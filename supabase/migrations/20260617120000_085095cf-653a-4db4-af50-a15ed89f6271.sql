-- ============================================================
-- F5: Financial Reversal Engine (Sales Invoice Cancellation)
-- ============================================================
-- RPC ذرّية cancel_sales_invoice + can_cancel_sales_invoice (فحص منفصل).
-- يعكس: Revenue JE + COGS JE (Clone من الأصلي) + المخزون + Open Items.
-- 8 تعديلات معتمدة مدمجة. المرجع: F5_IMPLEMENTATION_REVIEW.md.
-- ============================================================

-- ═══ تمهيد: أعمدة + جدول + seed ═══

-- (#2) أثر زمني للعكس
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;
ALTER TABLE public.journal_entries ADD COLUMN IF NOT EXISTS reversed_by UUID;

-- (#5) ربط تدقيقي لعكس التخصيص
ALTER TABLE public.open_item_allocations ADD COLUMN IF NOT EXISTS reverses_allocation_id UUID REFERENCES public.open_item_allocations(id);

-- credit_note_lines (Per-VIN)
CREATE TABLE IF NOT EXISTS public.credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  invoice_line_id UUID REFERENCES public.invoice_lines(id),
  vehicle_id UUID REFERENCES public.inventory_items(id),
  vin TEXT,
  description TEXT,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  line_total NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cnl_credit_note ON public.credit_note_lines(credit_note_id);
CREATE INDEX IF NOT EXISTS idx_cnl_vehicle ON public.credit_note_lines(vehicle_id);

-- (#3) seed CREDIT_NOTE في محرّك الترقيم
INSERT INTO public.document_sequences (document_type, document_name, prefix, current_number, number_length, yearly_reset, active, company_id)
SELECT 'CREDIT_NOTE', 'إشعار دائن', 'CN', 0, 4, false, true, get_current_company_id()
WHERE NOT EXISTS (SELECT 1 FROM public.document_sequences WHERE document_type='CREDIT_NOTE' AND company_id=get_current_company_id());

-- ═══ دالة الفحص (5 validations) ═══
CREATE OR REPLACE FUNCTION public.can_cancel_sales_invoice(p_invoice_id UUID)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $fn$
DECLARE
  v_inv RECORD; v_paid NUMERIC; v_delivered INT;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('can_cancel', false, 'reason', 'INVOICE_NOT_FOUND'); END IF;
  IF v_inv.status <> 'issued' THEN RETURN jsonb_build_object('can_cancel', false, 'reason', 'INVOICE_NOT_ISSUED'); END IF;

  -- (#1) idempotency بدليل قطعي: CN منشورة سابقاً
  IF EXISTS (SELECT 1 FROM public.credit_notes WHERE invoice_id=p_invoice_id AND status='posted') THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'ALREADY_CREDITED');
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.sales_payments WHERE invoice_id=p_invoice_id;
  IF v_paid > 0 THEN RETURN jsonb_build_object('can_cancel', false, 'reason', 'INVOICE_PAID_REQUIRE_RECEIPT_REVERSAL', 'paid', v_paid); END IF;

  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=p_invoice_id AND source_type='sales_invoice' AND COALESCE(is_reversed,false)=false) THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'REVENUE_JE_MISSING');
  END IF;

  -- COGS: إن وُجد cogs_journal_entry_id لكن لا COGS JE نشط → خلل (لا نعتمد cogs_posted لأنه قد يكون خاطئاً)
  IF v_inv.cogs_journal_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=p_invoice_id AND source_type='sales_invoice_cogs' AND COALESCE(is_reversed,false)=false) THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'COGS_JE_MISSING');
  END IF;

  -- (#8 + القرار 5) لا مركبة مُسلّمة (DB status أو meta overlay)
  SELECT COUNT(*) INTO v_delivered FROM public.invoice_lines il
    JOIN public.inventory_items ii ON ii.id=il.vehicle_id
    WHERE il.invoice_id=p_invoice_id AND il.vehicle_id IS NOT NULL
      AND (ii.status='delivered' OR ii.notes LIKE '%"status_overlay":"delivered"%');
  IF v_delivered > 0 THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'VEHICLE_DELIVERED_REQUIRE_GOODS_RETURN', 'delivered_count', v_delivered);
  END IF;

  RETURN jsonb_build_object('can_cancel', true);
END;
$fn$;

-- ═══ RPC الرئيسية (ذرّية) ═══
CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(p_invoice_id UUID, p_reason TEXT DEFAULT 'invoice_cancellation')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_check jsonb; v_inv RECORD; v_cn_id UUID; v_cn_no TEXT;
  v_rev_je RECORD; v_cogs_je RECORD; v_new_rev_je UUID; v_new_cogs_je UUID;
  v_line RECORD; v_yr TEXT; v_seq INT; v_entry_no TEXT;
  v_uid UUID; v_company UUID;
  v_inv_veh INT; v_cogs_veh INT;
