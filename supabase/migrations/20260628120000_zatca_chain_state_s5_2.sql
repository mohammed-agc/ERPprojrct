-- ════════════════════════════════════════════════════════════════════════════
-- S5.2 DocumentChainService — ADDITIVE cutover (step 1 of 2).
--
-- Per ADR-028 (Chain Concurrency Model, Accepted): inverts knowledge ordering.
-- The head (ICV + tail hash) is read BEFORE signing (readHead) and embedded in
-- the signed content; append validates the snapshot via a protocol token and
-- commits or reports CONFLICT — the head never moves under a stale snapshot.
--
-- ADDITIVE ONLY. The old assign-after-sign scaffolding (register_document_hash,
-- next_zatca_icv, zatca_icv_counter) has NO consumer (verified: no TS .rpc, no
-- SQL caller) and is dropped in a SEPARATE later migration — AFTER S5.2 is wired
-- and proven (same sprint). This migration breaks nothing.
--
-- Aggregate identity = (company_id, environment)  [ADR-028 §4]. Design rule:
-- every chain-specific unique constraint is DERIVED FROM the aggregate identity,
-- not from the prior implementation's shape.
-- Idempotent (re-runnable).
-- ════════════════════════════════════════════════════════════════════════════

-- ═══════════════ S5.2.0: zatca_chain_state (the unified head) ═══════════════
-- One head row per (company, environment). Absorbs the role of zatca_icv_counter.
CREATE TABLE IF NOT EXISTS public.zatca_chain_state (
  company_id   UUID   NOT NULL,
  environment  TEXT   NOT NULL,
  current_icv  BIGINT NOT NULL DEFAULT 0,   -- ICV of the last committed document (head)
  last_hash    TEXT   NOT NULL              -- the tail's invoice_hash = next document's PIH
               DEFAULT '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9', -- SHA256("0")
  version      BIGINT NOT NULL DEFAULT 0,   -- concurrency token (protocol, NOT domain)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zcs_pk PRIMARY KEY (company_id, environment),
  CONSTRAINT zcs_env_check CHECK (environment IN ('sandbox','simulation','production'))
);

-- ═══════════════ S5.2.1: zatca_document_chain → Event Log ═══════════════
-- The chain table becomes an append-only event log keyed by the new aggregate
-- identity. Its unique constraints are re-derived from (company, environment).
ALTER TABLE public.zatca_document_chain
  ADD COLUMN IF NOT EXISTS environment TEXT;

-- Backfill any pre-existing rows (test data) so NOT NULL + new constraints hold.
-- Production chain starts clean (register had no consumer → expected 0 rows).
UPDATE public.zatca_document_chain SET environment = 'sandbox' WHERE environment IS NULL;

ALTER TABLE public.zatca_document_chain
  ALTER COLUMN environment SET NOT NULL;

ALTER TABLE public.zatca_document_chain
  DROP CONSTRAINT IF EXISTS zdc_env_check;
ALTER TABLE public.zatca_document_chain
  ADD  CONSTRAINT zdc_env_check CHECK (environment IN ('sandbox','simulation','production'));

-- Re-derive the chain's unique constraints from the aggregate identity.
ALTER TABLE public.zatca_document_chain DROP CONSTRAINT IF EXISTS zdc_unique_icv;
ALTER TABLE public.zatca_document_chain DROP CONSTRAINT IF EXISTS zdc_unique_doc;
ALTER TABLE public.zatca_document_chain DROP CONSTRAINT IF EXISTS zdc_unique_hash;

ALTER TABLE public.zatca_document_chain
  ADD CONSTRAINT zdc_unique_icv  UNIQUE (company_id, environment, icv);
ALTER TABLE public.zatca_document_chain
  ADD CONSTRAINT zdc_unique_doc  UNIQUE (environment, document_type, document_id);
ALTER TABLE public.zatca_document_chain
  ADD CONSTRAINT zdc_unique_hash UNIQUE (company_id, environment, invoice_hash);

