-- ============================================================
-- ZATCA2: XML UBL + PIH Chain (Document Chain — Atomic)
-- ============================================================
-- السلسلة التنظيمية الموحّدة (فواتير + إشعارات). ICV+PIH+Hash ذرّياً.
-- XML UBL + SHA-256 في Service Layer. DB يدير السلسلة فقط.
-- المرجع: ZATCA2_DESIGN.md. القرارات معتمدة + Gatekeeper≠Registrar + Atomic.
-- ============================================================

-- ═══════════════════ Z2.0: zatca_document_chain (السلسلة الموحّدة) ═══════════════════
CREATE TABLE IF NOT EXISTS public.zatca_document_chain (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  document_type TEXT NOT NULL,          -- invoice / credit_note / debit_note
  document_id UUID NOT NULL,            -- invoices.id أو credit_notes.id
  icv BIGINT NOT NULL,                  -- العدّاد الموحّد (يُحجز هنا ذرّياً)
  uuid UUID NOT NULL,                   -- uuid المستند
  invoice_hash TEXT NOT NULL,           -- SHA-256 لـ XML (من Service)
  pih TEXT NOT NULL,                    -- هاش المستند السابق (أو SHA256"0")
  xml_generated_at TIMESTAMPTZ DEFAULT now(),
  xml_version TEXT DEFAULT 'UBL-2.1',
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT zdc_type_check CHECK (document_type IN ('invoice','credit_note','debit_note')),
  CONSTRAINT zdc_unique_icv UNIQUE (company_id, icv),               -- لا تكرار ICV
  CONSTRAINT zdc_unique_doc UNIQUE (document_type, document_id),    -- مستند = صفّ
  CONSTRAINT zdc_unique_hash UNIQUE (company_id, invoice_hash)      -- لا hash مكرّر (إضافة المالك)
);
CREATE INDEX IF NOT EXISTS idx_zdc_company_icv ON public.zatca_document_chain(company_id, icv);

-- النقطة 3 (تنظيف legacy): الفواتير المُجهّزة في ZATCA1 أخذت icv قبل اعتماد "ICV lives in chain".
-- الآن السلسلة (zatca_document_chain) هي SSOT للـ ICV. نُصفّر icv القديم في invoices
-- (بيانات اختبارية ZINV-TEST، لا chain row لها) — لئلا يبقى icv بلا صفّ سلسلة (بيانات شاذّة).
-- السلسلة الإنتاجية تبدأ نظيفة من أوّل register حقيقي (icv=1, PIH=SHA256"0").
UPDATE public.invoices SET icv=NULL
WHERE icv IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.zatca_document_chain z WHERE z.document_type='invoice' AND z.document_id=invoices.id);
-- نُصفّر العدّاد أيضاً (السلسلة تبدأ من 1 عند أوّل مستند حقيقي)
UPDATE public.zatca_icv_counter SET current_icv=0 WHERE current_icv > 0
  AND NOT EXISTS (SELECT 1 FROM public.zatca_document_chain WHERE company_id=zatca_icv_counter.company_id);

-- ═══════════════════ Z2.1: أعمدة ربط خفيفة (invoices + credit_notes) ═══════════════════
-- السلسلة هي SSOT، لكن نسخة في المستند تسهّل الواجهة/الاستعلام.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS xml_hash TEXT,
  ADD COLUMN IF NOT EXISTS pih TEXT,
  ADD COLUMN IF NOT EXISTS xml_generated_at TIMESTAMPTZ;
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS xml_hash TEXT,
  ADD COLUMN IF NOT EXISTS pih TEXT,
  ADD COLUMN IF NOT EXISTS xml_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS icv BIGINT;  -- credit_notes قد لا يكون له icv بعد (نفس عدّاد الفواتير)

