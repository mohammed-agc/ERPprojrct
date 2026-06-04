-- =========================================================================
-- PHASE 14A — Transactional Governance
-- =========================================================================

-- 1) Purchase Invoice status transition guard --------------------------------
CREATE OR REPLACE FUNCTION public.validate_purchase_invoice_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'          AND NEW.status IN ('posted','cancelled'))
     OR (OLD.status='posted'         AND NEW.status IN ('partially_paid','paid','cancelled'))
     OR (OLD.status='partially_paid' AND NEW.status IN ('paid','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة (فاتورة شراء): % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_purchase_invoice_status ON public.purchase_invoices;
CREATE TRIGGER trg_validate_purchase_invoice_status
  BEFORE UPDATE OF status ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.validate_purchase_invoice_status_transition();

-- Prevent edits to posted purchase invoices (except status/paid_amount/journal_entry_id)
CREATE OR REPLACE FUNCTION public.protect_posted_purchase_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
BEGIN
  IF OLD.status IN ('posted','partially_paid','paid') THEN
    IF NEW.invoice_no  IS DISTINCT FROM OLD.invoice_no
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
    OR NEW.subtotal    IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount  IS DISTINCT FROM OLD.vat_amount
    OR NEW.total       IS DISTINCT FROM OLD.total THEN
      IF NOT public.has_role(auth.uid(),'admin') THEN
        RAISE EXCEPTION 'لا يمكن تعديل بيانات فاتورة شراء مرحَّلة';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posted_purchase_invoice ON public.purchase_invoices;
CREATE TRIGGER trg_protect_posted_purchase_invoice
  BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.protect_posted_purchase_invoice();

-- 2) Supplier Payment status transition + posting guard ----------------------
CREATE OR REPLACE FUNCTION public.validate_supplier_payment_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'  AND NEW.status IN ('posted','void'))
     OR (OLD.status='posted' AND NEW.status IN ('void'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة (دفعة مورد): % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_supplier_payment_status ON public.supplier_payments;
CREATE TRIGGER trg_validate_supplier_payment_status
  BEFORE UPDATE OF status ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_payment_status_transition();

CREATE OR REPLACE FUNCTION public.protect_posted_supplier_payment()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    IF NEW.amount      IS DISTINCT FROM OLD.amount
    OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
    OR NEW.payment_no  IS DISTINCT FROM OLD.payment_no
    OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
    OR NEW.method      IS DISTINCT FROM OLD.method
    OR NEW.purchase_invoice_id IS DISTINCT FROM OLD.purchase_invoice_id THEN
      IF NOT public.has_role(auth.uid(),'admin') THEN
        RAISE EXCEPTION 'لا يمكن تعديل بيانات دفعة مورد مرحَّلة';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_protect_posted_supplier_payment ON public.supplier_payments;
CREATE TRIGGER trg_protect_posted_supplier_payment
  BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.protect_posted_supplier_payment();

-- 3) Unified governance/audit triggers --------------------------------------
CREATE OR REPLACE FUNCTION public.audit_doc_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_uname text;
  v_doc_id text;
  v_doc_code text;
  v_old_status text;
  v_new_status text;
BEGIN
  SELECT full_name INTO v_uname FROM public.profiles WHERE id = v_uid;
  v_doc_id := COALESCE(NEW.id, OLD.id)::text;

  IF TG_TABLE_NAME = 'purchase_invoices' THEN
    v_doc_code := COALESCE(NEW.invoice_no, OLD.invoice_no);
  ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
    v_doc_code := COALESCE(NEW.payment_no, OLD.payment_no);
  ELSIF TG_TABLE_NAME = 'inspections' THEN
    v_doc_code := COALESCE(NEW.insp_no, OLD.insp_no);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
    VALUES ('insert', TG_TABLE_NAME, TG_TABLE_NAME, v_doc_id, v_doc_code, v_uid, v_uname,
            jsonb_build_object('new', to_jsonb(NEW)));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_status := (to_jsonb(OLD) ->> 'status');
    v_new_status := (to_jsonb(NEW) ->> 'status');
    IF v_old_status IS DISTINCT FROM v_new_status THEN
      INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
      VALUES ('status_change', TG_TABLE_NAME, TG_TABLE_NAME, v_doc_id, v_doc_code, v_uid, v_uname,
              jsonb_build_object('old_status', v_old_status, 'new_status', v_new_status));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log(action, module, document_type, document_id, document_code, user_id, user_name, payload)
    VALUES ('delete', TG_TABLE_NAME, TG_TABLE_NAME, v_doc_id, v_doc_code, v_uid, v_uname,
            jsonb_build_object('old', to_jsonb(OLD)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_audit_purchase_invoices ON public.purchase_invoices;
CREATE TRIGGER trg_audit_purchase_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

DROP TRIGGER IF EXISTS trg_audit_supplier_payments ON public.supplier_payments;
CREATE TRIGGER trg_audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

DROP TRIGGER IF EXISTS trg_audit_inspections ON public.inspections;
CREATE TRIGGER trg_audit_inspections
  AFTER INSERT OR UPDATE OR DELETE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

-- =========================================================================
-- PHASE 14B — Security Hardening
-- =========================================================================

-- 1) RLS audit: fix `payments` UPDATE USING(true) ----------------------------
DROP POLICY IF EXISTS "auth update payments" ON public.payments;
CREATE POLICY "dept update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code = 'accounting'::department_code
    )
  )
  WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code = 'accounting'::department_code
    )
  );

-- 2) Storage bucket hygiene: remove duplicate broad write policies -----------
DROP POLICY IF EXISTS "vehicle-media authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-media authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "vehicle-media authenticated delete" ON storage.objects;
-- vehicles_insert/update/delete_vehicle_media (dept-scoped) remain authoritative.

-- 3) SECURITY DEFINER hygiene: revoke from anon / PUBLIC ---------------------
-- All public-schema SECURITY DEFINER functions perform their own internal
-- auth checks or are trigger-only; none should be invokable by anon.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;

-- Re-grant EXECUTE to authenticated only for functions the app actually calls
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_department(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_customer_finance(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_vehicle_landed_cost(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_vehicle_pnl(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_inspection(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_inspection(uuid, text)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_goods_return(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_sessions()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_invoice_journal(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_credit_note_journal(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_payment_journal(uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_purchase_invoice_journal(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_supplier_payment_journal(uuid)       TO authenticated;