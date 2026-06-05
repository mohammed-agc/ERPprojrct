
CREATE OR REPLACE FUNCTION public.post_purchase_invoice_journal(p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    UPDATE public.purchase_invoices
       SET journal_entry_id = v_existing,
           status = CASE WHEN status IN ('draft','issued') THEN 'posted' ELSE status END,
           posted_at = COALESCE(posted_at, now()),
           posted_by = COALESCE(posted_by, auth.uid())
     WHERE id = v_inv.id;
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
         status = CASE WHEN status IN ('draft','issued') THEN 'posted' ELSE status END,
         posted_at = COALESCE(posted_at, now()),
         posted_by = COALESCE(posted_by, auth.uid())
   WHERE id = v_inv.id;
  RETURN v_je_id;
END $function$;