-- ═══════════════════ Z2.2: تعديل prepare_zatca_invoice (Gatekeeper فقط — لا ICV) ═══════════════════
-- ZATCA1 كانت تحجز ICV. الآن: تحقّق + uuid + status='ready' فقط. ICV ينتقل لـ register.
CREATE OR REPLACE FUNCTION public.prepare_zatca_invoice(p_invoice_id UUID)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_company UUID; v_inv RECORD; v_comp RECORD; v_uuid UUID;
BEGIN
  v_company := get_current_company_id();
  SELECT * INTO v_inv FROM public.invoices WHERE id=p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'reason', 'INVOICE_NOT_FOUND'); END IF;

  -- بوّابة 1: الفاتورة مُصدرة
  IF v_inv.status <> 'issued' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'INVOICE_NOT_ISSUED', 'status', v_inv.status);
  END IF;

  -- بوّابة 2: فحص الإعادة الصارم (دخلت دورة ZATCA؟) — إضافة المالك
  IF v_inv.zatca_status IN ('ready','reported','cleared') THEN
    RETURN jsonb_build_object('success', true, 'already_prepared', true, 'uuid', v_inv.uuid, 'zatca_status', v_inv.zatca_status);
  END IF;

  -- بوّابة 3: اكتمال بيانات الشركة
  SELECT * INTO v_comp FROM public.companies WHERE id=v_company;
  IF v_comp.vat_number IS NULL OR v_comp.street_address IS NULL OR v_comp.city IS NULL OR v_comp.postal_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'COMPANY_ZATCA_DATA_INCOMPLETE',
      'missing', jsonb_build_object('vat_number', v_comp.vat_number IS NULL, 'street_address', v_comp.street_address IS NULL,
        'city', v_comp.city IS NULL, 'postal_code', v_comp.postal_code IS NULL));
  END IF;

  -- التجهيز: uuid + seller + timestamp + status='ready' (لا ICV — ينتقل لـ register)
  v_uuid := COALESCE(v_inv.uuid, gen_random_uuid());
  UPDATE public.invoices SET
    uuid = v_uuid,
    issue_timestamp = COALESCE(issue_timestamp, now()),
    seller_name = COALESCE(seller_name, v_comp.name),
    seller_vat = COALESCE(seller_vat, v_comp.vat_number),
    zatca_status = 'ready'
  WHERE id = p_invoice_id;

  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, subject_name, details)
  VALUES ('ZATCA_INVOICE_PREPARED','zatca','invoice',p_invoice_id,v_inv.invoice_no,v_comp.name,
    jsonb_build_object('uuid',v_uuid,'invoice_type',v_inv.invoice_type));

  -- البيانات لـ Service (لتوليد XML) — لا ICV/PIH بعد (تأتي من register)
  RETURN jsonb_build_object('success', true, 'uuid', v_uuid, 'zatca_status', 'ready',
    'invoice_data', jsonb_build_object(
      'seller_name', COALESCE(v_inv.seller_name, v_comp.name),
      'seller_vat', COALESCE(v_inv.seller_vat, v_comp.vat_number),
      'invoice_category', v_inv.invoice_category,
      'timestamp', COALESCE(v_inv.issue_timestamp, now()),
      'total', v_inv.total, 'vat_total', v_inv.vat_amount));
END;
$fn$;

