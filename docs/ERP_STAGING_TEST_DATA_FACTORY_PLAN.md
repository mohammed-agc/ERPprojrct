# Sarat ERP — Staging Test Data Factory Plan (Governance Draft)

**Status:** Governance Plan Draft Only / Not Executed · No seed SQL created · No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

---

## 1. Purpose

Prepare comprehensive test data for the Sarat ERP **on a confirmed staging environment only** — to make it easy to exercise functions, screens, and reports realistically. This document is:

- **Not production.** Nothing here touches production data.
- **Not an execution authorization.** It is a governance framework, not a go-ahead.
- **Not a direct seed.** No seed SQL is written here; data is built later, module by module, after live reads.

The factory's value is realistic, accounting-correct test data that passes through the system's own engines — never data that bypasses them.

## 2. Core Principle

```
Evidence Before Seed
Schema Before SQL
Workflow Before Data
Staging Before Execution
```

Every module is read live before any seed is designed for it. No seed is written on assumption. This is the exact discipline proven by DEBT-012 (see §10).

## 3. Scope (future map only)

Target modules, as a future roadmap — none is seeded by this draft: Companies/Branches · Contacts · Chart of Accounts / Account Determinations · Vehicles · Inventory · Spare Parts · Sales · Purchasing · Payments · Open Item Allocations · Settlements · Workshop · Insurance Claims · Fixed Assets · Journal Entries · ZATCA test invoices · Reports / RR-001 · Approval Workflows · Security / Roles.

## 4. Out of Scope for This Draft

No seed SQL · no execution · no raw INSERT · no module-specific assumptions · no staging execution · no production action. This draft only establishes *how* the factory will be built later.

## 5. Golden Rules

1. No raw inserts into financial transaction tables unless proven safe by live schema/workflow evidence.
2. Business documents must be created through workflows/functions/triggers where applicable (never bypass the Posting Engine under test).
3. Every future test record must carry the marker `SARAT_TEST_FACTORY_SEED`.
4. Posted accounting entries must be reversed through the system's reversal workflow, never raw-deleted.
5. Account numbers are evidence only, never logic — resolve by account roles and `account_determinations` (constitution: Evidence/Design/Implementation).
6. Each module requires a Phase A read-only review before any seed design.

## 6. Environment Gate

Before ANY execution, all must hold:

- Confirmed **separate** Supabase staging project.
- Staging project id recorded.
- Production project id recorded — and **different** from staging.
- Git branch and commit recorded.
- Explicit user approval recorded.
- Rollback/reversal plan exists.
- Backup/snapshot taken if available.

If any item is missing → no execution.

## 7. Module-by-Module Method

Each module passes through the same phases (mirroring DEBT-012):

- **Phase A — Read-only review:** schema · triggers · functions · service call-sites · existing live examples · risks.
- **Phase B — Seed design:** scenario matrix · workflow/function to use · direct SQL only where proven safe · expected accounting/inventory impact · cleanup/reversal method.
- **Phase C — Review:** human review; no execution.
- **Phase D — Staging execution:** only after explicit approval, on confirmed staging.
- **Phase E — Validation:** reports · accounting checks · document statuses.
- **Phase F — Cleanup/reversal:** workflow-based where posted entries exist.

No module skips Phase A. No module reaches Phase D without the Environment Gate (§6) satisfied.

## 8. Scenario Matrix Template (empty)

Filled per module during Phase B — not populated here.

| scenario_id | module | business purpose | required live evidence | workflow/function to use | raw SQL allowed? (yes/no/pending) | expected accounting impact | expected inventory impact | cleanup method | risk level | status |
|-------------|--------|------------------|------------------------|--------------------------|-----------------------------------|----------------------------|---------------------------|----------------|-----------|--------|
| — | — | — | — | — | pending | — | — | — | — | Not Reviewed |

**Status values:** Not Reviewed · Read-only Reviewed · Seed Drafted · Ready for Staging Review · Executed on Staging · Validated on Staging.

## 9. Priority Order (safest first)

1. **Sales / Invoices / Payments / Allocations** — large parts already read via DEBT-012 (highest readiness).
2. Purchasing / AP / Vendor Payments.
3. Inventory / Vehicles.
4. Workshop.
5. Insurance Claims.
6. Fixed Assets.
7. Reports / RR.
8. Security / Roles.

Rationale: start where live evidence already exists (Sales), extend outward to modules whose structure is not yet read.

## 10. Relation to DEBT-012 (reference model for the method)

DEBT-012 is the worked example of this method. Its workflow-gap resolution is the template every module must follow:

- **A1 — raw insert risk:** raw INSERT either fires engines with side effects or bypasses them → unrealistic data.
- **A2 — seed via workflow:** business documents go through the system's own functions/triggers.
- **G1 — simple issued invoice:** the minimal, lowest-side-effect document pattern (revenue JE only, no COGS/inventory).
- **G2 — payment JE linkage:** fetch the generated JE (exactly one) and pass it to `create_allocation`; never NULL (that reproduces DEBT-010).
- **G3 — fixture not DB seed:** ambiguous cases the system never produces naturally are unit/fixtures, not posted ledger entries.
- **G4 — payments vs sales_payments:** the real posting table must be identified by live evidence, not assumed.

**Requirement:** every module must reach the same depth of read (schema + triggers + functions + live examples) before any seed is designed for it.

## 11. Proposed Future Files (names only — not created now)

- `SARAT_TEST_FACTORY_00_ENV_GATE.md`
- `SARAT_TEST_FACTORY_01_MODULE_REVIEW_TEMPLATE.md`
- `SARAT_TEST_FACTORY_02_SCENARIO_MATRIX.md`
- `SARAT_TEST_FACTORY_SALES_PHASE_A.md`
- `SARAT_TEST_FACTORY_PURCHASING_PHASE_A.md`
- `SARAT_TEST_FACTORY_INVENTORY_PHASE_A.md`

None created now. Each is authored later, after that module's Phase A.

## 12. Current Status

```
Test Data Factory = Governance Plan Draft Only / Not Executed
No seed SQL created
No DB writes
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
