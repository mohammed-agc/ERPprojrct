
-- =========================================================
-- Phase 1: Vehicle Cost Foundation
-- =========================================================

-- 1) Enum for cost types
DO $$ BEGIN
  CREATE TYPE public.vehicle_cost_type AS ENUM (
    'freight','customs','transportation','preparation',
    'registration','insurance','repair','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) vehicle_costs table
CREATE TABLE IF NOT EXISTS public.vehicle_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL,
  cost_type public.vehicle_cost_type NOT NULL,
  amount numeric NOT NULL,
  cost_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  source_reference text,
  journal_entry_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_costs_vehicle ON public.vehicle_costs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_costs_type    ON public.vehicle_costs(cost_type);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_costs TO authenticated;
GRANT ALL ON public.vehicle_costs TO service_role;

ALTER TABLE public.vehicle_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read vehicle_costs"
  ON public.vehicle_costs FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth insert vehicle_costs"
  ON public.vehicle_costs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "auth update vehicle_costs"
  ON public.vehicle_costs FOR UPDATE TO authenticated
  USING (true) WITH CHECK (true);

CREATE POLICY "auth delete vehicle_costs"
  ON public.vehicle_costs FOR DELETE TO authenticated USING (true);

-- updated_at trigger
CREATE TRIGGER trg_vehicle_costs_updated_at
  BEFORE UPDATE ON public.vehicle_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- 3) Governance trigger
-- =========================================================
CREATE OR REPLACE FUNCTION public.vehicle_costs_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_inv_posted boolean;
  v_target uuid;
BEGIN
  v_target := COALESCE(NEW.vehicle_id, OLD.vehicle_id);

  -- Negative / zero guard
  IF TG_OP IN ('INSERT','UPDATE') AND COALESCE(NEW.amount, 0) <= 0 THEN
    RAISE EXCEPTION 'قيمة التكلفة يجب أن تكون أكبر من صفر';
  END IF;

  -- Fetch vehicle status
  SELECT status::text INTO v_status FROM public.vehicles WHERE id = v_target;

  -- Disallow delete after sale
  IF TG_OP = 'DELETE' AND v_status IN ('sold','delivered') THEN
    RAISE EXCEPTION 'لا يمكن حذف تكلفة لمركبة مباعة/مسلَّمة';
  END IF;

  -- Disallow modification (update/delete) after invoice is posted
  IF TG_OP IN ('UPDATE','DELETE') THEN
    SELECT EXISTS (
      SELECT 1
        FROM public.sales_order_lines sol
        JOIN public.invoices inv ON inv.sales_order_id = sol.order_id
       WHERE sol.vehicle_id = v_target
         AND inv.status IN ('posted','partially_paid','paid')
    ) INTO v_inv_posted;

    IF v_inv_posted THEN
      RAISE EXCEPTION 'لا يمكن تعديل/حذف تكلفة بعد ترحيل فاتورة المركبة';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_vehicle_costs_governance
  BEFORE INSERT OR UPDATE OR DELETE ON public.vehicle_costs
  FOR EACH ROW EXECUTE FUNCTION public.vehicle_costs_governance();

-- Audit logging trigger
CREATE OR REPLACE FUNCTION public.vehicle_costs_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (action, module, document_type, document_id, user_id, payload)
  VALUES (
    lower(TG_OP),
    'vehicle_costs',
    'vehicle_cost',
    COALESCE(NEW.id, OLD.id)::text,
    auth.uid(),
    jsonb_build_object(
      'old', CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_vehicle_costs_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_costs
  FOR EACH ROW EXECUTE FUNCTION public.vehicle_costs_audit();

-- =========================================================
-- 4) Landed cost engine
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_vehicle_landed_cost(p_vehicle_id uuid)
RETURNS TABLE (
  vehicle_id uuid,
  purchase_cost numeric,
  additional_costs numeric,
  landed_cost numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id,
    COALESCE(v.cost_price, 0)::numeric                                   AS purchase_cost,
    COALESCE((SELECT SUM(amount) FROM public.vehicle_costs vc WHERE vc.vehicle_id = v.id), 0)::numeric AS additional_costs,
    (COALESCE(v.cost_price, 0)
     + COALESCE((SELECT SUM(amount) FROM public.vehicle_costs vc WHERE vc.vehicle_id = v.id), 0))::numeric AS landed_cost
  FROM public.vehicles v
  WHERE v.id = p_vehicle_id;
$$;

-- =========================================================
-- 5) Profitability engine
-- =========================================================
CREATE OR REPLACE FUNCTION public.compute_vehicle_pnl(p_vehicle_id uuid)
RETURNS TABLE (
  vehicle_id uuid,
  purchase_cost numeric,
  additional_costs numeric,
  landed_cost numeric,
  sale_revenue numeric,
  discounts numeric,
  credit_notes numeric,
  gross_profit numeric,
  net_profit numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase numeric := 0;
  v_extra    numeric := 0;
  v_landed   numeric := 0;
  v_revenue  numeric := 0;
  v_disc     numeric := 0;
  v_cn       numeric := 0;
BEGIN
  SELECT lc.purchase_cost, lc.additional_costs, lc.landed_cost
    INTO v_purchase, v_extra, v_landed
    FROM public.compute_vehicle_landed_cost(p_vehicle_id) lc;

  -- Revenue & discounts from posted invoices (via sales_order_lines)
  SELECT
    COALESCE(SUM(sol.unit_price * sol.quantity), 0),
    COALESCE(SUM(sol.unit_price * sol.quantity * COALESCE(sol.discount_pct,0) / 100.0), 0)
    INTO v_revenue, v_disc
  FROM public.sales_order_lines sol
  JOIN public.invoices inv ON inv.sales_order_id = sol.order_id
  WHERE sol.vehicle_id = p_vehicle_id
    AND inv.status IN ('posted','partially_paid','paid');

  -- Credit notes against those invoices for this vehicle (line-level if present, else fall back to header proportion)
  SELECT COALESCE(SUM(cnl.line_total), 0)
    INTO v_cn
    FROM public.credit_note_lines cnl
    JOIN public.credit_notes cn ON cn.id = cnl.credit_note_id
   WHERE cnl.vehicle_id = p_vehicle_id
     AND cn.status = 'posted';

  RETURN QUERY SELECT
    p_vehicle_id,
    v_purchase,
    v_extra,
    v_landed,
    v_revenue,
    v_disc,
    v_cn,
    (v_revenue - v_disc - v_landed)::numeric           AS gross_profit,
    (v_revenue - v_disc - v_cn - v_landed)::numeric    AS net_profit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_vehicle_landed_cost(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.compute_vehicle_pnl(uuid) TO authenticated;
