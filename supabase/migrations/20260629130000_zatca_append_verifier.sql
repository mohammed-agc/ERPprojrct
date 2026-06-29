-- ════════════════════════════════════════════════════════════════════════════
-- Build #2 — Chain.append becomes a VERIFIER over an ArtifactReference.
--
-- The chain is a chain OF ARTIFACTS. append no longer receives a free-floating
-- hash; it receives a reference {artifactId, artifactHash} and VERIFIES it:
--   - reads ONLY artifact_hash from the Artifact Store, FOR SHARE,
--   - confirms storedHash == suppliedHash (identity ↔ hash — a small CAS),
--   - depends on nothing else in the artifact (Verifier, not Reader).
-- Mismatch / absence is a PROGRAMMING ERROR (exception), never an outcome.
--
-- The chain event now references the artifact (artifact_id, NOT NULL + FK), so an
-- invalid state — a chained hash with no matching artifact — is unrepresentable.
--
-- Touches the proven b387806. Re-proven on real Postgres before delivery.
-- Idempotent (re-runnable).
-- ════════════════════════════════════════════════════════════════════════════

-- ── (a) Rename the chain's link column to speak "artifact" (the constraint
--        zdc_unique_hash follows the column automatically). ──
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='zatca_document_chain' AND column_name='invoice_hash'
  ) THEN
    ALTER TABLE public.zatca_document_chain RENAME COLUMN invoice_hash TO artifact_hash;
  END IF;
END $$;

-- ── (b) The chain event references the artifact (structural existence guarantee).
--        NOT NULL is safe: the chain has no consumer yet, so the table is empty;
--        if rows existed this would fail and reveal them. ──
ALTER TABLE public.zatca_document_chain
  ADD COLUMN IF NOT EXISTS artifact_id UUID NOT NULL;

ALTER TABLE public.zatca_document_chain DROP CONSTRAINT IF EXISTS zdc_fk_artifact;
ALTER TABLE public.zatca_document_chain
  ADD CONSTRAINT zdc_fk_artifact
  FOREIGN KEY (artifact_id) REFERENCES public.zatca_signed_artifacts(id);

-- ── (c) Replace append. Signature changes (p_invoice_hash → p_artifact_id +
--        p_artifact_hash), so DROP the old overload first, then create the new. ──
DROP FUNCTION IF EXISTS public.zatca_append(uuid, text, text, uuid, uuid, text, bigint);

CREATE OR REPLACE FUNCTION public.zatca_append(
  p_company       UUID,
  p_environment   TEXT,
  p_document_type TEXT,
  p_document_id   UUID,
  p_uuid          UUID,
  p_artifact_id   UUID,
  p_artifact_hash TEXT,
  p_token         BIGINT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_state       public.zatca_chain_state%ROWTYPE;
  v_existing    public.zatca_document_chain%ROWTYPE;
  v_stored_hash TEXT;
  v_new_icv     BIGINT;
  v_pih         TEXT;
BEGIN
  -- (1) Preconditions — non-outcome failures propagate (exceptions, not results).
  IF p_company IS DISTINCT FROM get_current_company_id() THEN
    RAISE EXCEPTION 'COMPANY_SCOPE_VIOLATION';
  END IF;
  IF p_environment NOT IN ('sandbox','simulation','production') THEN
    RAISE EXCEPTION 'INVALID_ENVIRONMENT: %', p_environment;
  END IF;
  IF p_document_type NOT IN ('invoice','credit_note','debit_note') THEN
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;
  IF p_artifact_hash IS NULL OR LENGTH(TRIM(p_artifact_hash)) = 0 THEN
    RAISE EXCEPTION 'INVALID_ARTIFACT_HASH';
  END IF;

  -- (1b) VERIFY the artifact reference (Verifier, not Reader): read ONLY the
  -- hash, FOR SHARE, and confirm identity ↔ hash. The chain depends on nothing
  -- else in the artifact. Absence / mismatch is a PROGRAMMING ERROR.
  SELECT artifact_hash INTO v_stored_hash
  FROM public.zatca_signed_artifacts
  WHERE id = p_artifact_id
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ARTIFACT_NOT_FOUND: %', p_artifact_id;
  END IF;
  IF v_stored_hash <> p_artifact_hash THEN
    RAISE EXCEPTION 'ARTIFACT_HASH_MISMATCH';
  END IF;

  -- (2) Lock the head — the single atomic region for the whole decision.
  INSERT INTO public.zatca_chain_state (company_id, environment)
  VALUES (p_company, p_environment)
  ON CONFLICT (company_id, environment) DO NOTHING;

  SELECT * INTO v_state FROM public.zatca_chain_state
  WHERE company_id = p_company AND environment = p_environment
  FOR UPDATE;

  -- (3) ALREADY_APPLIED — decisive under the lock for (environment, type, id).
  SELECT * INTO v_existing FROM public.zatca_document_chain
  WHERE environment = p_environment
    AND document_type = p_document_type
    AND document_id   = p_document_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'outcome', 'ALREADY_APPLIED',
      'icv', v_existing.icv, 'pih', v_existing.pih,
      'artifactHash', v_existing.artifact_hash, 'uuid', v_existing.uuid
    );
  END IF;

  -- (4) Token compare → CONFLICT (no state change).
  IF v_state.version <> p_token THEN
    RETURN jsonb_build_object(
      'outcome', 'CONFLICT',
      'expectedToken', p_token, 'currentToken', v_state.version
    );
  END IF;

  -- (5) Insert the chain event — referencing the verified artifact.
  v_new_icv := v_state.current_icv + 1;
  v_pih     := v_state.last_hash;
  INSERT INTO public.zatca_document_chain
    (company_id, environment, document_type, document_id, icv, uuid,
     artifact_id, artifact_hash, pih)
  VALUES
    (p_company, p_environment, p_document_type, p_document_id, v_new_icv, p_uuid,
     p_artifact_id, p_artifact_hash, v_pih);

  -- (6) Advance the head (this artifact's hash becomes the next PIH; bump token).
  UPDATE public.zatca_chain_state SET
    current_icv = v_new_icv,
    last_hash   = p_artifact_hash,
    version     = version + 1,
    updated_at  = now()
  WHERE company_id = p_company AND environment = p_environment;

  RETURN jsonb_build_object(
    'outcome', 'SUCCESS',
    'icv', v_new_icv, 'pih', v_pih, 'artifactHash', p_artifact_hash
  );
END;
$fn$;
