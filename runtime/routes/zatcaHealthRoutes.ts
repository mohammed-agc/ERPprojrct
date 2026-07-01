/**
 * /zatca/health route — the first real authority hosted by the Runtime.
 *
 * Proves the Hosting Layer sits cleanly atop the Application Layer: the exact
 * ZatcaHealthReport proven in live E2E, now reached over HTTP, injected with the
 * Runtime's Supabase client (never the browser singleton).
 *
 * Scope comes from query params (companyId, environment); the Runtime does not
 * assume a tenant. Read-only — health checks never mutate.
 */

import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createZatcaHealthReport } from '../../src/services/zatca/health/ZatcaHealthReport.js';
import type { ZatcaEnvironment } from '../../src/services/zatca/credential/CredentialResolver.js';

const VALID_ENVIRONMENTS: readonly ZatcaEnvironment[] = [
  'sandbox',
  'simulation',
  'production',
];

export function registerZatcaHealthRoutes(
  app: FastifyInstance,
  db: SupabaseClient
): void {
  app.get('/zatca/health', async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    const companyId = q.companyId;
    const environment = q.environment as ZatcaEnvironment | undefined;

    if (!companyId) {
      return reply
        .code(400)
        .send({ error: 'companyId query parameter is required' });
    }
    if (!environment || !VALID_ENVIRONMENTS.includes(environment)) {
      return reply.code(400).send({
        error: `environment must be one of ${VALID_ENVIRONMENTS.join(', ')}`,
      });
    }

    const report = createZatcaHealthReport(db);
    const health = await report.check({ companyId, environment });
    return health;
  });
}
