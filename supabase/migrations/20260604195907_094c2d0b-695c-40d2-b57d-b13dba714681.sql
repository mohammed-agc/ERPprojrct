
-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.grn_status AS ENUM ('draft','received','inspected','closed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.grn_line_condition AS ENUM ('ok','damaged','missing','wrong_item');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inspection_status AS ENUM ('pending','in_progress','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.inspection_line_result AS ENUM ('pending','passed','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ SEQUENCES ============
CREATE SEQUENCE IF NOT EXISTS public.seq_grn_no START 1;
CREATE SEQUENCE IF NOT EXISTS public.seq_insp_no START 1;

-- ============ goods_receipts ============
CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_no text NOT NULL UNIQUE,
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE RESTRICT,
  allocation_id uuid NOT NULL REFERENCES public.allocations(id) ON DELETE RESTRICT,
  po_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  received_at date NOT NULL DEFAULT CURRENT_DATE,
  warehouse text,
  receiver_id uuid,
  status public.grn_status NOT NULL DEFAULT 'received',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipts TO authenticated;
GRANT ALL ON public.goods_receipts TO service_role;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read grn" ON public.goods_receipts FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert grn" ON public.goods_receipts FOR INSERT TO authenticated
WITH CHECK (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
);
CREATE POLICY "dept update grn" ON public.goods_receipts FOR UPDATE TO authenticated
USING (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
)
WITH CHECK (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
);
CREATE POLICY "admin delete grn" ON public.goods_receipts FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- ============ goods_receipt_lines ============
CREATE TABLE IF NOT EXISTS public.goods_receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  allocation_line_id uuid REFERENCES public.allocation_lines(id) ON DELETE SET NULL,
  line_no int NOT NULL,
  vin text NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year int,
  color text,
  engine_no text,
  unit_cost numeric NOT NULL DEFAULT 0,
  condition public.grn_line_condition NOT NULL DEFAULT 'ok',
  notes text
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_receipt_lines TO authenticated;
GRANT ALL ON public.goods_receipt_lines TO service_role;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read grn_lines" ON public.goods_receipt_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage grn_lines" ON public.goods_receipt_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = grn_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.goods_receipts g WHERE g.id = grn_id));

-- ============ inspections ============
CREATE TABLE IF NOT EXISTS public.inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insp_no text NOT NULL UNIQUE,
  grn_id uuid NOT NULL REFERENCES public.goods_receipts(id) ON DELETE RESTRICT,
  inspector_id uuid,
  status public.inspection_status NOT NULL DEFAULT 'pending',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  approved_by uuid,
  approved_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read inspections" ON public.inspections FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept insert inspections" ON public.inspections FOR INSERT TO authenticated
WITH CHECK (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
);
CREATE POLICY "dept update inspections" ON public.inspections FOR UPDATE TO authenticated
USING (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
)
WITH CHECK (
  public.is_manager_or_admin(auth.uid())
  OR public.user_department(auth.uid()) IN (
    SELECT id FROM public.departments WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
  )
);
CREATE POLICY "admin delete inspections" ON public.inspections FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'));

-- ============ inspection_lines ============
CREATE TABLE IF NOT EXISTS public.inspection_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  grn_line_id uuid NOT NULL REFERENCES public.goods_receipt_lines(id) ON DELETE RESTRICT,
  line_no int NOT NULL,
  vin text NOT NULL,
  result public.inspection_line_result NOT NULL DEFAULT 'pending',
  condition text,
  remarks text,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inspection_lines TO authenticated;
GRANT ALL ON public.inspection_lines TO service_role;
ALTER TABLE public.inspection_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read inspection_lines" ON public.inspection_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth manage inspection_lines" ON public.inspection_lines FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_id))
WITH CHECK (EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_id));

