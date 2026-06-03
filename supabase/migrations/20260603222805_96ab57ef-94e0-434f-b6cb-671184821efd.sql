
CREATE OR REPLACE FUNCTION public.assert_credit_note_within_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_existing NUMERIC;
  v_new NUMERIC;
BEGIN
  IF NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'posted') <> 'posted' THEN RETURN NEW; END IF;

  SELECT total INTO v_total FROM public.invoices WHERE id = NEW.invoice_id;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_existing
  FROM public.credit_notes
  WHERE invoice_id = NEW.invoice_id
    AND status = 'posted'
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_new := v_existing + COALESCE(NEW.total, 0);
  IF v_new > v_total + 0.01 THEN
    RAISE EXCEPTION 'لا يمكن إصدار إشعار دائن يتجاوز رصيد الفاتورة (المتاح: %)', (v_total - v_existing);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_cn_within_invoice ON public.credit_notes;
CREATE TRIGGER trg_assert_cn_within_invoice
BEFORE INSERT OR UPDATE ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.assert_credit_note_within_invoice();
