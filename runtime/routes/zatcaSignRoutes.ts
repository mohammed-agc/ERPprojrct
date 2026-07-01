/**
 * POST /zatca/sign — hosts the InvoiceSigningCoordinator over HTTP.
 *
 * This is the first route that depends on the VAULT (the private key on the
 * server's file system) — the real test of ADR-029: a file-system + crypto
 * authority hosted by the Runtime. The vault root comes from the environment
 * (ZATCA_VAULT_ROOT), exactly as the Supabase key does; no secret in code.
 *
 * Body: { companyId, environment, credentialType, documentType, documentId }
 * Returns the coordinator's SignDocumentResult (SIGNED | ALREADY_SIGNED).
 *
 * The coordinator resolves credentials, reads the chain head, builds+signs, and
 * commits — its concern ends at chain append. Submission is a separate route.
 */

import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvoiceSigningCoordinator } from '../../src/services/zatca/coordinator/createInvoiceSigningCoordinator.js';
import type { SignDocumentInput } from '../../src/services/zatca/coordinator/InvoiceSigningCoordinator.js';
import type { ZatcaEnvironment, CredentialType } from '../../src/services/zatca/credential/CredentialResolver.js';
import type { DocumentType } from '../../src/services/zatca/xmlBuilder.types.js';

const VALID_ENVIRONMENTS: readonly ZatcaEnvironment[] = [
  'sandbox',
  'simulation',
  'production',
];
const VALID_DOCUMENT_TYPES: readonly DocumentType[] = [
  'tax_invoice',
  'credit_note',
];

export interface ZatcaSignRoutesConfig {
  readonly vaultRoot: string;
}

export function registerZatcaSignRoutes(
  app: FastifyInstance,
  db: SupabaseClient,
  config: ZatcaSignRoutesConfig
): void {
  app.post('/zatca/sign', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<SignDocumentInput>;

    const { companyId, environment, credentialType, documentType, documentId } =
      body;

    // Validation — no silent defaults; the caller supplies full context.
    if (!companyId) return reply.code(400).send({ error: 'companyId is required' });
    if (!documentId) return reply.code(400).send({ error: 'documentId is required' });
    if (!environment || !VALID_ENVIRONMENTS.includes(environment)) {
      return reply.code(400).send({
        error: `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      });
    }
    if (!documentType || !VALID_DOCUMENT_TYPES.includes(documentType)) {
      return reply.code(400).send({
        error: `documentType must be one of ${VALID_DOCUMENT_TYPES.join(', ')}`,
      });
    }
    if (!credentialType) {
      return reply.code(400).send({ error: 'credentialType is required' });
    }

    const coordinator = createInvoiceSigningCoordinator(
      { vaultRoot: config.vaultRoot },
      undefined,
      db as never
    );

    try {
      const result = await coordinator.run({
        companyId,
        environment,
        credentialType: credentialType as CredentialType,
        documentType,
        documentId,
      });
      return result;
    } catch (err) {
      // Signing failures (resolve/build/compose/persist/append) are real errors
      // — surface them as 500 with the message, not as a business outcome.
      request.log.error(err);
      return reply.code(500).send({
        error: 'signing failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
