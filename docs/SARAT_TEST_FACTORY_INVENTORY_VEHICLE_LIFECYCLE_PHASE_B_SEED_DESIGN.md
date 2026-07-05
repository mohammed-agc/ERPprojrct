# Sarat Test Factory — Inventory Vehicle Lifecycle (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the third item in the Phase B order (§8): Inventory vehicle lifecycle. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. Inventory differs fundamentally from items 1 and 2: `inventory_items` carries **no triggers** (a clean record, no financial engine on the table itself), so an INSERT of a vehicle has **no direct accounting impact**. The financial impact arrives later, through sale (F3 COGS) and purchase (Cost Bridge), not from the table. This item also exposes the ghost-table risk (R-I1): code paths that reference a non-existent `vehicles` table.

---

## 1. Purpose

- Design safe seed scenarios for the vehicle lifecycle in `inventory_items`.
- Document that `inventory_items` has no triggers — INSERT has no direct GL/accounting impact.
- Expose R-I1 (ghost tables `vehicles` + `vehicle_costs` do not exist).
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from INVENTORY/VEHICLES review, commit 2ccc18e)

- `inventory_items` is the vehicles + parts table. `sku` + `name` NOT NULL; `item_type` default `'part'` (a vehicle needs `'vehicle'` explicitly).
- Three constraints: `item_type` (vehicle/part/consumable/asset), `costing_method`, `status` (10 values: on_order / in_transit / active / inactive / discontinued / reserved / sold / delivered / returned_pending_inspection / inspection_failed).
- 🟢 No triggers on the table — a clean record. An INSERT of a vehicle is safe and has no direct accounting side effect.
- 🔴 `vehicles` + `vehicle_costs` are ghost tables (do not exist) → R-I1 = Phase 5B. Some code paths historically reference `from('vehicles')`.
- Live: vehicles exist as `inventory_items` rows with `item_type='vehicle'`, `status='active'`, `qty_on_hand=1`.

## 3. Lifecycle Nature Statement (explicit)

This is the governing distinction for this item:

- Unlike Sales/Payments (item 1) and Purchasing (item 2), which post journal entries, `inventory_items` itself posts **nothing**. Status changes on the table are operational (MM/SD), not financial (FI).
- The financial events are driven elsewhere: purchase (Cost Bridge: `purchase_invoice_lines.net_cost` → `inventory_items.cost_price`, code), and sale (F3 COGS trigger on `invoices`, F4 status sync reserved→sold).
- Therefore lifecycle seed scenarios assert **status transitions and inventory quantities**, and annotate that any accounting impact belongs to the sale/purchase items, not here.

## 4. Master Data (design — not executed)

- One vehicle: an `inventory_items` row with `item_type='vehicle'`, a `TDF-`-prefixed `sku`, `status='active'`, `qty_on_hand=1`, a `costing_method`, and a `cost_price` (set by the Cost Bridge in the purchase path, or explicitly for a standalone lifecycle test). No real VIN of a real customer's car.
- One part: an `inventory_items` row with `item_type='part'` for the parts-vs-vehicle contrast.

## 5. Scenario Set

### TDF-INV-B01 — Vehicle master insert (baseline, no accounting)

- Classification: master-data seed.
- Flow: INSERT an `inventory_items` row with `item_type='vehicle'`, `status='active'`, `qty_on_hand=1`.
- Expected: the row exists; **no journal entry, no GL impact** (no triggers on the table).
- Purpose: establish the clean baseline and confirm the no-accounting nature.

### TDF-INV-B02 — Reserve on sale (active → reserved)

- Classification: transaction (lifecycle).
- Flow: the sale path reserves the vehicle (`status` active → reserved) as part of order handling.
- Expected: `status='reserved'`; quantities reflect the reservation per the current model.
- Design note: the reservation is an operational transition; the revenue/COGS accounting is item 1's concern, not here.
- Purpose: prove the reserve transition.

### TDF-INV-B03 — Sale completion (reserved → sold)

