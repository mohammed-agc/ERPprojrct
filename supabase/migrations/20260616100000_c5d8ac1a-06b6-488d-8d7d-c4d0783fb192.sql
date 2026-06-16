-- ============================================================
-- Vehicle Financial Foundation — F1: Cost Bridge
-- compute_vehicle_landed_cost(p_vehicle_id uuid)
-- ============================================================
-- يستبدل الدالة المفقودة التي تستدعيها VehiclePLCard.
-- V1: المصدر = inventory_items.cost_price (الموثوق، حسب COST_BRIDGE_AUDIT).
--   purchase_cost = cost_price
--   additional_costs = 0 (V2: freight/customs/insurance/incentives/workshop)
--   landed_cost = cost_price + additional_costs
--
-- مركبة غير موجودة → RETURN 0 ROWS (لا بيانات وهمية، لا إخفاء أخطاء).
-- الواجهة آمنة: costRow?.x || 0 يتعامل مع 0 صفوف.
-- SECURITY INVOKER (يحترم RLS)، STABLE (قراءة فقط).
-- المرجع: COST_BRIDGE_DESIGN.md + PHASE_F1_IMPLEMENTATION_REVIEW.md.
-- ============================================================

CREATE OR REPLACE FUNCTION compute_vehicle_landed_cost(p_vehicle_id uuid)
RETURNS TABLE (
  purchase_cost     numeric,
  additional_costs  numeric,
  landed_cost       numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(ii.cost_price, 0)::numeric  AS purchase_cost,
    0::numeric                            AS additional_costs,
    COALESCE(ii.cost_price, 0)::numeric  AS landed_cost
  FROM inventory_items ii
  WHERE ii.id = p_vehicle_id
    AND ii.item_type = 'vehicle';
$$;

-- التحقّق
SELECT proname, pg_get_function_arguments(oid) AS args, pg_get_function_result(oid) AS result
FROM pg_proc WHERE proname = 'compute_vehicle_landed_cost';
