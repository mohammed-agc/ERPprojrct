
-- Phase 13b: Allocations + Confirmations + Shipments persistence

CREATE TYPE public.allocation_status AS ENUM ('draft','confirmed','invoiced','in_transit','received','closed','cancelled');
CREATE TYPE public.allocation_line_status AS ENUM ('pending','confirmed','in_transit','received','inspected','stocked','cancelled');
CREATE TYPE public.shipment_status AS ENUM ('preparing','shipped','in_transit','at_customs','cleared','arrived','cancelled');
CREATE TYPE public.customs_clearance_status AS ENUM ('not_started','in_progress','cleared');

CREATE SEQUENCE public.seq_alloc_no START 1;
CREATE SEQUENCE public.seq_alloc_conf_no START 1;
CREATE SEQUENCE public.seq_shipment_no START 1;

-- ===== allocations =====
CREATE TABLE public.allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alloc_no text NOT NULL UNIQUE,
  po_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  status public.allocation_status NOT NULL DEFAULT 'draft',
  notes text,
  purchase_invoice_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocations TO authenticated;
GRANT ALL ON public.allocations TO service_role;
ALTER TABLE public.allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read allocations" ON public.allocations FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert allocations" ON public.allocations FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "dept update allocations" ON public.allocations FOR UPDATE TO authenticated
  USING (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])))
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "admin delete allocations" ON public.allocations FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- ===== allocation_lines =====
CREATE TABLE public.allocation_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  allocation_id uuid NOT NULL REFERENCES public.allocations(id) ON DELETE CASCADE,
  po_line_id uuid,
  line_no int NOT NULL,
  brand text NOT NULL,
  manufacturer text,
  model text NOT NULL,
  trim text,
  year int,
  color text,
  vin text NOT NULL,
  engine_no text NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  vat_pct numeric NOT NULL DEFAULT 15,
  status public.allocation_line_status NOT NULL DEFAULT 'pending',
  vehicle_id uuid,
  UNIQUE(allocation_id, vin)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_lines TO authenticated;
GRANT ALL ON public.allocation_lines TO service_role;
ALTER TABLE public.allocation_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alloc_lines" ON public.allocation_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage alloc_lines" ON public.allocation_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.allocations a WHERE a.id = allocation_lines.allocation_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.allocations a WHERE a.id = allocation_lines.allocation_id));

-- ===== allocation_confirmations =====
CREATE TABLE public.allocation_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conf_no text NOT NULL UNIQUE,
  allocation_id uuid NOT NULL REFERENCES public.allocations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL,
  po_id uuid NOT NULL,
  allocation_date date NOT NULL DEFAULT CURRENT_DATE,
  vehicle_count int NOT NULL DEFAULT 0,
  vin_list jsonb NOT NULL DEFAULT '[]'::jsonb,
  purchase_invoice_id uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allocation_confirmations TO authenticated;
GRANT ALL ON public.allocation_confirmations TO service_role;
ALTER TABLE public.allocation_confirmations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read alloc_conf" ON public.allocation_confirmations FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert alloc_conf" ON public.allocation_confirmations FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "dept update alloc_conf" ON public.allocation_confirmations FOR UPDATE TO authenticated
  USING (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])))
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "admin delete alloc_conf" ON public.allocation_confirmations FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- ===== shipments =====
CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_no text NOT NULL UNIQUE,
  po_id uuid NOT NULL,
  allocation_id uuid,
  carrier text NOT NULL DEFAULT '',
  reference text,
  origin text,
  destination text,
  eta date,
  status public.shipment_status NOT NULL DEFAULT 'preparing',
  customs_status public.customs_clearance_status NOT NULL DEFAULT 'not_started',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shipments TO authenticated;
GRANT ALL ON public.shipments TO service_role;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read shipments" ON public.shipments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert shipments" ON public.shipments FOR INSERT TO authenticated
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "dept update shipments" ON public.shipments FOR UPDATE TO authenticated
  USING (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])))
  WITH CHECK (is_manager_or_admin(auth.uid()) OR user_department(auth.uid()) IN
    (SELECT id FROM departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])));
CREATE POLICY "admin delete shipments" ON public.shipments FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role));

-- ===== auto-numbering triggers =====
CREATE OR REPLACE FUNCTION public.assign_alloc_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.alloc_no IS NULL OR NEW.alloc_no = '' THEN
    NEW.alloc_no := 'ALC-' || lpad(nextval('public.seq_alloc_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_assign_alloc_no BEFORE INSERT ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.assign_alloc_no();

CREATE OR REPLACE FUNCTION public.assign_alloc_conf_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.conf_no IS NULL OR NEW.conf_no = '' THEN
    NEW.conf_no := 'ALC-CN-' || lpad(nextval('public.seq_alloc_conf_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_assign_alloc_conf_no BEFORE INSERT ON public.allocation_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.assign_alloc_conf_no();

CREATE OR REPLACE FUNCTION public.assign_shipment_no()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.shipment_no IS NULL OR NEW.shipment_no = '' THEN
    NEW.shipment_no := 'SHP-' || lpad(nextval('public.seq_shipment_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_assign_shipment_no BEFORE INSERT ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.assign_shipment_no();

-- ===== updated_at =====
CREATE TRIGGER trg_alloc_updated_at BEFORE UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_shipment_updated_at BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== status transition validators =====
CREATE OR REPLACE FUNCTION public.validate_allocation_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'      AND NEW.status IN ('confirmed','cancelled'))
     OR (OLD.status='confirmed'  AND NEW.status IN ('invoiced','in_transit','cancelled'))
     OR (OLD.status='invoiced'   AND NEW.status IN ('in_transit','cancelled'))
     OR (OLD.status='in_transit' AND NEW.status IN ('received','cancelled'))
     OR (OLD.status='received'   AND NEW.status IN ('closed','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_allocation_status BEFORE UPDATE ON public.allocations
  FOR EACH ROW EXECUTE FUNCTION public.validate_allocation_status_transition();

CREATE OR REPLACE FUNCTION public.validate_shipment_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='preparing'  AND NEW.status IN ('shipped','cancelled'))
     OR (OLD.status='shipped'    AND NEW.status IN ('in_transit','cancelled'))
     OR (OLD.status='in_transit' AND NEW.status IN ('at_customs','arrived','cancelled'))
     OR (OLD.status='at_customs' AND NEW.status IN ('cleared','cancelled'))
     OR (OLD.status='cleared'    AND NEW.status IN ('arrived','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_shipment_status BEFORE UPDATE ON public.shipments
  FOR EACH ROW EXECUTE FUNCTION public.validate_shipment_status_transition();

CREATE INDEX idx_allocation_lines_alloc ON public.allocation_lines(allocation_id);
CREATE INDEX idx_alloc_conf_alloc ON public.allocation_confirmations(allocation_id);
CREATE INDEX idx_shipments_po ON public.shipments(po_id);
CREATE INDEX idx_shipments_alloc ON public.shipments(allocation_id);
