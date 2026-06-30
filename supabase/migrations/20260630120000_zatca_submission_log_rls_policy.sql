-- ============================================================
-- 20260630120000_zatca_submission_log_rls_policy.sql
-- ============================================================
-- zatca_submission_log was created with RLS ENABLED but NO policy (deny-all for
-- authenticated). The S5.3 submission pipeline, running as an authenticated
-- context, could therefore not append attempt rows.
--
-- Mirrors the app's authenticated-trust model (invoices.auth_invoices and the
-- S5 artifact/outbox policies). Append-only immutability remains enforced by the
-- table's own trigger(s), independent of RLS.
-- ============================================================

DROP POLICY IF EXISTS auth_zatca_submission_log ON public.zatca_submission_log;
CREATE POLICY auth_zatca_submission_log ON public.zatca_submission_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
