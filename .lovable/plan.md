# Purchasing & Sales Governance v1.3 — Adoption Plan

Supersedes v1.0–v1.2. Adds **Awaiting Supplier Confirmation** PO state, full PO closure lifecycle (Received → Inspection Pending → Inventory Completed → Closed), and a reserved Supplier Settlement architecture placeholder. Invoices always manual. Every doc carries status, next action, previous doc, approval history, audit timeline, responsible user.

## Approved lifecycles

**Purchasing**
```
PR(draft→confirmed→pending_approval) → Approved → PO
PO: approved → awaiting_supplier_confirmation → allocation_pending
    → ready_for_allocation → allocated → invoiced → in_transit
    → received → inspection_pending → inventory_completed → closed
 → Vehicle Allocation (VINs created, status=allocated)
 → Allocation Confirmation (formal doc, pre-shipment)
 → Purchase Invoice (manual) → Accounting (paid|paid_by_credit|returned)
 → Shipment (allocated→invoiced→in_transit)
 → GRN (validates VINs, no creation)
 → Inspection (passed|rejected)
 → Inventory Entry (VehicleUnit, status=available)
 → PO Closure (only after inventory completed)
```

**Sales**
```
Sales Request(draft→confirmed→pending_approval) → Approved → Sales Order
 → Sales Invoice (manual) → Accounting (pending_payment|partially_paid|paid|financed|returned)
 → Delivery Prepare → Print/Form → Signature → Delivered
 → Inventory: sold → delivered, removed from available
```

## 1. Shared governance — `src/services/erp/governance.ts` (new)
- `Role` enum: purchasing_officer, purchasing_manager, accounting, receiving, inspection, inventory, sales_officer, sales_manager, delivery.
- `AuditEntry`, `ApprovalEntry`, `DocLink` types appended to every doc.
- Helpers: `nextAction(doc, role)`, `canTransition`, `recordAudit`, `recordApproval`, `useRole()` (reads ErpSessionContext).

## 2. Purchasing service — `src/services/erp/purchasing.ts`

### Purchase Request
- Statuses: `draft → confirmed → pending_approval → approved | rejected` (+ `converted_to_po`).
- Officer: `createPR`, `editDraft`, `confirmPR`.
- Manager: `approvePR` → creates PO only. **No invoice auto-creation.** `rejectPR`.

### Purchase Order — full lifecycle
- Statuses: `approved → awaiting_supplier_confirmation → allocation_pending → ready_for_allocation → allocated → invoiced → in_transit → received → inspection_pending → inventory_completed → closed`.
- New `supplierConfirm(po_id, outcome)`: `confirm_all | confirm_partial | model_change | qty_change | rejected` — only after this does allocation unlock.
- Action "تخصيص السيارات" surfaced when status ∈ {allocation_pending, ready_for_allocation}.
- `closePO(po_id)` allowed only when status = `inventory_completed`.

### Vehicle Allocation (new doc)
- `Allocation { id, code, po_id, supplier_id, status, lines[], audit[], approvals[], confirmation_id? }`.
- Line: `vin (unique), engine_no, brand, model, year, color, trim, status: allocated|invoiced|in_transit|received|inspection|available|reserved|sold|delivered|returned`.
- Methods: `createAllocation(po_id)`, `addLines`, `confirmAllocation` → PO → `allocated`.

### Allocation Confirmation (new dedicated doc)
- `AllocationConfirmation { id, code, allocation_id, supplier_id, po_id, allocation_date, vehicle_count, vin_list[], invoice_id?, notes }`.
- Required before shipment.
- Methods: `createConfirmation(allocation_id)`, `attachInvoice(invoice_id)`.

### Purchase Invoice (manual)
- Unlocked only when allocation exists. References PO + allocation.
- Statuses: `pending_accounting → paid | paid_by_credit | returned_to_purchasing`.
- Accounting: `approvePayment`, `payViaCredit` (decrement supplier credit; incentives are balance offsets only — Rule 5), `returnToPurchasing(reason)`.
- On `paid|paid_by_credit` → allocation lines `allocated → invoiced`; PO → `invoiced`; shipment dispatch unlocked.

### Shipment / GRN / Inspection
- Shipment dispatch: VINs `invoiced → in_transit`; PO → `in_transit`.
- GRN: validate VIN/engine/color/model/qty against allocation; on receive → VIN `received`; PO → `received` then `inspection_pending`. **No vehicle creation.**
- Inspection: outcomes `passed | rejected`. On all-passed → PO → `inventory_completed` (after inventory units created).

### Inventory Entry
- **Only `onInspectionPassed`** creates a `VehicleUnit` (status `available`). Removes all other creation paths.
- After inventory created for all lines, PO eligible for `closePO()`.

## 3. Sales service — `src/services/erp/sales.ts`

### Sales Request
- Statuses: `draft → confirmed → pending_approval → approved | rejected`.
- Officer creates/confirms; manager approves → creates Sales Order. **No invoice auto-creation.**