-- ═══════════════════ Z2.3: register_document_hash (Registrar — ذرّي تماماً) ═══════════════════
-- المصدر الوحيد للحقيقة للسلسلة التنظيمية. ICV+PIH+Hash+Chain معاً أو لا شيء.
CREATE OR REPLACE FUNCTION public.register_document_hash(
  p_document_type TEXT, p_document_id UUID, p_invoice_hash TEXT
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_company UUID; v_icv BIGINT; v_pih TEXT; v_uuid UUID; v_prev_hash TEXT;
  v_seed TEXT := '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9'; -- SHA256("0")
  v_existing RECORD;
BEGIN
  v_company := get_current_company_id();

  -- فحص الهاش (إضافة المالك)
  IF p_invoice_hash IS NULL OR LENGTH(TRIM(p_invoice_hash))=0 THEN
    RAISE EXCEPTION 'INVALID_INVOICE_HASH';
  END IF;

  -- idempotency الإيجابية: المستند مُسجّل سابقاً؟ (مصدر الحقيقة = chain، لا status)
  -- نقطة تكامل خارجي (Service/Fatoora): retry آمن بعد COMMIT+انقطاع شبكة.
  SELECT * INTO v_existing FROM public.zatca_document_chain
  WHERE document_type=p_document_type AND document_id=p_document_id;
  IF FOUND THEN
    -- حوكمة الإعادة (لا تمرّ بصمت — لتحليل مشاكل التكامل مستقبلاً)
    INSERT INTO public.governance_log (event_type, module, document_type, document_id, details)
    VALUES ('ZATCA_DOCUMENT_RETRY','zatca',p_document_type,p_document_id,
      jsonb_build_object('icv',v_existing.icv,'invoice_hash',v_existing.invoice_hash,'note','idempotent retry — already registered'));
    RETURN jsonb_build_object('success', true, 'already_registered', true,
      'icv', v_existing.icv, 'pih', v_existing.pih, 'invoice_hash', v_existing.invoice_hash, 'uuid', v_existing.uuid);
  END IF;

  -- جلب uuid المستند (من invoices أو credit_notes)
  IF p_document_type='invoice' THEN
    SELECT uuid INTO v_uuid FROM public.invoices WHERE id=p_document_id;
  ELSIF p_document_type IN ('credit_note','debit_note') THEN
    SELECT uuid INTO v_uuid FROM public.credit_notes WHERE id=p_document_id;
  ELSE
    RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: %', p_document_type;
  END IF;
  IF v_uuid IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND_OR_NO_UUID: % %', p_document_type, p_document_id; END IF;

  -- ═══ الكتلة الذرّية: ICV + PIH + Hash + Chain معاً ═══
  -- 1. حجز ICV (ذرّي FOR UPDATE داخل next_zatca_icv)
  v_icv := public.next_zatca_icv(v_company);

  -- 2. جلب hash آخر مستند في السلسلة (icv الأعلى السابق) — PIH
  SELECT invoice_hash INTO v_prev_hash FROM public.zatca_document_chain
  WHERE company_id=v_company ORDER BY icv DESC LIMIT 1;
  -- 3. PIH = السابق، أو SHA256("0") للأوّل
  v_pih := COALESCE(v_prev_hash, v_seed);

  -- 4. إدراج صفّ السلسلة (icv+uuid+hash+pih معاً)
  INSERT INTO public.zatca_document_chain (company_id, document_type, document_id, icv, uuid, invoice_hash, pih)
  VALUES (v_company, p_document_type, p_document_id, v_icv, v_uuid, p_invoice_hash, v_pih);

  -- 5. تحديث المستند (نسخة خفيفة + ICV + status='reported')
  IF p_document_type='invoice' THEN
    UPDATE public.invoices SET icv=v_icv, xml_hash=p_invoice_hash, pih=v_pih, xml_generated_at=now(), zatca_status='reported'
    WHERE id=p_document_id;
  ELSE
    UPDATE public.credit_notes SET icv=v_icv, xml_hash=p_invoice_hash, pih=v_pih, xml_generated_at=now(), zatca_status='reported'
    WHERE id=p_document_id;
  END IF;

  -- حوكمة
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, details)
  VALUES ('ZATCA_DOCUMENT_REGISTERED','zatca',p_document_type,p_document_id,
    (CASE WHEN p_document_type='invoice' THEN (SELECT invoice_no FROM invoices WHERE id=p_document_id) ELSE (SELECT cn_no FROM credit_notes WHERE id=p_document_id) END),
    jsonb_build_object('icv',v_icv,'pih',v_pih,'invoice_hash',p_invoice_hash));

  RETURN jsonb_build_object('success', true, 'icv', v_icv, 'pih', v_pih,
    'invoice_hash', p_invoice_hash, 'uuid', v_uuid, 'zatca_status', 'reported');
END;
$fn$;

-- التحقّق
SELECT 'chain_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='zatca_document_chain') AS r
UNION ALL SELECT 'chain_constraints', (SELECT COUNT(*)::text FROM pg_constraint WHERE conname IN ('zdc_unique_icv','zdc_unique_doc','zdc_unique_hash','zdc_type_check'))
UNION ALL SELECT 'invoice_xml_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='invoices' AND column_name IN ('xml_hash','pih','xml_generated_at'))
UNION ALL SELECT 'cn_xml_cols', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='credit_notes' AND column_name IN ('xml_hash','pih','xml_generated_at','icv'))
UNION ALL SELECT 'prepare_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='prepare_zatca_invoice')
UNION ALL SELECT 'register_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='register_document_hash');
