-- ============================================================
-- PHASE 15 — Sales Governance Parity + Payment Numbering
-- ============================================================

-- 1) SALES ORDER status transition guard
CREATE OR REPLACE FUNCTION public.validate_sales_order_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'          AND NEW.status IN ('confirmed','cancelled'))
     OR (OLD.status='confirmed'      AND NEW.status IN ('invoiced','cancelled'))
     OR (OLD.status='invoiced'       AND NEW.status IN ('partially_paid','paid','delivered','cancelled'))
     OR (OLD.status='partially_paid' AND NEW.status IN ('paid','delivered','cancelled'))
     OR (OLD.status='paid'           AND NEW.status IN ('delivered','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة (أمر بيع): % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sales_orders_status_guard ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_status_guard
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.validate_sales_order_status_transition();

-- 2) INVOICE status transition guard (mirror purchase_invoices)
CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'          AND NEW.status IN ('posted','cancelled'))
     OR (OLD.status='posted'         AND NEW.status IN ('partially_paid','paid','cancelled'))
     OR (OLD.status='partially_paid' AND NEW.status IN ('paid','cancelled'))
     OR (OLD.status='paid'           AND NEW.status IN ('cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة (فاتورة بيع): % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_status_guard ON public.invoices;
CREATE TRIGGER trg_invoices_status_guard
BEFORE UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.validate_invoice_status_transition();

-- 3) Protect posted invoice critical fields (mirror purchase_invoices)
CREATE OR REPLACE FUNCTION public.protect_posted_invoice()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.status IN ('posted','partially_paid','paid') THEN
    IF NEW.invoice_no  IS DISTINCT FROM OLD.invoice_no
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
    OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
    OR NEW.subtotal    IS DISTINCT FROM OLD.subtotal
    OR NEW.vat_amount  IS DISTINCT FROM OLD.vat_amount
    OR NEW.total       IS DISTINCT FROM OLD.total THEN
      IF NOT public.has_role(auth.uid(),'admin') THEN
        RAISE EXCEPTION 'لا يمكن تعديل بيانات فاتورة بيع مرحَّلة';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_protect_posted ON public.invoices;
CREATE TRIGGER trg_invoices_protect_posted
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.protect_posted_invoice();

-- 4) Extend audit_doc_changes to handle sales_orders + invoices
CREATE OR REPLACE FUNCTION public.audit_doc_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
  ELSIF TG_TABLE_NAME = 'invoices' THEN
    v_doc_code := COALESCE(NEW.invoice_no, OLD.invoice_no);
  ELSIF TG_TABLE_NAME = 'sales_orders' THEN
    v_doc_code := COALESCE(NEW.order_no, OLD.order_no);
  ELSIF TG_TABLE_NAME = 'payments' THEN
    v_doc_code := COALESCE(NEW.payment_no, OLD.payment_no);
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

-- 5) Attach audit triggers
DROP TRIGGER IF EXISTS trg_sales_orders_audit ON public.sales_orders;
CREATE TRIGGER trg_sales_orders_audit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

DROP TRIGGER IF EXISTS trg_invoices_audit ON public.invoices;
CREATE TRIGGER trg_invoices_audit
AFTER INSERT OR UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

DROP TRIGGER IF EXISTS trg_payments_audit ON public.payments;
CREATE TRIGGER trg_payments_audit
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.audit_doc_changes();

-- 6) Payment number governance
CREATE SEQUENCE IF NOT EXISTS public.seq_payment_no START 1;

CREATE OR REPLACE FUNCTION public.next_payment_no()
RETURNS text LANGUAGE sql VOLATILE SET search_path TO 'public' AS $$
  SELECT 'PAY-' || lpad(nextval('public.seq_payment_no')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.assign_payment_no()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.payment_no IS NULL OR NEW.payment_no = '' THEN
    NEW.payment_no := public.next_payment_no();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payments_assign_no ON public.payments;
CREATE TRIGGER trg_payments_assign_no
BEFORE INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.assign_payment_no();

-- 7) Lock down EXECUTE on new functions
REVOKE EXECUTE ON FUNCTION public.next_payment_no() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_payment_no() TO authenticated;