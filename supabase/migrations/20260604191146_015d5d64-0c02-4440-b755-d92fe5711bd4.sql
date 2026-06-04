
-- 1) Chart of accounts
INSERT INTO public.accounts (code, name_ar, name_en, type, is_active)
SELECT '2100', 'الذمم الدائنة', 'Accounts Payable', 'liability', true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '2100');

INSERT INTO public.accounts (code, name_ar, name_en, type, is_active)
SELECT '1350', 'ضريبة المدخلات', 'VAT Input (Recoverable)', 'asset', true
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '1350');

-- 2) Suppliers
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  vat_number text, phone text, email text, address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept manages suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')));

-- 3) Purchase invoices
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  supplier_invoice_ref text,
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  journal_entry_id uuid,
  notes text,
  posted_at timestamptz, posted_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoices TO authenticated;
GRANT ALL ON public.purchase_invoices TO service_role;
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read purchase_invoices" ON public.purchase_invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert purchase_invoices" ON public.purchase_invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')));
CREATE POLICY "dept update purchase_invoices" ON public.purchase_invoices FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')));
CREATE POLICY "admin delete purchase_invoices" ON public.purchase_invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.purchase_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id),
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  vat_pct numeric NOT NULL DEFAULT 15,
  line_total numeric NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_invoice_lines TO authenticated;
GRANT ALL ON public.purchase_invoice_lines TO service_role;
ALTER TABLE public.purchase_invoice_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read pinv_lines" ON public.purchase_invoice_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage pinv_lines" ON public.purchase_invoice_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_invoices p WHERE p.id = invoice_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_invoices p WHERE p.id = invoice_id));

