
-- Credit notes header
CREATE TABLE public.credit_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_no TEXT NOT NULL UNIQUE,
  invoice_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  cn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL DEFAULT 'invoice_cancellation',
  notes TEXT,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  vat_amount NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'posted',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.credit_notes TO authenticated;
GRANT ALL ON public.credit_notes TO service_role;

ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read credit_notes" ON public.credit_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert credit_notes" ON public.credit_notes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update credit_notes" ON public.credit_notes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "admin delete credit_notes" ON public.credit_notes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_credit_notes_updated_at
BEFORE UPDATE ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Credit note lines
CREATE TABLE public.credit_note_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  credit_note_id UUID NOT NULL REFERENCES public.credit_notes(id) ON DELETE CASCADE,
  line_no INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  vat_pct NUMERIC NOT NULL DEFAULT 15,
  line_total NUMERIC NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_note_lines TO authenticated;
GRANT ALL ON public.credit_note_lines TO service_role;

ALTER TABLE public.credit_note_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read cn_lines" ON public.credit_note_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage cn_lines" ON public.credit_note_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_lines.credit_note_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.credit_notes c WHERE c.id = credit_note_lines.credit_note_id));

-- Add credited_amount to invoices
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS credited_amount NUMERIC NOT NULL DEFAULT 0;

-- Recalc trigger: keep invoices.credited_amount in sync and flip status to cancelled when fully credited
CREATE OR REPLACE FUNCTION public.recalc_invoice_credited()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv UUID;
  v_total NUMERIC;
  v_credited NUMERIC;
BEGIN
  v_inv := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_inv IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_credited
  FROM public.credit_notes
  WHERE invoice_id = v_inv AND status = 'posted';

  SELECT total INTO v_total FROM public.invoices WHERE id = v_inv;

  UPDATE public.invoices
  SET credited_amount = v_credited,
      status = CASE
        WHEN v_credited >= COALESCE(v_total, 0) AND v_credited > 0 THEN 'cancelled'::invoice_status
        ELSE status
      END
  WHERE id = v_inv;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_recalc_invoice_credited
AFTER INSERT OR UPDATE OR DELETE ON public.credit_notes
FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_credited();
