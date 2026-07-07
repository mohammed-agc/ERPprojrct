-- ═══════════════════════════════════════════════════════════════════════════
-- DEBT-012 Remediation Migration
-- Cancelled-invoice payment/settlement handling: reclass to Customer Deposits
-- ═══════════════════════════════════════════════════════════════════════════
-- Problem (DEBT-012): cancel_sales_invoice reversed revenue/COGS/inventory and
--   the open-item allocations, but left the received payment stranded — the cash
--   stayed in the till while AR control (1131) carried an unexplained credit
--   balance that belongs in Customer Deposits (2141). can_cancel_sales_invoice
--   also checked the wrong table (sales_payments instead of payments) and never
--   inspected open_item_allocations, so it allowed cancellation of fully-paid
--   invoices without flagging the treatment required.
--
-- Fix (three parts, all idempotent):
--   Part A: ensure a CUSTOMER_DEPOSITS account-determination key exists,
--           resolved dynamically from the chart of accounts by code '2141'
--           (Installable-By-Any-Customer: no hardcoded account UUID).
--   Part B: can_cancel_sales_invoice — payments-aware + allocation-aware,
--           classifies treatments_required, deterministic guards, blocks
--           ambiguous cases.
--   Part C: cancel_sales_invoice — array snapshot of original allocations
--           before F5.5, plus F5.7 GL clearing (PAYMENT -> Customer Deposits;
--           SETTLEMENT -> original counter reversed faithfully).
--
-- Scope: future cancellations only. No historical correction. Does not touch
--   ZATCA tables. SECURITY DEFINER preserved. DEBT-009 (safe search_path) is a
--   separate concern, out of scope here and not widened by this migration.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- Part A: CUSTOMER_DEPOSITS determination key (idempotent, code-resolved)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.account_determinations
  (determination_key, account_id, is_default, active, description)
SELECT 'CUSTOMER_DEPOSITS', a.id, true, true,
       'Customer deposits determination key (advance payments / cancelled-invoice reclass)'
FROM public.accounts a
WHERE a.code = '2141'
  AND NOT EXISTS (
    SELECT 1 FROM public.account_determinations
    WHERE determination_key = 'CUSTOMER_DEPOSITS'
      AND branch_id IS NULL AND department_code IS NULL
      AND product_type IS NULL AND payment_method IS NULL
  );


