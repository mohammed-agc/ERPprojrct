-- Phase 2: Credit Note COGS Reversal Governance

-- 1) cn_type enum
DO $$ BEGIN
  CREATE TYPE public.cn_type AS ENUM ('cancellation','return','price_adjustment','discount');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) credit_notes: cn_type + cogs_journal_entry_id
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS cn_type public.cn_type NOT NULL DEFAULT 'cancellation',
  ADD COLUMN IF NOT EXISTS cogs_journal_entry_id uuid;

-- Backfill cn_type from legacy reason text
UPDATE public.credit_notes
   SET cn_type = CASE
     WHEN reason ILIKE '%return%'      THEN 'return'::public.cn_type
     WHEN reason ILIKE '%price%'       THEN 'price_adjustment'::public.cn_type
     WHEN reason ILIKE '%discount%'    THEN 'discount'::public.cn_type
     ELSE 'cancellation'::public.cn_type
   END
 WHERE cn_type = 'cancellation' AND reason IS NOT NULL;

-- 3) Goods Return Workflow tables
CREATE TABLE IF NOT EXISTS public.goods_return_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_no text NOT NULL UNIQUE,
  credit_note_id uuid REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending', -- pending | inspected | approved | rejected | reinstated
  inspected_by uuid,
  inspected_at timestamptz,
  inspection_notes text,
  approved_by uuid,
  approved_at timestamptz,
  reinstated_at timestamptz,
  cogs_reversal_je_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_return_requests TO authenticated;
GRANT ALL ON public.goods_return_requests TO service_role;

ALTER TABLE public.goods_return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read goods_return_requests" ON public.goods_return_requests
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert goods_return_requests" ON public.goods_return_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update goods_return_requests" ON public.goods_return_requests
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete goods_return_requests" ON public.goods_return_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_goods_return_requests_updated_at
  BEFORE UPDATE ON public.goods_return_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) Extended post_credit_note_journal with JE-C (COGS reversal)
