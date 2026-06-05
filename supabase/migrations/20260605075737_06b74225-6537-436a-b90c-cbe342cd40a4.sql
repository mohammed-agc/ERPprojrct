
CREATE OR REPLACE FUNCTION public.validate_purchase_invoice_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE ok boolean := false;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  ok := (OLD.status='draft'          AND NEW.status IN ('posted','cancelled'))
     OR (OLD.status='issued'         AND NEW.status IN ('posted','cancelled'))
     OR (OLD.status='posted'         AND NEW.status IN ('partially_paid','paid','cancelled'))
     OR (OLD.status='partially_paid' AND NEW.status IN ('paid','cancelled'));
  IF NOT ok THEN
    RAISE EXCEPTION 'انتقال غير مسموح للحالة (فاتورة شراء): % -> %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END $function$;
