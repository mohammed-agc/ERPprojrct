/**
 * VaultWriter — the durable-credential PERSISTENCE authority (contract only).
 *
 * Owns exactly one concern: writing the *durable* assets of a credential into
 * the vault, under the single canonical layout that the signing and submission
 * providers already read:
 *
 *   <vaultRoot>/credentials/<credentialId>/
 *     private.pem       (EC private key — secret)
 *     certificate.pem   (X.509 certificate — public)
 *     compliance.json   ({ binarySecurityToken, secret })
 *     metadata.json     (operational metadata — not part of any API)
 *
 * Deliberately NOT here:
 *   - storeCsr — a CSR is a transient onboarding message, never a durable asset.
 *   - storeKeyPair — the public key is always derivable from the private key.
 *
 * The writer EXECUTES writes; it does not DECIDE policy. Whether an existing file
 * may be replaced is the caller's call (the Onboarding Coordinator), passed
 * explicitly via WriteOptions.overwrite — never a hidden default. Absent the
 * flag, an existing file is a loud error (No Silent Assumptions).
 */

export interface WriteOptions {
  /**
   * Allow replacing an existing file. Default false. The Onboarding Coordinator
   * sets this deliberately, e.g. certificate.pem / compliance.json during a
   * CCSID→PCSID rotation. The writer never overwrites silently.
   */
  readonly overwrite?: boolean;
}

/** ZATCA API credential material persisted as compliance.json. */
export interface ComplianceCredentialMaterial {
  readonly binarySecurityToken: string;
  readonly secret: string;
}

/**
 * Operational metadata (metadata.json). Free-form on purpose — the caller owns
 * its content; the writer just persists it. Not read by any signing/submission
 * path; a field-diagnostics aid only.
 */
export type CredentialMetadata = Record<string, unknown>;

export type VaultWriteErrorCode =
  | 'INVALID_CREDENTIAL_ID'
  | 'ALREADY_EXISTS'
  | 'WRITE_FAILED';

export class VaultWriteError extends Error {
  constructor(
    readonly code: VaultWriteErrorCode,
    message: string,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultWriteError';
  }
}

export interface VaultWriter {
  readonly implementationName: string;

  storePrivateKey(
    credentialId: string,
    privateKeyPem: string,
    options?: WriteOptions
  ): Promise<void>;

  storeCertificate(
    credentialId: string,
    certificatePem: string,
    options?: WriteOptions
  ): Promise<void>;

  storeComplianceCredential(
    credentialId: string,
    credential: ComplianceCredentialMaterial,
    options?: WriteOptions
  ): Promise<void>;

  storeMetadata(
    credentialId: string,
    metadata: CredentialMetadata,
    options?: WriteOptions
  ): Promise<void>;
}