### Sales Invoice (manual, "إنشاء فاتورة بيع")
- Statuses: `pending_payment → partially_paid | paid | financed | returned`.
- Accounting: collectPayment, approveFinancing, returnInvoice.

### Delivery
- Statuses: `prepared → signed → delivered`.
- **Rule 2 gate**: `canPrepare` requires invoice `paid` or `financed`.
- Actions: prepare, printInvoice (stub), generateDeliveryForm (stub), captureSignature (data-URL), deliver.
- On `delivered`: VIN `sold → delivered`, removed from available.

## 4. Business rules enforced centrally
- Rule 1: sales picker filtered by `vehicleSellable() === ok` (status `available` only).
- Rule 2: `canDeliver(invoice)` helper.
- Rule 3: `createVehicleUnit()` guarded by `inspection_passed`.
- Rule 4: VIN uniqueness in allocation + inventory create.
- Rule 5: remove cash-payout path for incentives (offset-only).

## 5. UI — universal doc chrome

`src/components/erp/DocGovernancePanel.tsx` (new) on every doc detail:
- Status chip + role-aware Next Action button (hidden when role mismatches, "Requires: <role>" hint).
- Previous Document link.
- Approval History list.
- Audit Timeline (chronological).
- Responsible User by current status.

Wired into: PR, PO, Allocation, Allocation Confirmation, Purchase Invoice, GRN, Inspection, Sales Request, Sales Order, Sales Invoice, Delivery detail.

## 6. New pages / dialogs
- `/purchasing/allocations` list + `/purchasing/allocations/:id` detail.
- `/purchasing/allocation-confirmations` list + `/purchasing/allocation-confirmations/:id` detail.
- `/purchasing/invoices/:id` detail (list exists).
- `/sales/requests` list + detail.
- `/sales/invoices` list + `/sales/invoices/:id` detail.
- `/sales/deliveries/:id` detail with signature capture.
- Dialogs: `AllocationCreateDialog`, `AllocationLinesEditor`, `AllocationConfirmationDialog`, `SupplierConfirmationDialog` (PO awaiting-confirmation outcomes), `PurchaseInvoiceCreateDialog`, `SalesInvoiceCreateDialog`, `DeliverySignatureDialog`.

## 7. Navigation & routing
- Purchasing sidebar order: Requests → Orders → **Allocations → Allocation Confirmations** → Invoices → Shipments → GRN → Inspection.
- Sales sidebar order: Requests → Orders → Invoices → Deliveries.
- Register all new routes in `src/App.tsx`.

## 8. Reserved future module — Supplier Settlement
- Add `src/services/erp/supplierSettlement.ts` skeleton only:
  - Exported types: `SupplierSettlementSnapshot { supplier_id, opening_balance, invoices[], payments[], credit_used, incentives_earned, incentives_used, closing_balance }`.
  - Empty placeholder functions throwing `not_implemented`.
- No UI. Documented as architecture placeholder.

## Out of scope
- Backend accounting/posting, costing, valuation engines.
- Real auth/role enforcement at DB level (frontend contract only).
- Real printing/signature hardware — stubs only.
- Parts allocation flow (parts keep current PO → GRN → Inspection → on_hand path).
- Supplier Settlement implementation (skeleton only).

## Files
**New:** `src/services/erp/governance.ts`, `src/services/erp/supplierSettlement.ts`, `src/components/erp/DocGovernancePanel.tsx`, `src/components/erp/SupplierConfirmationDialog.tsx`, `src/components/erp/AllocationCreateDialog.tsx`, `src/components/erp/AllocationLinesEditor.tsx`, `src/components/erp/AllocationConfirmationDialog.tsx`, `src/components/erp/PurchaseInvoiceCreateDialog.tsx`, `src/components/erp/SalesInvoiceCreateDialog.tsx`, `src/components/erp/DeliverySignatureDialog.tsx`, `src/pages/purchasing/Allocations.tsx`, `src/pages/purchasing/AllocationDetail.tsx`, `src/pages/purchasing/AllocationConfirmations.tsx`, `src/pages/purchasing/AllocationConfirmationDetail.tsx`, `src/pages/purchasing/PurchaseInvoiceDetail.tsx`, `src/pages/sales/SalesRequests.tsx`, `src/pages/sales/SalesRequestDetail.tsx`, `src/pages/sales/SalesInvoices.tsx`, `src/pages/sales/SalesInvoiceDetail.tsx`, `src/pages/sales/DeliveryDetail.tsx`.
**Updated:** `src/services/erp/purchasing.ts`, `src/services/erp/sales.ts`, `src/services/erp/inventory.ts`, `src/services/erp/integration.ts`, `src/pages/purchasing/{PurchaseRequests,PurchaseOrders,PurchaseInvoices,Inspection}.tsx`, `src/pages/grn/GRNDetail.tsx`, `src/pages/sales/{Quotations,Deliveries}.tsx`, `src/pages/SalesOrderDetail.tsx`, `src/components/layout/AppSidebar.tsx`, `src/App.tsx`, `src/contexts/ErpSessionContext.tsx` (extend role list).

Approve to proceed, or tell me what to trim/expand.