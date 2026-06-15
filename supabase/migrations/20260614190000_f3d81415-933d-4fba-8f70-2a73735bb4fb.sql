-- Migration: add branch_id FK + type to warehouses
-- Context:
--   1) warehouses.branch is free-text (الدمام/الرياض...) with no real link.
--      Add branch_id FK (nullable) so warehouses link to the branches table.
--   2) warehouse type (vehicles/parts/mixed) is useful for a car dealership
--      but missing from the table. Add it with a CHECK constraint.
--   Legacy text `branch` column kept for now (deprecated, removed at cleanup).

-- ── 1) branch_id (FK، nullable) ──
ALTER TABLE warehouses
ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS warehouses_branch_id_idx ON warehouses(branch_id);

-- ── 2) type (تصنيف المستودع) ──
ALTER TABLE warehouses
ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'mixed';

-- قيد القيم المسموحة
ALTER TABLE warehouses
DROP CONSTRAINT IF EXISTS warehouses_type_check;

ALTER TABLE warehouses
ADD CONSTRAINT warehouses_type_check
CHECK (type = ANY (ARRAY['vehicles'::text, 'parts'::text, 'mixed'::text]));

-- التحقّق
SELECT 'warehouses' AS tbl, COUNT(*) AS total,
       COUNT(branch_id) AS linked,
       COUNT(*) FILTER (WHERE type IS NOT NULL) AS typed
FROM warehouses;
