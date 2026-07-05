# Sarat Test Factory — Phase A Consolidated Review

**Status:** Read-only consolidation / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document consolidates the Phase A results across the nine reviewed modules. It is not a new read, not Phase B, not seed design, not staging execution, and not remediation. It ties the nine module reviews into a single reference frame before any remediation design or Phase B begins.

---

## 1. Executive Summary

Before this file, `docs/` held 19 governance documents. Phase A covered nine modules:

1. Sales
2. Purchasing
3. Inventory/Vehicles
4. Payments/Settlements
5. Journal Entries/Posting Engine
6. Fixed Assets
7. Reports/RR
8. Approval
9. ZATCA

The goal here is to unify the picture before Phase B or any remediation design.

## 2. Governance Principles

- Evidence Before Judgment.
- Evidence Before Seed.
- Schema Before SQL.
- Workflow Before Data.
- Staging Before Execution.
- Plan ≠ Authorization.
- Draft ≠ Migration.
- Evidence may mention account numbers.
- Design must use account roles.
- Implementation must use account determination.

## 3. Module-by-Module Status Matrix

| Module | Phase A document | Status | Key finding | Candidate risks | Phase B readiness |
|--------|------------------|--------|-------------|-----------------|-------------------|
| Sales | SARAT_TEST_FACTORY_SALES_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | sales_order → invoice issued; invoice_lines.vehicle_id nullable (COGS vs simple) | R2 duplicate cols | design pending |
| Purchasing | SARAT_TEST_FACTORY_PURCHASING_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | JE fires on approved status; Cost Bridge in code; SAP Open Item not applied on AP | R-P1, TECH-DEBT-AP-001 | design pending |
| Inventory/Vehicles | SARAT_TEST_FACTORY_INVENTORY_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | inventory_items holds vehicles; no triggers (clean record); vehicles/vehicle_costs ghost | R-I1 (Phase 5B), R-I2, R-I4 | design pending |
| Payments/Settlements | SARAT_TEST_FACTORY_PAYMENTS_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | payment trigger posts Dr cash/Cr AR; open_item_allocations is the link layer | R-Pay1, R-Pay4, R-Pay5 | design pending |
| Journal Entries/Posting Engine | SARAT_TEST_FACTORY_JOURNAL_ENTRIES_PHASE_A | Read-only Reviewed / Not Executed | 5 protective triggers (balance, approval, immutability, partner) | R-JE1, R-JE2, R-JE4 | design pending |
| Fixed Assets | SARAT_TEST_FACTORY_FIXED_ASSETS_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | function-driven (no triggers, live-verified); straight-line depreciation | R-FA1, R-FA2, TECH-DEBT-FA-001/FA3-001 | design pending |
| Reports/RR | SARAT_TEST_FACTORY_REPORTS_RR_PHASE_A | Read-only Reviewed / Not Executed | 3 views only; TB/BS/IS are a centralized SSOT in accounting.ts | R-RR1(=DEBT-011), R-RR2(Resolved), R-RR2a/b/c/d, R-RR3 | design pending |
| Approval | SARAT_TEST_FACTORY_APPROVAL_PHASE_A | Read-only Reviewed / No seed designed / Not Executed | central workflow engine; SoD + logged admin override + amount tiers; function-driven | R-AP1..R-AP5 | design pending |
| ZATCA | SARAT_TEST_FACTORY_ZATCA_PHASE_A | Read-only Review / Part 1 + Part 2 documented | service layer live/used; 4 sandbox artifacts; reported + CLEARED | R-Z1..R-Z4 | design pending |

## 4. Cross-Cutting Patterns

