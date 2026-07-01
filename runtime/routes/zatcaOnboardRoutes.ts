/**
 * POST /zatca/onboard — hosts the OnboardingCoordinator over HTTP.
 *
 * A pure HTTP adapter: validates request SHAPE, composes the coordinator with its
 * six authorities, and runs it. It decides nothing — environment, credentialType,
 * credentialId, the CSR fields, and the OTP all come from the request body.
 *
 * Needs the vault (private key + certs written here) — vaultRoot from
 * ZATCA_VAULT_ROOT — and the injected Runtime Supabase client (metadata
 * registration). fetch defaults to global fetch.
 *
 * Body: { credentialId, companyId, environment, credentialType, csr:{...}, otp }
 * Returns the coordinator's { credentialId, credentialType, environment, requestId }.
 *
 * NOTE: onboarding a real customer requires a valid Fatoora OTP and completed
 * compliance checks; those are external. This route wires the flow end to end.
 */

import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOpenSslCsrGenerator } from '../../src/services/zatca/onboarding/OpenSslCsrGenerator.js';
import { createProcessRunner } from '../../src/services/zatca/onboarding/ProcessRunner.js';
import { createOpenSslLocator } from '../../src/services/zatca/onboarding/OpenSslLocator.js';
import { createVaultWriter } from '../../src/services/zatca/vault/FileSystemVaultWriter.js';
import { createCcsidEnrollmentClient } from '../../src/services/zatca/enrollment/ccsid/FetchCcsidEnrollmentClient.js';
import { createPcsidEnrollmentClient } from '../../src/services/zatca/enrollment/pcsid/FetchPcsidEnrollmentClient.js';
import { createEnvironmentEndpointResolver } from '../../src/services/zatca/enrollment/EnvironmentEndpointResolver.js';
import { createCertificateMetadataLoader } from '../../src/services/zatca/certificate/CertificateMetadataLoader.js';
import { createCredentialRepository } from '../../src/services/zatca/enrollment/onboarding/CredentialRepository.js';
import { DefaultOnboardingCoordinator, type OnboardingInput } from '../../src/services/zatca/enrollment/onboarding/OnboardingCoordinator.js';
import type { ZatcaEnvironment, CredentialType } from '../../src/services/zatca/credential/CredentialResolver.js';

const VALID_ENVIRONMENTS: readonly ZatcaEnvironment[] = [
  'sandbox',
  'simulation',
  'production',
];
const VALID_CREDENTIAL_TYPES: readonly CredentialType[] = ['CCSID', 'PCSID'];
const VALID_INVOICE_TYPES = ['1000', '0100', '1100'] as const;

export interface ZatcaOnboardRoutesConfig {
  readonly vaultRoot: string;
}

interface OnboardBody {
  credentialId?: string;
  companyId?: string;
  environment?: ZatcaEnvironment;
  credentialType?: CredentialType;
  otp?: string;
  csr?: Partial<OnboardingInput['csr']>;
}

export function registerZatcaOnboardRoutes(
  app: FastifyInstance,
  db: SupabaseClient,
  config: ZatcaOnboardRoutesConfig
): void {
  app.post('/zatca/onboard', async (request, reply) => {
    const body = (request.body ?? {}) as OnboardBody;
    const { credentialId, companyId, environment, credentialType, otp, csr } =
      body;

    // Shape validation — no domain decisions here.
    if (!credentialId) return reply.code(400).send({ error: 'credentialId is required' });
    if (!companyId) return reply.code(400).send({ error: 'companyId is required' });
    if (!otp) return reply.code(400).send({ error: 'otp is required' });
    if (!environment || !VALID_ENVIRONMENTS.includes(environment)) {
      return reply.code(400).send({
        error: `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      });
    }
    if (!credentialType || !VALID_CREDENTIAL_TYPES.includes(credentialType)) {
      return reply.code(400).send({
        error: `credentialType must be one of ${VALID_CREDENTIAL_TYPES.join(', ')}`,
      });
    }
    if (!csr) return reply.code(400).send({ error: 'csr fields are required' });
    const csrRequired = [
      'organizationName',
      'organizationUnitName',
      'commonName',
      'serialNumber',
      'vatNumber',
      'registeredAddress',
      'businessCategory',
    ] as const;
    for (const field of csrRequired) {
      if (!csr[field]) {
        return reply.code(400).send({ error: `csr.${field} is required` });
      }
    }
    if (!csr.invoiceType || !VALID_INVOICE_TYPES.includes(csr.invoiceType)) {
      return reply.code(400).send({
        error: `csr.invoiceType must be one of ${VALID_INVOICE_TYPES.join(', ')}`,
      });
    }

    // Compose the coordinator with its six authorities.
    const endpointResolver = createEnvironmentEndpointResolver();
    const coordinator = new DefaultOnboardingCoordinator(
      createOpenSslCsrGenerator(createProcessRunner(), createOpenSslLocator()),
      createVaultWriter({ vaultRoot: config.vaultRoot }),
      createCcsidEnrollmentClient({ environment, endpointResolver }),
      createPcsidEnrollmentClient({ environment, endpointResolver }),
      createCertificateMetadataLoader(),
      createCredentialRepository(db as never)
    );

    try {
      const result = await coordinator.onboard({
        credentialId,
        companyId,
        environment,
        credentialType,
        otp,
        csr: csr as OnboardingInput['csr'],
      });
      return result;
    } catch (err) {
      request.log.error(err);
      // Surface the failing stage if the coordinator named one.
      const stage =
        err && typeof err === 'object' && 'stage' in err
          ? (err as { stage: string }).stage
          : undefined;
      return reply.code(502).send({
        error: 'onboarding failed',
        stage,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
