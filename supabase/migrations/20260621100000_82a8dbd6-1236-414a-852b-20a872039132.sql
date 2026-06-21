-- ============================================================
-- ZATCA1: Foundation Layer (أساس الفوترة الإلكترونية السعودية)
-- ============================================================
-- Phase 1: بيانات الامتثال + هوية الفاتورة + ICV مستقل + تجهيز QR.
-- QR TLV/Base64 في Service Layer (TypeScript)، لا SQL.
-- المرجع: ZATCA1_DESIGN.md. القرارات معتمدة + credit_notes + zatca_status موحّد.
-- ============================================================

-- ضمان توفّر gen_random_uuid (احتياط للبيئات الجديدة)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═══════════════════ Z1.0: Company Compliance Data ═══════════════════
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS street_address TEXT,
  ADD COLUMN IF NOT EXISTS building_number TEXT,
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS postal_code TEXT,
  ADD COLUMN IF NOT EXISTS additional_number TEXT,
  ADD COLUMN IF NOT EXISTS country_code TEXT DEFAULT 'SA',
  ADD COLUMN IF NOT EXISTS zatca_environment TEXT DEFAULT 'sandbox';  -- sandbox/simulation/production

-- ═══════════════════ Z1.1: Invoice Identity Layer ═══════════════════
-- invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS icv BIGINT,
  ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'standard',       -- standard/simplified
  ADD COLUMN IF NOT EXISTS invoice_category TEXT DEFAULT 'tax_invoice',-- tax_invoice/credit_note/debit_note
  ADD COLUMN IF NOT EXISTS issue_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS zatca_status TEXT DEFAULT 'draft',          -- draft/ready/reported/cleared/rejected/cancelled
  ADD COLUMN IF NOT EXISTS qr_generated_at TIMESTAMPTZ;

-- credit_notes (بنية تعريفية فقط — قرار المالك)
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS icv BIGINT,
  ADD COLUMN IF NOT EXISTS invoice_category TEXT DEFAULT 'credit_note',
  ADD COLUMN IF NOT EXISTS zatca_status TEXT DEFAULT 'draft';

