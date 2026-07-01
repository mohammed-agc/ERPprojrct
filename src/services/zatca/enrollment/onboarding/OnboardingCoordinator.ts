/**
 * OnboardingCoordinator — the credential-lifecycle COMPOSITION root (4.5).
 *
 * Sequences the four authorities into one onboarding run. It adds NO new fact:
 * no crypto, no HTTP, no policy. Like SubmissionCoordinator, it EXECUTES an
 * ordering of decisions made elsewhere — it does not choose the environment,
 * the credentialType, the endpoint, retries, or rotation. All of that arrives in
 * the input.
 *
 * Three invariants (frozen):
 *   1. No DB registration before PCSID succeeds. The CredentialResolver must
 *      never see a half-onboarded credential — registration is the LAST step.
 *   2. Vault before Database, always. Orphan Vault files (Vault ok, DB failed)
 *      are cleanable/re-registerable; a DB row pointing at absent files is worse.
 *   3. The coordinator decides nothing.
 *
 * Sequence:
 *   generate CSR (4.1)
 *     → store private key (4.2, Vault)
 *       → enroll CCSID (4.3)
 *         → store CCSID cert + compliance.json (4.2, Vault)
 *           → enroll PCSID (4.4)
 *             → replace cert + compliance.json with production (4.2, Vault, overwrite)
 *               → store metadata.json (4.2, Vault)
 *                 → register metadata (DB — last)
 *
 * Output carries only what a consumer needs; secrets stay in the Vault.
 */

import type { ZatcaEnvironment, CredentialType } from '../../credential/CredentialResolver';
import type { CsrGenerator, CsrInput } from '../../onboarding/CsrGenerator';
import type { VaultWriter } from '../../vault/VaultWriter';
import type { CcsidEnrollmentClient } from '../ccsid/CcsidEnrollmentClient';
import type { PcsidEnrollmentClient } from '../pcsid/PcsidEnrollmentClient';
import type {
  CredentialRepository,
  CredentialMetadataRecord,
} from './CredentialRepository';

/** Everything the run needs — all decided by the caller (nothing chosen here). */
export interface OnboardingInput {
  /** The vault directory name for this credential; also the DB id. */
  readonly credentialId: string;
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly credentialType: CredentialType;
  /** The CSR fields (organization, VAT, invoice type, …). */
  readonly csr: CsrInput;
  /** The Fatoora OTP for CCSID enrollment. */
  readonly otp: string;
  /** Certificate expiry to record (ISO) — derived by the caller. */
  readonly certificateExpiryAt: string;
  /** Fingerprints for the DB record — derived by the caller. */
  readonly certificateFingerprint: string;
  readonly credentialFingerprint: string;
}

/** The facts a consumer needs after onboarding; secrets remain in the Vault. */
export interface OnboardingResult {
  readonly credentialId: string;
  readonly credentialType: CredentialType;
  readonly environment: ZatcaEnvironment;
  /** The CCSID requestId used to obtain the PCSID (for audit). */
  readonly requestId: string;
}

export class OnboardingError extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

export interface OnboardingCoordinator {
  readonly implementationName: string;
  onboard(input: OnboardingInput): Promise<OnboardingResult>;
}

export class DefaultOnboardingCoordinator implements OnboardingCoordinator {
  readonly implementationName = 'DefaultOnboardingCoordinator';

  constructor(
    private readonly csrGenerator: CsrGenerator,
    private readonly vaultWriter: VaultWriter,
    private readonly ccsidClient: CcsidEnrollmentClient,
    private readonly pcsidClient: PcsidEnrollmentClient,
    private readonly repository: CredentialRepository
  ) {}

  async onboard(input: OnboardingInput): Promise<OnboardingResult> {
    const { credentialId } = input;

    // 1) Generate the CSR + secp256k1 key (4.1). The CSR stays in memory.
    const csr = await this.stage('generate-csr', () =>
      this.csrGenerator.generate(input.csr)
    );

    // 2) Store the private key (4.2 — Vault first). Durable from here on.
    await this.stage('store-private-key', () =>
      this.vaultWriter.storePrivateKey(credentialId, csr.privateKeyPem)
    );

    // 3) Enroll the CCSID (4.3).
    const ccsid = await this.stage('enroll-ccsid', () =>
      this.ccsidClient.enroll({ csrBase64: csr.csrBase64, otp: input.otp })
    );

    // 4) Store the CCSID certificate + compliance material (4.2).
    await this.stage('store-ccsid', async () => {
      await this.vaultWriter.storeCertificate(
        credentialId,
        this.toCertificatePem(ccsid.binarySecurityToken)
      );
      await this.vaultWriter.storeComplianceCredential(credentialId, {
        binarySecurityToken: ccsid.binarySecurityToken,
        secret: ccsid.secret,
      });
    });

    // 5) Enroll the PCSID (4.4), authenticating with the CCSID.
    const pcsid = await this.stage('enroll-pcsid', () =>
      this.pcsidClient.enroll({
        complianceRequestId: ccsid.requestId,
        binarySecurityToken: ccsid.binarySecurityToken,
        secret: ccsid.secret,
      })
    );

    // 6) Replace the Vault credential with the PRODUCTION one (4.2, overwrite).
    await this.stage('store-pcsid', async () => {
      await this.vaultWriter.storeCertificate(
        credentialId,
        this.toCertificatePem(pcsid.binarySecurityToken),
        { overwrite: true }
      );
      await this.vaultWriter.storeComplianceCredential(
        credentialId,
        {
          binarySecurityToken: pcsid.binarySecurityToken,
          secret: pcsid.secret,
        },
        { overwrite: true }
      );
      await this.vaultWriter.storeMetadata(credentialId, {
        credentialId,
        companyId: input.companyId,
        environment: input.environment,
        credentialType: input.credentialType,
        createdAt: new Date().toISOString(),
        generator: this.csrGenerator.implementationName,
      });
    });

    // 7) Register metadata in the DB — LAST, only after everything above.
    await this.stage('register', () => {
      const record: CredentialMetadataRecord = {
        credentialId,
        companyId: input.companyId,
        environment: input.environment,
        credentialType: input.credentialType,
        certificateFingerprint: input.certificateFingerprint,
        credentialFingerprint: input.credentialFingerprint,
        certificateExpiryAt: input.certificateExpiryAt,
      };
      return this.repository.register(record);
    });

    return {
      credentialId,
      credentialType: input.credentialType,
      environment: input.environment,
      requestId: ccsid.requestId,
    };
  }

  /** Wrap a stage so any failure names WHERE it failed. */
  private async stage<T>(stage: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof OnboardingError) throw e;
      throw new OnboardingError(
        stage,
        `onboarding failed at "${stage}": ${
          e instanceof Error ? e.message : String(e)
        }`,
        e
      );
    }
  }

  /** ZATCA returns the certificate as a base64 token; wrap it as PEM for the vault. */
  private toCertificatePem(binarySecurityToken: string): string {
    const body = binarySecurityToken.replace(/\s+/g, '');
    const lines = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----\n`;
  }
}

export function createOnboardingCoordinator(
  csrGenerator: CsrGenerator,
  vaultWriter: VaultWriter,
  ccsidClient: CcsidEnrollmentClient,
  pcsidClient: PcsidEnrollmentClient,
  repository: CredentialRepository
): OnboardingCoordinator {
  return new DefaultOnboardingCoordinator(
    csrGenerator,
    vaultWriter,
    ccsidClient,
    pcsidClient,
    repository
  );
}
