-- ============================================================
-- ZATCA4: CSR/CCSID/PCSID Lifecycle Engine
-- ============================================================
-- دورة حياة الشهادات: توسيع الحالة + onboarding tracking + CSR metadata
-- + renewal history + expiry monitoring + State Machine. كله DB tracking.
-- CSR/OTP/API الفعلي في Service Layer. المرجع: ZATCA4_DESIGN.md.
-- ============================================================

-- ═══════════════════ Z4.0: توسيع credential status (State Machine) ═══════════════════
-- ZATCA3: status IN (active/revoked/expired). نضيف pending/rotating (دورة الحياة الكاملة).
ALTER TABLE public.zatca_credentials DROP CONSTRAINT IF EXISTS zc_status_check;
ALTER TABLE public.zatca_credentials ADD CONSTRAINT zc_status_check
  CHECK (status IN ('pending','active','rotating','revoked','expired'));

-- ═══════════════════ Z4.1: zatca_onboarding_sessions (تتبّع المراحل، append-only) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  environment TEXT NOT NULL,
  -- CSR metadata (للتدقيق — ليست أسراراً)
  common_name TEXT,
  egs_serial_number TEXT,
  organization_identifier TEXT,
  manufacturer_name TEXT,
  model_name TEXT,
  device_version TEXT,
  -- مراحل دورة الحياة (تواريخ)
  otp_requested_at TIMESTAMPTZ,
  csr_generated_at TIMESTAMPTZ,
  ccsid_received_at TIMESTAMPTZ,
  pcsid_received_at TIMESTAMPTZ,
  compliance_request_id TEXT,            -- من CCSID، يُستخدم لطلب PCSID
  -- State Machine للجلسة
  onboarding_status TEXT NOT NULL DEFAULT 'otp_requested',
  -- ربط بالشهادات الناتجة
  ccsid_credential_id UUID REFERENCES public.zatca_credentials(id),
  pcsid_credential_id UUID REFERENCES public.zatca_credentials(id),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zos_env_check CHECK (environment IN ('sandbox','simulation','production')),
  CONSTRAINT zos_status_check CHECK (onboarding_status IN
    ('otp_requested','csr_generated','ccsid_received','compliance_in_progress','compliance_passed','pcsid_received','completed','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_onboarding_company ON public.zatca_onboarding_sessions(company_id, environment);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON public.zatca_onboarding_sessions(onboarding_status);
COMMENT ON TABLE public.zatca_onboarding_sessions IS 'Append-only onboarding tracking (OTP->CSR->CCSID->compliance->PCSID). No secrets stored. UPDATE allowed only for status progression via advance_onboarding; DELETE blocked.';

-- ═══════════════════ Z4.2: zatca_credential_renewals (سجلّ التجديد، append-only) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_credential_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  old_credential_id UUID REFERENCES public.zatca_credentials(id),
  new_credential_id UUID REFERENCES public.zatca_credentials(id),
  renewal_type TEXT NOT NULL,            -- renewal (PATCH) / rotation (full) / replacement
  reason TEXT,
  performed_by UUID,
  renewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT zcr_type_check CHECK (renewal_type IN ('renewal','rotation','replacement'))
);
CREATE INDEX IF NOT EXISTS idx_renewals_company ON public.zatca_credential_renewals(company_id, renewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_renewals_old_cred ON public.zatca_credential_renewals(old_credential_id);
COMMENT ON TABLE public.zatca_credential_renewals IS 'Append-only credential renewal/rotation history. UPDATE/DELETE blocked by trigger.';

-- Append-Only triggers (نمط ZATCA3 submission_log)
CREATE OR REPLACE FUNCTION public.zatca_lifecycle_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $ao$
BEGIN
  RAISE EXCEPTION 'ZATCA_LIFECYCLE_RECORD_IS_APPEND_ONLY: % on % not allowed', TG_OP, TG_TABLE_NAME;
END;
$ao$;
DROP TRIGGER IF EXISTS trg_zcr_no_update ON public.zatca_credential_renewals;
DROP TRIGGER IF EXISTS trg_zcr_no_delete ON public.zatca_credential_renewals;
CREATE TRIGGER trg_zcr_no_update BEFORE UPDATE ON public.zatca_credential_renewals
  FOR EACH ROW EXECUTE FUNCTION public.zatca_lifecycle_append_only();
CREATE TRIGGER trg_zcr_no_delete BEFORE DELETE ON public.zatca_credential_renewals
  FOR EACH ROW EXECUTE FUNCTION public.zatca_lifecycle_append_only();
-- onboarding: DELETE محظور فقط (UPDATE مسموح للتقدّم عبر advance_onboarding)
DROP TRIGGER IF EXISTS trg_zos_no_delete ON public.zatca_onboarding_sessions;
CREATE TRIGGER trg_zos_no_delete BEFORE DELETE ON public.zatca_onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.zatca_lifecycle_append_only();

-- ═══════════════════ Z4.3: vw_zatca_expiring_credentials (مراقبة الانتهاء متدرّجة) ═══════════════════
CREATE OR REPLACE VIEW public.vw_zatca_expiring_credentials AS
SELECT id, company_id, environment, credential_type, certificate_serial, certificate_expiry_at, status, is_active,
  EXTRACT(DAY FROM (certificate_expiry_at - now()))::int AS days_until_expiry,
  CASE
    WHEN certificate_expiry_at < now() THEN 'expired'
    WHEN certificate_expiry_at < now() + INTERVAL '7 days' THEN 'expires_7_days'
    WHEN certificate_expiry_at < now() + INTERVAL '15 days' THEN 'expires_15_days'
    WHEN certificate_expiry_at < now() + INTERVAL '30 days' THEN 'expires_30_days'
    ELSE 'valid'
  END AS expiry_alert
FROM public.zatca_credentials
WHERE status IN ('active','rotating');  -- status لا is_active (rotating الآن is_active=false بالخيار A)

-- ═══════════════════ Z4.4: advance_onboarding (State Machine للجلسة) ═══════════════════
CREATE OR REPLACE FUNCTION public.advance_onboarding(p_session_id UUID, p_new_status TEXT, p_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_current TEXT; v_valid_next TEXT[];
BEGIN
  SELECT onboarding_status INTO v_current FROM public.zatca_onboarding_sessions WHERE id=p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ONBOARDING_SESSION_NOT_FOUND: %', p_session_id; END IF;

  -- حوكمة الانتقال (تقدّم خطّي + failed/cancelled من أي مرحلة)
  v_valid_next := CASE v_current
    WHEN 'otp_requested' THEN ARRAY['csr_generated','failed','cancelled']
    WHEN 'csr_generated' THEN ARRAY['ccsid_received','failed','cancelled']
    WHEN 'ccsid_received' THEN ARRAY['compliance_in_progress','failed','cancelled']
    WHEN 'compliance_in_progress' THEN ARRAY['compliance_passed','failed','cancelled']
    WHEN 'compliance_passed' THEN ARRAY['pcsid_received','failed','cancelled']
    WHEN 'pcsid_received' THEN ARRAY['completed','failed','cancelled']
    ELSE ARRAY[]::TEXT[]  -- completed/failed/cancelled نهائية
  END;
  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'INVALID_ONBOARDING_TRANSITION: % -> %', v_current, p_new_status USING ERRCODE='22023';
  END IF;

  -- وضع علامة الجلسة (تسمح للـ trigger بقبول هذا الـ UPDATE — البند 2)
  PERFORM set_config('zatca.via_advance', 'true', true);

  -- تحديث الجلسة + الطوابع الزمنية حسب المرحلة
  UPDATE public.zatca_onboarding_sessions SET
    onboarding_status = p_new_status,
    csr_generated_at = CASE WHEN p_new_status='csr_generated' THEN now() ELSE csr_generated_at END,
    ccsid_received_at = CASE WHEN p_new_status='ccsid_received' THEN now() ELSE ccsid_received_at END,
    pcsid_received_at = CASE WHEN p_new_status='pcsid_received' THEN now() ELSE pcsid_received_at END,
    compliance_request_id = COALESCE(p_data->>'compliance_request_id', compliance_request_id),
    error_message = CASE WHEN p_new_status='failed' THEN p_data->>'error_message' ELSE error_message END
  WHERE id=p_session_id;

  -- إعادة ضبط العلامة فوراً (لا تبقى للبقية — أمان البند 2)
  PERFORM set_config('zatca.via_advance', 'false', true);

  INSERT INTO public.governance_log (event_type, module, details)
  VALUES ('ZATCA_ONBOARDING_'||UPPER(p_new_status),'zatca',
    jsonb_build_object('session_id',p_session_id,'from',v_current,'to',p_new_status));

  RETURN jsonb_build_object('success', true, 'from', v_current, 'to', p_new_status);
END;
$fn$;

-- ═══════════════════ Z4.4b: Onboarding Immutability (البند 2 — UPDATE عبر advance فقط) ═══════════════════
-- State Machine إلزامية: UPDATE مباشر ممنوع، advance_onboarding هو المسار الوحيد.
-- TECH-DEBT-ZATCA4-001: الحماية تعتمد session flag (via_advance). أقوى لاحقاً عبر
-- دالة داخلية مخصّصة أو pg_trigger_depth. الحالي كافٍ (الـ flag transaction-scoped + يُعاد ضبطه).
CREATE OR REPLACE FUNCTION public.zatca_onboarding_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $g$
BEGIN
  IF current_setting('zatca.via_advance', true) IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'ZATCA_ONBOARDING_IS_STATE_MACHINE: use advance_onboarding() — direct UPDATE not allowed';
  END IF;
  RETURN NEW;
END;
$g$;
DROP TRIGGER IF EXISTS trg_zos_guard_update ON public.zatca_onboarding_sessions;
CREATE TRIGGER trg_zos_guard_update BEFORE UPDATE ON public.zatca_onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION public.zatca_onboarding_guard();

-- ═══════════════════ Z4.5: mark_expired_credentials (مراقبة آلية) ═══════════════════
CREATE OR REPLACE FUNCTION public.mark_expired_credentials()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_count INT;
BEGIN
  UPDATE public.zatca_credentials SET status='expired', is_active=false, updated_at=now()
  WHERE certificate_expiry_at < now() AND status IN ('active','rotating');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('success', true, 'expired_count', v_count);
END;
$fn$;

-- ═══════════════════ Z4.6: transition_credential_status (State Machine للشهادة) ═══════════════════
-- المسار الوحيد لتغيير status الشهادة. حوكمة الانتقالات الكاملة.
CREATE OR REPLACE FUNCTION public.transition_credential_status(
  p_credential_id UUID, p_new_status TEXT, p_reason TEXT DEFAULT NULL, p_changed_by UUID DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE v_current TEXT; v_valid_next TEXT[];
BEGIN
  SELECT status INTO v_current FROM public.zatca_credentials WHERE id=p_credential_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'CREDENTIAL_NOT_FOUND: %', p_credential_id; END IF;

  -- حوكمة الانتقالات (نفس فلسفة AW1/ZATCA3)
  v_valid_next := CASE v_current
    WHEN 'pending'  THEN ARRAY['active','revoked']           -- pending→active (أو إلغاء)
    WHEN 'active'   THEN ARRAY['rotating','revoked','expired']
    WHEN 'rotating' THEN ARRAY['active','revoked','expired'] -- rotating→active (اكتمل التدوير)
    ELSE ARRAY[]::TEXT[]  -- revoked/expired نهائيتان
  END;
  IF NOT (p_new_status = ANY(v_valid_next)) THEN
    RAISE EXCEPTION 'INVALID_CREDENTIAL_TRANSITION: % -> % (revoked/expired are terminal)', v_current, p_new_status USING ERRCODE='22023';
  END IF;

  -- فحص استباقي (المالك): التفعيل (→active) مع وجود active أخرى لنفس (company,env,type)
  -- → رسالة حوكمة واضحة بدل خطأ unique index الغامض.
  IF p_new_status='active' THEN
    IF EXISTS (
      SELECT 1 FROM public.zatca_credentials c2
      WHERE c2.company_id = (SELECT company_id FROM public.zatca_credentials WHERE id=p_credential_id)
        AND c2.environment = (SELECT environment FROM public.zatca_credentials WHERE id=p_credential_id)
        AND c2.credential_type = (SELECT credential_type FROM public.zatca_credentials WHERE id=p_credential_id)
        AND c2.is_active = true AND c2.id <> p_credential_id
    ) THEN
      RAISE EXCEPTION 'ACTIVE_CREDENTIAL_ALREADY_EXISTS: revoke the current active credential first';
    END IF;
  END IF;

  -- تحديث الحالة + is_active (الخيار A — المالك): active وحدها الفعّالة؛
  -- rotating قيد التفعيل (is_active=false) لئلا تكسر uq_active_credential مع القديمة active.
  -- التدوير: قديمة active + جديدة rotating(false) → عند الاكتمال القديمة revoked + الجديدة rotating→active.
  UPDATE public.zatca_credentials SET
    status = p_new_status,
    is_active = (p_new_status = 'active'),
    last_rotated_at = CASE WHEN p_new_status='rotating' THEN now() ELSE last_rotated_at END,
    updated_at = now()
  WHERE id = p_credential_id;

  INSERT INTO public.governance_log (event_type, module, details)
  VALUES ('ZATCA_CREDENTIAL_'||UPPER(p_new_status),'zatca',
    jsonb_build_object('credential_id',p_credential_id,'from',v_current,'to',p_new_status,'reason',p_reason,'changed_by',p_changed_by));

  RETURN jsonb_build_object('success', true, 'from', v_current, 'to', p_new_status);
END;
$fn$;

-- التحقّق
SELECT 'status_pending_rotating' AS check, (SELECT CASE WHEN pg_get_constraintdef(oid) LIKE '%pending%' AND pg_get_constraintdef(oid) LIKE '%rotating%' THEN '1' ELSE '0' END FROM pg_constraint WHERE conname='zc_status_check') AS r
UNION ALL SELECT 'onboarding_table', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_onboarding_sessions')
UNION ALL SELECT 'onboarding_csr_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='zatca_onboarding_sessions' AND column_name IN ('common_name','egs_serial_number','organization_identifier','manufacturer_name','model_name','device_version'))
UNION ALL SELECT 'renewals_table', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_credential_renewals')
UNION ALL SELECT 'expiry_view', (SELECT COUNT(*)::text FROM information_schema.views WHERE table_name='vw_zatca_expiring_credentials')
UNION ALL SELECT 'advance_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='advance_onboarding')
UNION ALL SELECT 'mark_expired_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='mark_expired_credentials')
UNION ALL SELECT 'append_only_triggers', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname IN ('trg_zcr_no_update','trg_zcr_no_delete','trg_zos_no_delete'))
UNION ALL SELECT 'onboarding_guard', (SELECT COUNT(*)::text FROM pg_trigger WHERE tgname='trg_zos_guard_update')
UNION ALL SELECT 'transition_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='transition_credential_status');