- Many modules are function-driven / code-driven, not trigger-driven (Fixed Assets, Approval, ZATCA signing/submission).
- `company_id` is not uniform across modules (present in Fixed Assets and ZATCA; absent in Journal Entries, Approval, Payments).
- Some tables are ghost / deprecated or not the source of truth (`vehicles`, `vehicle_costs` do not exist; `sales_payments` is not where real payments post).
- Open Items on the AR side are more mature than on AP (SAP Open Item applied to AR; purchase_invoices still use `paid_amount` — TECH-DEBT-AP-001).
- The Posting Engine is strong (five protective triggers) but remains Under Audit / Partially Audited.
- Service/code sometimes corrects what is not visible in the DB — e.g. R-RR2 (the financial-report SSOT lives in `accounting.ts`, not in DB views).
- Live evidence corrected memory more than once: Inventory ghost tables; Reports/RR SSOT in `accounting.ts`; Approval function-driven engine; ZATCA service layer live / used.

## 5. Confirmed Technical Debts / Existing Risks

The following are carried forward unchanged — no status change, no remediation, not fixed:

- DEBT-008 (anon/PUBLIC EXECUTE on financial SECURITY DEFINER functions — Critical).
- DEBT-009 (no safe search_path — High).
- DEBT-010 (create_allocation caller-controlled created_by; nullable journal_entry_id — High).
- DEBT-011 (reversal handling in document_allocated/document_remaining — High, confirmed live, impacts reporting).
- DEBT-012 (cancelled paid/settled invoices leave prior AR credits in GL — High, active GL impact, not implemented).
- TECH-DEBT-AP-001 (SAP Open Item not applied to purchase_invoices — High).
- TECH-DEBT-FA-001 (unified document numbering for fixed assets).
- TECH-DEBT-FA3-001 (prorated depreciation).

## 6. Candidate Risk Register

Candidates grouped by module (not promoted to debts without explicit permission):

Inventory:
- R-I2 unified status model.
- R-I4 company_id future multi-tenant concern.

Payments:
- R-Pay1 payment_method/method duplication.
- R-Pay4 company_id inconsistency.
- R-Pay5 payment_no pattern inconsistency.

Journal Entries:
- R-JE1 approval default.
- R-JE2 non-centralized numbering.
- R-JE4 no company_id.

Reports/RR:
- R-RR2 = Resolved — Centralized SSOT.
- R-RR2a TB aggregation duplication.
- R-RR2b cashFlow hardcoded cash classification.
- R-RR2c client-side reporting performance.
- R-RR2d accounts.nature unused / type-vs-nature duplication.
- R-RR3 aging/open amount derived from document_remaining.

Approval:
- R-AP1 approval_mode any/all not implemented.
- R-AP2 approver_id not checked.
- R-AP3 timeout/escalation not implemented.
- R-AP4 GRN/CLOSE final document update gap.
- R-AP5 generic workflow coverage gaps.

ZATCA:
- R-Z1 ICV (icv_counter vs chain_state).
- R-Z2 last_used tracking.
- R-Z3 PCSID onboarding origin.
- R-Z4 error path not live-tested.

## 7. Phase B Readiness

- Phase A does not mean seed-ready.
- Phase B must begin with design only.
- Execution is deferred until staging is confirmed.
- Phase B must choose safe, specific scenarios per module.
- No production data is used.
- No ZATCA external APIs are called in seed without separate permission.

## 8. Recommended Phase B Order (proposal — no execution)

1. Sales + Payments + Open Items.
2. Purchasing + AP limitation documentation.
3. Inventory vehicle lifecycle.
4. Journal Entries safety tests.
5. Reports/RR read consistency.
6. Approval workflow request lifecycle.
7. ZATCA sandbox artifact/submission replay — review only, no external call.
8. Fixed Assets lifecycle.

## 9. What Is Not Authorized

- No DB writes.
- No migrations.
- No remediation.
- No staging execution.
- No seed execution.
- No production action.
- No external ZATCA submission.
- No PASS / FAIL.

## 10. Final Status

```
Sarat Test Factory Phase A = Consolidated across 9 modules
Phase A = Read-only reviews documented
Phase B = Not designed / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
ZATCA sandbox acceptance recorded ≠ production readiness
R-RR2 = Resolved — Centralized SSOT
DEBT-011 = Confirmed live / impacts reporting
DEBT-012 = High / Active GL Impact / Not Implemented
```
