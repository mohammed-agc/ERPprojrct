
# Phase 13 — Purchasing Spine Persistence (Supabase-authoritative)

Scope confirmed: start clean, no LS migration, no backward compatibility, no import wizard. All purchasing data flows through Supabase exclusively. `purchasingService` (LS) and `allocationService` (LS) will be retired and replaced by Supabase-backed services.

The chain to persist:

```
PR → PO → Allocation → GRN (Receiving) → Inspection → Purchase Invoice → Supplier Payment
```

The last two (Purchase Invoice + Supplier Payment) are already authoritative from Phase 11/12. This phase brings the first five online.

## Why split Phase 13 into sub-turns

The current LS spine is ~2,700 lines of service code and ~18 pages (~3,200 lines). Doing it in one push violates the "small blast radius" principle the user already chose. I propose three sub-turns under the Phase 13 umbrella, each fully shippable and verifiable:

### Phase 13a — Schema + PR/PO persistence (this turn)
- **Migration**: create `purchase_requests`, `purchase_request_lines`, `purchase_orders`, `purchase_order_lines`. Enums for status. Auto-numbering via sequences. GRANTs + RLS (vehicles dept + accounting + managers can write; all auth can read). `updated_at` triggers.
- **Service**: new `src/services/erp/purchasingDb.ts` with `listPRs / getPR / createPR / submitPR / approvePR / rejectPR / convertPRtoPO / listPOs / getPO / createPO / sendPO / acknowledgePO / cancelPO`.
- **Pages rewritten**: `PurchaseRequests.tsx`, `PurchaseRequestDetail.tsx`, `PurchaseOrders.tsx`, `PurchaseOrderDetail.tsx`. They call the new DB service only.
- **LS removal**: delete PR/PO methods from `purchasingService`. Any other page still importing them is rewired to call `purchasingDb` or temporarily disabled with a clear placeholder if it belongs to a later sub-turn.

### Phase 13b — Allocation + Shipments
- Migration for `allocations`, `allocation_lines`, `shipments` + RLS/GRANTs.
- New `allocationsDb.ts` + `shipmentsDb.ts`.
- Rewrite `Allocations.tsx`, `AllocationDetail.tsx`, `AllocationConfirmations.tsx`, `AllocationConfirmationDetail.tsx`, `Shipments.tsx`.
- Retire `allocationService` (LS) and shipment methods from `purchasingService`.

### Phase 13c — GRN (Receiving) + Inspection + auto-create vehicles + close
- Migration for `goods_receipts`, `goods_receipt_lines`, `inspections`, `inspection_lines`.
- On GRN post: insert `vehicles` rows (status='available', cost_price from PO line) tied back to the GRN line so the existing purchase-invoice flow can attach them.
- Rewrite `Receiving.tsx`, `ReceivingWorkbench.tsx`, `Inspection.tsx`, `InspectionDetail.tsx`, `PurchasingDashboard.tsx`.
- Delete `src/services/erp/purchasing.ts` LS internals (keep only pure helpers — labels, tones, fmt). Delete `src/services/erp/allocations.ts` LS internals.
- Final verification: end-to-end PR → PO → Allocation → GRN → Inspection → PINV → Supplier Payment with a real auth user.

`SupplierCredit.tsx` and `SupplierIncentives.tsx` are out of Phase 13 scope (deferred — they are not on the spine).

## This turn (Phase 13a) — detailed work

### Migration
```text
purchase_requests(id, pr_no, request_date, requested_by, department_code, status, notes, total_estimated, created_*, updated_*)
purchase_request_lines(id, pr_id, line_no, brand, model, year, color, quantity, estimated_unit_cost, notes)
purchase_orders(id, po_no, pr_id, supplier_id, order_date, expected_delivery, status, subtotal, vat_amount, total, notes, created_*, updated_*)
purchase_order_lines(id, po_id, pr_line_id, line_no, brand, model, year, color, quantity, unit_cost, vat_pct, line_total)
```
- Enums: `pr_status` (`draft|submitted|approved|rejected|converted|cancelled`), `po_status` (`draft|sent|acknowledged|partially_received|received|cancelled`).
- GRANTs: `SELECT` to authenticated (line tables too); write for managers/admin and vehicles+accounting depts; full to service_role.
- RLS mirrors existing `purchase_invoices` policy pattern.
- Auto-numbering: simple `pr_no = 'PR-' || lpad(nextval('seq_pr')::text, 6, '0')` set in BEFORE INSERT trigger if `pr_no` is null.

### Service (`purchasingDb.ts`)
Pure Supabase calls. No LS. Each mutator returns the freshly read row. State transitions are server-enforced via a trigger that rejects invalid status moves.

### Pages
Rewritten as thin React Query consumers of `purchasingDb`. Behavior preserved (list, filter, create, view, action buttons). RTL/Arabic strings preserved.

### LS cleanup this turn
- Remove `createPR/listPRs/...` and PO methods from `purchasingService`.
- If `Allocations.tsx`/`Shipments.tsx`/`Receiving*.tsx` still import retired PR/PO helpers, swap to `purchasingDb` reads. They keep their own LS internals until 13b/13c.

### Verification
- Insert a PR via UI → confirm row in `purchase_requests`.
- Convert to PO → confirm `purchase_orders` row with FK to PR.
- Send PO → status transitions allowed; invalid transitions rejected.
- Read-only check that `PurchaseInvoices` (accounting side, Phase 12) still resolves.

## Deliverable at end of each sub-turn
- Updated ERP Readiness %
- Updated Production Readiness %
- Remaining LS-backed pages (named list)
- Remaining critical findings

## Out of scope (entire Phase 13)
- Phase 14 security hardening (RLS tightening on `payments`, `audit_log`, line tables).
- `SupplierCredit` / `SupplierIncentives` pages.
- Any analytics, dashboards, or new modules.

## Approve to proceed with Phase 13a this turn.
