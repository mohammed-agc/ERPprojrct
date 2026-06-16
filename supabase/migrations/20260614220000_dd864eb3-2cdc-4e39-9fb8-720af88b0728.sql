-- ============================================================
-- Sequence Engine — TASK 5: Sales Invoice Integration (Option 2, AUDITED + SAFEGUARDS)
-- ============================================================
-- مرجع: SEQUENCE_TRIGGER_AUDIT.md (معتمد) + مراجعة التكامل (ضمانتان).
--
-- الضمانة 1: دالة get_current_company_id() = مصدر واحد لسياق الشركة على مستوى DB.
--            triggers تستدعيها بدل تكرار منطق الاستعلام. مستقبلاً تتغيّر هي فقط.
-- الضمانة 2: NEW.id — تأكّد أن invoices.id له default gen_random_uuid()، لذا
--            DEFAULT يُملأ قبل BEFORE INSERT triggers (قاعدة PostgreSQL). NEW.id مضمون.
--
-- branch_id = NULL (invoices بلا عمود فرع — ترقيم company-level).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- SAFEGUARD 1 — دالة سياق الشركة المركزية (مصدر واحد)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  SELECT id INTO v_company_id
  FROM companies
  WHERE code = 'DEFAULT' AND is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No active default company found';
  END IF;

  RETURN v_company_id;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- STEP 1 — حذف الـ trigger المكرّر الميّت + دالته
-- ════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS trg_invoice_no ON invoices;
DROP FUNCTION IF EXISTS generate_invoice_no();

-- ════════════════════════════════════════════════════════════
-- STEP 2 — الإبقاء على trg_inv_no (الـ trigger الوحيد) — لا تغيير عليه.
-- ════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════
-- STEP 3 — إعادة كتابة gen_inv_no() لتستدعي المحرّك المركزي
--   عبر get_current_company_id() (الضمانة 1)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION gen_inv_no()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    -- الضمانة 1: سياق الشركة من الدالة المركزية (لا تكرار منطق)
    v_company_id := get_current_company_id();

    -- المحرّك المركزي: atomic، يسجّل، company-aware.
    -- NEW.id مضمون (default gen_random_uuid يُملأ قبل BEFORE INSERT).
    NEW.invoice_no := get_next_document_number(
      v_company_id,                              -- p_company_id
      'SALES_INVOICE',                           -- p_document_type
      NULL,                                      -- p_branch_id (لا فرع)
      COALESCE(NEW.invoice_date, CURRENT_DATE),  -- p_document_date
      NEW.created_by,                            -- p_generated_by
      NEW.id                                     -- p_document_id (مضمون)
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- ════════════════════════════════════════════════════════════
-- التحقّق — trigger ترقيم واحد فقط + دالة السياق موجودة
-- ════════════════════════════════════════════════════════════
SELECT tgname AS remaining_triggers,
       CASE WHEN (tgtype & 2) > 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
       proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE tgrelid = 'invoices'::regclass AND NOT tgisinternal
ORDER BY (tgtype & 2) DESC, tgname;

-- ════════════════════════════════════════════════════════════
-- ROLLBACK PLAN (توثيق — لا يُنفّذ إلا عند الحاجة)
-- ════════════════════════════════════════════════════════════
-- 1) إعادة gen_inv_no القديمة (nextval inv_no_seq):
--    CREATE OR REPLACE FUNCTION gen_inv_no() RETURNS trigger LANGUAGE plpgsql AS $$
--    BEGIN IF NEW.invoice_no IS NULL OR NEW.invoice_no='' THEN
--      NEW.invoice_no := 'INV-'||to_char(now(),'YYYY')||'-'||LPAD(nextval('inv_no_seq')::text,4,'0');
--    END IF; RETURN NEW; END; $$;
-- 2) (اختياري) إعادة generate_invoice_no() + trg_invoice_no.
-- 3) get_current_company_id() يمكن تركها (غير ضارّة).
-- inv_no_seq/sinv_seq لم تُحذفا → الاستعادة ممكنة.
