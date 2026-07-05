# Sarat Test Factory — Phase B Seed Design Framework

**Status:** Seed Design Framework only / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document defines the unified methodology for designing seed scenarios per module, before any real seed is written. It is a framework only — not a seed for a specific module, not execution, not staging, not remediation.

---

## 1. Purpose

- Phase B = Seed Design only.
- Phase B does not mean execution.
- Execution is deferred until staging confirmation.
- The goal is to unify how scenarios, data, and verification are designed across all modules.

## 2. Governance Rules

- Evidence Before Seed.
- Schema Before SQL.
- Workflow Before Data.
- Staging Before Execution.
- Plan ≠ Authorization.
- Draft ≠ Migration.
- No DB writes.
- No PASS / FAIL.

## 3. Seed Design Template

Each seed scenario must document:

- Scenario ID.
- Business purpose.
- Module.
- Related Phase A evidence.
- Required master data.
- Required transaction data.
- Dependencies.
- Workflow path.
- Expected document flow.
- Expected accounting impact (if any).
- Expected open-item impact (if any).
- Expected reporting impact (if any).
- Safety gates.
- Rollback / cleanup strategy.
- Execution status = Not executed.

## 4. Safety Gates

Mandatory gates before any execution:

- Confirm staging environment.
- Confirm database target.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls unless explicitly authorized.
- Confirm no production/customer real data.
- Confirm dry-run / read-only review before execution.
- Confirm rollback approach.
- Confirm PASS/FAIL only after execution evidence.

## 5. Scenario Classification

Scenarios are classified as:

- Master-data seed.
- Transaction seed.
- Accounting-impact seed.
- Open-item seed.
- Reporting-read seed.
- Approval-workflow seed.
- ZATCA sandbox-artifact review only.
- Negative / guard test.
- Regression test.

## 6. Data Naming Convention

Safe naming:

- Prefix: `TDF-`
- Module code: SALES, PAY, OI, PUR, INV, JE, FA, RR, APPR, ZATCA.
- Examples: `TDF-SALES-B01`, `TDF-PAY-B01`, `TDF-OI-B01`.
- Do not use production invoice numbers.
- Do not use real customer names.

## 7. Phase B Module Order

Adopting the consolidated review order:

1. Sales + Payments + Open Items.
2. Purchasing + AP limitation documentation.
3. Inventory vehicle lifecycle.
4. Journal Entries safety tests.
5. Reports/RR read consistency.
6. Approval workflow request lifecycle.
7. ZATCA sandbox artifact/submission replay — review only, no external call.
8. Fixed Assets lifecycle.

## 8. First Phase B Target

The first practical seed design will be Sales + Payments + Open Items.

It is not designed here. It will be the next file:

`docs/SARAT_TEST_FACTORY_SALES_PAYMENTS_OPEN_ITEMS_PHASE_B_SEED_DESIGN.md`

## 9. Non-Authorization Statement

This framework does not authorize:

- seed execution.
- DB writes.
- staging execution.
- migrations.
- remediation.
- production changes.
- external ZATCA calls.
- PASS / FAIL judgment.

## 10. Status

```
Phase B = Seed Design Framework only
Phase B seed scenarios = Not yet designed
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
