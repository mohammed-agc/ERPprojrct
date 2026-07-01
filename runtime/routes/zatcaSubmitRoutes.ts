/**
 * POST /zatca/submit — hosts the SubmissionCoordinator over HTTP.
 *
 * A pure HTTP adapter: it validates the SHAPE of the request and calls the
 * coordinator. It does NOT choose the target — target is part of
 * SubmitDocumentInput, decided by a higher layer (Workflow/Controller via
 * InvoiceRoutingPolicy). The route validates only that target is a well-formed
 * value, never whether it fits the invoice type (that is the policy's concern).
 *
 * Needs the vault (submission credential compliance.json) — vaultRoot from
 * ZATCA_VAULT_ROOT — and injects the Runtime's Supabase client + global fetch.
 *
 * Body: { companyId, environment, credentialType, documentType, documentId, target }
 * Returns the coordinator's SubmitDocumentResult (the FACTS; accepted is derived).
 */

import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSubmissionCoordinator } from '../../src/services/zatca/submission/createSubmissionCoordinator.js';
import type { SubmitDocumentInput } from '../../src/services/zatca/submission/SubmissionCoordinator.js';
import type { ZatcaEnvironment, CredentialType } from '../../src/services/zatca/credential/CredentialResolver.js';
import type { DocumentType } from '../../src/services/zatca/xmlBuilder.types.js';

const VALID_ENVIRONMENTS: readonly ZatcaEnvironment[] = [
  'sandbox',
  'simulation',
  'production',
];
const VALID_TARGETS = ['compliance', 'clearance', 'reporting'] as const;
// The coordinator expects DocumentType (tax_invoice / credit_note) and maps it
// to the chain's ArtifactDocumentType (invoice / …) internally via CHAIN_TYPE.
const VALID_DOCUMENT_TYPES: readonly DocumentType[] = [
  'tax_invoice',
  'credit_note',
];

export interface ZatcaSubmitRoutesConfig {
  readonly vaultRoot: string;
}

export function registerZatcaSubmitRoutes(
  app: FastifyInstance,
  db: SupabaseClient,
  config: ZatcaSubmitRoutesConfig
): void {
  app.post('/zatca/submit', async (request, reply) => {
    const body = (request.body ?? {}) as Partial<SubmitDocumentInput>;
    const { companyId, environment, credentialType, documentType, documentId, target } =
      body;

    // Shape validation only — no domain decisions here.
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
    if (!target || !VALID_TARGETS.includes(target as (typeof VALID_TARGETS)[number])) {
      return reply.code(400).send({
        error: `target must be one of ${VALID_TARGETS.join(', ')}`,
      });
    }

    const coordinator = createSubmissionCoordinator(
      { vaultRoot: config.vaultRoot },
      db as never
    );

    try {
      const result = await coordinator.submit({
        companyId,
        environment,
        credentialType: credentialType as CredentialType,
        documentType,
        documentId,
        target,
      } as SubmitDocumentInput);
      return result;
    } catch (err) {
      // Transport/infrastructure failure (not a business rejection — those come
      // back as a SubmitDocumentResult). Surface as 502 with the message.
      request.log.error(err);
      return reply.code(502).send({
        error: 'submission failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
