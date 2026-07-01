// @vitest-environment jsdom
//
// ZatcaHealthReport live E2E — the full operational + projection report on the
// REAL company. Observe only (all diagnostics are read-only). Prints the report
// a dashboard / CLI would show.
//
// Self-skips unless SUPABASE_SERVICE_ROLE_KEY is set.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_…>"
//   npx vitest run src/services/zatca/health/__tests__/healthReport.integration.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { createZatcaHealthReport } from '../ZatcaHealthReport';
import type { OperationalScope } from '../OperationalDiagnostics';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SUPABASE_URL;

const COMPANY_ID = 'f40c7eff-57e3-42aa-869b-867d3d77cb84';
const ADMIN_EMAIL = process.env.ZATCA_TEST_EMAIL ?? 'admin@ard-erp.com';
const ADMIN_PASSWORD = process.env.ZATCA_TEST_PASSWORD ?? 'Admin@123';

describe('ZatcaHealthReport live E2E — company (observe only)', () => {
  it.runIf(!!SERVICE_KEY)(
    'check() produces the full health report',
    async () => {
      if (!SUPABASE_URL) throw new Error('set VITE_SUPABASE_URL');

      const client = createClient<Database>(SUPABASE_URL, SERVICE_KEY!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          storageKey: 'sb-zatca-service-role-isolated',
        },
      });
      const auth = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      if (auth.error) throw new Error('admin sign-in failed: ' + auth.error.message);

      const scope: OperationalScope = {
        companyId: COMPANY_ID,
        environment: 'sandbox',
      };

      const report = createZatcaHealthReport(client);
      const health = await report.check(scope);

      const op = health.operational;
      const lines: string[] = [
        '',
        '════════ ZATCA Health Report ════════',
        `Company    : ${scope.companyId}`,
        `Environment: ${scope.environment}`,
        `Checked at : ${health.checkedAt}`,
        '',
        `OVERALL: ${health.overall}`,
        '',
        '── Operational ──',
        `  credential : ${op.credential.status} (active=${op.credential.activeCount}${op.credential.credentialType ? `, ${op.credential.credentialType}` : ''})`,
        `  certificate: ${op.certificate.status}` +
          (op.certificate.daysRemaining !== undefined
            ? ` (${op.certificate.daysRemaining}d, threshold ${op.certificate.thresholdDays}d)`
            : ''),
        `  database   : ${op.database.status}`,
        `  outbox     : ${op.outbox.status} (unresolved=${op.outbox.unresolvedCount})`,
        `  vault      : ${op.vault}`,
        '',
        '── Projection ──',
        `  severity   : ${health.projection.severity}`,
        `  scanned    : ${health.projection.diagnostics.total}`,
        `  repairable : ${health.projection.diagnostics.repairable}`,
        `  escalations: ${health.projection.diagnostics.escalations.length}`,
        '═════════════════════════════════════',
      ];
      // eslint-disable-next-line no-console
      console.log(lines.join('\n'));

      // The report is well-formed; we do NOT presume a specific overall.
      expect(['HEALTHY', 'DEGRADED', 'DOWN']).toContain(health.overall);
      expect(op.vault).toBe('not-checked');
      expect(health.projection.diagnostics.total).toBeGreaterThanOrEqual(0);
    },
    180_000
  );
});
