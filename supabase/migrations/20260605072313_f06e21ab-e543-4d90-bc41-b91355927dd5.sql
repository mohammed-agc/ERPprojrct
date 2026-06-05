
-- Auto-numbering for purchase_invoices (Stage 2 enabler)
CREATE SEQUENCE IF NOT EXISTS public.seq_pinv_no START 1;

CREATE OR REPLACE FUNCTION public.assign_pinv_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.invoice_no IS NULL OR NEW.invoice_no = '' THEN
    NEW.invoice_no := 'PINV-' || lpad(nextval('public.seq_pinv_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_pinv_no ON public.purchase_invoices;
CREATE TRIGGER trg_assign_pinv_no BEFORE INSERT ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_pinv_no();

-- Seed sequence past any existing invoice_no like PINV-XXXXXX
SELECT setval('public.seq_pinv_no',
  GREATEST(
    1,
    COALESCE((
      SELECT MAX(CAST(substring(invoice_no FROM 'PINV-(\d+)') AS integer))
      FROM public.purchase_invoices
      WHERE invoice_no ~ '^PINV-\d+$'
    ), 0)
  )
);
