# ERP Core Freeze v1.0

**Release date:** 2026-06-04
**Status:** Frozen baseline. Future work branches from this snapshot.

This document captures the implemented scope of the ERP system as of the v1.0
core freeze. The Git repository (including `supabase/migrations/`) is the
single source of truth; cloning the repo and running the migrations recreates
the system exactly.

---

## 1. Implemented Modules

| Domain | Status |
| --- | --- |
| Master Data (Customers, Vehicles, Products, Colors, Departments) | ✅ |
| Purchasing (PR → PO → Allocation → Shipment → Receiving → Inspection → GRN → Purchase Invoice) | ✅ |
| Inventory (Warehouses, Vehicle Inventory, Parts, Movements, Reservations, Transfers) | ✅ |
| Sales (Quotations, Reservations, Orders, Invoices, Deliveries, Financing) | ✅ |
| Credit Notes (full reversal chain: Revenue, VAT, AR, COGS, Inventory) | ✅ |
| Accounting (Chart of Accounts, Journals, GL, Trial Balance, IS, BS, Cash Flow) | ✅ |
| Treasury (Accounts, Receipts, Payments, Transfers, Bank Reconciliation) | ✅ |
| AR / AP (Aging, Customer/Supplier Statements, Reconciliation) | ✅ |
| Costing & Profitability (Departments, Branches, Vehicles, Cost Allocation) | ✅ |
| Governance (Periods, Monthly/Year-End Close, Approvals, Audit Center) | ✅ |
| Admin (Users, Roles, Permissions, Sessions, Login History, Settings) | ✅ |

---

## 2. Purchasing Governance

- Multi-stage workflow PR → PO → Allocation → Allocation Confirmation →
  Shipment → Receiving → Inspection → GRN → Purchase Invoice.
- VIN allocation locked once confirmed; per-VIN landed cost via
  `compute_vehicle_landed_cost`.
- Supplier credit & incentive programs with authorization edge function
  (`incentive-authz`).
- GRN postings reflected into `vehicle_costs` with `source_reference`.

## 3. Sales Governance

- Sales Order → Invoice → Delivery chain with department-scoped RLS
  (`dept manages sales_orders`).
- Posting an invoice stamps `posted_at`, `posted_by`, generates the revenue +
  VAT + AR journal, and (for vehicle lines) the COGS + Inventory journal.
- `invoices_stamp_vehicle_sold_at` trigger keeps `vehicles.sold_at`
  authoritative.
- Customer credit gate + payment terms enforced via `CreditGateBanner`.

## 4. Financial Governance

- Double-entry journal model (`journal_entries` + `journal_entry_lines`)
  managed exclusively by the accounting department / managers / admins.
- Financial periods with monthly + year-end close; locked-period banner
  prevents back-dated postings.
- Trial Balance, Income Statement, Balance Sheet, and Cash Flow regenerate
  from the journal store.

## 5. Credit Note Governance

- Atomic reversal: Revenue, VAT, AR, COGS, Inventory in a single transaction.
- `credit_notes.journal_entry_id` + `cogs_journal_entry_id` link to the two
  reversal journals.
- Goods Return Requests (`goods_return_requests`) drive physical reinstatement;
  `approve_goods_return` RPC posts the COGS reversal and flips the vehicle
  back to `available`.
- Invoice `credited_amount` tracks cumulative reversal exposure.

## 6. Vehicle Profitability

- Persistent lifecycle dates `vehicles.acquired_at` / `vehicles.sold_at`
  stamped by triggers (creation + status transition + invoice posting).
- Per-VIN P&L Card: Landed Cost, Revenue, Discounts, Credit Notes, Gross /
  Net Profit, Days in Stock, COGS posting status & journal reference.
- Profitability dashboard: filters (date range, department, VIN), sortable
  columns (highest/lowest margin, longest days in stock), governance flags,
  CSV export including COGS amount + JE number.
- Governance views: `v_gov_vehicles_missing_acquired_at`,
  `v_gov_vehicles_sold_missing_sold_at`,
  `v_gov_vehicles_negative_days_in_stock`,
  `v_gov_invoices_missing_cogs`, `v_gov_sold_vehicles_without_cogs`,
  `v_gov_vehicles_missing_cost`.

## 7. Master Data Governance

- Customers carry restricted finance fields (`credit_limit`,
  `settlement_policy`, `payment_terms_days`, `grace_days`) protected by the
  `customers_restrict_finance_fields` trigger (Arabic denial message).
- `customers_audit_changes` trigger writes field-by-field diffs to
  `audit_log` (cr_number/name_ar/name_en/short_name/national_id/mobile +
  finance fields) with user, timestamp, old/new values.
- Product & color masters centralised under `productsService` /
  `colorsService` (currently localStorage-backed; repository contracts ready
  for Supabase migration without UI changes).

## 8. Audit Framework

- `audit_log` table captures module, action, document type/id/code, user,
  user_name, JSONB payload.
- Audit Center page surfaces filterable activity; Activity Feed shows the
  user-facing stream.
- All financial mutations (invoice posting, credit notes, GRN, vehicle costs,
  customer finance changes, return approvals) write structured audit entries.

## 9. Security Controls

- Roles stored in dedicated `user_roles` table (never on profiles).
- Security-definer helpers: `has_role`, `is_manager_or_admin`,
  `user_department`.
- Department-scoped RLS on `accounts`, `journal_entries`,
  `journal_entry_lines`, `sales_orders`, `vehicles`.
- Hardened policies on `customers` (finance fields), `credit_notes`,
  `goods_return_requests`, `user_roles` write paths, and the
  `approve_goods_return` RPC role check.
- Edge function `incentive-authz` gates supplier incentive program changes.

## 10. Known Deferred Features

The following are intentionally out of scope for v1.0 and tracked for a
future enhancement phase:

- `customer_name_snapshot` historical naming on invoices / credit notes.
- Persisting product & color masters to Supabase tables (repository layer
  already abstracted).
- Structured PO/Supplier COGS provenance chain beyond `source_reference`.
- Workshop & Spare Parts operational modules (placeholder routes only).
- Advanced report builder and scheduled report distribution.
- Multi-currency support.
