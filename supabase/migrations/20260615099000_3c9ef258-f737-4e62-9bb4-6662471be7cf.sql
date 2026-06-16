-- ============================================================
-- A9 Vehicle Integrity — HISTORICAL DATA REPAIR MIGRATION
-- Backfill invoice_lines.vehicle_id from VIN match
-- ============================================================
-- يوثّق الملء التاريخي المطبّق يدوياً أثناء A9 Phase 2.
-- ⚠️ Historical Data Repair: يربط بنود الفواتير القديمة بالمركبة عبر تطابق VIN.
-- آمن: UPDATE فقط (لا حذف)، يلمس البنود ذات vehicle_id=NULL فقط.
-- idempotent: تشغيله مكرّراً لا يضرّ (الشرط il.vehicle_id IS NULL).
--
-- ملاحظة: يجب أن يسبق هذا الـ migration إضافة FK (Migration FK)،
-- أو يُشغّل قبلها، لضمان عدم فشل FK على بيانات قديمة غير مربوطة.
-- الترتيب الزمني هنا (101000 بعد 100000) يفترض أن البيانات نظيفة (0 يتامى).
-- على بيئة جديدة بلا بيانات قديمة، هذا الـ migration لا يؤثّر (لا صفوف).
-- ============================================================

UPDATE invoice_lines il
SET vehicle_id = ii.id
FROM inventory_items ii
WHERE ii.vin = il.vin
  AND ii.item_type = 'vehicle'
  AND il.vehicle_id IS NULL;

-- التحقّق (يجب أن تكون كل بنود المركبات مربوطة)
SELECT
  COUNT(*) AS total_lines,
  COUNT(vehicle_id) AS linked,
  COUNT(*) FILTER (WHERE vehicle_id IS NULL) AS unlinked
FROM invoice_lines;
