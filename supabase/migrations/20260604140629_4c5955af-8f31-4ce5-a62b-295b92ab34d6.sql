
-- 1) Extend audit to diff meta JSONB keys + add role gate for financial fields

CREATE OR REPLACE FUNCTION public.can_manage_customer_finance(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'manager')
    OR public.has_role(_user_id, 'general_manager')
    OR public.has_role(_user_id, 'accountant')
    OR (public.user_department(_user_id) = (SELECT id FROM public.departments WHERE code = 'accounting'));
$$;

-- Replace audit trigger function: now also diffs meta JSONB keys
CREATE OR REPLACE FUNCTION public.customers_audit_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  v_field text;
  v_old jsonb;
  v_new jsonb;
  v_old_row jsonb;
  v_new_row jsonb;
  v_old_meta jsonb;
  v_new_meta jsonb;
  v_tracked text[] := ARRAY[
    'name','vat_number','phone','email','city','address','notes',
    'credit_limit','payment_terms_days','settlement_policy','grace_days','is_active'
  ];
  v_meta_tracked text[] := ARRAY[
    'cr_number','name_ar','name_en','short_name','national_id','mobile'
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

  -- top-level tracked columns
  FOREACH v_field IN ARRAY v_tracked LOOP
    v_old := v_old_row -> v_field;
    v_new := v_new_row -> v_field;
    IF v_old IS DISTINCT FROM v_new THEN
      INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
      VALUES ('update','customers','customer', NEW.id::text, NEW.code, v_uid, v_uname,
              jsonb_build_object('field', v_field, 'old', v_old, 'new', v_new));
    END IF;
  END LOOP;

  -- meta JSONB tracked keys (cr_number, name_ar, name_en, short_name, national_id, mobile)
  v_old_meta := COALESCE(v_old_row -> 'meta', '{}'::jsonb);
  v_new_meta := COALESCE(v_new_row -> 'meta', '{}'::jsonb);
  -- only diff if meta column exists on the table; otherwise both are '{}'
  IF (v_old_row ? 'meta') OR (v_new_row ? 'meta') THEN
    FOREACH v_field IN ARRAY v_meta_tracked LOOP
      v_old := v_old_meta -> v_field;
      v_new := v_new_meta -> v_field;
      IF v_old IS DISTINCT FROM v_new THEN
        INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
        VALUES ('update','customers','customer', NEW.id::text, NEW.code, v_uid, v_uname,
                jsonb_build_object('field', 'meta.' || v_field, 'old', v_old, 'new', v_new));
      END IF;
    END LOOP;
  END IF;

  -- stamp updated_by automatically when the caller didn't set it
  IF NEW.updated_by IS NULL OR NEW.updated_by = OLD.updated_by THEN
    NEW.updated_by := COALESCE(v_uid, NEW.updated_by);
  END IF;
  NEW.updated_at := now();

  RETURN NEW;
END;
$function$;

-- 2) Role gate trigger for financial fields
CREATE OR REPLACE FUNCTION public.customers_restrict_finance_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  v_changed boolean := false;
  v_changed_fields text[] := ARRAY[]::text[];
BEGIN
  IF NEW.credit_limit IS DISTINCT FROM OLD.credit_limit THEN
    v_changed := true; v_changed_fields := v_changed_fields || 'credit_limit';
  END IF;
  IF NEW.settlement_policy IS DISTINCT FROM OLD.settlement_policy THEN
    v_changed := true; v_changed_fields := v_changed_fields || 'settlement_policy';
  END IF;
  IF NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days THEN
    v_changed := true; v_changed_fields := v_changed_fields || 'payment_terms_days';
  END IF;
  IF NEW.grace_days IS DISTINCT FROM OLD.grace_days THEN
    v_changed := true; v_changed_fields := v_changed_fields || 'grace_days';
  END IF;

  IF v_changed AND NOT public.can_manage_customer_finance(v_uid) THEN
    SELECT full_name INTO v_uname FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
    VALUES ('denied','customers','customer', OLD.id::text, OLD.code, v_uid, v_uname,
            jsonb_build_object(
              'reason','unauthorized_finance_update',
              'attempted_fields', to_jsonb(v_changed_fields)
            ));
    RAISE EXCEPTION 'ليس لديك صلاحية تعديل الحدود الائتمانية أو سياسات السداد';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS customers_restrict_finance_fields_trg ON public.customers;
CREATE TRIGGER customers_restrict_finance_fields_trg
BEFORE UPDATE ON public.customers
FOR EACH ROW EXECUTE FUNCTION public.customers_restrict_finance_fields();
