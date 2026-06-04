# ERP Architecture

Companion to [ERP_CORE_FREEZE_V1.md](./ERP_CORE_FREEZE_V1.md). Describes the
runtime topology, the database, and the cross-module lifecycles that define
ERP Core Freeze v1.0.

---

## 1. System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser (React 18 + Vite + TypeScript + Tailwind + shadcn)  │
│  ├─ Pages (src/pages/**)                                     │
│  ├─ ERP components (src/components/erp/**)                   │
│  ├─ React Query data layer (src/services/erp/**)             │
│  └─ Auth + ERP session contexts                              │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTPS (Supabase JS client)
┌───────────────▼──────────────────────────────────────────────┐
│  Lovable Cloud (Supabase)                                     │
│  ├─ Postgres (public schema, RLS-enforced)                   │
│  ├─ Auth (email + optional providers)                        │
│  ├─ Storage (vehicle-media bucket)                           │
│  └─ Edge Functions: incentive-api, incentive-authz           │
└──────────────────────────────────────────────────────────────┘
```

- **Routing:** `src/App.tsx` lazy-loads every route under an `AppLayout`
  shell. Auth-gated by `AuthProvider` + `ErpSessionProvider`.
- **State:** React Query for server state; `localStorage` only for
  master-data prototypes flagged for future Supabase migration.
- **Styling:** Tailwind semantic tokens defined in `src/index.css` and
  `tailwind.config.ts`. RTL-first (Arabic).
- **Code splitting:** Every page is a `lazy()` import; `PageLoader` is the
  shared fallback.

## 2. Database Architecture

The schema lives entirely in `supabase/migrations/` (19 migrations at
freeze). Every change is reproducible by running them in filename order.

### Core entities

| Group | Tables |
| --- | --- |
| Identity | `profiles`, `user_roles`, `role_permissions`, `departments` |
| Master data | `customers`, `vehicles`, `accounts` |
| Purchasing | PR / PO / Allocation / Shipment / Receiving / Inspection / GRN / Purchase Invoice tables |
| Sales | `sales_orders`, `sales_order_lines`, `invoices`, `invoice_lines`, `payments` |
| Reversals | `credit_notes`, `credit_note_lines`, `goods_return_requests` |
| Accounting | `journal_entries`, `journal_entry_lines`, `vehicle_costs` |
| Audit | `audit_log` |

### Functions, triggers, views

- **Security helpers:** `has_role`, `is_manager_or_admin`, `user_department`.
- **Costing:** `compute_vehicle_landed_cost(uuid)`.
- **Triggers:** `customers_audit_changes`, `customers_restrict_finance_fields`,
  `vehicles_lifecycle_dates`, `invoices_stamp_vehicle_sold_at`,
  `vehicle_costs_governance`, `update_updated_at_column` (shared).
- **RPCs:** `approve_goods_return` (SECURITY DEFINER, role-gated).
- **Governance views:** `v_gov_vehicles_missing_acquired_at`,
  `v_gov_vehicles_sold_missing_sold_at`,
  `v_gov_vehicles_negative_days_in_stock`,
  `v_gov_invoices_missing_cogs`, `v_gov_sold_vehicles_without_cogs`,
  `v_gov_vehicles_missing_cost`.
- **Enums:** `app_role`, `department_code`, `vehicle_status`,
  `invoice_status`, `order_status`, `cn_type`, `cost_type`.

### Access control

Department- and role-scoped RLS on every write path. `service_role` retains
full access for edge functions / admin tooling. `anon` is denied on
operational tables.

## 3. Module Relationships

```
Customers ─────────────┐
                       │
Vehicles ──► Sales Orders ──► Invoices ──► Payments
   │            │                │  │
   │            │                │  └──► Credit Notes ──► Goods Return Requests
   │            │                │              │
   │            │                ▼              ▼
   │            │           Journal Entries (Revenue/VAT/AR + reversals)
   │            │                ▲
   │            └────────────────┘
   │
   └──► Vehicle Costs ──► Journal Entries (Inventory/COGS)
            ▲
            │
Purchasing chain (PR → PO → Allocation → GRN → Purchase Invoice)
```

## 4. Vehicle Lifecycle

1. **Intake** — `VehicleIntakeDialog` inserts into `vehicles`; trigger stamps
   `acquired_at` (immutable).
2. **Costing** — GRN + landed-cost charges accrete in `vehicle_costs`.
   `compute_vehicle_landed_cost` aggregates.
3. **Reservation/Allocation** — status transitions guarded by
   `vehicle_status` enum + RLS.
4. **Sale** — invoice posting stamps `sold_at` (via
   `invoices_stamp_vehicle_sold_at`) and triggers COGS + Inventory journal.
5. **Return** (optional) — Goods Return Request → `approve_goods_return` RPC
   posts the reversal journal and resets status to `available`.

## 5. Purchase Lifecycle

```
Purchase Request → Purchase Order → Allocation → Allocation Confirmation →
Shipment → Receiving (Workbench) → Inspection → GRN → Purchase Invoice
```

Each stage writes structured records and audit entries. GRN posting is the
point at which inventory + cost basis enter the GL.

## 6. Sales Lifecycle

```
Quotation → Reservation → Sales Order → Invoice (post) → Delivery
                                       │
                                       └─► Payment(s) / Credit Note(s)
```

Department code on the sales order scopes RLS for the entire chain.

## 7. Credit Note Lifecycle

```
Invoice (posted)
    │
    ▼
Credit Note (cancellation | partial | goods_return)
    │
    ├─► JE 1: reverse Revenue + VAT + AR
    └─► JE 2 (vehicle lines): reverse COGS + reinstate Inventory
            │
            ▼
       (if goods_return) Goods Return Request → approve_goods_return RPC
            │
            └─► vehicle.status = 'available', reinstated_at stamped
```

All steps are atomic; failure rolls everything back.

## 8. COGS Flow

```
Invoice posted (vehicle line)
        │
        ▼
compute_vehicle_landed_cost(vehicle_id)
        │
        ▼
Journal Entry: DR COGS / CR Inventory  ─► invoices.cogs_journal_entry_id
        │
        ▼ (on credit note / return)
Reversal Journal: DR Inventory / CR COGS ─► credit_notes.cogs_journal_entry_id
```

Governance views surface any invoice that was posted without a matching COGS
journal, or any sold vehicle without inventory reduction.

## 9. Profitability Flow

```
vehicles.acquired_at ─┐
vehicle_costs ────────┼─► Landed Cost ─┐
                      │                │
invoices (revenue) ───┤                ├─► Per-VIN P&L Card
credit_notes ─────────┤                │   + Profitability Dashboard
                      │                │
vehicles.sold_at ─────┘                └─► Days in Stock, Margin %
```

The Vehicle Profitability page aggregates the above per VIN with filters,
sorting, governance flags, and CSV export. The Vehicle P&L Card on
`VehicleDetail` exposes the same data per vehicle alongside COGS status.

---

## Reproducing from scratch

1. `git clone <repo>` at tag `ERP-Core-Freeze-v1.0`.
2. `bun install` (or `npm install`).
3. Enable Lovable Cloud / connect a Supabase project.
4. Apply every file in `supabase/migrations/` in filename order.
5. `bun run dev` — the running app matches the freeze snapshot.
