CREATE OR REPLACE FUNCTION public.validate_grn_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_alloc uuid; v_po uuid; v_alloc_po uuid;
BEGIN
  -- Direct-from-allocation path (Phase 16A): no shipment required.
  IF NEW.source = 'allocation' OR NEW.shipment_id IS NULL THEN
    IF NEW.allocation_id IS NULL THEN
      RAISE EXCEPTION 'مذكرة الاستلام يجب أن ترتبط بتخصيص';
    END IF;
    SELECT po_id INTO v_alloc_po FROM public.allocations WHERE id = NEW.allocation_id;
    IF v_alloc_po IS NULL THEN
      RAISE EXCEPTION 'التخصيص المرتبط بمذكرة الاستلام غير موجود';
    END IF;
    IF NEW.po_id IS DISTINCT FROM v_alloc_po THEN
      RAISE EXCEPTION 'أمر شراء مذكرة الاستلام لا يطابق أمر شراء التخصيص';
    END IF;
    RETURN NEW;
  END IF;

  -- Shipment path: enforce shipment ↔ allocation ↔ PO consistency.
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
END $function$;