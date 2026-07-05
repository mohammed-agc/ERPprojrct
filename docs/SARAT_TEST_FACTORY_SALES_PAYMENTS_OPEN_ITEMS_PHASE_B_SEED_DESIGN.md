# Sarat Test Factory — Sales + Payments + Open Items (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the first practical application of the Phase B Seed Design Framework (`SARAT_TEST_FACTORY_PHASE_B_SEED_DESIGN_FRAMEWORK.md`), covering the first item in the Phase B order (§8): Sales + Payments + Open Items. It designs scenarios only — it does not execute any seed, write to any database, or issue a PASS/FAIL. It deliberately covers both the healthy path and the scenarios that expose the known live debts DEBT-011 and DEBT-012, so the seed is a detector, not a mask.

---

## 1. Purpose

- Design safe seed scenarios for the Sales → Payments → Open Items cycle.
- Cover the healthy path and the debt-exposing paths (DEBT-011, DEBT-012).
- Seed Design only. No execution. Execution deferred until staging confirmation.
- The seed must reveal known defects, never assume corrected behaviour where a live defect is documented.

## 2. Phase A Evidence Basis

From the nine module Phase A reviews:

- Sales: `SalesOrderDetail.tsx:315` inserts `invoices` at status `issued`; `invoice_lines.vehicle_id` is nullable (COGS vs simple line).
- Payments: `payments` posts via `trg_payment_journal_entry` (AFTER INSERT) as Dr cash / Cr AR; `payments` has no `journal_entry_id` column, no `approval_status`, no `company_id`.
- Open Items: `open_item_allocations` is the link layer; `journal_entry_id` nullable (DEBT-010), `reverses_allocation_id` nullable (DEBT-011).
- DEBT-011 (confirmed live): `document_allocated`/`document_remaining` sum original + reversal positively without checking `reverses_allocation_id`; affects `partner_aging` and `document_clearing_status`.
- DEBT-012 (confirmed live): cancelled paid/settled invoices leave prior AR credits in GL; the corrected guard must inspect `payments` + `open_item_allocations`, not `sales_payments`.

## 3. Master Data (design — not executed)

- Test customer: `TDF-SALES-CUST-01` (a contact of customer type). No real customer name.
- One vehicle item in `inventory_items` with `item_type='vehicle'`, status `active`, `qty_on_hand=1` — for the simple-invoice scenarios, use a non-vehicle/simple line to avoid COGS unless a scenario explicitly needs it.
- Accounts referenced by role only (per the constitution): AR = 1131, cash = 1111, customer deposits = 2141, AP = 2111. Implementation must resolve these via account determination, not literals.

## 4. Scenario Set

### TDF-SPO-B01 — Healthy simple invoice (baseline)

- Classification: transaction + accounting.
- Flow: create sales order → issue simple invoice (no vehicle line, revenue only).
- Expected accounting: Dr 1131 (AR) / Cr revenue + Cr VAT output.
- Expected open-item: one OPEN document, `open_amount = total`.
- Expected reporting: appears in `partner_aging` current bucket at full outstanding.
- Purpose: establish the correct baseline before any payment.

### TDF-SPO-B02 — Full payment + allocation (healthy clearing)

- Classification: transaction + accounting + open-item.
- Flow: for TDF-SPO-B01, INSERT into `payments` (trigger posts Dr 1111 / Cr 1131) → create allocation type `PAYMENT` linked to the payment's journal entry.
- Expected accounting: cash increases, AR reduces.
- Expected open-item: document moves OPEN → CLEARED; `cleared_amount = total`, `open_amount = 0`.
- Expected reporting: leaves `partner_aging` (outstanding = 0).
- Purpose: prove the healthy clearing path end to end.

### TDF-SPO-B03 — Partial payment (partial clearing)

- Classification: transaction + open-item.
- Flow: partial payment against TDF-SPO-B01.
- Expected open-item: PARTIALLY_CLEARED; `open_amount = total − partial`.
- Expected reporting: reduced outstanding in aging.
- Purpose: prove partial-clearing arithmetic without reversal.

### TDF-SPO-B04 — Reversal pair (DEBT-011 exposure)

- Classification: open-item + negative / debt-exposing.
- Flow: an active allocation plus its active reversal (a `reverses_allocation_id` pair), mirroring the live CLR / REV-CLR pattern.
- **Known-defect expectation (DEBT-011):** `document_allocated`/`document_remaining` currently sum original + reversal positively without checking `reverses_allocation_id`, so `partner_aging` outstanding and `document_clearing_status` will be distorted.
- Design note: this scenario is a detector for DEBT-011. It must not be written to assume corrected behaviour. The expected result is the distorted output, documented as the current defect.
- Purpose: make DEBT-011's reporting impact reproducible for a future fix's before/after.

### TDF-SPO-B05 — Cancel a paid invoice (DEBT-012 exposure)

- Classification: accounting + negative / debt-exposing.
- Flow: a paid invoice (payment in `payments`, GL posted) then a cancellation.
- **Known-defect expectation (DEBT-012):** cancellation does not create the reversing GL entry for the prior payment, and the guard historically inspected `sales_payments` (empty) rather than `payments`; an AR residual remains in 1131.
- Design note: detector for DEBT-012. Expected result is the residual, documented as the current defect, not a clean cancellation.
- Purpose: make DEBT-012's GL impact reproducible for the remediation's before/after.

### TDF-SPO-B06 — Guard/negative checks

- Classification: negative / guard.
- Flow: attempt operations that should be blocked (e.g. cancel where a delivered vehicle requires goods return).
- Expected: the guard blocks with the documented Arabic error code.
- Purpose: confirm guards fire as designed.

## 5. Dependencies

- TDF-SPO-B02/B03 depend on TDF-SPO-B01.
- TDF-SPO-B04 depends on an allocation existing (B02 or B03).
- TDF-SPO-B05 depends on a paid invoice (B02).
- Master data (section 3) precedes all.

## 6. Expected Impact Summary

| Scenario | Accounting | Open-item | Reporting | Debt exposed |
|----------|------------|-----------|-----------|--------------|
| B01 | Dr AR / Cr rev+VAT | OPEN | aging current | — |
| B02 | Dr cash / Cr AR | CLEARED | leaves aging | — |
| B03 | partial Dr cash / Cr AR | PARTIALLY_CLEARED | reduced aging | — |
| B04 | (allocation layer) | distorted | distorted aging + clearing | DEBT-011 |
| B05 | residual in AR | stale | stale outstanding | DEBT-012 |
| B06 | none (blocked) | none | none | — (guard) |

## 7. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / customer real data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 8. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- Posted journal entries are immutable (Posting Engine guards); cleanup of posted entries requires un-posting first, per the documented Posting Engine behaviour — to be handled only in confirmed staging, never production.
- Cleanup order reverses creation order (allocations → payments → invoices → master data).
- No cleanup is executed here; this is design only.

## 9. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation, production changes, external ZATCA calls, or PASS/FAIL judgment.

## 10. Status

```
Sales + Payments + Open Items Phase B Seed Design = Designed / Not executed
Scenarios = TDF-SPO-B01..B06 (B04 exposes DEBT-011, B05 exposes DEBT-012)
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
DEBT-011 = Confirmed live / impacts reporting (B04 detector)
DEBT-012 = High / Active GL Impact / Not Implemented (B05 detector)
Posting Engine = Under Audit / Partially Audited
```
