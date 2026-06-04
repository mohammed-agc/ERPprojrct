
-- Enums
DO $$ BEGIN
  CREATE TYPE public.pr_status AS ENUM ('draft','submitted','approved','rejected','converted','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.po_status AS ENUM ('draft','sent','acknowledged','partially_received','received','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Sequences for auto-numbering
CREATE SEQUENCE IF NOT EXISTS public.seq_pr_no START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_po_no START 1;

-- ========== purchase_requests ==========
CREATE TABLE IF NOT EXISTS public.purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_no text NOT NULL UNIQUE,
  request_date date NOT NULL DEFAULT CURRENT_DATE,
  requested_by uuid,
  department_code public.department_code NOT NULL DEFAULT 'vehicles',
  status public.pr_status NOT NULL DEFAULT 'draft',
  notes text,
  total_estimated numeric NOT NULL DEFAULT 0,
  approved_by uuid,
  approved_at timestamptz,
  rejected_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_requests TO authenticated;
GRANT ALL ON public.purchase_requests TO service_role;

ALTER TABLE public.purchase_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read purchase_requests" ON public.purchase_requests
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dept insert purchase_requests" ON public.purchase_requests
  FOR INSERT TO authenticated WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  );

CREATE POLICY "dept update purchase_requests" ON public.purchase_requests
  FOR UPDATE TO authenticated USING (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  ) WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  );

CREATE POLICY "admin delete purchase_requests" ON public.purchase_requests
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ========== purchase_request_lines ==========
CREATE TABLE IF NOT EXISTS public.purchase_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id uuid NOT NULL REFERENCES public.purchase_requests(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  color text,
  quantity numeric NOT NULL DEFAULT 1,
  estimated_unit_cost numeric NOT NULL DEFAULT 0,
  notes text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_request_lines TO authenticated;
GRANT ALL ON public.purchase_request_lines TO service_role;

ALTER TABLE public.purchase_request_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read pr_lines" ON public.purchase_request_lines
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth manage pr_lines" ON public.purchase_request_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_requests p WHERE p.id = purchase_request_lines.pr_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_requests p WHERE p.id = purchase_request_lines.pr_id));

-- ========== purchase_orders ==========
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_no text NOT NULL UNIQUE,
  pr_id uuid REFERENCES public.purchase_requests(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL,
  order_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery date,
  status public.po_status NOT NULL DEFAULT 'draft',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read purchase_orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dept insert purchase_orders" ON public.purchase_orders
  FOR INSERT TO authenticated WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  );

CREATE POLICY "dept update purchase_orders" ON public.purchase_orders
  FOR UPDATE TO authenticated USING (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  ) WITH CHECK (
    public.is_manager_or_admin(auth.uid())
    OR public.user_department(auth.uid()) IN (
      SELECT id FROM public.departments WHERE code IN ('accounting','vehicles')
    )
  );

CREATE POLICY "admin delete purchase_orders" ON public.purchase_orders
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- ========== purchase_order_lines ==========
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  pr_line_id uuid REFERENCES public.purchase_request_lines(id) ON DELETE SET NULL,
  line_no integer NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  color text,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  vat_pct numeric NOT NULL DEFAULT 15,
  line_total numeric NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_lines TO authenticated;
GRANT ALL ON public.purchase_order_lines TO service_role;

ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read po_lines" ON public.purchase_order_lines
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth manage po_lines" ON public.purchase_order_lines
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_lines.po_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.purchase_orders p WHERE p.id = purchase_order_lines.po_id));

-- ========== updated_at triggers ==========
CREATE TRIGGER trg_purchase_requests_updated_at
  BEFORE UPDATE ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ========== auto-number triggers ==========
CREATE OR REPLACE FUNCTION public.assign_pr_no()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
BEGIN
  IF NEW.pr_no IS NULL OR NEW.pr_no = '' THEN
    NEW.pr_no := 'PR-' || lpad(nextval('public.seq_pr_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_po_no()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
BEGIN
  IF NEW.po_no IS NULL OR NEW.po_no = '' THEN
    NEW.po_no := 'PO-' || lpad(nextval('public.seq_po_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_assign_pr_no BEFORE INSERT ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.assign_pr_no();

CREATE TRIGGER trg_assign_po_no BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.assign_po_no();

-- ========== Status transition guards ==========
CREATE OR REPLACE FUNCTION public.validate_pr_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'     AND NEW.status IN ('submitted','cancelled'))
     OR (OLD.status='submitted' AND NEW.status IN ('approved','rejected','cancelled'))
     OR (OLD.status='approved'  AND NEW.status IN ('converted','cancelled'))
     OR (OLD.status='rejected'  AND NEW.status IN ('draft','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.validate_po_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path='public' AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'              AND NEW.status IN ('sent','cancelled'))
     OR (OLD.status='sent'               AND NEW.status IN ('acknowledged','cancelled'))
     OR (OLD.status='acknowledged'       AND NEW.status IN ('partially_received','received','cancelled'))
     OR (OLD.status='partially_received' AND NEW.status IN ('received','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_pr_status_transition BEFORE UPDATE OF status ON public.purchase_requests
  FOR EACH ROW EXECUTE FUNCTION public.validate_pr_status_transition();

CREATE TRIGGER trg_po_status_transition BEFORE UPDATE OF status ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.validate_po_status_transition();

-- ========== Indexes ==========
CREATE INDEX IF NOT EXISTS idx_pr_lines_pr ON public.purchase_request_lines(pr_id);
CREATE INDEX IF NOT EXISTS idx_po_lines_po ON public.purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON public.purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_po_pr ON public.purchase_orders(pr_id);
CREATE INDEX IF NOT EXISTS idx_pr_status ON public.purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_po_status ON public.purchase_orders(status);