CREATE OR REPLACE FUNCTION public.post_credit_note_journal(p_cn_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cn         RECORD;
  v_je_id      uuid;
  v_je_cogs    uuid;
  v_acc_rev    uuid;
  v_acc_vat    uuid;
  v_acc_ar     uuid;
  v_acc_cogs   uuid;
  v_acc_inv    uuid;
  v_cogs_total numeric := 0;
  v_veh        RECORD;
  v_landed     numeric;
  v_vstatus    text;
  v_pending    int;
BEGIN
  SELECT id, credit_note_no, cn_date, invoice_id, customer_id,
         subtotal, vat_amount, total, status, cn_type,
         journal_entry_id, cogs_journal_entry_id
    INTO v_cn
    FROM public.credit_notes
   WHERE id = p_cn_id;

  IF v_cn.id IS NULL THEN
    RAISE EXCEPTION 'إشعار دائن غير موجود: %', p_cn_id;
  END IF;

  IF COALESCE(v_cn.status,'posted') <> 'posted' THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد إشعار دائن غير مرحَّل';
  END IF;

  SELECT id INTO v_acc_rev  FROM public.accounts WHERE code = '4100' LIMIT 1;
  SELECT id INTO v_acc_vat  FROM public.accounts WHERE code = '2200' LIMIT 1;
  SELECT id INTO v_acc_ar   FROM public.accounts WHERE code = '1200' LIMIT 1;
  SELECT id INTO v_acc_cogs FROM public.accounts WHERE code = '5100' LIMIT 1;
  SELECT id INTO v_acc_inv  FROM public.accounts WHERE code = '1310' LIMIT 1;

  IF v_acc_rev IS NULL OR v_acc_vat IS NULL OR v_acc_ar IS NULL
     OR v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'دليل الحسابات ناقص (4100/2200/1200/5100/1310)';
  END IF;

  -- (A) Revenue / VAT / AR reversal (idempotent)
  IF v_cn.journal_entry_id IS NULL THEN
    INSERT INTO public.journal_entries (
      entry_no, entry_date, reference, description,
      source_type, source_id, is_posted, created_by
    ) VALUES (
      'CN-JE-' || v_cn.credit_note_no, v_cn.cn_date, v_cn.credit_note_no,
      'قيد إشعار دائن ' || v_cn.credit_note_no,
      'credit_note', v_cn.id, false, auth.uid()
    ) RETURNING id INTO v_je_id;

    INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
      (v_je_id, v_acc_rev, COALESCE(v_cn.subtotal,0),  0, 'عكس إيراد — ' || v_cn.credit_note_no),
      (v_je_id, v_acc_vat, COALESCE(v_cn.vat_amount,0),0, 'عكس ضريبة مخرجات — ' || v_cn.credit_note_no),
      (v_je_id, v_acc_ar,  0, COALESCE(v_cn.total,0),     'تخفيض ذمم العميل — ' || v_cn.credit_note_no);

    UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;
    UPDATE public.credit_notes SET journal_entry_id = v_je_id WHERE id = v_cn.id;
  ELSE
    v_je_id := v_cn.journal_entry_id;
  END IF;

  -- (B) COGS reversal JE-C — only for cancellation / return
  IF v_cn.cogs_journal_entry_id IS NULL
     AND v_cn.cn_type IN ('cancellation','return') THEN

    -- Gather vehicles tied to CN lines; compute landed cost via authoritative chain
    FOR v_veh IN
      SELECT DISTINCT cnl.vehicle_id
        FROM public.credit_note_lines cnl
       WHERE cnl.credit_note_id = v_cn.id
         AND cnl.vehicle_id IS NOT NULL
    LOOP
      -- For 'return' CN, every delivered vehicle must have an APPROVED return request
      IF v_cn.cn_type = 'return' THEN
        SELECT status::text INTO v_vstatus FROM public.vehicles WHERE id = v_veh.vehicle_id;
        IF v_vstatus = 'delivered' THEN
          SELECT COUNT(*) INTO v_pending
            FROM public.goods_return_requests grr
           WHERE grr.credit_note_id = v_cn.id
             AND grr.vehicle_id = v_veh.vehicle_id
             AND grr.status IN ('approved','reinstated');
          IF v_pending = 0 THEN
            RAISE EXCEPTION 'لا يمكن عكس COGS لمركبة مسلَّمة بدون موافقة مرتجع (vehicle=%)', v_veh.vehicle_id;
          END IF;
        END IF;
      END IF;

      SELECT landed_cost INTO v_landed
        FROM public.compute_vehicle_landed_cost(v_veh.vehicle_id);
      v_cogs_total := v_cogs_total + COALESCE(v_landed, 0);
    END LOOP;

    IF v_cogs_total > 0 THEN
      INSERT INTO public.journal_entries (
        entry_no, entry_date, reference, description,
        source_type, source_id, is_posted, created_by
      ) VALUES (
        'CN-COGS-JE-' || v_cn.credit_note_no, v_cn.cn_date, v_cn.credit_note_no,
        'عكس تكلفة بضاعة مباعة — ' || v_cn.credit_note_no,
        'credit_note_cogs', v_cn.id, false, auth.uid()
      ) RETURNING id INTO v_je_cogs;

      INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
        (v_je_cogs, v_acc_inv,  v_cogs_total, 0,            'إعادة مخزون مركبات — ' || v_cn.credit_note_no),
        (v_je_cogs, v_acc_cogs, 0,            v_cogs_total, 'عكس COGS — ' || v_cn.credit_note_no);

      UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_cogs;
      UPDATE public.credit_notes SET cogs_journal_entry_id = v_je_cogs WHERE id = v_cn.id;
    END IF;
  END IF;

  RETURN v_je_id;
END;
$function$;

-- 5) Goods return approval RPC: approve + reinstate inventory + reverse COGS atomically
CREATE OR REPLACE FUNCTION public.approve_goods_return(p_request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_r       RECORD;
  v_je_id   uuid;
  v_acc_cogs uuid;
  v_acc_inv  uuid;
  v_landed   numeric;
BEGIN
  SELECT * INTO v_r FROM public.goods_return_requests WHERE id = p_request_id FOR UPDATE;
  IF v_r.id IS NULL THEN RAISE EXCEPTION 'طلب مرتجع غير موجود'; END IF;
  IF v_r.status = 'reinstated' THEN RETURN v_r.cogs_reversal_je_id; END IF;
  IF v_r.status NOT IN ('pending','inspected','approved') THEN
    RAISE EXCEPTION 'حالة الطلب لا تسمح بالاعتماد: %', v_r.status;
  END IF;

  SELECT id INTO v_acc_cogs FROM public.accounts WHERE code='5100' LIMIT 1;
  SELECT id INTO v_acc_inv  FROM public.accounts WHERE code='1310' LIMIT 1;
  IF v_acc_cogs IS NULL OR v_acc_inv IS NULL THEN
    RAISE EXCEPTION 'دليل الحسابات ناقص (5100/1310)';
  END IF;

  SELECT landed_cost INTO v_landed FROM public.compute_vehicle_landed_cost(v_r.vehicle_id);
  IF COALESCE(v_landed,0) <= 0 THEN
    RAISE EXCEPTION 'تكلفة المركبة غير معروفة — تعذّر عكس COGS';
  END IF;

  -- Atomic: JE then inventory restore then status update
  INSERT INTO public.journal_entries (
    entry_no, entry_date, reference, description,
    source_type, source_id, is_posted, created_by
  ) VALUES (
    'RET-JE-' || v_r.request_no, CURRENT_DATE, v_r.request_no,
    'إعادة مخزون + عكس COGS — مرتجع ' || v_r.request_no,
    'goods_return', v_r.id, false, auth.uid()
  ) RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_acc_inv,  v_landed, 0,        'إعادة مخزون مركبة — ' || v_r.request_no),
    (v_je_id, v_acc_cogs, 0,        v_landed, 'عكس COGS — ' || v_r.request_no);

  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;

  UPDATE public.vehicles SET status = 'available' WHERE id = v_r.vehicle_id;

  UPDATE public.goods_return_requests
     SET status = 'reinstated',
         approved_by = COALESCE(approved_by, auth.uid()),
         approved_at = COALESCE(approved_at, now()),
         reinstated_at = now(),
         cogs_reversal_je_id = v_je_id
   WHERE id = v_r.id;

  RETURN v_je_id;
