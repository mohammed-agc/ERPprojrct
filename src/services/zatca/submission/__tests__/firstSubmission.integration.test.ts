// @vitest-environment jsdom
//
// First Submission — sandbox live E2E.
//
// Submits the already-signed, already-chained invoice (966673e8) to ZATCA's
// sandbox compliance endpoint through the WHOLE S5.3 coordinator, then asserts:
//   - the coordinator returns CLEARED facts,
//   - exactly one zatca_submission_log row was appended (success=true),
//   - invoices.zatca_status was projected to 'cleared'.
//
// Manual: self-skips unless SUPABASE_SERVICE_ROLE_KEY is set.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<sb_secret_…>"
//   npx vitest run src/services/zatca/submission/__tests__/firstSubmission.integration.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { createSubmissionCoordinator } from '../createSubmissionCoordinator';
import { isAccepted } from '../SubmissionCoordinator';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_SUPABASE_URL;
const VAULT_ROOT = process.env.ZATCA_VAULT_ROOT ?? 'F:\\zatca-vault';

const COMPANY_ID = 'f40c7eff-57e3-42aa-869b-867d3d77cb84';
const DOCUMENT_ID = '966673e8-d773-471d-be90-d10ae9ed6c99';
const ADMIN_EMAIL = process.env.ZATCA_TEST_EMAIL ?? 'admin@ard-erp.com';
const ADMIN_PASSWORD = process.env.ZATCA_TEST_PASSWORD ?? 'Admin@123';

describe('first submission — sandbox live E2E', () => {
  it.runIf(!!SERVICE_KEY)(
    'submits the signed invoice end-to-end and gets CLEARED',
    async () => {
      if (!SUPABASE_URL) {
        throw new Error('set VITE_SUPABASE_URL (or ensure .env is loaded)');
      }

      const client = createClient<Database>(SUPABASE_URL, SERVICE_KEY!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          storageKey: 'sb-zatca-service-role-isolated',
        },
      });

      // The signed-document reader's default path reads under the singleton; the
      // injected service-role client is used here, but keep the singleton authed
      // too in case any layer falls back to it (mirrors the signing E2E).
      const auth = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      if (auth.error) throw new Error('admin sign-in failed: ' + auth.error.message);

      const coordinator = createSubmissionCoordinator(
        { vaultRoot: VAULT_ROOT },
        client,
        fetch
      );

      const result = await coordinator.submit({
        companyId: COMPANY_ID,
        environment: 'sandbox',
        credentialType: 'CCSID',
        documentType: 'tax_invoice',
        documentId: DOCUMENT_ID,
        target: 'compliance',
      });

      // eslint-disable-next-line no-console
      console.log('SUBMISSION RESULT:', JSON.stringify(result, null, 2));

      expect(result.httpStatus).toBe(200);
      expect(result.validationStatus).toBe('PASS');
      expect(result.clearanceStatus).toBe('CLEARED');
      expect(result.errors).toHaveLength(0);
      expect(isAccepted(result)).toBe(true);
      expect(result.submissionLogId).toBeTruthy();

      // submission_log row appended
      const log = await client
        .from('zatca_submission_log')
        .select('success, zatca_status, zatca_response_code, http_status')
        .eq('id', result.submissionLogId)
        .single();
      if (log.error) throw new Error(log.error.message);
      expect(log.data).toMatchObject({
        success: true,
        zatca_status: 'PASS',
        zatca_response_code: 'CLEARED',
        http_status: 200,
      });

      // read-model projected to 'cleared'
      const inv = await client
        .from('invoices')
        .select('zatca_status')
        .eq('id', DOCUMENT_ID)
        .single();
      if (inv.error) throw new Error(inv.error.message);
      expect((inv.data as { zatca_status: string }).zatca_status).toBe('cleared');

      // eslint-disable-next-line no-console
      console.log('OK — CLEARED, logged, projected. submissionLogId:', result.submissionLogId);
    },
    120_000
  );
});
