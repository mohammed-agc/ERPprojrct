# Sarat Test Factory — Inventory/Vehicles Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md` §7): schema · constraints · triggers · functions · service call-sites · existing live examples · risks. No seed is designed here. This is the third module reviewed (after Sales and Purchasing).

---

## 1. Purpose

Document the Inventory/Vehicles Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed.

## 2. Schema Evidence

`inventory_items` is the single table for both vehicles and stock parts. `item_type='vehicle'` designates a vehicle (default is 'part', so vehicle must be set explicitly). Required (NOT NULL): `sku`, `name`. Important fields: `sku`, `name`, `item_type`, `status`; vehicle attributes `brand`/`model`/`trim`/`year`/`color`/`vin`/`engine_no`; costing `cost_price`/`last_cost`/`avg_cost`/`costing_method`; stock `qty_on_hand`/`qty_reserved`/`qty_on_order`; sale `sale_price`/`sold_at`. There is no `company_id` column in `inventory_items` (single-tenant, consistent with `account_determinations`).

## 3. Constraints Evidence

- `item_type`: vehicle / part / consumable / asset.
- `status` (10): on_order / in_transit / active / inactive / discontinued / reserved / sold / delivered / returned_pending_inspection / inspection_failed.
- `costing_method`: avg / fifo / lifo / standard.

The vehicle lifecycle is constrained in the database (not only in code): active → reserved → sold → delivered → [returned_pending_inspection → inspection_failed or back to active]. The last five statuses are the vehicle path; the first five are general inventory.

## 4. Triggers Evidence

`inventory_items` has **no triggers**. It is a clean data record. External functions update the item's state (F4 `complete_vehicle_sale`, F5 `cancel_sales_invoice`, F6 goods return) — the table itself fires nothing. Because there is no trigger, a simple vehicle seed (a direct INSERT) is structurally safe on confirmed staging: it produces no accounting, no side effect. This also explains why the Purchase-Cost Bridge is code, not a trigger — there is no trigger on `inventory_items` to catch an insert.

## 5. Ghost Table Evidence

The `vehicles` table does not exist. The `vehicle_costs` table does not exist. Vehicles live only in `inventory_items`. Any code relying on `from('vehicles')` or `vehicle_costs` is reading a non-existent table and needs review. This confirms the Phase 5B ghost-table debt (VehicleProfitability / AdminDashboard / Dashboard).

## 6. Functions Evidence [read earlier in F1/F4/F5/F6]

- `compute_vehicle_landed_cost` (F1) — landed cost from `cost_price`.
- `complete_vehicle_sale` (F4) — reserved → sold, qty → 0.
- `cancel_sales_invoice` (F5) — sold → active, qty restored.
- `receive_goods_return` + `approve_goods_return` (F6) — delivered → returned_pending_inspection → inspection_failed / active.

All of these update `inventory_items` from the outside (driven by the invoice/return side); the table is acted upon, never the actor.

## 7. Live Examples Evidence

- **F3VIN00000000001** — active, qty=1, cost_price=90000.
- **TEST-V-001** (VIN 1HGBH41JXMN109186) — active, qty=1, cost_price=80000, sale_price=100000.
- **JT2BG22K1W0123457** — active, qty=1, cost_price=100000.
- **JT2BG22K1W0123456** — active, qty=1, cost_price=99500.

All vehicles are active, qty_on_hand=1, qty_reserved=0, sold_at=NULL. No vehicle is currently sold / delivered / reserved (prior test cycles were cancelled/returned, returning the vehicles to active). `cost_price` is populated on all of them, evidence the Purchase-Cost Bridge (code) works.

## 8. Scenario Matrix (outline — filled in Phase B, not now)

| scenario | workflow | accounting impact | inventory impact | raw SQL status |
|----------|----------|-------------------|------------------|----------------|
| Simple vehicle seed | INSERT inventory_items (item_type='vehicle', status='active', cost_price) | none | qty=1 | safe on confirmed staging |
| Vehicle from purchase | PINV + Purchase-Cost Bridge (service) | AP + inventory/cost | qty=1 | mixed / Phase B |
| Vehicle reservation | sales workflow / code | none | reserved | code |
| Vehicle sale | invoice issued + complete_vehicle_sale | revenue + COGS | sold / qty=0 | via workflow |
| Vehicle return | receive/approve goods return | reversal | back to active | workflow |

## 9. Risks / Candidates

- **R-I1 (confirmed = Phase 5B debt):** ghost `vehicles` table confirmed live; code referencing it is broken. Structural evidence for the Phase 5B debt.
- **R-I2 (candidate):** the unified `status` model mixes general inventory statuses (on_order/in_transit) with vehicle lifecycle statuses (reserved/sold/...). A single model — potentially confusing, but not an error. Candidate only.
- **R-I3:** `sale_price`=0 for most vehicles (populated at sale, or left 0). Clarify in Phase B.
- **R-I4 (candidate):** no `company_id`. Acceptable under the current single-tenant model, but relevant to a future Track 2 multi-tenant (constitution's company-aware principle).

## 10. Recommendation

Inventory/Vehicles Phase A is Read-only Reviewed: schema, constraints (10 statuses), absence of triggers, ghost-table confirmation, functions (F1/F4/F5/F6), and live examples are all read. A simple vehicle seed is the safest among the first modules because `inventory_items` has no triggers — a direct INSERT has no side effects. Phase B seed remains deferred until staging confirmation. The full vehicle purchase/sale lifecycle must use the workflows/functions, not raw shortcuts.

## 11. Status

```
Inventory/Vehicles Phase A = Read-only Reviewed / No seed designed / Not Executed
Ghost vehicles table = Confirmed live
inventory_items = no triggers / clean data record
Candidates (not promoted): R-I2 (unified status), R-I4 (no company_id / Track 2)
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
