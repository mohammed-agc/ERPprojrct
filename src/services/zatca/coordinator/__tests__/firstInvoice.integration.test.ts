// @vitest-environment jsdom
//
// First Compliant Invoice — sandbox E2E.
//
// Runs the WHOLE local signing pipeline against the real Supabase, on a real
// tax_invoice, using the real sandbox CCSID in the FileSystem vault. It is a
// MANUAL integration test: it self-skips unless SUPABASE_SERVICE_ROLE_KEY is set,
// so normal `vitest run` is unaffected.
//
//   why service-role: get_current_company_id() returns the DEFAULT company
//   (== our company), so zatca_append's COMPANY_SCOPE guard passes; service-role
//   bypasses RLS for the direct artifact/projection writes; the append RPC is
//   SECURITY DEFINER. No auth session required.
//
//   why jsdom: the app Supabase singleton (pulled in transitively) touches
//   localStorage at module load — jsdom provides it. node:fs still works here,
//   so the FileSystem vault and the XML write are unaffected.
//
// Run (PowerShell):
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service_role secret from Supabase>"
//   npx vitest run src/services/zatca/coordinator/__tests__/firstInvoice.integration.test.ts

import { describe, it, expect } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'node:fs';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { createInvoiceSigningCoordinator } from '../createInvoiceSigningCoordinator';

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

describe('first compliant invoice — sandbox E2E', () => {
  it.runIf(!!SERVICE_KEY)(
    'signs a real tax_invoice end-to-end and writes signed-invoice.xml',
    async () => {
      if (!SUPABASE_URL) {
        throw new Error(
          'SUPABASE_URL missing: set VITE_SUPABASE_URL (or ensure .env is loaded)'
        );
      }

      const client = createClient<Database>(SUPABASE_URL, SERVICE_KEY!, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          // CRITICAL: isolate from the singleton's shared storage key. Without
          // this, this client reads the admin session the singleton stored and
          // sends it as Authorization — demoting itself from service-role to
          // admin (RLS enforced). A distinct key keeps it on the secret key.
          storageKey: 'sb-zatca-service-role-isolated',
        },
      });

      // The XmlBuilder's data loader (invoiceDataLoader) imports the app
      // singleton directly, so it reads under RLS, not via the injected client.
      // Sign the singleton in as admin so its reads see the company's invoice.
      // (TECH DEBT: make invoiceDataLoader accept an injectable client like the
      //  other authorities, so server-side runs need no auth session.)
      const auth = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      });
      if (auth.error) {
        throw new Error('admin sign-in failed: ' + auth.error.message);
      }

      const coordinator = createInvoiceSigningCoordinator(
        { vaultRoot: VAULT_ROOT, enforcePermissions: false },
        undefined,
        client
      );

      const result = await coordinator.run({
        companyId: COMPANY_ID,
        environment: 'sandbox',
        credentialType: 'CCSID',
        documentType: 'tax_invoice',
        documentId: DOCUMENT_ID,
      });

      // eslint-disable-next-line no-console
      console.log('COORDINATOR RESULT:', JSON.stringify(result, null, 2));
      expect(['SIGNED', 'ALREADY_SIGNED']).toContain(result.status);

      // Resolve the artifact id: directly for SIGNED, via the chain for ALREADY_SIGNED.
      let artifactId: string;
      if (result.status === 'SIGNED') {
        artifactId = result.artifactId;
      } else {
        const chain = await client
          .from('zatca_document_chain')
          .select('artifact_id')
          .eq('environment', 'sandbox')
          .eq('document_type', 'invoice')
          .eq('document_id', DOCUMENT_ID)
          .single();
        if (chain.error) throw new Error(chain.error.message);
        artifactId = (chain.data as { artifact_id: string }).artifact_id;
      }

      const art = await client
        .from('zatca_signed_artifacts')
        .select('signed_xml')
        .eq('id', artifactId)
        .single();
      if (art.error) throw new Error(art.error.message);
      const signedXml = (art.data as { signed_xml: string }).signed_xml;

      expect(signedXml).toBeTruthy();
      expect(signedXml).toContain('<Invoice');

      writeFileSync('signed-invoice.xml', signedXml, 'utf-8');
      // eslint-disable-next-line no-console
      console.log(
        `WROTE signed-invoice.xml (${signedXml.length} chars), icv=${result.icv}, artifact=${artifactId}`
      );
    },
    120_000
  );
});