-- قيد التحقّق من zatca_status (الحالات الستّة الموحّدة)
DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_zatca_status_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_zatca_status_check
      CHECK (zatca_status IN ('draft','ready','reported','cleared','rejected','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='credit_notes_zatca_status_check') THEN
    ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_zatca_status_check
      CHECK (zatca_status IN ('draft','ready','reported','cleared','rejected','cancelled'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_type_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_type_check
      CHECK (invoice_type IN ('standard','simplified'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='invoices_category_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_category_check
      CHECK (invoice_category IN ('tax_invoice','credit_note','debit_note'));
  END IF;
END $chk$;

-- ═══════════════════ Z1.3: ICV Sequence (عدّاد مستقل بحت) ═══════════════════
-- جدول مخصّص لـ ICV — عدّاد تنظيمي بحت (BIGINT تصاعدي، لا صيغة نصّية، لا prefix/year).
-- قرار: لا نعيد استخدام get_next_document_number (مبنيّ لصيغ PREFIX-YEAR-NNNN، هشّ مع prefix='').
CREATE TABLE IF NOT EXISTS public.zatca_icv_counter (
  company_id UUID PRIMARY KEY,
  current_icv BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.zatca_icv_counter (company_id, current_icv)
SELECT get_current_company_id(), 0
WHERE NOT EXISTS (SELECT 1 FROM public.zatca_icv_counter WHERE company_id=get_current_company_id());

-- دالة حجز ICV التالي (ذرّية FOR UPDATE، تُرجع BIGINT بحت)
CREATE OR REPLACE FUNCTION public.next_zatca_icv(p_company UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER AS $icv$
DECLARE v_next BIGINT;
BEGIN
  -- قفل ذرّي + إنشاء الصفّ إن لم يوجد
  INSERT INTO public.zatca_icv_counter (company_id, current_icv) VALUES (p_company, 0)
  ON CONFLICT (company_id) DO NOTHING;

  SELECT current_icv + 1 INTO v_next FROM public.zatca_icv_counter WHERE company_id=p_company FOR UPDATE;
  UPDATE public.zatca_icv_counter SET current_icv=v_next, updated_at=now() WHERE company_id=p_company;
  RETURN v_next;
END;
$icv$;

-- ═══════════════════ Z1.4: prepare_zatca_invoice ═══════════════════
-- يجهّز بيانات الفاتورة لـ ZATCA (UUID + ICV + seller + timestamp). لا يولّد QR (الكود يفعل).
CREATE OR REPLACE FUNCTION public.prepare_zatca_invoice(p_invoice_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_company UUID; v_inv RECORD; v_comp RECORD; v_icv BIGINT; v_uuid UUID;
BEGIN
  v_company := get_current_company_id();
  SELECT * INTO v_inv FROM public.invoices WHERE id=p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'INVOICE_NOT_FOUND'); END IF;

  -- يجب أن تكون الفاتورة مُصدرة (issued) — ICV للمُصدرة فقط
  IF v_inv.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'INVOICE_NOT_ISSUED', 'status', v_inv.status);
  END IF;

  -- idempotency: إن جُهّزت سابقاً (لها icv)، نُرجع البيانات دون إعادة حجز
  IF v_inv.icv IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_prepared', true, 'uuid', v_inv.uuid, 'icv', v_inv.icv, 'zatca_status', v_inv.zatca_status);
  END IF;

  -- بيانات الشركة (البائع)
  SELECT * INTO v_comp FROM public.companies WHERE id=v_company;

  -- النقطة 5: فحص اكتمال بيانات الشركة التنظيمية (لا فاتورة ناقصة تنظيمياً)
  IF v_comp.vat_number IS NULL OR v_comp.street_address IS NULL OR v_comp.city IS NULL OR v_comp.postal_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'COMPANY_ZATCA_DATA_INCOMPLETE',
      'missing', jsonb_build_object('vat_number', v_comp.vat_number IS NULL, 'street_address', v_comp.street_address IS NULL,
        'city', v_comp.city IS NULL, 'postal_code', v_comp.postal_code IS NULL));
  END IF;

  -- حجز ICV التالي (عدّاد مستقل بحت — BIGINT مباشر، لا صيغة نصّية)
  v_icv := public.next_zatca_icv(v_company);

  -- uuid (موجود من DEFAULT، نثبّته)
  v_uuid := COALESCE(v_inv.uuid, gen_random_uuid());

  -- تحديث الفاتورة (التجهيز)
  UPDATE public.invoices SET
    uuid = v_uuid,
    icv = v_icv,
    issue_timestamp = COALESCE(issue_timestamp, now()),
    seller_name = COALESCE(seller_name, v_comp.name),
    seller_vat = COALESCE(seller_vat, v_comp.vat_number),
    zatca_status = 'ready'  -- جاهزة لتوليد QR في Service Layer
  WHERE id = p_invoice_id;

  -- حوكمة
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('ZATCA_INVOICE_PREPARED','zatca','invoice',p_invoice_id,v_inv.invoice_no,v_comp.name,
    jsonb_build_object('uuid',v_uuid,'icv',v_icv,'invoice_type',v_inv.invoice_type));

  -- إرجاع البيانات الخمسة لـ QR (Service Layer يولّد TLV+Base64)
  RETURN jsonb_build_object('success', true, 'uuid', v_uuid, 'icv', v_icv,
    'qr_data', jsonb_build_object(
      'seller_name', COALESCE(v_inv.seller_name, v_comp.name),
      'seller_vat', COALESCE(v_inv.seller_vat, v_comp.vat_number),
      'timestamp', COALESCE(v_inv.issue_timestamp, now()),
      'total', v_inv.total,
      'vat_total', v_inv.vat_amount
    ),
    'zatca_status', 'ready');
END;
$fn$;

-- التحقّق
SELECT 'pgcrypto' AS check, (SELECT COUNT(*)::text FROM pg_extension WHERE extname='pgcrypto') AS r
UNION ALL SELECT 'company_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='companies' AND column_name IN ('street_address','building_number','district','city','postal_code','additional_number','country_code','zatca_environment'))
UNION ALL SELECT 'invoice_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='invoices' AND column_name IN ('uuid','icv','invoice_type','invoice_category','issue_timestamp','zatca_status','qr_generated_at'))
UNION ALL SELECT 'cn_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='credit_notes' AND column_name IN ('uuid','icv','invoice_category','zatca_status'))
UNION ALL SELECT 'icv_counter', (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_icv_counter')
UNION ALL SELECT 'icv_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='next_zatca_icv')
UNION ALL SELECT 'prepare_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='prepare_zatca_invoice')
UNION ALL SELECT 'status_constraints', (SELECT COUNT(*)::text FROM pg_constraint WHERE conname IN ('invoices_zatca_status_check','credit_notes_zatca_status_check','invoices_type_check','invoices_category_check'));