DROP INDEX IF EXISTS public.idx_zdc_company_icv;
CREATE INDEX IF NOT EXISTS idx_zdc_company_env_icv
  ON public.zatca_document_chain(company_id, environment, icv);

-- ═══════════════ S5.2.2: zatca_read_head (sole READER of the head) ═══════════════
-- Returns a SNAPSHOT of the CURRENT head (state, not projection). The caller
-- derives nextIcv = currentIcv + 1 and uses currentPih as the next doc's PIH.
CREATE OR REPLACE FUNCTION public.zatca_read_head(
  p_company UUID, p_environment TEXT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_row public.zatca_chain_state%ROWTYPE;
BEGIN
  IF p_company IS DISTINCT FROM get_current_company_id() THEN
    RAISE EXCEPTION 'COMPANY_SCOPE_VIOLATION';
  END IF;
  IF p_environment NOT IN ('sandbox','simulation','production') THEN
    RAISE EXCEPTION 'INVALID_ENVIRONMENT: %', p_environment;
  END IF;

  -- Lazy-init the head (defaults: icv=0, last_hash=SHA256("0"), version=0).
  INSERT INTO public.zatca_chain_state (company_id, environment)
  VALUES (p_company, p_environment)
  ON CONFLICT (company_id, environment) DO NOTHING;

  SELECT * INTO v_row FROM public.zatca_chain_state
  WHERE company_id = p_company AND environment = p_environment;

  RETURN jsonb_build_object(
    'currentIcv', v_row.current_icv,
    'currentPih', v_row.last_hash,
    'token',      v_row.version
  );
END;
$fn$;

-- ═══════════════ S5.2.3: zatca_append (sole WRITER; atomic, idempotent) ═══════════════
-- Invariant Locality (ADR-028 §3.1): everything that decides the outcome is
-- evaluated under the SAME lock on the head row.
--   ALREADY_APPLIED (re-entry — the stronger truth) WINS over CONFLICT.
--   CONFLICT leaves the chain state unchanged.
--   Non-outcomes (bad input) propagate as exceptions, never as an outcome.
CREATE OR REPLACE FUNCTION public.zatca_append(
  p_company       UUID,
  p_environment   TEXT,
  p_document_type TEXT,
  p_document_id   UUID,
  p_uuid          UUID,
  p_invoice_hash  TEXT,
  p_token         BIGINT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_state    public.zatca_chain_state%ROWTYPE;
  v_existing public.zatca_document_chain%ROWTYPE;
  v_new_icv  BIGINT;
  v_pih      TEXT;
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
  IF p_invoice_hash IS NULL OR LENGTH(TRIM(p_invoice_hash)) = 0 THEN
    RAISE EXCEPTION 'INVALID_INVOICE_HASH';
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
      'invoiceHash', v_existing.invoice_hash, 'uuid', v_existing.uuid
    );
  END IF;

  -- (4) Token compare — did the head move since the caller's readHead snapshot?
  IF v_state.version <> p_token THEN
    RETURN jsonb_build_object(            -- no state change
      'outcome', 'CONFLICT',
      'expectedToken', p_token, 'currentToken', v_state.version
    );
  END IF;

  -- (5) Insert the chain event (the icv/pih the caller built upon).
  v_new_icv := v_state.current_icv + 1;
  v_pih     := v_state.last_hash;
  INSERT INTO public.zatca_document_chain
    (company_id, environment, document_type, document_id, icv, uuid, invoice_hash, pih)
  VALUES
    (p_company, p_environment, p_document_type, p_document_id,
     v_new_icv, p_uuid, p_invoice_hash, v_pih);

  -- (6) Advance the head (this doc's hash becomes the next PIH; bump token).
  UPDATE public.zatca_chain_state SET
    current_icv = v_new_icv,
    last_hash   = p_invoice_hash,
    version     = version + 1,
    updated_at  = now()
  WHERE company_id = p_company AND environment = p_environment;

  RETURN jsonb_build_object(
    'outcome', 'SUCCESS',
    'icv', v_new_icv, 'pih', v_pih, 'invoiceHash', p_invoice_hash
  );
END;
$fn$;
