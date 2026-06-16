-- ============================================================
-- Sequence Engine — get_current_company_id() (standalone, idempotent)
-- ============================================================
-- مصدر واحد لسياق الشركة على مستوى DB. تستدعيها triggers/functions
-- (مثل gen_inv_no) بدل تكرار منطق الاستعلام.
-- مستقبلاً (multi-company/SaaS): تُعاد كتابة هذه الدالة فقط (سياق المستأجر)
-- دون تعديل أي trigger.
--
-- ملاحظة: عُرّفت أصلاً ضمن migration تكامل الفاتورة (20260614220000)؛
-- هذا الـ migration يوثّقها مستقلّةً (CREATE OR REPLACE = idempotent).
-- ============================================================

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

-- التحقّق
SELECT get_current_company_id() AS default_company_id;
