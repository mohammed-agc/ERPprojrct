# Phase 12 — AP UI Wiring

Wire the **accounting-side** Accounts Payable surface to the authoritative Supabase tables shipped in Phase 11 (`suppliers`, `purchase_invoices`, `purchase_invoice_lines`, `supplier_payments`). Purchasing-workflow pages that depend on PR/PO/Allocation/GRN are intentionally **out of scope** — they belong to Phase 13.

## In scope

### Service layer — `src/services/erp/accounting.ts`
1. Replace stub `listPayables()` with a Supabase-backed implementation:
   - Read `suppliers` + `purchase_invoices` (where `status <> 'cancelled'`) + `supplier_payments`.
   - Compute per-vendor: bill count, total payable, paid amount, remaining, overdue, aging buckets (current / 0-30 / 31-60 / 61-90 / 90+).
   - Aging uses `due_date` when present, else `invoice_date + 30`.
2. Replace stub `vendorStatement(vendorId, from?, to?)`:
   - Combine invoices (credit) and supplier payments (debit) into a chronological ledger with running balance.
3. Update `financialKpis.payables` to use the sum of `listPayables().remaining_balance` (instead of hard-coded `0`).

### New DB read helpers — `src/services/erp/accounting.ts`
4. Add `listPurchaseInvoices(filters?)` and `getPurchaseInvoice(id)` (with lines + supplier + payments) using Supabase. These are pure read helpers — no PO/Allocation joins, since those tables don't exist yet.

### Pages
5. **`src/pages/accounting/PurchaseInvoicesRegistry.tsx`** — rewrite:
   - Source data via the new `accounting.listPurchaseInvoices()`.
   - Drop PO/Allocation columns (no DB source). Keep: invoice no, supplier, issue date, due date, subtotal, VAT, total, paid, remaining, status, JE link badge.
   - Link row → existing `/purchasing/invoices/:id` is *not* rewired (Phase 13 owns that page); instead link to a new lightweight detail view `/accounting/purchase-invoices/:id` that reads from DB.
6. **`src/pages/accounting/PurchaseInvoiceAccountingDetail.tsx`** — new minimal read-only page:
   - Header: code, supplier, dates, totals, status, JE link.
   - Lines table (from `purchase_invoice_lines`).
   - Payments table (from `supplier_payments`).
   - Links to underlying GL journal entries (`journal_entries` by `source_type='purchase_invoice'`/`'supplier_payment'`).
7. **`src/pages/AccountsPayable.tsx`** — already calls `accounting.listPayables()`; extend table to render the aging buckets columns now that data is real.
8. Register the new route in `src/App.tsx`.

### Verification
- Insert a test supplier + purchase invoice + line + payment via `supabase--insert`, refresh `/accounts-payable` and `/accounting/purchase-invoices`, confirm the vendor balance, aging, and JE links resolve. Clean up the test data after.

## Explicitly out of scope (deferred to Phase 13)
- `src/pages/purchasing/PurchaseInvoices.tsx`
- `src/pages/purchasing/PurchaseInvoiceDetail.tsx`
- `src/components/erp/PurchaseInvoiceCreateDialog.tsx`
- Any LS-backed `purchasingService` method (`listPOs`, `listSuppliers` LS-side, `recordPurchasePayment`, `recordMixedPurchasePayment`, etc.)
- Supplier credit / mixed-payment flows (require Phase 13 supplier credit schema)
- GRN / Inspection / Receiving pages

## Explicitly out of scope (deferred to Phase 14)
- Tightening RLS on `payments` / `audit_log` / line tables (audit flagged in the prior review)
- Hardening any new write surfaces — existing Phase 11 RLS on AP tables is already department-scoped and stays as-is.

## Technical notes
- No new migrations. All needed tables, triggers, and grants shipped in Phase 11.
- No changes to `purchasingService` (LS) — Phase 13 will retire it.
- No new components beyond the single read-only detail page.
- All new Supabase reads scope to `authenticated` and rely on existing RLS.
