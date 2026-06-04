
-- 1) Sub-accounts under 1100 for payment debit legs
INSERT INTO public.accounts (code, name_ar, name_en, type, parent_id)
SELECT v.code, v.name_ar, v.name_en, 'asset'::account_type, (SELECT id FROM public.accounts WHERE code='1100')
FROM (VALUES
  ('1110','الصندوق','Cash on Hand'),
  ('1120','البنوك','Bank Accounts'),
  ('1130','تسويات نقاط البيع','POS Clearing'),
  ('1140','شيكات برسم التحصيل','Cheques Under Collection')
) AS v(code, name_ar, name_en)
WHERE NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = v.code);

-- 2) Add status column to payments (posted/draft) for governance
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'posted';

-- 3) Function: post payment journal entry
CREATE OR REPLACE FUNCTION public.post_payment_journal(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p RECORD;
  v_je_id uuid;
  v_debit_acc uuid;
  v_debit_code text;
  v_acc_ar uuid;
  v_existing_je uuid;
BEGIN
  SELECT id, payment_no, payment_date, amount, method, reference, invoice_id, customer_id
    INTO v_p
  FROM public.payments WHERE id = p_payment_id;

  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'دفعة غير موجودة: %', p_payment_id;
  END IF;

  -- Idempotency: if a JE already exists for this payment, return it
  SELECT id INTO v_existing_je
    FROM public.journal_entries
   WHERE source_type = 'payment' AND source_id = v_p.id
   LIMIT 1;
  IF v_existing_je IS NOT NULL THEN
    RETURN v_existing_je;
  END IF;

  v_debit_code := CASE lower(coalesce(v_p.method, 'cash'))
    WHEN 'cash'           THEN '1110'
    WHEN 'bank'           THEN '1120'
    WHEN 'bank_transfer'  THEN '1120'
    WHEN 'transfer'       THEN '1120'
    WHEN 'pos'            THEN '1130'
    WHEN 'card'           THEN '1130'
    WHEN 'cheque'         THEN '1140'
    WHEN 'check'          THEN '1140'
    ELSE '1110'
  END;

  SELECT id INTO v_debit_acc FROM public.accounts WHERE code = v_debit_code LIMIT 1;
  SELECT id INTO v_acc_ar    FROM public.accounts WHERE code = '1200'        LIMIT 1;

  IF v_debit_acc IS NULL OR v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'الحسابات المطلوبة غير معرَّفة لقيد سند القبض (% / 1200)', v_debit_code;
  END IF;

  INSERT INTO public.journal_entries (
    entry_no, entry_date, reference, description,
    source_type, source_id, is_posted, created_by
  ) VALUES (
    'RCP-JE-' || v_p.payment_no,
    v_p.payment_date,
    coalesce(v_p.reference, v_p.payment_no),
    'قيد سند قبض ' || v_p.payment_no,
    'payment',
    v_p.id,
    false,
    coalesce(auth.uid(), v_p.created_by)
  ) RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_debit_acc, coalesce(v_p.amount, 0), 0, 'تحصيل — ' || v_p.payment_no),
    (v_je_id, v_acc_ar,    0, coalesce(v_p.amount, 0), 'تخفيض ذمم العميل — ' || v_p.payment_no);

  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;

  RETURN v_je_id;
END;
$$;

-- 4) Trigger to auto-create JE on payment insert
CREATE OR REPLACE FUNCTION public.trg_payments_post_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(NEW.status, 'posted') = 'posted' AND coalesce(NEW.amount, 0) > 0 THEN
    PERFORM public.post_payment_journal(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_post_journal ON public.payments;
CREATE TRIGGER payments_post_journal
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payments_post_journal();

-- 5) Backfill: post journals for existing posted payments without JE
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.id FROM public.payments p
    LEFT JOIN public.journal_entries je
      ON je.source_type = 'payment' AND je.source_id = p.id
    WHERE je.id IS NULL
      AND coalesce(p.status,'posted') = 'posted'
      AND coalesce(p.amount,0) > 0
  LOOP
    BEGIN
      PERFORM public.post_payment_journal(r.id);
    EXCEPTION WHEN OTHERS THEN
      -- skip individual failures during backfill
      NULL;
    END;
  END LOOP;
END $$;
