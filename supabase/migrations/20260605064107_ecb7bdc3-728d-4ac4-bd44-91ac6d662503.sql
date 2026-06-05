CREATE OR REPLACE FUNCTION public.approve_inspection(p_inspection_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_insp RECORD; v_grn RECORD; v_line RECORD; v_grn_line RECORD; v_alloc_line RECORD;
  v_supplier_name text; v_po_no text;
  v_vehicle_id uuid; v_created int := 0; v_code text;
  v_meta jsonb; v_proc jsonb; v_notes text;
BEGIN
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
  SELECT name INTO v_supplier_name FROM public.suppliers WHERE id = v_grn.supplier_id;
  SELECT po_no INTO v_po_no FROM public.purchase_orders WHERE id = v_grn.po_id;

  FOR v_line IN
    SELECT * FROM public.inspection_lines
     WHERE inspection_id = p_inspection_id
       AND result = 'passed'
       AND vehicle_id IS NULL
  LOOP
    SELECT * INTO v_grn_line FROM public.goods_receipt_lines WHERE id = v_line.grn_line_id;
    IF v_grn_line.id IS NULL THEN CONTINUE; END IF;

    v_alloc_line := NULL;
    IF v_grn_line.allocation_line_id IS NOT NULL THEN
      SELECT * INTO v_alloc_line FROM public.allocation_lines WHERE id = v_grn_line.allocation_line_id;
    END IF;

    IF EXISTS (SELECT 1 FROM public.vehicles WHERE vin = v_grn_line.vin) THEN
      RAISE EXCEPTION 'VIN مكرر في المخزون: %', v_grn_line.vin;
    END IF;

    v_code := 'VH-' || upper(substr(v_grn_line.vin, greatest(1, length(v_grn_line.vin)-5)));

    v_proc := jsonb_strip_nulls(jsonb_build_object(
      'state', 'approved',
      'supplier', v_supplier_name,
      'po_reference', v_po_no,
      'branch_destination', v_grn.warehouse,
      'received_at', to_char(v_grn.received_at, 'YYYY-MM-DD'),
      'approved_at', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'cost_purchase', v_grn_line.unit_cost,
      'vin_verified', true,
      'engine_verified', (v_grn_line.engine_no IS NOT NULL AND v_grn_line.engine_no <> '')
    ));

    v_meta := jsonb_strip_nulls(jsonb_build_object(
      'engine', v_grn_line.engine_no,
      'trim', COALESCE(v_alloc_line.trim, NULL),
      'branch', v_grn.warehouse,
      'supplier', v_supplier_name,
      'purchase_source', v_po_no,
      'procurement', v_proc
    ));

    v_notes := CASE WHEN v_meta = '{}'::jsonb THEN NULL
                    ELSE '###VMETA###' || v_meta::text END;

    INSERT INTO public.vehicles (
      code, name, brand, model, year, color, vin,
      cost_price, status, notes,
      supplier_id, allocation_id, shipment_id, grn_id, inspection_id,
      acquired_at, created_by
    ) VALUES (
      v_code,
      COALESCE(v_alloc_line.manufacturer, v_grn_line.brand) || ' ' || v_grn_line.model
        || COALESCE(' '|| v_grn_line.year::text, ''),
      COALESCE(v_alloc_line.manufacturer, v_grn_line.brand),
      v_grn_line.model,
      COALESCE(v_grn_line.year, EXTRACT(year FROM CURRENT_DATE)::int),
      v_grn_line.color, v_grn_line.vin,
      COALESCE(v_grn_line.unit_cost, 0),
      'available'::vehicle_status,
      v_notes,
      v_grn.supplier_id, v_grn.allocation_id, v_grn.shipment_id, v_grn.id, v_insp.id,
      now(), auth.uid()
    ) RETURNING id INTO v_vehicle_id;

    UPDATE public.inspection_lines SET vehicle_id = v_vehicle_id WHERE id = v_line.id;
    IF v_grn_line.allocation_line_id IS NOT NULL THEN
      UPDATE public.allocation_lines
         SET vehicle_id = v_vehicle_id, status = 'stocked'
       WHERE id = v_grn_line.allocation_line_id;
    END IF;

    INSERT INTO public.receiving_events (event_type, grn_id, inspection_id, vehicle_id, user_id, payload)
    VALUES ('vehicle_created', v_grn.id, v_insp.id, v_vehicle_id, auth.uid(),
            jsonb_build_object('vin', v_grn_line.vin, 'cost', v_grn_line.unit_cost,
                               'engine', v_grn_line.engine_no, 'branch', v_grn.warehouse));

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
END $function$;

-- Backfill provenance for vehicles already created without VMETA notes.
UPDATE public.vehicles v
   SET notes = '###VMETA###' || jsonb_strip_nulls(jsonb_build_object(
         'engine', src.engine_no,
         'trim', src.trim,
         'branch', src.warehouse,
         'supplier', src.supplier_name,
         'purchase_source', src.po_no,
         'procurement', jsonb_strip_nulls(jsonb_build_object(
           'state', 'approved',
           'supplier', src.supplier_name,
           'po_reference', src.po_no,
           'branch_destination', src.warehouse,
           'received_at', to_char(src.received_at, 'YYYY-MM-DD'),
           'cost_purchase', src.unit_cost,
           'vin_verified', true,
           'engine_verified', (src.engine_no IS NOT NULL AND src.engine_no <> '')
         ))
       ))::text
  FROM (
    SELECT g.id AS grn_id, g.warehouse, g.received_at, g.supplier_id, g.po_id,
           grl.vin, grl.engine_no, grl.unit_cost,
           al.trim,
           s.name AS supplier_name,
           po.po_no
      FROM public.goods_receipts g
      JOIN public.goods_receipt_lines grl ON grl.grn_id = g.id
      LEFT JOIN public.allocation_lines al ON al.id = grl.allocation_line_id
      LEFT JOIN public.suppliers s ON s.id = g.supplier_id
      LEFT JOIN public.purchase_orders po ON po.id = g.po_id
  ) AS src
 WHERE v.grn_id = src.grn_id
   AND v.vin = src.vin
   AND (v.notes IS NULL OR v.notes = '');