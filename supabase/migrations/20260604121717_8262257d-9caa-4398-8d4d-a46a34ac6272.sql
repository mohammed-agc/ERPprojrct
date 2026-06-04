
-- =========================================================
-- PHASE 0 — COGS FOUNDATION
-- =========================================================

-- 1) GL ACCOUNTS ------------------------------------------------
INSERT INTO public.accounts (code, name_ar, name_en, type, is_active)
VALUES
  ('1310', 'مخزون المركبات',         'Vehicle Inventory',          'asset',   true),
  ('1320', 'مركبات تحت التجهيز',     'Vehicle WIP',                'asset',   true),
  ('5100', 'تكلفة البضاعة المباعة',  'Cost Of Goods Sold',         'expense', true),
  ('5110', 'تسوية التكلفة الواردة',  'Landed Cost Clearing',       'expense', true),
  ('5120', 'تكاليف تجهيز المركبات',  'Vehicle Preparation Cost',   'expense', true)
ON CONFLICT (code) DO NOTHING;

-- 2) INVOICE → JE LINKAGE --------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id     uuid,
  ADD COLUMN IF NOT EXISTS cogs_journal_entry_id uuid;

-- 3) POST INVOICE JOURNAL --------------------------------------
CREATE OR REPLACE FUNCTION public.post_invoice_journal(p_invoice_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv       RECORD;
  v_je_rev    uuid;
  v_je_cogs   uuid;
  v_acc_ar    uuid;
  v_acc_rev   uuid;
  v_acc_vat   uuid;
  v_acc_cogs  uuid;
  v_acc_inv   uuid;
  v_cogs_total NUMERIC := 0;
  v_veh       RECORD;
BEGIN
  SELECT id, invoice_no, invoice_date, customer_id, sales_order_id,
         subtotal, vat_amount, total, status,
         journal_entry_id, cogs_journal_entry_id
    INTO v_inv
  FROM public.invoices WHERE id = p_invoice_id;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'فاتورة غير موجودة: %', p_invoice_id;
  END IF;

  IF v_inv.status = 'draft' OR v_inv.status = 'cancelled' THEN
    RETURN NULL; -- nothing to post
  END IF;

  -- Accounts
  SELECT id INTO v_acc_ar   FROM public.accounts WHERE code = '1200' LIMIT 1;
  SELECT id INTO v_acc_rev  FROM public.accounts WHERE code = '4100' LIMIT 1;
  SELECT id INTO v_acc_vat  FROM public.accounts WHERE code = '2200' LIMIT 1;
  SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '5100' LIMIT 1;
  SELECT id INTO v_acc_inv  FROM public.accounts WHERE code = '1310' LIMIT 1;

  IF v_acc_ar IS NULL OR v_acc_rev IS NULL OR v_acc_vat IS NULL
     OR v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'دليل الحسابات ناقص (1200/4100/2200/5100/1310)';
  END IF;

  -- DATA INTEGRITY — validate vehicles tied to this invoice
  IF v_inv.sales_order_id IS NOT NULL THEN
    FOR v_veh IN
      SELECT v.id, v.vin, v.cost_price, v.status
        FROM public.sales_order_lines sol
        JOIN public.vehicles v ON v.id = sol.vehicle_id
       WHERE sol.order_id = v_inv.sales_order_id
         AND sol.vehicle_id IS NOT NULL
    LOOP
      IF COALESCE(v_veh.cost_price, 0) <= 0 THEN
        RAISE EXCEPTION 'لا يمكن ترحيل الفاتورة: المركبة % بدون تكلفة (cost_price=0)', COALESCE(v_veh.vin, v_veh.id::text);
      END IF;
      IF v_veh.status NOT IN ('available','reserved','sold','delivered') THEN
        RAISE EXCEPTION 'لا يمكن ترحيل الفاتورة: حالة المركبة % غير صالحة (%)', COALESCE(v_veh.vin, v_veh.id::text), v_veh.status;
      END IF;
      v_cogs_total := v_cogs_total + COALESCE(v_veh.cost_price, 0);
    END LOOP;
  END IF;

  -- (A) Revenue / VAT / AR ------------------------------------
  IF v_inv.journal_entry_id IS NULL THEN
    INSERT INTO public.journal_entries (
      entry_no, entry_date, reference, description,
      source_type, source_id, is_posted, created_by
    ) VALUES (
      'INV-JE-' || v_inv.invoice_no,
      v_inv.invoice_date,
      v_inv.invoice_no,
      'قيد فاتورة بيع ' || v_inv.invoice_no,
      'invoice', v_inv.id, false, auth.uid()
    ) RETURNING id INTO v_je_rev;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
      (v_je_rev, v_acc_ar,  COALESCE(v_inv.total, 0),      0,                            'ذمم العميل — ' || v_inv.invoice_no),
      (v_je_rev, v_acc_rev, 0,                              COALESCE(v_inv.subtotal, 0), 'إيراد مبيعات — ' || v_inv.invoice_no),
      (v_je_rev, v_acc_vat, 0,                              COALESCE(v_inv.vat_amount,0),'ضريبة مخرجات — ' || v_inv.invoice_no);

    UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_rev;
    UPDATE public.invoices SET journal_entry_id = v_je_rev WHERE id = v_inv.id;
  ELSE
    v_je_rev := v_inv.journal_entry_id;
  END IF;

  -- (B) COGS / Inventory --------------------------------------
  IF v_inv.cogs_journal_entry_id IS NULL AND v_cogs_total > 0 THEN
    INSERT INTO public.journal_entries (
      entry_no, entry_date, reference, description,
      source_type, source_id, is_posted, created_by
    ) VALUES (
      'COGS-JE-' || v_inv.invoice_no,
      v_inv.invoice_date,
      v_inv.invoice_no,
      'قيد تكلفة بضاعة مباعة — ' || v_inv.invoice_no,
      'invoice_cogs', v_inv.id, false, auth.uid()
    ) RETURNING id INTO v_je_cogs;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
      (v_je_cogs, v_acc_cogs, v_cogs_total, 0,            'COGS — ' || v_inv.invoice_no),
      (v_je_cogs, v_acc_inv,  0,            v_cogs_total, 'تخفيض مخزون مركبات — ' || v_inv.invoice_no);

    UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_cogs;
    UPDATE public.invoices SET cogs_journal_entry_id = v_je_cogs WHERE id = v_inv.id;
  END IF;

  RETURN v_je_rev;
END;
$$;

-- 4) TRIGGER on invoices ---------------------------------------
CREATE OR REPLACE FUNCTION public.trg_invoices_post_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('posted','partially_paid','paid') THEN
    PERFORM public.post_invoice_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_post_journal_aiu ON public.invoices;
