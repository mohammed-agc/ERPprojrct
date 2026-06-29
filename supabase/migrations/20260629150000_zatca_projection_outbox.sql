-- ════════════════════════════════════════════════════════════════════════════
-- Step 2 — zatca_projection_outbox.
--
-- The durable channel for ProjectionFailed events (ADR-029 §3). The chain has
-- committed; only the read-model projection failed. This row makes that failure
-- RECOVERABLE (a later reconciler re-runs the projection) and never lost.
--
-- KEYED ON artifact_id (the one non-derivable fact): from the artifact the
-- reconciler reaches document/company/environment/hash and re-projects. Every
-- other field would be redundant, so it is NOT stored here.
--
-- Mutable (unlike the artifact): the reconciler UPDATEs attempt_count / resolved_at.
-- Idempotent & additive.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zatca_projection_outbox (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id   UUID        NOT NULL,   -- the key; everything else derives from it
  error_code    TEXT        NOT NULL,
  error_message TEXT        NOT NULL,
  attempt_count INT         NOT NULL DEFAULT 1,
  occurred_at   TIMESTAMPTZ NOT NULL,
  resolved_at   TIMESTAMPTZ,            -- NULL until reconciled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zpo_fk_artifact
    FOREIGN KEY (artifact_id) REFERENCES public.zatca_signed_artifacts(id)
);

-- The reconciler's working set: unresolved entries only.
CREATE INDEX IF NOT EXISTS idx_zpo_unresolved
  ON public.zatca_projection_outbox(occurred_at)
  WHERE resolved_at IS NULL;
