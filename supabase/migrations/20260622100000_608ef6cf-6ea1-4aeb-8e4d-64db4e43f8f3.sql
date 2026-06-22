-- ============================================================
-- ZATCA3: Fatoora Integration — Database & Audit Layer
-- ============================================================
-- بنية التخزين/التسجيل للتكامل مع Fatoora. لا توقيع/CSR/API (Service Layer).
-- المفتاح الخاص في Vault نهائياً. DB يخزّن المراجع + سجلّ الإرسال + حوكمة الحالة.
-- المرجع: ZATCA3_DESIGN.md. الدمج المعتمد (الصورة + إضافات المالك).
-- ============================================================

-- ═══════════════════ Z3.0: zatca_credentials (مراجع CSID، لا مفتاح خاص) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,                       -- sandbox/simulation/production
  credential_type TEXT NOT NULL,                   -- CCSID / PCSID
  certificate_serial TEXT,
  certificate_subject TEXT,
  certificate_fingerprint TEXT NOT NULL,           -- المرجع الحقيقي للشهادة
  certificate_expiry_at TIMESTAMPTZ NOT NULL,    -- إلزامي (دورة حياة الشهادة — المالك)
  binary_security_token TEXT NOT NULL,             -- رمز مصادقة API (قابل للإبطال)
  secret_encrypted TEXT NOT NULL,                  -- secret مشفّر (لا نصّ صريح)
  secret_encryption_iv TEXT NOT NULL,              -- IV/nonce لـ AES-256-GCM (فريد)
  secret_encryption_version TEXT NOT NULL DEFAULT 'AES-256-GCM',
  credential_fingerprint TEXT NOT NULL,            -- بصمة الرمز/السرّ (إلزامي — المالك)
  issued_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,                         -- مراقبة الاستخدام (المالك)
  last_rotated_at TIMESTAMPTZ,                      -- تدوير الشهادة (المالك)
  secret_rotated_at TIMESTAMPTZ,                    -- تدوير الرمز فقط — حدث منفصل (المالك)
  status TEXT NOT NULL DEFAULT 'active',            -- active/revoked/expired
  is_active BOOLEAN NOT NULL DEFAULT true,          -- (المالك)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zc_type_check CHECK (credential_type IN ('CCSID','PCSID')),
  CONSTRAINT zc_env_check CHECK (environment IN ('sandbox','simulation','production')),
  CONSTRAINT zc_status_check CHECK (status IN ('active','revoked','expired'))
);
-- شهادة فعّالة واحدة لكل (شركة، بيئة، نوع) — يمنع PCSID Active مزدوج
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_credential
  ON public.zatca_credentials(company_id, environment, credential_type) WHERE is_active=true;
CREATE INDEX IF NOT EXISTS idx_credentials_company ON public.zatca_credentials(company_id);

-- تعليق حوكمة أمني صريح (النقطة 2 — المالك): لا مفاتيح خاصة في DB إطلاقاً
COMMENT ON TABLE public.zatca_credentials IS 'No private keys/PEM/PFX stored in database. Private keys live in external Vault/KMS/HSM only. This table holds API auth references (binary_security_token + encrypted secret) and certificate metadata only.';