-- ============ receiving_events (audit) ============
CREATE TABLE IF NOT EXISTS public.receiving_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  grn_id uuid REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  inspection_id uuid REFERENCES public.inspections(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  user_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.receiving_events TO authenticated;
GRANT ALL ON public.receiving_events TO service_role;
ALTER TABLE public.receiving_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read receiving_events" ON public.receiving_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert receiving_events" ON public.receiving_events FOR INSERT TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ============ VEHICLE PROVENANCE COLUMNS ============
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS supplier_id    uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS allocation_id  uuid REFERENCES public.allocations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS shipment_id    uuid REFERENCES public.shipments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS grn_id         uuid REFERENCES public.goods_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS inspection_id  uuid REFERENCES public.inspections(id) ON DELETE SET NULL;

-- ============ updated_at TRIGGERS ============
DROP TRIGGER IF EXISTS trg_grn_updated_at ON public.goods_receipts;
CREATE TRIGGER trg_grn_updated_at BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_insp_updated_at ON public.inspections;
CREATE TRIGGER trg_insp_updated_at BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ NUMBER ASSIGNMENT TRIGGERS ============
CREATE OR REPLACE FUNCTION public.assign_grn_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.grn_no IS NULL OR NEW.grn_no = '' THEN
    NEW.grn_no := 'GRN-' || lpad(nextval('public.seq_grn_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.assign_insp_no()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.insp_no IS NULL OR NEW.insp_no = '' THEN
    NEW.insp_no := 'INS-' || lpad(nextval('public.seq_insp_no')::text, 6, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_grn_no ON public.goods_receipts;
CREATE TRIGGER trg_assign_grn_no BEFORE INSERT ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.assign_grn_no();

DROP TRIGGER IF EXISTS trg_assign_insp_no ON public.inspections;
CREATE TRIGGER trg_assign_insp_no BEFORE INSERT ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.assign_insp_no();

-- ============ STATUS TRANSITION VALIDATORS ============
CREATE OR REPLACE FUNCTION public.validate_grn_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'     AND NEW.status IN ('received','cancelled'))
     OR (OLD.status='received'  AND NEW.status IN ('inspected','cancelled'))
     OR (OLD.status='inspected' AND NEW.status IN ('closed','cancelled'));
  IF NOT ok THEN RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grn_status ON public.goods_receipts;
CREATE TRIGGER trg_grn_status BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.validate_grn_status_transition();

CREATE OR REPLACE FUNCTION public.validate_inspection_status_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='pending'     AND NEW.status IN ('in_progress','cancelled'))
     OR (OLD.status='in_progress' AND NEW.status IN ('approved','rejected','cancelled'))
     OR (OLD.status='rejected'    AND NEW.status IN ('in_progress','cancelled'));
  IF NOT ok THEN RAISE EXCEPTION 'انتقال غير مسموح للحالة: % -> %', OLD.status, NEW.status; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_insp_status ON public.inspections;
CREATE TRIGGER trg_insp_status BEFORE UPDATE ON public.inspections
  FOR EACH ROW EXECUTE FUNCTION public.validate_inspection_status_transition();

-- ============ CHAIN INTEGRITY VALIDATOR ============
-- GRN must reference a shipment whose allocation matches & whose PO matches.
CREATE OR REPLACE FUNCTION public.validate_grn_chain()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_alloc uuid; v_po uuid;
BEGIN
  SELECT allocation_id, po_id INTO v_alloc, v_po FROM public.shipments WHERE id = NEW.shipment_id;
  IF v_alloc IS NULL THEN
    RAISE EXCEPTION 'الشحنة المرتبطة بمذكرة الاستلام يجب أن تكون مرتبطة بتخصيص';
  END IF;
  IF NEW.allocation_id IS DISTINCT FROM v_alloc THEN
    RAISE EXCEPTION 'تخصيص مذكرة الاستلام لا يطابق تخصيص الشحنة';
  END IF;
  IF NEW.po_id IS DISTINCT FROM v_po THEN
    RAISE EXCEPTION 'أمر شراء مذكرة الاستلام لا يطابق أمر شراء الشحنة';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_grn_chain ON public.goods_receipts;
CREATE TRIGGER trg_grn_chain BEFORE INSERT OR UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.validate_grn_chain();

-- ============ APPROVE INSPECTION (creates vehicles) ============
CREATE OR REPLACE FUNCTION public.approve_inspection(p_inspection_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_insp RECORD; v_grn RECORD; v_line RECORD; v_grn_line RECORD;
  v_vehicle_id uuid; v_created int := 0; v_code text;
BEGIN
  -- Authorization
  IF NOT (public.is_manager_or_admin(auth.uid())
          OR public.user_department(auth.uid()) IN (
            SELECT id FROM public.departments
            WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
          )) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_insp FROM public.inspections WHERE id = p_inspection_id FOR UPDATE;
  IF v_insp.id IS NULL THEN RAISE EXCEPTION 'سجل الفحص غير موجود'; END IF;
  IF v_insp.status = 'approved' THEN RETURN 0; END IF;
  IF v_insp.status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION 'لا يمكن اعتماد فحص في حالة %', v_insp.status;
  END IF;

  SELECT * INTO v_grn FROM public.goods_receipts WHERE id = v_insp.grn_id;

  -- Create vehicles for every passed line
  FOR v_line IN
    SELECT * FROM public.inspection_lines
     WHERE inspection_id = p_inspection_id
       AND result = 'passed'
       AND vehicle_id IS NULL
  LOOP
    SELECT * INTO v_grn_line FROM public.goods_receipt_lines WHERE id = v_line.grn_line_id;
    IF v_grn_line.id IS NULL THEN CONTINUE; END IF;

    -- enforce VIN uniqueness
    IF EXISTS (SELECT 1 FROM public.vehicles WHERE vin = v_grn_line.vin) THEN
      RAISE EXCEPTION 'VIN مكرر في المخزون: %', v_grn_line.vin;
    END IF;

    v_code := 'VH-' || upper(substr(v_grn_line.vin, greatest(1, length(v_grn_line.vin)-5)));

    INSERT INTO public.vehicles (
      code, name, brand, model, year, color, vin,
      cost_price, status,
      supplier_id, allocation_id, shipment_id, grn_id, inspection_id,
      acquired_at, created_by
    ) VALUES (
      v_code,
      v_grn_line.brand || ' ' || v_grn_line.model || COALESCE(' '|| v_grn_line.year::text, ''),
      v_grn_line.brand, v_grn_line.model,
      COALESCE(v_grn_line.year, EXTRACT(year FROM CURRENT_DATE)::int),
      v_grn_line.color, v_grn_line.vin,
      COALESCE(v_grn_line.unit_cost, 0),
      'available'::vehicle_status,
      v_grn.supplier_id, v_grn.allocation_id, v_grn.shipment_id, v_grn.id, v_insp.id,
      now(), auth.uid()
    ) RETURNING id INTO v_vehicle_id;

    UPDATE public.inspection_lines SET vehicle_id = v_vehicle_id WHERE id = v_line.id;
    -- link allocation_line if any
    IF v_grn_line.allocation_line_id IS NOT NULL THEN
      UPDATE public.allocation_lines
         SET vehicle_id = v_vehicle_id, status = 'stocked'
       WHERE id = v_grn_line.allocation_line_id;
    END IF;

    INSERT INTO public.receiving_events (event_type, grn_id, inspection_id, vehicle_id, user_id, payload)
    VALUES ('vehicle_created', v_grn.id, v_insp.id, v_vehicle_id, auth.uid(),
            jsonb_build_object('vin', v_grn_line.vin, 'cost', v_grn_line.unit_cost));

    v_created := v_created + 1;
  END LOOP;

  UPDATE public.inspections
     SET status = 'approved'::inspection_status,
         approved_at = now(), approved_by = auth.uid(),
         completed_at = COALESCE(completed_at, now())
   WHERE id = p_inspection_id;

  UPDATE public.goods_receipts SET status = 'inspected'
   WHERE id = v_insp.grn_id AND status = 'received';

  INSERT INTO public.receiving_events (event_type, grn_id, inspection_id, user_id, payload)
  VALUES ('inspection_approved', v_insp.grn_id, p_inspection_id, auth.uid(),
          jsonb_build_object('vehicles_created', v_created));

  RETURN v_created;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_inspection(uuid) TO authenticated;

-- ============ REJECT INSPECTION ============
CREATE OR REPLACE FUNCTION public.reject_inspection(p_inspection_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_manager_or_admin(auth.uid())
          OR public.user_department(auth.uid()) IN (
            SELECT id FROM public.departments
            WHERE code = ANY (ARRAY['accounting'::department_code,'vehicles'::department_code])
          )) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.inspections
     SET status = 'rejected'::inspection_status,
         completed_at = COALESCE(completed_at, now()),
         notes = COALESCE(notes,'') || CASE WHEN p_reason IS NOT NULL THEN E'\n[رفض] '||p_reason ELSE '' END
   WHERE id = p_inspection_id;
  INSERT INTO public.receiving_events (event_type, inspection_id, user_id, payload)
  VALUES ('inspection_rejected', p_inspection_id, auth.uid(), jsonb_build_object('reason', p_reason));
END $$;

GRANT EXECUTE ON FUNCTION public.reject_inspection(uuid, text) TO authenticated;

-- ============ GOVERNANCE VIEWS ============
CREATE OR REPLACE VIEW public.v_gov_grn_without_inspection AS
SELECT g.id AS grn_id, g.grn_no, g.received_at, g.status, g.po_id, g.allocation_id, g.shipment_id
  FROM public.goods_receipts g
 WHERE g.status IN ('received')
   AND NOT EXISTS (SELECT 1 FROM public.inspections i WHERE i.grn_id = g.id);
ALTER VIEW public.v_gov_grn_without_inspection SET (security_invoker = true);
GRANT SELECT ON public.v_gov_grn_without_inspection TO authenticated;

CREATE OR REPLACE VIEW public.v_gov_inspection_without_vehicle AS
SELECT il.inspection_id, i.insp_no, il.vin, il.id AS inspection_line_id
  FROM public.inspection_lines il
  JOIN public.inspections i ON i.id = il.inspection_id
 WHERE i.status = 'approved' AND il.result = 'passed' AND il.vehicle_id IS NULL;
ALTER VIEW public.v_gov_inspection_without_vehicle SET (security_invoker = true);
GRANT SELECT ON public.v_gov_inspection_without_vehicle TO authenticated;

CREATE OR REPLACE VIEW public.v_gov_vehicle_missing_procurement_chain AS
SELECT v.id, v.code, v.vin, v.supplier_id, v.allocation_id, v.shipment_id, v.grn_id, v.inspection_id
  FROM public.vehicles v
 WHERE v.grn_id IS NULL OR v.inspection_id IS NULL
    OR v.allocation_id IS NULL OR v.shipment_id IS NULL OR v.supplier_id IS NULL;
ALTER VIEW public.v_gov_vehicle_missing_procurement_chain SET (security_invoker = true);
GRANT SELECT ON public.v_gov_vehicle_missing_procurement_chain TO authenticated;