-- ─────────────────────────────────────────────────────────────────────────
-- Part B: can_cancel_sales_invoice (payments-aware + allocation-aware)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_cancel_sales_invoice(p_invoice_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_inv RECORD; v_delivered INT;
  v_pay_count INT; v_pay_sum NUMERIC;
  v_alloc RECORD; v_alloc_total INT := 0;
  v_dep RECORD; v_deposits_count INT; v_counter_count INT;
  v_treatments TEXT[] := ARRAY[]::TEXT[];
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  v_ar_acct UUID;
  v_payment_alloc_sum NUMERIC := 0;   -- #3: مجموع تخصيصات PAYMENT
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('can_cancel', false, 'reason', 'INVOICE_NOT_FOUND'); END IF;
  IF v_inv.status <> 'issued' THEN RETURN jsonb_build_object('can_cancel', false, 'reason', 'INVOICE_NOT_ISSUED'); END IF;

  IF EXISTS (SELECT 1 FROM public.credit_notes WHERE invoice_id=p_invoice_id AND status='posted') THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'ALREADY_CREDITED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=p_invoice_id AND source_type='sales_invoice' AND COALESCE(is_reversed,false)=false) THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'REVENUE_JE_MISSING');
  END IF;

  IF v_inv.cogs_journal_entry_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE source_id=p_invoice_id AND source_type='sales_invoice_cogs' AND COALESCE(is_reversed,false)=false) THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'COGS_JE_MISSING');
  END IF;

  SELECT COUNT(*) INTO v_delivered FROM public.invoice_lines il
    JOIN public.inventory_items ii ON ii.id=il.vehicle_id
    WHERE il.invoice_id=p_invoice_id AND il.vehicle_id IS NOT NULL
      AND (ii.status='delivered' OR ii.notes LIKE '%"status_overlay":"delivered"%');
  IF v_delivered > 0 THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'VEHICLE_DELIVERED_REQUIRE_GOODS_RETURN', 'delivered_count', v_delivered);
  END IF;

  -- AR control (guarded)
  SELECT jel.account_id INTO v_ar_acct FROM public.journal_entry_lines jel
    JOIN public.journal_entries je ON je.id=jel.entry_id
    WHERE je.source_id=p_invoice_id AND je.source_type='sales_invoice'
      AND COALESCE(je.is_reversed,false)=false AND jel.debit > 0 LIMIT 1;
  IF v_ar_acct IS NULL THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'AR_CONTROL_UNRESOLVED');
  END IF;

  -- البُعد 3 مُصحَّح: payments الحقيقيّة
  SELECT COUNT(*), COALESCE(SUM(amount),0) INTO v_pay_count, v_pay_sum
    FROM public.payments WHERE invoice_id=p_invoice_id;

  -- البُعد 2 مُصحَّح: allocations + تصنيف + guards
  FOR v_alloc IN
    SELECT oia.* FROM public.open_item_allocations oia
    WHERE ((oia.target_document_type='sales_invoice' AND oia.target_document_id=p_invoice_id)
        OR (oia.source_document_type='sales_invoice' AND oia.source_document_id=p_invoice_id))
      AND oia.status='active'
      AND oia.reverses_allocation_id IS NULL
      AND oia.allocation_type IN ('PAYMENT','SETTLEMENT')
  LOOP
    v_alloc_total := v_alloc_total + 1;

    IF v_alloc.allocation_type = 'PAYMENT' THEN
      v_payment_alloc_sum := v_payment_alloc_sum + v_alloc.allocated_amount;   -- #3

      -- guard #1: CUSTOMER_DEPOSITS count-first deterministic
      SELECT COUNT(*) INTO v_deposits_count
      FROM public.account_determinations ad
      WHERE ad.determination_key='CUSTOMER_DEPOSITS'
        AND ad.branch_id IS NULL AND ad.department_code IS NULL
        AND ad.product_type IS NULL AND ad.payment_method IS NULL
        AND ad.active=true AND ad.is_default=true;
      IF v_deposits_count <> 1 THEN
        RETURN jsonb_build_object('can_cancel', false, 'reason', 'CUSTOMER_DEPOSITS_NOT_DETERMINISTIC', 'found', v_deposits_count);
      END IF;
      SELECT a.id, a.is_posting, a.type, a.is_archived INTO v_dep
      FROM public.account_determinations ad
      JOIN public.accounts a ON a.id = ad.account_id
      WHERE ad.determination_key='CUSTOMER_DEPOSITS'
        AND ad.branch_id IS NULL AND ad.department_code IS NULL
        AND ad.product_type IS NULL AND ad.payment_method IS NULL
        AND ad.active=true AND ad.is_default=true;
      IF v_dep.is_posting IS NOT TRUE OR v_dep.type <> 'liability' OR COALESCE(v_dep.is_archived,false) = true THEN
        RETURN jsonb_build_object('can_cancel', false, 'reason', 'CUSTOMER_DEPOSITS_ACCOUNT_INVALID',
          'is_posting', v_dep.is_posting, 'type', v_dep.type, 'is_archived', v_dep.is_archived);
      END IF;

      IF v_alloc.journal_entry_id IS NULL THEN
        v_warnings := array_append(v_warnings, 'PAYMENT_ALLOCATION_JE_MISSING');
      END IF;
      v_treatments := array_append(v_treatments, 'PAYMENT_RECLASS');

    ELSIF v_alloc.allocation_type = 'SETTLEMENT' THEN
      IF v_alloc.journal_entry_id IS NULL THEN
        RETURN jsonb_build_object('can_cancel', false, 'reason', 'SETTLEMENT_JE_MISSING', 'allocation_id', v_alloc.id);
      END IF;
      SELECT COUNT(*) INTO v_counter_count FROM public.journal_entry_lines
        WHERE entry_id=v_alloc.journal_entry_id AND account_id <> v_ar_acct
          AND (debit > 0 OR credit > 0);
      IF v_counter_count <> 1 THEN
        RETURN jsonb_build_object('can_cancel', false, 'reason', 'SETTLEMENT_COUNTER_AMBIGUOUS',
          'non_ar_lines', v_counter_count, 'allocation_id', v_alloc.id);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.journal_entry_lines
          WHERE entry_id=v_alloc.journal_entry_id AND account_id <> v_ar_acct
            AND ABS(GREATEST(debit,credit) - v_alloc.allocated_amount) <= 0.01) THEN
        RETURN jsonb_build_object('can_cancel', false, 'reason', 'SETTLEMENT_COUNTER_AMOUNT_MISMATCH', 'allocation_id', v_alloc.id);
      END IF;
      v_treatments := array_append(v_treatments, 'SETTLEMENT_REVERSAL');
    END IF;
  END LOOP;

  -- payment موجود بلا allocation → مراجعة يدويّة
  IF v_pay_count > 0 AND v_alloc_total = 0 THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'PAYMENT_WITHOUT_ALLOCATION_MANUAL_REVIEW',
      'payments', v_pay_count, 'paid_sum', v_pay_sum);
  END IF;

  -- #3: مجموع payments يطابق مجموع PAYMENT allocations (اتّساق)
  IF v_pay_count > 0 AND ABS(v_pay_sum - v_payment_alloc_sum) > 0.01 THEN
    RETURN jsonb_build_object('can_cancel', false, 'reason', 'PAYMENT_ALLOCATION_AMOUNT_MISMATCH',
      'paid_sum', v_pay_sum, 'payment_allocation_sum', v_payment_alloc_sum);
  END IF;

  RETURN jsonb_build_object('can_cancel', true,
    'treatments_required', v_treatments,
    'warnings', v_warnings,
    'allocation_count', v_alloc_total);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────
