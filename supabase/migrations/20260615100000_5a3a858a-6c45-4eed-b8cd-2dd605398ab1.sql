-- ============================================================
-- A9 Vehicle Integrity — FK: invoice_lines.vehicle_id → inventory_items.id
-- ============================================================
-- يوثّق القيد المطبّق يدوياً في DB أثناء A9 Phase 3.
-- يضمن إعادة البناء من الصفر (SaaS / staging / CI/CD / عميل جديد).
--
-- المركبة = inventory_items (item_type='vehicle'). كل بند فاتورة مركبة
-- يجب أن يرتبط بمركبة موجودة. ON DELETE/UPDATE RESTRICT:
--   - لا تُحذف مركبة مرتبطة بفاتورة (تُلغى عبر status، soft delete).
--   - المفاتيح الأساسية (UUID) لا تتغيّر؛ الفشل الظاهر أفضل من الانتشار الصامت.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoice_lines_vehicle'
  ) THEN
    ALTER TABLE invoice_lines
    ADD CONSTRAINT fk_invoice_lines_vehicle
    FOREIGN KEY (vehicle_id)
    REFERENCES inventory_items(id)
    ON DELETE RESTRICT
    ON UPDATE RESTRICT;
  END IF;
END $$;

-- التحقّق
SELECT conname, pg_get_constraintdef(oid) AS def
FROM pg_constraint WHERE conname = 'fk_invoice_lines_vehicle';
