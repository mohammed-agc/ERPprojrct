-- ============================================================
-- Vehicle Financial Foundation — F4: Sales Completion Engine
-- دالة منفصلة complete_vehicle_sale + trigger مستقلّ (فصل FI عن MM/SD)
-- ============================================================
-- عند إصدار الفاتورة (status='issued') وبعد إنشاء قيد COGS:
--   لكل invoice_line بـ vehicle_id:
--     inventory_items.status = 'sold'
--     inventory_items.qty_on_hand = 0
--     inventory_items.sold_at = invoice_date
--   + سجل governance_log (VEHICLE_SOLD)
--
-- لا يعدّل: ownership / status_overlay / reservation (داخل notes JSON — TECH_DEBT_META_JSON).
-- التسليم يبقى منفصلاً (عملية الواجهة الحالية).
-- منفصل عن create_invoice_journal_entry (محاسبة) — هذا تشغيل (MM/SD).
-- شروط: status='issued' + cogs_journal_entry_id موجود + vehicle_id موجود. idempotent.
-- المرجع: F4_SALES_COMPLETION_AUDIT.md.
-- ============================================================

-- (1) إضافة عمود sold_at (الكود يقرأه أصلاً في VehiclePLCard)
ALTER TABLE public.inventory_items ADD COLUMN IF NOT EXISTS sold_at DATE;

-- (2) دالة إكمال البيع (تشغيلية، منفصلة عن المحاسبة)
CREATE OR REPLACE FUNCTION public.complete_vehicle_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_line RECORD;
  v_prev_status TEXT;
BEGIN
  -- شرط 1: فقط الفواتير المُصدرة
  IF NEW.status <> 'issued' THEN
    RETURN NEW;
  END IF;

  -- شرط 2: قيد COGS مُنشأ (يضمن أن المحاسبة اكتملت قبل التشغيل)
  IF NEW.cogs_journal_entry_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- لكل مركبة في الفاتورة
  FOR v_line IN
    SELECT il.vehicle_id, ii.status AS current_status, ii.sku
    FROM public.invoice_lines il
    JOIN public.inventory_items ii ON ii.id = il.vehicle_id
    WHERE il.invoice_id = NEW.id AND il.vehicle_id IS NOT NULL
  LOOP
    -- idempotency: تجاهل المباعة بالفعل
    IF v_line.current_status = 'sold' THEN
      CONTINUE;
    END IF;

    v_prev_status := v_line.current_status;

    -- التحديث التشغيلي (حقول مباشرة فقط — لا JSON/meta)
    UPDATE public.inventory_items
    SET status = 'sold',
        qty_on_hand = 0,
        sold_at = NEW.invoice_date
    WHERE id = v_line.vehicle_id;

    -- سجل الحوكمة
    INSERT INTO public.governance_log (event_type, module, document_type, document_id, document_code,
      subject_id, subject_name, decision, reason, details)
    VALUES ('VEHICLE_SOLD', 'inventory', 'sales_invoice', NEW.id, NEW.invoice_no,
      v_line.vehicle_id, v_line.sku, 'sold', 'إصدار فاتورة + قيد COGS',
      jsonb_build_object('event','VEHICLE_SOLD','invoice_id',NEW.id,'vehicle_id',v_line.vehicle_id,
        'previous_status',v_prev_status,'new_status','sold')::text);
  END LOOP;

  RETURN NEW;
END;
$function$;

-- (3) trigger مستقلّ (AFTER UPDATE — بعد أن يكون cogs_journal_entry_id مملوءاً)
DROP TRIGGER IF EXISTS trg_zz_complete_vehicle_sale ON public.invoices;
CREATE TRIGGER trg_zz_complete_vehicle_sale
  AFTER INSERT OR UPDATE ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_vehicle_sale();

-- التحقّق
SELECT 'sold_at_exists' AS check,
  (SELECT COUNT(*)::text FROM information_schema.columns WHERE table_name='inventory_items' AND column_name='sold_at') AS result
UNION ALL
SELECT 'function_exists', (SELECT COUNT(*)::text FROM pg_proc WHERE proname='complete_vehicle_sale')
UNION ALL
SELECT 'trigger_exists', (SELECT COUNT(*)::text FROM information_schema.triggers WHERE trigger_name='trg_zz_complete_vehicle_sale');
