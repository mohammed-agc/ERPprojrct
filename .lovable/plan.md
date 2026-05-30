# Purchasing Governance v1.4 — Implementation Plan

Two coordinated frontend changes on top of the existing `purchasingService` / `allocationService` / `inventoryService` mock layer. No DB schema changes are needed: supplier credit, allocations, invoices, GRN, inspection, and vehicle intake already exist as services — we wire them into a coherent flow.

---

## 1. Supplier Credit Management in Payment Dialog

**Goal:** When paying a Purchase Invoice, show the supplier's live credit position and allow mixed settlement (Credit + Cash/Transfer/POS/Cheque).

### Changes
- Extend `PaymentDialog` (or create a thin `SupplierPaymentDialog` wrapper used by `PurchaseInvoices` and `PurchaseInvoiceDetail`) to accept supplier credit context:
  - `credit_limit`, `credit_utilized`, `credit_remaining`, `credit_expiry`, `credit_status`.
- New **Supplier Credit Summary** card at the top of the dialog:
  - 4 KPI tiles: Limit / Utilized / Remaining / Current Invoice.
  - Status badge (Active / Expired / Suspended).
  - Auto verdict:
    - `remaining >= invoice_due` → green "✓ الائتمان يغطي الفاتورة" + enable **Pay via Credit**.
    - `remaining < invoice_due` → amber "⚠ الائتمان لا يغطي الفاتورة بالكامل" + propose **Mixed Settlement** with auto-split (credit = remaining, cash = invoice − remaining).
- Payment method selector expanded to: `cash | bank_transfer | pos | supplier_credit | mixed | cheque`.
- **Mixed mode**: two inputs (Credit portion, Cash/Transfer portion) with live validation `credit ≤ remaining` and `credit + cash = invoice_due`.
- `purchasingService.recordPurchasePayment` already exists; add a sibling `recordMixedPurchasePayment({invoice_id, credit_amount, cash_amount, cash_method, reference})` that:
  1. Calls `supplierCreditService.utilize(supplier_id, credit_amount, invoice_code)` (already present) when `credit_amount > 0`.
  2. Calls existing `recordPurchasePayment` for the cash portion with method `credit_utilization` for the credit leg and the chosen cash method for the rest.
  3. Marks invoice `paid` only when `credit + cash + prior_paid = total`.
- Supplier Account Statement already aggregates payments by supplier — credit utilization entries flow in automatically via the existing payments ledger; verify the entries carry `method: "credit_utilization"` so they render correctly.

### Files
- `src/components/erp/PaymentDialog.tsx` — add `supplierCredit` prop, credit summary block, mixed mode UI, POS method.
- `src/services/erp/purchasing.ts` — add `recordMixedPurchasePayment`; reuse existing supplier-credit utilization.
- `src/pages/purchasing/PurchaseInvoices.tsx` + `src/pages/purchasing/PurchaseInvoiceDetail.tsx` — pass supplier credit context into the dialog; route mixed submits through the new service call.

---

## 2. Connected Receiving → Inspection → Inventory Workflow

**Goal:** Single VIN-driven flow. User enters Invoice # or PO #; system loads everything; no re-entry.

### New unified screen: `ReceivingWorkbench`
Route: `/purchasing/receiving/workbench` (added to sidebar next to existing Receiving list, which remains as the registry).

Three-step stepper inside one page (no navigation away):

```
[1] Load Document  →  [2] Receive & Inspect  →  [3] Post to Inventory
```

**Step 1 — Load:**
- Input + autocomplete for Purchase Invoice # OR Purchase Order #.
- On select: resolve supplier, PO, linked invoice(s), and confirmed allocation lines via `getPoVehicleUnits(poId)` (already implemented). Show read-only summary card with supplier / PO / invoice / allocation code.
- Gate: invoice must be `paid` (per spec "Paid → Ready For Receiving") — show banner + block step 2 otherwise.

**Step 2 — Receive & Inspect (combined table, one row per VIN):**
Columns prefilled from allocation (no edit on identity):
`VIN · Engine No · Manufacturer · Model · Trim · Year · Color · Cost`
Editable per row:
- Physical condition (ok / minor_damage / damaged)
- VIN verified ✓
- Engine verified ✓
- Color/Model/Trim verified ✓
- Result: `passed | rejected | pending`
- Notes
Bulk actions: "Verify all", "Pass all OK".

Creating the GRN + Inspection records happens together when the user clicks **Confirm Receiving & Inspection**:
- `purchasingService.createGRN(...)` from selected lines (existing).
- `purchasingService.recordInspection(...)` with per-line passed/failed (existing) — triggers the existing `inventoryIntegration.onInspectionApproved` hook.

**Step 3 — Post to Inventory:**
- Lists `passed` VINs only.
- Single button **"Post Vehicles to Inventory"** calls the existing `VehicleIntakeDialog` payload path (`recordVehicleIntake` + Supabase `vehicles` insert) using data already in hand — no manual fields.
- On success: success screen with links to Vehicle Inventory filtered by these VINs, plus "Start another" reset.

### VIN Governance Verification
Add a helper `assertVinChainIntact(vin)` (in `src/lib/vinChain.ts`) that confirms a VIN exists in: allocation → invoice line note/ref → GRN → inspection → inventory. Surfaced as a small "VIN chain ✓" badge per row in step 2/3 (read-only, doesn't block).

### Files
- `src/pages/purchasing/ReceivingWorkbench.tsx` — new unified screen.
- `src/lib/vinChain.ts` — new helper.
- `src/App.tsx` — register route.
- `src/components/layout/AppSidebar.tsx` — add "ورشة الاستلام" entry under Purchasing.
- `src/services/erp/purchasing.ts` — minor: ensure `listPurchaseInvoices` exposes `po_id` lookup by invoice number (already does); add `findInvoiceOrPoByCode(code)` convenience.

The existing standalone Receiving and Inspection pages stay as registries for audit, but the *operational* path becomes the Workbench.

---

## Out of Scope
- No DB schema migrations (all data already lives in service layer / existing tables).
- No changes to Sales/Delivery — only verifying VIN appears unchanged downstream (it already does via `inventoryIntegration.onDeliveryCompleted`).
- No new permissions — uses existing purchasing permission codes.
