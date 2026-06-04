-- Add lifecycle date columns
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;

-- Backfill acquired_at from created_at for legacy records
UPDATE public.vehicles
   SET acquired_at = created_at
 WHERE acquired_at IS NULL;

-- Backfill sold_at for vehicles already sold/delivered using earliest posted invoice date
UPDATE public.vehicles v
   SET sold_at = sub.first_inv_date
  FROM (
    SELECT sol.vehicle_id, MIN(inv.invoice_date)::timestamptz AS first_inv_date
      FROM public.sales_order_lines sol
      JOIN public.invoices inv ON inv.sales_order_id = sol.order_id
     WHERE inv.status IN ('posted','partially_paid','paid')
       AND sol.vehicle_id IS NOT NULL
     GROUP BY sol.vehicle_id
  ) sub
 WHERE v.id = sub.vehicle_id
   AND v.sold_at IS NULL
   AND v.status IN ('sold','delivered');

-- Fallback: sold/delivered vehicles without invoice -> use updated_at
UPDATE public.vehicles
   SET sold_at = updated_at
 WHERE sold_at IS NULL
   AND status IN ('sold','delivered');

-- Trigger: protect acquired_at immutability and auto-set on insert
CREATE OR REPLACE FUNCTION public.vehicles_lifecycle_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.acquired_at IS NULL THEN
      NEW.acquired_at := COALESCE(NEW.created_at, now());
    END IF;
    -- sold_at only if inserted as already sold
    IF NEW.sold_at IS NULL AND NEW.status IN ('sold','delivered') THEN
      NEW.sold_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Immutability of acquired_at once set
    IF OLD.acquired_at IS NOT NULL AND NEW.acquired_at IS DISTINCT FROM OLD.acquired_at THEN
      RAISE EXCEPTION 'لا يمكن تعديل تاريخ دخول المركبة للمخزون (acquired_at)';
    END IF;
    IF NEW.acquired_at IS NULL THEN
      NEW.acquired_at := COALESCE(OLD.acquired_at, OLD.created_at, now());
    END IF;
    -- Auto-set sold_at on first transition to sold/delivered
    IF NEW.status IN ('sold','delivered')
       AND (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.sold_at IS NULL THEN
      NEW.sold_at := now();
    END IF;
    -- Prevent clearing sold_at once set
    IF OLD.sold_at IS NOT NULL AND NEW.sold_at IS NULL THEN
      NEW.sold_at := OLD.sold_at;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vehicles_lifecycle_dates ON public.vehicles;
CREATE TRIGGER trg_vehicles_lifecycle_dates
BEFORE INSERT OR UPDATE ON public.vehicles
FOR EACH ROW EXECUTE FUNCTION public.vehicles_lifecycle_dates();

-- Trigger on invoices: when invoice transitions to posted, stamp sold_at for linked vehicles
CREATE OR REPLACE FUNCTION public.invoices_stamp_vehicle_sold_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('posted','partially_paid','paid')
     AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('posted','partially_paid','paid'))
     AND NEW.sales_order_id IS NOT NULL THEN
    UPDATE public.vehicles v
       SET sold_at = COALESCE(v.sold_at, NEW.invoice_date::timestamptz)
      FROM public.sales_order_lines sol
     WHERE sol.order_id = NEW.sales_order_id
       AND sol.vehicle_id = v.id
       AND v.sold_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoices_stamp_vehicle_sold_at ON public.invoices;
CREATE TRIGGER trg_invoices_stamp_vehicle_sold_at
AFTER INSERT OR UPDATE OF status ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.invoices_stamp_vehicle_sold_at();

-- Governance views
CREATE OR REPLACE VIEW public.v_gov_vehicles_missing_acquired_at AS
SELECT id, code, vin, brand, model, status, created_at
  FROM public.vehicles
 WHERE acquired_at IS NULL;

CREATE OR REPLACE VIEW public.v_gov_vehicles_sold_missing_sold_at AS
SELECT id, code, vin, brand, model, status, created_at, updated_at
  FROM public.vehicles
 WHERE status IN ('sold','delivered')
   AND sold_at IS NULL;

CREATE OR REPLACE VIEW public.v_gov_vehicles_negative_days_in_stock AS
SELECT id, code, vin, brand, model, status, acquired_at, sold_at,
       EXTRACT(EPOCH FROM (sold_at - acquired_at))/86400.0 AS days_in_stock
  FROM public.vehicles
 WHERE acquired_at IS NOT NULL
   AND sold_at IS NOT NULL
   AND sold_at < acquired_at;

GRANT SELECT ON public.v_gov_vehicles_missing_acquired_at TO authenticated;
GRANT SELECT ON public.v_gov_vehicles_sold_missing_sold_at TO authenticated;
GRANT SELECT ON public.v_gov_vehicles_negative_days_in_stock TO authenticated;