-- 4) Supplier payments
CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_no text NOT NULL UNIQUE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id),
  purchase_invoice_id uuid REFERENCES public.purchase_invoices(id),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  method text NOT NULL DEFAULT 'bank',
  reference text, notes text,
  status text NOT NULL DEFAULT 'posted',
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read supplier_payments" ON public.supplier_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert supplier_payments" ON public.supplier_payments FOR INSERT TO authenticated
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')));
CREATE POLICY "dept update supplier_payments" ON public.supplier_payments FOR UPDATE TO authenticated
  USING (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')))
  WITH CHECK (public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')));
CREATE POLICY "admin delete supplier_payments" ON public.supplier_payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at triggers
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_purchase_invoices_updated_at BEFORE UPDATE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_supplier_payments_updated_at BEFORE UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Posting: purchase invoice
CREATE OR REPLACE FUNCTION public.post_purchase_invoice_journal(p_invoice_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv RECORD; v_je_id uuid; v_acc_inv uuid; v_acc_vat_in uuid; v_acc_ap uuid;
  v_existing uuid; v_line_count int; v_veh_count int; v_line RECORD;
BEGIN
  SELECT * INTO v_inv FROM public.purchase_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'فاتورة شراء غير موجودة: %', p_invoice_id; END IF;
  IF v_inv.journal_entry_id IS NOT NULL THEN RETURN v_inv.journal_entry_id; END IF;
  SELECT id INTO v_existing FROM public.journal_entries
   WHERE source_type='purchase_invoice' AND source_id = v_inv.id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.purchase_invoices SET journal_entry_id = v_existing WHERE id = v_inv.id;
    RETURN v_existing;
  END IF;

  IF v_inv.supplier_id IS NULL THEN RAISE EXCEPTION 'لا يمكن ترحيل فاتورة شراء بدون مورد'; END IF;
  IF COALESCE(v_inv.total,0) <= 0 THEN RAISE EXCEPTION 'لا يمكن ترحيل فاتورة شراء بإجمالي صفر'; END IF;
  SELECT COUNT(*), COUNT(vehicle_id) INTO v_line_count, v_veh_count
    FROM public.purchase_invoice_lines WHERE invoice_id = v_inv.id;
  IF v_line_count = 0 THEN RAISE EXCEPTION 'لا يمكن ترحيل فاتورة شراء بدون بنود'; END IF;
  IF v_veh_count = 0 THEN RAISE EXCEPTION 'لا يمكن ترحيل فاتورة شراء بدون مركبات مرتبطة'; END IF;

  SELECT id INTO v_acc_inv    FROM public.accounts WHERE code='1310' LIMIT 1;
  SELECT id INTO v_acc_vat_in FROM public.accounts WHERE code='1350' LIMIT 1;
  SELECT id INTO v_acc_ap     FROM public.accounts WHERE code='2100' LIMIT 1;
  IF v_acc_inv IS NULL OR v_acc_vat_in IS NULL OR v_acc_ap IS NULL THEN
    RAISE EXCEPTION 'دليل الحسابات ناقص (1310/1350/2100)';
  END IF;

  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, source_type, source_id, is_posted, created_by)
  VALUES ('PINV-JE-'||v_inv.invoice_no, v_inv.invoice_date, v_inv.invoice_no,
          'قيد فاتورة شراء '||v_inv.invoice_no, 'purchase_invoice', v_inv.id, false, auth.uid())
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_acc_inv,    COALESCE(v_inv.subtotal,0),   0, 'مخزون مركبات — '||v_inv.invoice_no),
    (v_je_id, v_acc_vat_in, COALESCE(v_inv.vat_amount,0), 0, 'ضريبة مدخلات — '||v_inv.invoice_no),
    (v_je_id, v_acc_ap,     0, COALESCE(v_inv.total,0),      'ذمم المورد — '||v_inv.invoice_no);
  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;

  FOR v_line IN
    SELECT id, vehicle_id, unit_cost, quantity, line_total
      FROM public.purchase_invoice_lines
     WHERE invoice_id = v_inv.id AND vehicle_id IS NOT NULL
  LOOP
    UPDATE public.vehicles SET cost_price = COALESCE(v_line.unit_cost, v_line.line_total)
     WHERE id = v_line.vehicle_id;
    INSERT INTO public.vehicle_costs (vehicle_id, cost_type, amount, cost_date, notes, source_reference, journal_entry_id, created_by)
    VALUES (v_line.vehicle_id, 'purchase'::public.vehicle_cost_type,
            COALESCE(v_line.unit_cost, v_line.line_total), v_inv.invoice_date,
            'تكلفة شراء — فاتورة '||v_inv.invoice_no, v_inv.invoice_no, v_je_id, auth.uid());
  END LOOP;

  UPDATE public.purchase_invoices
     SET journal_entry_id = v_je_id,
         status = CASE WHEN status = 'draft' THEN 'posted' ELSE status END,
         posted_at = COALESCE(posted_at, now()),
         posted_by = COALESCE(posted_by, auth.uid())
   WHERE id = v_inv.id;
  RETURN v_je_id;
END $$;

-- 6) Posting: supplier payment
CREATE OR REPLACE FUNCTION public.post_supplier_payment_journal(p_payment_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_p RECORD; v_je_id uuid; v_acc_ap uuid; v_acc_credit uuid; v_credit_code text;
  v_existing uuid; v_total numeric; v_paid numeric;
BEGIN
  SELECT * INTO v_p FROM public.supplier_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'دفعة مورد غير موجودة: %', p_payment_id; END IF;
  IF v_p.journal_entry_id IS NOT NULL THEN RETURN v_p.journal_entry_id; END IF;
  SELECT id INTO v_existing FROM public.journal_entries
   WHERE source_type='supplier_payment' AND source_id = v_p.id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    UPDATE public.supplier_payments SET journal_entry_id = v_existing WHERE id = v_p.id;
    RETURN v_existing;
  END IF;

  IF v_p.supplier_id IS NULL THEN RAISE EXCEPTION 'لا يمكن ترحيل دفعة بدون مورد'; END IF;
  IF COALESCE(v_p.amount,0) <= 0 THEN RAISE EXCEPTION 'قيمة الدفعة يجب أن تكون أكبر من صفر'; END IF;

  v_credit_code := CASE lower(coalesce(v_p.method,'bank'))
    WHEN 'cash' THEN '1110' WHEN 'bank' THEN '1120' WHEN 'bank_transfer' THEN '1120'
    WHEN 'transfer' THEN '1120' WHEN 'pos' THEN '1130' WHEN 'card' THEN '1130'
    WHEN 'cheque' THEN '1140' WHEN 'check' THEN '1140' ELSE '1120' END;

  SELECT id INTO v_acc_ap     FROM public.accounts WHERE code='2100' LIMIT 1;
  SELECT id INTO v_acc_credit FROM public.accounts WHERE code = v_credit_code LIMIT 1;
  IF v_acc_ap IS NULL OR v_acc_credit IS NULL THEN
    RAISE EXCEPTION 'الحسابات المطلوبة غير معرَّفة لقيد دفعة المورد (2100 / %)', v_credit_code;
  END IF;

  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, source_type, source_id, is_posted, created_by)
  VALUES ('PAY-JE-'||v_p.payment_no, v_p.payment_date, coalesce(v_p.reference, v_p.payment_no),
          'قيد دفعة مورد '||v_p.payment_no, 'supplier_payment', v_p.id, false, auth.uid())
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_acc_ap,     COALESCE(v_p.amount,0), 0, 'تخفيض ذمم المورد — '||v_p.payment_no),
    (v_je_id, v_acc_credit, 0, COALESCE(v_p.amount,0), 'سداد — '||v_p.payment_no);
  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;
  UPDATE public.supplier_payments SET journal_entry_id = v_je_id WHERE id = v_p.id;

  IF v_p.purchase_invoice_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.supplier_payments
     WHERE purchase_invoice_id = v_p.purchase_invoice_id AND status = 'posted';
    SELECT total INTO v_total FROM public.purchase_invoices WHERE id = v_p.purchase_invoice_id;
    UPDATE public.purchase_invoices
       SET paid_amount = v_paid,
           status = CASE WHEN v_paid >= COALESCE(v_total,0) AND v_paid > 0 THEN 'paid'
                         WHEN v_paid > 0 THEN 'partially_paid' ELSE status END
     WHERE id = v_p.purchase_invoice_id;
  END IF;
  RETURN v_je_id;