END;
$function$;

-- 6) Governance view
CREATE OR REPLACE VIEW public.v_gov_cn_missing_cogs_reversal
WITH (security_invoker = true) AS
WITH cn_vehicles AS (
  SELECT cn.id AS credit_note_id, cn.credit_note_no, cn.cn_type, cn.status,
         cn.cogs_journal_entry_id, cnl.vehicle_id, v.status::text AS vehicle_status
    FROM public.credit_notes cn
    JOIN public.credit_note_lines cnl ON cnl.credit_note_id = cn.id
    LEFT JOIN public.vehicles v ON v.id = cnl.vehicle_id
   WHERE cn.status = 'posted'
     AND cnl.vehicle_id IS NOT NULL
)
SELECT DISTINCT
  cv.credit_note_id,
  cv.credit_note_no,
  cv.cn_type,
  cv.vehicle_id,
  cv.vehicle_status,
  CASE
    WHEN cv.cn_type IN ('cancellation','return') AND cv.cogs_journal_entry_id IS NULL
      THEN 'missing_cogs_reversal'
    WHEN cv.cn_type = 'return' AND cv.vehicle_status = 'delivered'
         AND NOT EXISTS (
           SELECT 1 FROM public.goods_return_requests grr
            WHERE grr.credit_note_id = cv.credit_note_id
              AND grr.vehicle_id = cv.vehicle_id
              AND grr.status IN ('approved','reinstated')
         )
      THEN 'delivered_return_without_approval'
    WHEN cv.vehicle_status = 'available' AND cv.cogs_journal_entry_id IS NULL
         AND cv.cn_type IN ('cancellation','return')
      THEN 'inventory_restored_without_je'
  END AS gap
FROM cn_vehicles cv
WHERE
  (cv.cn_type IN ('cancellation','return') AND cv.cogs_journal_entry_id IS NULL)
  OR (cv.cn_type = 'return' AND cv.vehicle_status = 'delivered'
      AND NOT EXISTS (
        SELECT 1 FROM public.goods_return_requests grr
         WHERE grr.credit_note_id = cv.credit_note_id
           AND grr.vehicle_id = cv.vehicle_id
           AND grr.status IN ('approved','reinstated')
      ));

GRANT SELECT ON public.v_gov_cn_missing_cogs_reversal TO authenticated;