- Classification: transaction (lifecycle).
- Flow: on invoice issue, the F4 completion path sets `status` reserved → sold, `qty_on_hand` → 0, `sold_at`.
- Expected: `status='sold'`, `qty_on_hand=0`, `sold_at` set.
- Design note: F4 fires after F3 (COGS) by execution order; the accounting is item 1's, this scenario asserts the operational state only.
- Purpose: prove the sold transition and quantity zeroing.

### TDF-INV-B04 — Delivery (sold → delivered)

- Classification: transaction (lifecycle).
- Flow: manual delivery marks the vehicle delivered.
- Expected: `status='delivered'` (or the delivered overlay per the current model).
- Design note: delivery is the point after which cancellation requires goods return (F6), not simple cancel (F5).
- Purpose: prove the delivered transition and its downstream guard implication.

### TDF-INV-B05 — Return re-entry (delivered → returned_pending_inspection → active/inspection_failed)

- Classification: transaction (lifecycle) + regression.
- Flow: goods return (F6) moves delivered → returned_pending_inspection; inspection pass → active + qty restored; inspection fail → inspection_failed.
- Expected: the two inspection outcomes reach their respective statuses; a return that clears inspection makes the vehicle resellable again.
- Design note: the financial reversal is F6→F5's concern; this scenario asserts the inventory re-entry states.
- Purpose: prove the full return lifecycle at the inventory level.

### TDF-INV-B06 — Ghost table exposure (R-I1)

- Classification: negative / debt-exposing.
- Flow: exercise a code path (or document the known one) that references `from('vehicles')` or `vehicle_costs`.
- **Known-defect expectation (R-I1):** the `vehicles` and `vehicle_costs` tables do not exist; such a path fails or returns nothing. The real vehicle identity lives in `inventory_items` with `item_type='vehicle'`.
- Design note: this scenario is the detector for R-I1 (Phase 5B). It must document the ghost-table failure as the current reality, not assume a working `vehicles` table.
- Purpose: make R-I1 reproducible for the Phase 5B fix.

### TDF-INV-B07 — Constraint/guard checks

- Classification: negative / guard.
- Flow: attempt an out-of-range `item_type`, `costing_method`, or `status` value.
- Expected: the CHECK constraints reject the invalid values.
- Purpose: confirm the three constraints hold.

## 6. Dependencies

- TDF-INV-B02..B05 depend on the vehicle master (B01).
- B05 depends on a delivered vehicle (B04).
- B03 assumes the sale path (item 1) has run for the accounting side; here only the status assertion matters.

## 7. Expected Impact Summary

| Scenario | Inventory state | Accounting | Debt/limitation exposed |
|----------|-----------------|------------|--------------------------|
| B01 | active, qty=1 | none (no triggers) | — |
| B02 | reserved | none here (item 1 posts) | — |
| B03 | sold, qty=0, sold_at | none here (F3/F4 elsewhere) | — |
| B04 | delivered | none here | — |
| B05 | returned→active/failed | none here (F6→F5 elsewhere) | — |
| B06 | n/a | n/a | R-I1 (ghost tables) |
| B07 | rejected | none | — (constraints) |

Note the "Accounting" column is "none" on the inventory table throughout — the financial events belong to the sale/purchase items, reflecting that `inventory_items` has no triggers.

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / real vehicle data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- `inventory_items` has no triggers, so a vehicle master row can be deleted directly in cleanup (no posted-entry immutability on this table) — provided no sale/purchase document references it; if it does, clean those (items 1/2) first.
- Cleanup order reverses creation order (return → delivery → sale → reserve → master).
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation (including any `vehicles`/`vehicle_costs` table creation for R-I1), production changes, external ZATCA calls, or PASS/FAIL judgment. Documenting R-I1 here does not change its status or schedule a fix.

## 11. Status

```
Inventory Vehicle Lifecycle Phase B Seed Design = Designed / Not executed
Scenarios = TDF-INV-B01..B07 (B06 exposes R-I1 ghost tables)
inventory_items has no triggers → INSERT has no direct accounting impact (explicit)
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
R-I1 = ghost tables vehicles/vehicle_costs (documented, not fixed; Phase 5B)
Posting Engine = Under Audit / Partially Audited
```