BEGIN
  v_uid := auth.uid();
  v_company := get_current_company_id();

  -- ═══ Pre-Cancellation Validation ═══
  v_check := public.can_cancel_sales_invoice(p_invoice_id);
  IF (v_check->>'can_cancel')::boolean = false THEN RETURN v_check; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id=p_invoice_id;

  -- ═══ (#8) Referential Validation: تطابق عدد المركبات invoice ↔ COGS ═══
  IF EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=p_invoice_id AND source_type='sales_invoice_cogs' AND COALESCE(is_reversed,false)=false) THEN
    SELECT COUNT(DISTINCT il.vehicle_id) INTO v_inv_veh FROM public.invoice_lines il WHERE il.invoice_id=p_invoice_id AND il.vehicle_id IS NOT NULL;
    SELECT COUNT(DISTINCT jel.vehicle_id) INTO v_cogs_veh FROM public.journal_entry_lines jel
      JOIN public.journal_entries je ON je.id=jel.entry_id
      WHERE je.source_id=p_invoice_id AND je.source_type='sales_invoice_cogs' AND jel.vehicle_id IS NOT NULL;
    IF v_inv_veh <> v_cogs_veh THEN
      RETURN jsonb_build_object('success', false, 'reason', 'VEHICLE_COUNT_MISMATCH', 'invoice_vehicles', v_inv_veh, 'cogs_vehicles', v_cogs_veh);
    END IF;
  END IF;

  -- ═══ Credit Note (#3 الترقيم عبر المحرّك) ═══
  v_cn_no := public.get_next_document_number(v_company, 'CREDIT_NOTE', NULL, CURRENT_DATE, v_uid, NULL);
  INSERT INTO public.credit_notes (cn_no, invoice_id, customer_id, cn_date, amount, vat_amount, total, reason, status, created_by)
  VALUES (v_cn_no, p_invoice_id, v_inv.customer_id, CURRENT_DATE, v_inv.subtotal, v_inv.vat_amount, v_inv.total, p_reason, 'posted', v_uid)
  RETURNING id INTO v_cn_id;

  INSERT INTO public.credit_note_lines (credit_note_id, invoice_line_id, vehicle_id, vin, description, quantity, unit_price, vat_amount, line_total, reason)
  SELECT v_cn_id, il.id, il.vehicle_id, ii.vin, il.description, il.quantity, il.unit_price, il.vat_amount, il.total, p_reason
  FROM public.invoice_lines il LEFT JOIN public.inventory_items ii ON ii.id=il.vehicle_id
  WHERE il.invoice_id=p_invoice_id;

  v_yr := TO_CHAR(CURRENT_DATE,'YYYY');

  -- ═══ F5.2 Revenue Reversal (Clone، #8 فحص source) ═══
  SELECT * INTO v_rev_je FROM public.journal_entries
    WHERE source_id=p_invoice_id AND source_type='sales_invoice' AND COALESCE(is_reversed,false)=false LIMIT 1;
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-'||v_yr||'-(\d+)') AS INT)),0)+1 INTO v_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-'||v_yr||'-%';
  v_entry_no := 'JE-'||v_yr||'-'||LPAD(v_seq::TEXT,4,'0');
  INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit, reverses_entry_id)
  VALUES (v_entry_no, CURRENT_DATE, v_cn_no, 'عكس إيراد - '||v_inv.invoice_no, true, 'credit_note', v_cn_id, v_rev_je.total_credit, v_rev_je.total_debit, v_rev_je.id)
  RETURNING id INTO v_new_rev_je;
  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, contact_id, partner_type, document_type, document_id, reference_number, vehicle_id)
  SELECT v_new_rev_je, account_id, credit, debit, 'عكس: '||COALESCE(description,''), contact_id, partner_type, 'credit_note', v_cn_id, v_cn_no, vehicle_id
  FROM public.journal_entry_lines WHERE entry_id=v_rev_je.id;
  UPDATE public.journal_entries SET is_reversed=true, reversed_at=now(), reversed_by=v_uid WHERE id=v_rev_je.id;

  -- ═══ F5.3 COGS Reversal (Clone) — يعتمد على وجود COGS JE فعلياً، لا cogs_posted ═══
  SELECT * INTO v_cogs_je FROM public.journal_entries
    WHERE source_id=p_invoice_id AND source_type='sales_invoice_cogs' AND COALESCE(is_reversed,false)=false LIMIT 1;
  IF FOUND THEN
      SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-'||v_yr||'-(\d+)') AS INT)),0)+1 INTO v_seq FROM public.journal_entries WHERE entry_no LIKE 'JE-'||v_yr||'-%';
      v_entry_no := 'JE-'||v_yr||'-'||LPAD(v_seq::TEXT,4,'0');
      INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted, source_type, source_id, total_debit, total_credit, reverses_entry_id)
      VALUES (v_entry_no, CURRENT_DATE, v_cn_no, 'عكس COGS - '||v_inv.invoice_no, true, 'credit_note_cogs', v_cn_id, v_cogs_je.total_credit, v_cogs_je.total_debit, v_cogs_je.id)
      RETURNING id INTO v_new_cogs_je;
      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description, document_type, document_id, reference_number, vehicle_id)
      SELECT v_new_cogs_je, account_id, credit, debit, 'عكس: '||COALESCE(description,''), 'credit_note_cogs', v_cn_id, v_cn_no, vehicle_id
      FROM public.journal_entry_lines WHERE entry_id=v_cogs_je.id;
      UPDATE public.journal_entries SET is_reversed=true, reversed_at=now(), reversed_by=v_uid WHERE id=v_cogs_je.id;
  END IF;

  -- ═══ F5.4 Inventory Reversal ═══
  -- تمييز حسب نوع الصنف: المركبة Per-VIN (assignment، كمية محدّدة)، القطع تراكمية (increment).
  -- المركبة الفيزيائية واحدة — النهاية qty=quantity سواء مرّت بـ F4 (sold,qty=0) أم لا (reserved,qty=1).
  FOR v_line IN
    SELECT cnl.vehicle_id, cnl.quantity, ii.status, ii.item_type FROM public.credit_note_lines cnl
    JOIN public.inventory_items ii ON ii.id=cnl.vehicle_id
    WHERE cnl.credit_note_id=v_cn_id AND cnl.vehicle_id IS NOT NULL
  LOOP
    IF v_line.status <> 'delivered' THEN
      IF v_line.item_type = 'vehicle' THEN
        -- مركبة: assignment (Per-VIN)
        UPDATE public.inventory_items
        SET status='active', qty_on_hand=v_line.quantity, qty_reserved=0, sold_at=NULL
        WHERE id=v_line.vehicle_id;
      ELSE
        -- قطع/مستهلكات: increment (تراكمي)
        UPDATE public.inventory_items
        SET status='active', qty_on_hand=COALESCE(qty_on_hand,0)+v_line.quantity, qty_reserved=0, sold_at=NULL
        WHERE id=v_line.vehicle_id;
      END IF;
    END IF;
  END LOOP;

  -- ═══ F5.5 Open Item Reversal (#5 reverses_allocation_id + موجب) ═══
  INSERT INTO public.open_item_allocations (allocation_number, allocation_date, allocation_type, partner_id,
    source_document_type, source_document_id, target_document_type, target_document_id, allocated_amount,
    journal_entry_id, status, remarks, created_by, reverses_allocation_id)
  SELECT 'REV-'||oia.allocation_number, CURRENT_DATE, 'CREDIT_NOTE', oia.partner_id,
    oia.source_document_type, oia.source_document_id, oia.target_document_type, oia.target_document_id,
    oia.allocated_amount, v_new_rev_je, 'active', 'عكس تخصيص - '||v_cn_no, v_uid, oia.id
  FROM public.open_item_allocations oia
  WHERE ((oia.target_document_type='sales_invoice' AND oia.target_document_id=p_invoice_id)
      OR (oia.source_document_type='sales_invoice' AND oia.source_document_id=p_invoice_id))
    AND oia.reverses_allocation_id IS NULL;  -- لا نعكس تخصيصاً عاكساً (تمييز عبر reverses_allocation_id لا allocation_type)

  -- ═══ تحديث الفاتورة (#6 cancelled مؤقتاً) ═══
  UPDATE public.invoices SET credited_amount=COALESCE(credited_amount,0)+v_inv.total, status='cancelled' WHERE id=p_invoice_id;

  -- ═══ F5.6 Governance ═══
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, reason, details)
  VALUES ('SALE_CANCELLED', 'accounting', 'credit_note', v_cn_id, v_cn_no, p_reason,
    jsonb_build_object('invoice_no', v_inv.invoice_no, 'cn_no', v_cn_no, 'revenue_reversal_je', v_new_rev_je, 'cogs_reversal_je', v_new_cogs_je, 'total', v_inv.total));

  RETURN jsonb_build_object('success', true, 'credit_note_id', v_cn_id, 'cn_no', v_cn_no, 'revenue_reversal_je', v_new_rev_je, 'cogs_reversal_je', v_new_cogs_je);
END;
$fn$;

-- التحقّق
SELECT 'cnl_table' AS check, (SELECT COUNT(*)::text FROM information_schema.tables WHERE table_name='credit_note_lines') AS r
UNION ALL SELECT 'can_cancel_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='can_cancel_sales_invoice')
UNION ALL SELECT 'cancel_fn', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='cancel_sales_invoice')
UNION ALL SELECT 'reversed_at_col', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='journal_entries' AND column_name='reversed_at')
UNION ALL SELECT 'reverses_alloc_col', (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='open_item_allocations' AND column_name='reverses_allocation_id')
UNION ALL SELECT 'cn_seq_seeded', (SELECT COUNT(*)::text FROM document_sequences WHERE document_type='CREDIT_NOTE');
