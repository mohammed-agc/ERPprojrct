// @vitest-environment jsdom
//
// Reconciler live E2E — analyze the real invoice 966673e8.
//
// We manually repaired this invoice during the signing-projection investigation
// (signed_artifact_id + xml_hash from the chain, outbox resolved). If the
// reconciler's logic matches what we did by hand, analyze() must now report
// CONSISTENT / NO_ACTION. This is the proof that the automated path agrees with
// the manual fix — and would catch any future drift.
//
// Self-skips unless SUPABASE_SERVICE_ROLE_KEY is set.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_…>"
//   npx vitest run src/services/zatca/reconciliation/__tests__/reconcile966673e8.integration.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { createProjectionReconciler } from '../DefaultProjectionReconciler';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SUPABASE_URL;

const DOCUMENT_ID = '966673e8-d773-471d-be90-d10ae9ed6c99';
const ADMIN_EMAIL = process.env.ZATCA_TEST_EMAIL ?? 'admin@ard-erp.com';
const ADMIN_PASSWORD = process.env.ZATCA_TEST_PASSWORD ?? 'Admin@123';

describe('reconciler live E2E — 966673e8', () => {
  it.runIf(!!SERVICE_KEY)(
    'analyze reports CONSISTENT (agrees with the manual repair)',
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

      const reconciler = createProjectionReconciler(client);
      const report = await reconciler.analyze({
        documentId: DOCUMENT_ID,
        environment: 'sandbox',
        documentType: 'invoice',
      });

      // eslint-disable-next-line no-console
      console.log('RECONCILE REPORT:', JSON.stringify(report, null, 2));

      expect(report.classification).toBe('CONSISTENT');
      expect(report.decision).toBe('NO_ACTION');
      expect(report.drifts).toEqual([]);
      expect(report.orphanedOutboxIds).toEqual([]);
    },
    120_000
  );
});
