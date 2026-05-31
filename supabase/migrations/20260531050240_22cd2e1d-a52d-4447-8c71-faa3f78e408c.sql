
-- 1) Extend enums
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'partially_paid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'delivered';

ALTER TYPE public.vehicle_status ADD VALUE IF NOT EXISTS 'delivered';

ALTER TYPE public.invoice_status ADD VALUE IF NOT EXISTS 'partially_paid';

-- 2) Customers — credit governance foundation
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS settlement_policy TEXT NOT NULL DEFAULT 'net_30',
  ADD COLUMN IF NOT EXISTS grace_days INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3) Invoices — partial payment + due date foundation
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS branch TEXT;

-- Backfill due_date from invoice_date + customer terms when missing
UPDATE public.invoices i
SET due_date = i.invoice_date + COALESCE((SELECT c.payment_terms_days FROM public.customers c WHERE c.id = i.customer_id), 30)
WHERE i.due_date IS NULL;

-- 4) Tighten customers RLS — anonymous must not manage customers
DROP POLICY IF EXISTS "auth manages customers" ON public.customers;
DROP POLICY IF EXISTS "auth read customers" ON public.customers;

CREATE POLICY "auth read customers"
  ON public.customers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "auth insert customers"
  ON public.customers FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth update customers"
  ON public.customers FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "admin delete customers"
  ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5) Payments table — full payment history
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_no TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL,
  invoice_id UUID,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payments_customer_idx ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_date_idx ON public.payments(payment_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read payments"
  ON public.payments FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert payments"
  ON public.payments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth update payments"
  ON public.payments FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "admin delete payments"
  ON public.payments FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger
DROP TRIGGER IF EXISTS payments_updated_at ON public.payments;
CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) Recalculate invoice paid_amount / status after payment insert
CREATE OR REPLACE FUNCTION public.recalc_invoice_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_paid NUMERIC;
BEGIN
  IF NEW.invoice_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.payments
  WHERE invoice_id = NEW.invoice_id;

  SELECT total INTO v_total FROM public.invoices WHERE id = NEW.invoice_id;

  UPDATE public.invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_paid >= COALESCE(v_total, 0) AND v_paid > 0 THEN 'paid'::invoice_status
        WHEN v_paid > 0 THEN 'partially_paid'::invoice_status
        ELSE status
      END
  WHERE id = NEW.invoice_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_invoice_payment ON public.payments;
CREATE TRIGGER trg_recalc_invoice_payment
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.recalc_invoice_payment();