END $$;

-- 7) Auto-posting triggers
CREATE OR REPLACE FUNCTION public.trg_purchase_invoices_post_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('posted','partially_paid','paid') AND NEW.journal_entry_id IS NULL THEN
    PERFORM public.post_purchase_invoice_journal(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_pinv_post_journal AFTER INSERT OR UPDATE OF status ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_purchase_invoices_post_journal();

CREATE OR REPLACE FUNCTION public.trg_supplier_payments_post_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.status,'posted') = 'posted' AND COALESCE(NEW.amount,0) > 0
     AND NEW.journal_entry_id IS NULL THEN
    PERFORM public.post_supplier_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sup_pay_post_journal AFTER INSERT OR UPDATE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.trg_supplier_payments_post_journal();

-- 8) AP subledger views
CREATE OR REPLACE VIEW public.v_ap_vendor_balances AS
SELECT s.id AS supplier_id, s.code AS supplier_code, s.name AS supplier_name,
  COUNT(pi.id) AS bill_count,
  COALESCE(SUM(pi.total),0) AS total_payable,
  COALESCE(SUM(pi.paid_amount),0) AS paid_amount,
  COALESCE(SUM(pi.total - pi.paid_amount),0) AS remaining_balance,
  COALESCE(SUM(CASE WHEN pi.due_date < CURRENT_DATE AND pi.status IN ('posted','partially_paid')
                    THEN (pi.total - pi.paid_amount) ELSE 0 END),0) AS overdue_amount
FROM public.suppliers s
LEFT JOIN public.purchase_invoices pi ON pi.supplier_id = s.id
  AND pi.status IN ('posted','partially_paid','paid')
GROUP BY s.id, s.code, s.name;
GRANT SELECT ON public.v_ap_vendor_balances TO authenticated;

CREATE OR REPLACE VIEW public.v_ap_vendor_aging AS
SELECT pi.supplier_id, pi.id AS invoice_id, pi.invoice_no, pi.invoice_date, pi.due_date,
  pi.total, pi.paid_amount, (pi.total - pi.paid_amount) AS balance,
  CASE WHEN pi.due_date IS NULL OR pi.due_date >= CURRENT_DATE THEN 'current'
       WHEN CURRENT_DATE - pi.due_date <= 30 THEN '1_30'
       WHEN CURRENT_DATE - pi.due_date <= 60 THEN '31_60'
       WHEN CURRENT_DATE - pi.due_date <= 90 THEN '61_90'
       ELSE 'over_90' END AS aging_bucket
FROM public.purchase_invoices pi
WHERE pi.status IN ('posted','partially_paid');
GRANT SELECT ON public.v_ap_vendor_aging TO authenticated;

CREATE OR REPLACE VIEW public.v_ap_vendor_statement AS
SELECT pi.supplier_id, pi.invoice_date AS doc_date, 'invoice' AS doc_type,
  pi.invoice_no AS doc_no, pi.total AS debit, 0::numeric AS credit, pi.journal_entry_id
FROM public.purchase_invoices pi WHERE pi.status IN ('posted','partially_paid','paid')
UNION ALL
SELECT sp.supplier_id, sp.payment_date AS doc_date, 'payment' AS doc_type,
  sp.payment_no AS doc_no, 0::numeric AS debit, sp.amount AS credit, sp.journal_entry_id
FROM public.supplier_payments sp WHERE COALESCE(sp.status,'posted') = 'posted';
GRANT SELECT ON public.v_ap_vendor_statement TO authenticated;

-- 9) Governance views
CREATE OR REPLACE VIEW public.v_gov_purchase_invoices_missing_je AS
SELECT pi.id, pi.invoice_no, pi.supplier_id, pi.status, pi.total, pi.invoice_date
FROM public.purchase_invoices pi
WHERE pi.status IN ('posted','partially_paid','paid') AND pi.journal_entry_id IS NULL;
GRANT SELECT ON public.v_gov_purchase_invoices_missing_je TO authenticated;

CREATE OR REPLACE VIEW public.v_gov_supplier_payments_missing_je AS
SELECT sp.id, sp.payment_no, sp.supplier_id, sp.amount, sp.payment_date
FROM public.supplier_payments sp
WHERE COALESCE(sp.status,'posted') = 'posted' AND sp.journal_entry_id IS NULL;
GRANT SELECT ON public.v_gov_supplier_payments_missing_je TO authenticated;

CREATE OR REPLACE VIEW public.v_gov_inventory_without_purchase_cost AS
SELECT v.id, v.code, v.vin, v.brand, v.model, v.year, v.status, v.cost_price
FROM public.vehicles v
WHERE NOT EXISTS (
  SELECT 1 FROM public.vehicle_costs vc
   WHERE vc.vehicle_id = v.id AND vc.cost_type = 'purchase'::public.vehicle_cost_type
);
GRANT SELECT ON public.v_gov_inventory_without_purchase_cost TO authenticated;
