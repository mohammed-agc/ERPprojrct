
-- 1) Link credit note lines to a specific vehicle (for inventory release)
ALTER TABLE public.credit_note_lines
  ADD COLUMN IF NOT EXISTS vehicle_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_cn_lines_vehicle ON public.credit_note_lines(vehicle_id);

-- 2) Link a credit note to its authoritative journal entry
ALTER TABLE public.credit_notes
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid NULL;

CREATE INDEX IF NOT EXISTS idx_credit_notes_je ON public.credit_notes(journal_entry_id);

-- 3) RPC: post the AR/Revenue/VAT journal for a credit note.
--    Idempotent: if a JE already exists for this CN, returns it.
CREATE OR REPLACE FUNCTION public.post_credit_note_journal(p_cn_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn         RECORD;
  v_je_id      uuid;
  v_acc_rev    uuid;
  v_acc_vat    uuid;
  v_acc_ar     uuid;
BEGIN
  SELECT id, credit_note_no, cn_date, invoice_id, customer_id,
         subtotal, vat_amount, total, status, journal_entry_id
    INTO v_cn
    FROM public.credit_notes
   WHERE id = p_cn_id;

  IF v_cn.id IS NULL THEN
    RAISE EXCEPTION 'إشعار دائن غير موجود: %', p_cn_id;
  END IF;

  IF COALESCE(v_cn.status, 'posted') <> 'posted' THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد إشعار دائن غير مرحَّل';
  END IF;

  -- Idempotency
  IF v_cn.journal_entry_id IS NOT NULL THEN
    RETURN v_cn.journal_entry_id;
  END IF;

  SELECT id INTO v_acc_rev FROM public.accounts WHERE code = '4100' LIMIT 1;
  SELECT id INTO v_acc_vat FROM public.accounts WHERE code = '2200' LIMIT 1;
  SELECT id INTO v_acc_ar  FROM public.accounts WHERE code = '1200' LIMIT 1;

  IF v_acc_rev IS NULL OR v_acc_vat IS NULL OR v_acc_ar IS NULL THEN
    RAISE EXCEPTION 'الحسابات المطلوبة غير معرَّفة في دليل الحسابات (4100/2200/1200)';
  END IF;

  -- Create unposted entry first so validate_balanced_entry doesn't fire before lines exist
  INSERT INTO public.journal_entries (
    entry_no, entry_date, reference, description,
    source_type, source_id, is_posted, created_by
  )
  VALUES (
    'CN-JE-' || v_cn.credit_note_no,
    v_cn.cn_date,
    v_cn.credit_note_no,
    'قيد إشعار دائن ' || v_cn.credit_note_no,
    'credit_note',
    v_cn.id,
    false,
    auth.uid()
  )
  RETURNING id INTO v_je_id;

  INSERT INTO public.journal_entry_lines (entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_acc_rev, COALESCE(v_cn.subtotal, 0), 0, 'عكس إيراد — ' || v_cn.credit_note_no),
    (v_je_id, v_acc_vat, COALESCE(v_cn.vat_amount, 0), 0, 'عكس ضريبة مخرجات — ' || v_cn.credit_note_no),
    (v_je_id, v_acc_ar,  0, COALESCE(v_cn.total, 0),    'تخفيض ذمم العميل — ' || v_cn.credit_note_no);

  -- Now post (the validate_balanced_entry trigger will check debits = credits)
  UPDATE public.journal_entries SET is_posted = true WHERE id = v_je_id;

  UPDATE public.credit_notes SET journal_entry_id = v_je_id WHERE id = v_cn.id;

  RETURN v_je_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_credit_note_journal(uuid) TO authenticated;
