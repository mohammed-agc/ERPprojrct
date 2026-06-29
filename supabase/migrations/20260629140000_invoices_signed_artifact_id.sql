-- ════════════════════════════════════════════════════════════════════════════
-- Build #4 (link column) — invoices.signed_artifact_id.
--
-- The Invoice Projection is write-ownership, not storage: it lives ON the
-- existing invoices ZATCA columns (icv, pih, qr_code, xml_hash, zatca_status,
-- xml_generated_at, qr_generated_at), written solely by ProjectionWriter. This
-- adds the one missing field: a reference to the CURRENT signed artifact, so the
-- projection points to the artifact bytes rather than duplicating them.
--
-- NULLABLE on purpose: the projection is written AFTER chain success and is
-- non-transactional / re-runnable, so it may be transiently absent. The FK
-- guarantees that WHEN set, it references a real, durable artifact.
--
-- Additive & idempotent. Does not touch existing invoice data.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS signed_artifact_id UUID;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_signed_artifact_fk;
ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_signed_artifact_fk
  FOREIGN KEY (signed_artifact_id)
  REFERENCES public.zatca_signed_artifacts(id);