-- ═══════════════════ Z3.1: zatca_submission_log (سجلّ التدقيق الكامل) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_submission_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,                     -- invoice/credit_note/debit_note
  document_id UUID NOT NULL,
  icv BIGINT,
  zatca_invoice_uuid TEXT,                         -- uuid المستند (نصّ — حيادي)
  submission_type TEXT NOT NULL,                   -- clearance (B2B) / reporting (B2C)
  credential_id UUID REFERENCES public.zatca_credentials(id),  -- أيّ شهادة استُخدمت
  request_id TEXT,
  external_reference TEXT,                         -- مرجع حيادي (لا clearance_uuid — المالك)
  http_status INT,
  zatca_status TEXT,                               -- الحالة الناتجة
  zatca_response_code TEXT,
  response_description TEXT,
  response_json JSONB,                             -- الاستجابة الكاملة (تدقيق)
  xml_hash TEXT,                                   -- مرجع (لا XML كامل — مربوط بالسلسلة)
  success BOOLEAN NOT NULL DEFAULT false,
  error_category TEXT CHECK (error_category IN ('network','validation','zatca_rejected','server','unknown')),
  error_code TEXT,
  error_message TEXT,
  retryable BOOLEAN,
  attempt_number INT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zsl_subtype_check CHECK (submission_type IN ('clearance','reporting'))
);
-- فهرسان (المالك): success للعمليات، status للتدقيق
CREATE INDEX IF NOT EXISTS idx_submission_doc ON public.zatca_submission_log(document_type, document_id);
CREATE INDEX IF NOT EXISTS idx_submission_success ON public.zatca_submission_log(success, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_submission_status ON public.zatca_submission_log(zatca_status, submitted_at DESC);

-- النقطة 4 (Append-Only — المالك): سجلّ الإرسال غير قابل للتعديل/الحذف.
-- كل محاولة = صفّ جديد (attempt_number). لا UPDATE/DELETE — تكامل التدقيق.
COMMENT ON TABLE public.zatca_submission_log IS 'Append-only audit log. Each submission attempt is a new row (attempt_number). UPDATE/DELETE blocked by trigger for audit integrity.';

CREATE OR REPLACE FUNCTION public.zatca_submission_log_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $ao$
BEGIN
  RAISE EXCEPTION 'ZATCA_SUBMISSION_LOG_IS_APPEND_ONLY: % not allowed', TG_OP;
END;
$ao$;
DROP TRIGGER IF EXISTS trg_zsl_no_update ON public.zatca_submission_log;
DROP TRIGGER IF EXISTS trg_zsl_no_delete ON public.zatca_submission_log;
CREATE TRIGGER trg_zsl_no_update BEFORE UPDATE ON public.zatca_submission_log
  FOR EACH ROW EXECUTE FUNCTION public.zatca_submission_log_append_only();
CREATE TRIGGER trg_zsl_no_delete BEFORE DELETE ON public.zatca_submission_log
  FOR EACH ROW EXECUTE FUNCTION public.zatca_submission_log_append_only();

-- ═══════════════════ Z3.2: update_zatca_submission_status (State Machine فقط) ═══════════════════
-- حوكمة انتقال الحالة فقط — لا تكتب log (فصل المسؤوليات — المالك).
CREATE OR REPLACE FUNCTION public.update_zatca_submission_status(
  p_document_type TEXT, p_document_id UUID, p_new_status TEXT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_current_status TEXT;
BEGIN
  -- 1. الحالة الحالية
  IF p_document_type='invoice' THEN
    SELECT zatca_status INTO v_current_status FROM public.invoices WHERE id=p_document_id;
  ELSIF p_document_type IN ('credit_note','debit_note') THEN
    SELECT zatca_status INTO v_current_status FROM public.credit_notes WHERE id=p_document_id;
  ELSE
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND: % %', p_document_type, p_document_id; END IF;

  -- 2. حوكمة الانتقال الصارمة (نهائية — ERRCODE 22023)
  IF v_current_status='cleared' AND p_new_status IN ('rejected','failed') THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION_CLEARED_TO_REJECTED' USING ERRCODE='22023';
  END IF;
  IF v_current_status='rejected' AND p_new_status='cleared' THEN
    RAISE EXCEPTION 'INVALID_STATE_TRANSITION_REJECTED_TO_CLEARED' USING ERRCODE='22023';
  END IF;

  -- 3. تحديث المستند
  IF p_document_type='invoice' THEN
    UPDATE public.invoices SET zatca_status=p_new_status, updated_at=now() WHERE id=p_document_id;
  ELSE
    UPDATE public.credit_notes SET zatca_status=p_new_status, updated_at=now() WHERE id=p_document_id;
  END IF;

  -- 4. حوكمة
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, details)
  VALUES ('ZATCA_SUBMISSION_'||UPPER(p_new_status),'zatca',p_document_type,p_document_id,
    jsonb_build_object('from',v_current_status,'to',p_new_status));

  RETURN jsonb_build_object('success', true, 'from', v_current_status, 'to', p_new_status);
END;
$fn$;

-- التحقّق
SELECT 'credentials_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_credentials') AS r
UNION ALL SELECT 'credentials_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='zatca_credentials' AND column_name IN ('secret_encrypted','secret_encryption_iv','secret_encryption_version','credential_fingerprint','last_used_at','last_rotated_at','secret_rotated_at','is_active','certificate_fingerprint'))
UNION ALL SELECT 'no_private_key', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='zatca_credentials' AND (column_name LIKE '%private%' OR column_name LIKE '%pem%' OR column_name LIKE '%pfx%'))
UNION ALL SELECT 'uq_active_cred', (SELECT COUNT(*)::text FROM pg_indexes WHERE indexname='uq_active_credential')
UNION ALL SELECT 'log_table', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_submission_log')
UNION ALL SELECT 'log_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='zatca_submission_log' AND column_name IN ('attempt_number','success','retryable','error_category','response_json','external_reference','credential_id'))
UNION ALL SELECT 'log_indexes', (SELECT COUNT(*)::text FROM pg_indexes WHERE indexname IN ('idx_submission_doc','idx_submission_success','idx_submission_status'))
UNION ALL SELECT 'update_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='update_zatca_submission_status')
UNION ALL SELECT 'expiry_not_null', (SELECT CASE WHEN is_nullable='NO' THEN '1' ELSE '0' END FROM information_schema.columns WHERE table_name='zatca_credentials' AND column_name='certificate_expiry_at')
UNION ALL SELECT 'append_only_triggers', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname IN ('trg_zsl_no_update','trg_zsl_no_delete'))
UNION ALL SELECT 'governance_comment', (SELECT CASE WHEN obj_description('public.zatca_credentials'::regclass) IS NOT NULL THEN '1' ELSE '0' END);
