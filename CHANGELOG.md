# Changelog

All notable changes to this ERP project. Dates use ISO-8601.
This log captures milestone-level changes; per-commit detail lives in Git history.

## [1.0.0] — 2026-06-04 — ERP Core Freeze v1.0

Frozen baseline. Tag: `ERP-Core-Freeze-v1.0`.

### Added
- **Release documentation** — `docs/ERP_CORE_FREEZE_V1.md`, `docs/ARCHITECTURE.md`.
- **Vehicle Profitability**
  - Persistent lifecycle dates: `vehicles.acquired_at`, `vehicles.sold_at` with triggers (`vehicles_lifecycle_dates`, `invoices_stamp_vehicle_sold_at`) and historical backfill.
  - Governance views: `v_gov_vehicles_missing_acquired_at`, `v_gov_vehicles_sold_missing_sold_at`, `v_gov_vehicles_negative_days_in_stock`.
  - Per-VIN P&L Card on Vehicle Detail (landed cost, revenue, discounts, credit notes, gross/net profit, days in stock, COGS status).
  - Vehicle Profitability dashboard with date/department/VIN filters, sortable columns, governance flags, CSV export.
  - COGS visibility: amount + journal entry number + status (Posted / Missing JE / Inventory Not Reduced / Cost Source Missing).
- **Master Data Governance**
  - Field-by-field audit trigger `customers_audit_changes` (cr_number, name_ar, name_en, short_name, national_id, mobile, finance fields).
  - Finance-field guard trigger `customers_restrict_finance_fields` with Arabic denial message.

### Changed
- Credit Note posting now performs atomic Revenue + VAT + AR + COGS + Inventory reversal in a single transaction.
- Profitability calculations use persisted `acquired_at` / `sold_at` instead of derived invoice dates.

### Security
- Roles isolated in `user_roles`; security-definer helpers `has_role`, `is_manager_or_admin`, `user_department`.
- Department-scoped RLS hardened on `accounts`, `journal_entries`, `journal_entry_lines`, `sales_orders`, `vehicles`.
- `approve_goods_return` RPC role-gated; goods-return updates restricted to inspection/manager roles.

---

## [0.9.0] — 2026-06-03 — Sales Governance Phase 2

- Credit Note model (`credit_notes`, `credit_note_lines`) with cancellation / partial / goods-return types.
- `goods_return_requests` workflow with inspection → approval → reinstatement.
- Invoice `credited_amount` tracking; full GL reversal chain.
- Customer credit gate and payment terms enforcement (`CreditGateBanner`).

## [0.8.0] — 2026-05-31 — Financial Governance & Closing

- Financial periods, monthly close, year-end close, locked-period banner.
- Approvals workflow for journals.
- Audit Center + Activity Feed surfaced.
- Income Statement, Balance Sheet, Cash Flow reports generated from journals.

## [0.7.0] — 2026-05-29 — Treasury & AR/AP

- Treasury Accounts, Receipts, Payments, Transfers, Bank Reconciliation.
- Accounts Receivable aging, customer statements, AR reconciliation.
- Accounts Payable with supplier statements.

## [0.6.0] — 2026-05-28 — Accounting Core

- Chart of accounts (`accounts`) with hierarchical structure and types.
- Double-entry journals (`journal_entries`, `journal_entry_lines`).
- General Ledger, Trial Balance.
- Vehicle cost ledger (`vehicle_costs`) + `compute_vehicle_landed_cost`.

## [0.5.0] — 2026-05-27 — Sales Module v1

- Quotations, Reservations, Sales Orders, Invoices, Deliveries, Financing.
- Invoice posting generates Revenue + VAT + AR journal.
- Customer Timeline, Customer Credit, Customer Payments views.
- Sales analytics dashboard.

## [0.4.0] — Inventory & GRN

- Warehouses, Vehicle Inventory, Parts Inventory, Movements, Reservations, Transfers.
- Goods Receipt Notes (GRN) with receipt + inspection flow.

## [0.3.0] — Purchasing Module

- Purchase Requests → Purchase Orders → Allocations → Allocation Confirmations.
- Shipments, Receiving Workbench, Inspection.
- Purchase Invoices, Supplier Credit, Supplier Incentive Programs.
- Edge functions `incentive-api` and `incentive-authz` for incentive authorization.

## [0.2.0] — Master Data & Admin

- Customers, Vehicles, Contacts, Departments.
- Products, Vehicle Colors, Vehicle Catalog (manufacturers/models/trims).
- Admin module: Users, Roles, Permissions, Sessions, Login History, Audit Log.
- Company / Branch / Warehouse / Tax / Sequence / Template settings.

## [0.1.0] — Project Bootstrap

- React 18 + Vite + TypeScript + Tailwind + shadcn/ui scaffolding.
- Lovable Cloud (Supabase) integration: Auth, Postgres, Storage.
- RTL Arabic layout, AppLayout shell with sidebar navigation.
- Auth flows (login, forgot password, reset password) and dashboard.