-- Part C: cancel_sales_invoice (snapshot + F5.7 GL clearing)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_sales_invoice(p_invoice_id uuid, p_reason text DEFAULT 'invoice_cancellation'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_check jsonb; v_inv RECORD; v_cn_id UUID; v_cn_no TEXT;
  v_rev_je RECORD; v_cogs_je RECORD; v_new_rev_je UUID; v_new_cogs_je UUID;
  v_line RECORD; v_yr TEXT; v_seq INT; v_entry_no TEXT;
  v_uid UUID; v_company UUID;
  v_inv_veh INT; v_cogs_veh INT;
  v_allocation_snapshot_ids UUID[];        -- F5.7 snapshot
  v_gl_clearing_je_ids UUID[] := ARRAY[]::uuid[];  -- #2: قيود F5.7
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

  -- ═══ F5.3 COGS Reversal (Clone) ═══
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
  FOR v_line IN
    SELECT cnl.vehicle_id, cnl.quantity, ii.status, ii.item_type FROM public.credit_note_lines cnl
    JOIN public.inventory_items ii ON ii.id=cnl.vehicle_id
    WHERE cnl.credit_note_id=v_cn_id AND cnl.vehicle_id IS NOT NULL
  LOOP
    IF v_line.status <> 'delivered' THEN
      IF v_line.item_type = 'vehicle' THEN
        UPDATE public.inventory_items
        SET status='active', qty_on_hand=v_line.quantity, qty_reserved=0, sold_at=NULL
        WHERE id=v_line.vehicle_id;
      ELSE
        UPDATE public.inventory_items
        SET status='active', qty_on_hand=COALESCE(qty_on_hand,0)+v_line.quantity, qty_reserved=0, sold_at=NULL
        WHERE id=v_line.vehicle_id;
      END IF;
    END IF;
  END LOOP;

  -- ★═══ F5.7 SNAPSHOT: التقط الأصل قبل F5.5 ═══★
  SELECT COALESCE(array_agg(oia.id), ARRAY[]::uuid[])
  INTO v_allocation_snapshot_ids
  FROM public.open_item_allocations oia
  WHERE ((oia.target_document_type='sales_invoice' AND oia.target_document_id=p_invoice_id)
      OR (oia.source_document_type='sales_invoice' AND oia.source_document_id=p_invoice_id))
    AND oia.status='active'
    AND oia.reverses_allocation_id IS NULL
    AND oia.allocation_type IN ('PAYMENT','SETTLEMENT');

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
    AND oia.reverses_allocation_id IS NULL;

  -- ★═══ F5.7 GL Clearing Treatment (DEBT-012) ═══★
  -- يقرأ من snapshot ids فقط (لا يعتمد status بعد F5.5):
  --   PAYMENT    → Dr AR / Cr Customer Deposits
  --   SETTLEMENT → Dr AR / Cr counter (طرف التسوية الأصليّ، معكوساً بأمانة)
  DECLARE
    v_ar_acct UUID;
    v_deposits_count INT;
    v_dep RECORD;
    v_deposits_acct UUID;
    v_clr_je UUID;
    v_alloc RECORD;
    v_counter RECORD;      -- #1: سطر counter الأصليّ كاملاً
    v_counter_count INT;
  BEGIN
    -- AR control من قيد الإيراد الأصليّ
    SELECT account_id INTO v_ar_acct FROM public.journal_entry_lines
      WHERE entry_id=v_rev_je.id AND debit > 0 LIMIT 1;
    IF v_ar_acct IS NULL THEN
      RAISE EXCEPTION 'F5.7: AR_CONTROL_UNRESOLVED للفاتورة %', v_inv.invoice_no;
    END IF;

    FOR v_alloc IN
      SELECT oia.* FROM public.open_item_allocations oia
      WHERE oia.id = ANY(v_allocation_snapshot_ids)   -- snapshot، لا status
    LOOP
      SELECT COALESCE(MAX(CAST(SUBSTRING(entry_no FROM 'JE-'||v_yr||'-(\d+)') AS INT)),0)+1 INTO v_seq
        FROM public.journal_entries WHERE entry_no LIKE 'JE-'||v_yr||'-%';
      v_entry_no := 'JE-'||v_yr||'-'||LPAD(v_seq::TEXT,4,'0');

      IF v_alloc.allocation_type = 'PAYMENT' THEN
        -- deterministic Customer Deposits: count=1
        SELECT COUNT(*) INTO v_deposits_count FROM public.account_determinations
          WHERE determination_key='CUSTOMER_DEPOSITS'
            AND branch_id IS NULL AND department_code IS NULL
            AND product_type IS NULL AND payment_method IS NULL
            AND active=true AND is_default=true;
        IF v_deposits_count <> 1 THEN
          RAISE EXCEPTION 'F5.7: CUSTOMER_DEPOSITS_NOT_DETERMINISTIC (found %)', v_deposits_count;
        END IF;
        -- الحساب صالح: posting/liability/غير archived
        SELECT a.id, a.is_posting, a.type, a.is_archived INTO v_dep
        FROM public.account_determinations ad
        JOIN public.accounts a ON a.id = ad.account_id
        WHERE ad.determination_key='CUSTOMER_DEPOSITS'
          AND ad.branch_id IS NULL AND ad.department_code IS NULL
          AND ad.product_type IS NULL AND ad.payment_method IS NULL
          AND ad.active=true AND ad.is_default=true;
        IF v_dep.is_posting IS NOT TRUE OR v_dep.type <> 'liability' OR COALESCE(v_dep.is_archived,false) = true THEN
          RAISE EXCEPTION 'F5.7: CUSTOMER_DEPOSITS_ACCOUNT_INVALID (posting=%, type=%, archived=%)',
            v_dep.is_posting, v_dep.type, v_dep.is_archived;
        END IF;
        v_deposits_acct := v_dep.id;

        INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted,
          source_type, source_id, total_debit, total_credit)
        VALUES (v_entry_no, CURRENT_DATE, v_cn_no, 'ترحيل دفعة ملغاة لعربون العملاء - '||v_inv.invoice_no, true,
          'invoice_cancellation_payment_reclass', v_cn_id, v_alloc.allocated_amount, v_alloc.allocated_amount)
        RETURNING id INTO v_clr_je;
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
          contact_id, partner_type, document_type, document_id, reference_number)
        VALUES (v_clr_je, v_ar_acct, v_alloc.allocated_amount, 0, 'إعادة تحميل ذمم (إلغاء دفعة)',
          v_alloc.partner_id, 'customer', 'credit_note', v_cn_id, v_cn_no);
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
          contact_id, partner_type, document_type, document_id, reference_number)
        VALUES (v_clr_je, v_deposits_acct, 0, v_alloc.allocated_amount, 'عربون عميل (دفعة فاتورة ملغاة)',
          v_alloc.partner_id, 'customer', 'credit_note', v_cn_id, v_cn_no);

        v_gl_clearing_je_ids := array_append(v_gl_clearing_je_ids, v_clr_je);  -- #2

      ELSIF v_alloc.allocation_type = 'SETTLEMENT' THEN
        -- #1: اقرأ سطر counter الأصليّ كاملاً (account_id + contact_id + partner_type)
        SELECT COUNT(*) INTO v_counter_count FROM public.journal_entry_lines
          WHERE entry_id=v_alloc.journal_entry_id AND account_id <> v_ar_acct
            AND (debit > 0 OR credit > 0);
        IF v_counter_count <> 1 THEN
          RAISE EXCEPTION 'F5.7: SETTLEMENT_COUNTER_AMBIGUOUS (non_ar_lines %)', v_counter_count;
        END IF;
        SELECT account_id, contact_id, partner_type INTO v_counter
        FROM public.journal_entry_lines
          WHERE entry_id=v_alloc.journal_entry_id AND account_id <> v_ar_acct
            AND ABS(GREATEST(debit,credit) - v_alloc.allocated_amount) <= 0.01 LIMIT 1;
        IF v_counter.account_id IS NULL THEN
          RAISE EXCEPTION 'F5.7: SETTLEMENT_COUNTER_AMOUNT_MISMATCH';
        END IF;

        INSERT INTO public.journal_entries (entry_no, entry_date, reference, description, is_posted,
          source_type, source_id, total_debit, total_credit)
        VALUES (v_entry_no, CURRENT_DATE, v_cn_no, 'عكس تسوية ملغاة - '||v_inv.invoice_no, true,
          'invoice_cancellation_settlement_reversal', v_cn_id, v_alloc.allocated_amount, v_alloc.allocated_amount)
        RETURNING id INTO v_clr_je;
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
          contact_id, partner_type, document_type, document_id, reference_number)
        VALUES (v_clr_je, v_ar_acct, v_alloc.allocated_amount, 0, 'إعادة تحميل ذمم (عكس تسوية)',
          v_alloc.partner_id, 'customer', 'credit_note', v_cn_id, v_cn_no);
        -- Cr counter بنفس account_id + contact_id + partner_type الأصليّين (#1)
        INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description,
          contact_id, partner_type, document_type, document_id, reference_number)
        VALUES (v_clr_je, v_counter.account_id, 0, v_alloc.allocated_amount, 'عكس طرف التسوية',
          v_counter.contact_id, v_counter.partner_type, 'credit_note', v_cn_id, v_cn_no);

        v_gl_clearing_je_ids := array_append(v_gl_clearing_je_ids, v_clr_je);  -- #2
      END IF;
    END LOOP;
  END;

  -- ═══ تحديث الفاتورة (#6 cancelled مؤقتاً) ═══
  UPDATE public.invoices SET credited_amount=COALESCE(credited_amount,0)+v_inv.total, status='cancelled' WHERE id=p_invoice_id;

  -- ═══ F5.6 Governance (#2: يشمل gl_clearing_je_ids) ═══
  INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code, reason, details)
  VALUES ('SALE_CANCELLED', 'accounting', 'credit_note', v_cn_id, v_cn_no, p_reason,
    jsonb_build_object('invoice_no', v_inv.invoice_no, 'cn_no', v_cn_no,
      'revenue_reversal_je', v_new_rev_je, 'cogs_reversal_je', v_new_cogs_je,
      'gl_clearing_je_ids', v_gl_clearing_je_ids, 'total', v_inv.total));

  RETURN jsonb_build_object('success', true, 'credit_note_id', v_cn_id, 'cn_no', v_cn_no,
    'revenue_reversal_je', v_new_rev_je, 'cogs_reversal_je', v_new_cogs_je,
    'gl_clearing_je_ids', v_gl_clearing_je_ids);   -- #2
END;
$function$;
