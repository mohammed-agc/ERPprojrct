-- ════════════════════════════════════════════════════════════════════════════
-- Artifact Store — zatca_signed_artifacts.
--
-- The SOLE owner of the signed artifact: the irreproducible product of compose
-- (signed XML + the exact signing context). Born BEFORE the chain commits to its
-- hash (the durability boundary), so the chain never references a lost artifact.
--
-- OWNERSHIP & INVARIANTS (frozen, per the S5 review):
--   - Immutable, append-only: INSERT + SELECT only. UPDATE/DELETE are blocked at
--     the DB level — an artifact is a historical record, even failed attempts.
--   - A document may have MANY artifacts (one per signing attempt). The chain
--     references exactly ONE (the committed attempt); the rest are system record,
--     not garbage. Hence NO unique on document_id.
--   - artifact_hash is the ONLY field the chain reads (to VERIFY identity↔hash,
--     FOR SHARE). The chain depends on nothing else here.
--   - QR is NOT stored here: it is a deterministic derivative, already embedded in
--     signed_xml and projected onto invoices.qr_code (it is not artifact identity).
--   - certificate_fingerprint is kept ALONGSIDE credential_id because the artifact
--     is a historical record: credentials may be recycled / the Vault replaced, but
--     the artifact must preserve WHAT actually signed it.
--
-- Aggregate identity for scoping mirrors the chain: (company_id, environment).
-- Idempotent (re-runnable).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.zatca_signed_artifacts (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id              UUID        NOT NULL,
  environment             TEXT        NOT NULL,
  document_type           TEXT        NOT NULL,
  document_id             UUID        NOT NULL,
  artifact_hash           TEXT        NOT NULL,   -- the ONLY field the chain verifies
  signed_xml              TEXT        NOT NULL,   -- the irreproducible product (bytes)
  signing_time            TIMESTAMPTZ NOT NULL,   -- the exact time baked into the signature
  credential_id           UUID        NOT NULL,   -- operational reference
  certificate_fingerprint TEXT        NOT NULL,   -- historical record of what signed it
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zsa_env_check  CHECK (environment   IN ('sandbox','simulation','production')),
  CONSTRAINT zsa_type_check CHECK (document_type IN ('invoice','credit_note','debit_note'))
);

-- Lookup by the document this artifact was produced for (many attempts per doc).
CREATE INDEX IF NOT EXISTS idx_zsa_company_env_doc
  ON public.zatca_signed_artifacts(company_id, environment, document_type, document_id);

-- ── Immutability guard: append-only at the DB level (insert + select only) ──
CREATE OR REPLACE FUNCTION public.zatca_artifacts_immutable()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION
    'zatca_signed_artifacts is append-only (immutable): % is not allowed', TG_OP;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_zsa_immutable ON public.zatca_signed_artifacts;
CREATE TRIGGER trg_zsa_immutable
  BEFORE UPDATE OR DELETE ON public.zatca_signed_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.zatca_artifacts_immutable();
