-- Master Data Governance for customers (covers supplier-role contacts too)

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- Block hard delete; require is_active=false instead
CREATE OR REPLACE FUNCTION public.customers_block_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'لا يُسمح بحذف بطاقة العميل/المورد نهائياً — استخدم "تعطيل" (is_active=false) بدلاً من الحذف';
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_block_hard_delete ON public.customers;
CREATE TRIGGER trg_customers_block_hard_delete
  BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_block_hard_delete();

-- Block changes to protected/system fields
CREATE OR REPLACE FUNCTION public.customers_protect_system_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id <> OLD.id THEN RAISE EXCEPTION 'لا يمكن تعديل المعرّف الداخلي'; END IF;
  IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'لا يمكن تعديل الكود التسلسلي للعميل/المورد'; END IF;
  IF NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'لا يمكن تعديل تاريخ الإنشاء'; END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN RAISE EXCEPTION 'لا يمكن تعديل منشئ السجل'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_protect_system_fields ON public.customers;
CREATE TRIGGER trg_customers_protect_system_fields
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_protect_system_fields();

-- Field-level audit trigger
CREATE OR REPLACE FUNCTION public.customers_audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_old_row jsonb;
  v_new_row jsonb;
  v_tracked text[] := ARRAY[
    'name','vat_number','phone','email','city','address','notes',
    'credit_limit','payment_terms_days','settlement_policy','grace_days','is_active'
  ];
BEGIN
  SELECT full_name INTO v_uname FROM public.profiles WHERE id = v_uid;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
    VALUES ('insert','customers','customer', NEW.id::text, NEW.code, v_uid, v_uname,
            jsonb_build_object('new', to_jsonb(NEW)));
    RETURN NEW;
  END IF;

  v_old_row := to_jsonb(OLD);
  v_new_row := to_jsonb(NEW);

  FOREACH v_field IN ARRAY v_tracked LOOP
    v_old := v_old_row -> v_field;
    v_new := v_new_row -> v_field;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
      VALUES ('update','customers','customer', NEW.id::text, NEW.code, v_uid, v_uname,
              jsonb_build_object('field', v_field, 'old', v_old, 'new', v_new));
    END IF;
  END LOOP;

  -- stamp updated_by automatically when the caller didn't set it
  IF NEW.updated_by IS NULL OR NEW.updated_by = OLD.updated_by THEN
    NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_audit_changes ON public.customers;
CREATE TRIGGER trg_customers_audit_changes
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_audit_changes();
