// @vitest-environment jsdom
//
// ProjectionDiagnostics live E2E — analyzeScope on the REAL company.
//
// Proves the full chain on production data with NO hidden assumptions:
//   Enumerator → TruthSnapshotReader → deriveExpected → compare → classify → tally
//
// OBSERVE ONLY. This test NEVER calls repair(). If a drift surfaces, that is a
// SUCCESS (the tool found the truth) — repair is a separate, deliberate step.
// The printed summary is the project's reconciliation BASELINE.
//
// Self-skips unless SUPABASE_SERVICE_ROLE_KEY is set.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_…>"
//   npx vitest run src/services/zatca/reconciliation/__tests__/diagnosticsScope.integration.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { createProjectionDiagnostics } from '../DefaultProjectionDiagnostics';
import { ALL_CLASSIFICATIONS, type BatchScope } from '../ProjectionDiagnostics';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SUPABASE_URL;

const COMPANY_ID = 'f40c7eff-57e3-42aa-869b-867d3d77cb84';
const ENVIRONMENT = 'sandbox' as const;
const ADMIN_EMAIL = process.env.ZATCA_TEST_EMAIL ?? 'admin@ard-erp.com';
const ADMIN_PASSWORD = process.env.ZATCA_TEST_PASSWORD ?? 'Admin@123';

describe('ProjectionDiagnostics live E2E — company scope (observe only)', () => {
  it.runIf(!!SERVICE_KEY)(
    'analyzeScope scans the company and prints the reconciliation baseline',
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

      const scope: BatchScope = {
        kind: 'company-environment',
        companyId: COMPANY_ID,
        environment: ENVIRONMENT,
      };

      const diagnostics = createProjectionDiagnostics(client);
      const result = await diagnostics.analyzeScope(scope);

      // --- Baseline summary -------------------------------------------------
      const lines: string[] = [
        '',
        'ProjectionDiagnostics Summary',
        '',
        `Company    : ${COMPANY_ID}`,
        `Environment: ${ENVIRONMENT}`,
        '',
        `Documents scanned : ${result.total}`,
        '',
      ];
      for (const c of ALL_CLASSIFICATIONS) {
        lines.push(`${c.padEnd(28)}: ${result.tally[c]}`);
      }
      lines.push('');
      lines.push(`Repairable : ${result.repairable}`);
      lines.push(`Escalations: ${result.escalations.length}`);
      // List any non-consistent documents for drill-down (still observe-only).
      const notConsistent = result.reports.filter(
        (r) => r.classification !== 'CONSISTENT'
      );
      if (notConsistent.length) {
        lines.push('');
        lines.push('Non-consistent documents:');
        for (const r of notConsistent) {
          lines.push(
            `  ${r.documentRef.documentId}  ${r.classification}  [${r.decision}]`
          );
        }
      }
      // eslint-disable-next-line no-console
      console.log(lines.join('\n'));

      // --- Assertions: the SCAN worked. We do NOT assert a distribution -----
      // (observe, don't presume). Tally must be internally consistent.
      const tallySum = ALL_CLASSIFICATIONS.reduce(
        (n, c) => n + result.tally[c],
        0
      );
      expect(tallySum).toBe(result.total);
      expect(result.reports).toHaveLength(result.total);
      expect(result.total).toBeGreaterThan(0); // the company has signed documents
    },
    180_000
  );
});