CREATE TRIGGER trg_invoices_post_journal_aiu
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trg_invoices_post_journal();

-- 5) GOVERNANCE VIEWS ------------------------------------------
CREATE OR REPLACE VIEW public.v_gov_invoices_missing_cogs AS
SELECT i.id, i.invoice_no, i.invoice_date, i.status, i.total
  FROM public.invoices i
 WHERE i.status IN ('posted','partially_paid','paid')
   AND i.cogs_journal_entry_id IS NULL
   AND EXISTS (
     SELECT 1 FROM public.sales_order_lines sol
      WHERE sol.order_id = i.sales_order_id AND sol.vehicle_id IS NOT NULL
   );

CREATE OR REPLACE VIEW public.v_gov_sold_vehicles_without_cogs AS
SELECT v.id AS vehicle_id, v.vin, v.brand, v.model, v.status, v.cost_price
  FROM public.vehicles v
 WHERE v.status IN ('sold','delivered')
   AND NOT EXISTS (
     SELECT 1
       FROM public.sales_order_lines sol
       JOIN public.invoices i ON i.sales_order_id = sol.order_id
      WHERE sol.vehicle_id = v.id
        AND i.cogs_journal_entry_id IS NOT NULL
   );

CREATE OR REPLACE VIEW public.v_gov_vehicles_missing_cost AS
SELECT v.id AS vehicle_id, v.vin, v.brand, v.model, v.status
  FROM public.vehicles v
 WHERE COALESCE(v.cost_price, 0) <= 0
   AND v.status IN ('reserved','sold','delivered');

GRANT SELECT ON public.v_gov_invoices_missing_cogs       TO authenticated;
GRANT SELECT ON public.v_gov_sold_vehicles_without_cogs  TO authenticated;
GRANT SELECT ON public.v_gov_vehicles_missing_cost       TO authenticated;

-- 6) BACKFILL — post journals for already-posted invoices
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.invoices
     WHERE status IN ('posted','partially_paid','paid')
       AND (journal_entry_id IS NULL OR cogs_journal_entry_id IS NULL)
  LOOP
    BEGIN
      PERFORM public.post_invoice_journal(r.id);
    EXCEPTION WHEN OTHERS THEN
      -- skip invoices that fail integrity (zero cost etc.); they will surface in governance views
      NULL;
    END;
  END LOOP;
END $$;
