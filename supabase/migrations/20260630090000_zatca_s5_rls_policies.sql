-- ============================================================
-- 20260630090000_zatca_s5_rls_policies.sql
-- ============================================================
-- The S5 local-signing tables (zatca_signed_artifacts, zatca_projection_outbox)
-- were created with RLS ENABLED but NO policies — i.e. deny-all for the
-- authenticated role. The signing pipeline, running as an authenticated context,
-- could therefore not INSERT artifacts or outbox rows.
--
-- These policies mirror the app's established model (see invoices.auth_invoices:
-- authenticated / ALL / true) — a single-tenant authenticated-trust posture.
--
-- NOTE: artifact immutability is NOT weakened by FOR ALL here. UPDATE/DELETE
-- remain blocked by trg_zsa_immutable at the trigger level, independent of RLS.
--
-- FUTURE HARDENING (multi-tenant): scope USING/WITH CHECK by company_id =
-- get_current_company_id() once get_current_company_id() becomes per-principal.
-- ============================================================

DROP POLICY IF EXISTS auth_zatca_signed_artifacts ON public.zatca_signed_artifacts;
CREATE POLICY auth_zatca_signed_artifacts ON public.zatca_signed_artifacts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS auth_zatca_projection_outbox ON public.zatca_projection_outbox;
CREATE POLICY auth_zatca_projection_outbox ON public.zatca_projection_outbox
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
