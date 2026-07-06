# Sarat Test Factory — Reports / RR Read Consistency (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the fifth item in the Phase B order (§8): Reports/RR read consistency. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. Reports/RR differs fundamentally from items 1–4: it is a **read layer**. It creates no data of its own; it reads the data produced by items 1–4 and asserts that the reporting functions and financial statements reflect that data faithfully — and exposes where they do not (DEBT-011 distorts aging and clearing).

---

## 1. Purpose

- Design read-consistency scenarios over the data produced by items 1–4 (no new transactional data here).
- Assert that the reporting functions (aging, balance summary, subledger, clearing status) and the financial statements (TB/BS/IS SSOT) reflect the underlying journal/open-item data.
- Expose where the read is distorted: DEBT-011 on `partner_aging` and `document_clearing_status`; observe R-RR2b (cashFlow hardcoded accounts).
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from REPORTS/RR review, commit 6498be0 + R-RR2 appendix d4f30b9)

- Only 3 views exist: `customers`, `suppliers` (compatibility from `contacts`), and `vw_zatca_expiring_credentials`.
- Reporting functions: `partner_aging(p_kind, p_as_of)` (6 buckets; outstanding = `document_remaining` = DEBT-011; age from due_date/invoice_date), `partner_balance_summary()` (customer/vendor/net), `partner_subledger` (overloaded, running_balance, GL-side), `document_clearing_status` (SSOT status, DEBT-011), plus `document_allocated`/`document_remaining` (DEBT-011).
- 🔴 DEBT-011 impacts the read: `partner_aging` outstanding and `document_clearing_status` both consume `document_remaining`, which sums original + reversal positively without checking `reverses_allocation_id` (R-RR1).
- 🟢 R-RR2 = Resolved / Centralized SSOT: TB / BS / IS live in `src/services/erp/accounting.ts` — `listAccounts` + `accountBalances(from,to)` (reads `journal_entry_lines` + `is_posted` into a Map) + `naturalBalance(type,d,c)` ((asset|expense)? d−c : c−d). cashFlow has hardcoded account codes 1101/1102 (R-RR2b, the notable candidate). Also R-RR2a/c/d, R-RR3.

## 3. Read-Layer Nature Statement (explicit)

This is the governing distinction for this item:

- Unlike items 1–4, Reports/RR writes nothing. Its scenarios are **assertions over existing data**, not inserts.
- Each scenario reads a report/function/statement after a known state produced by items 1–4, and asserts the read matches the expectation.
- Two things are exposed as reads, not as new defects: DEBT-011 (distorted aging/clearing over a reversal pair) and R-RR2b (cashFlow hardcoded accounts). Documenting them here does not change their status.

## 4. Master Data (design — not executed)

- No new master data. This item consumes the master + transaction data of items 1–4 (the customer, vehicle, invoices, payments, allocations, journal entries already designed there).
- Accounts referenced by role only (per the constitution). Implementation must resolve via account determination, not literals.

## 5. Scenario Set

### TDF-RR-B01 — Aging reflects an open invoice (partner_aging)

- Classification: reporting-read.
- Precondition: item 1's TDF-SPO-B01 (a healthy OPEN invoice).
- Flow: call `partner_aging('customer', as_of)`.
- Expected: the customer appears with outstanding = the invoice total, in the correct age bucket.
- Purpose: confirm aging reflects an open item faithfully.

### TDF-RR-B02 — Aging reflects a cleared invoice (partner_aging)

- Classification: reporting-read.
- Precondition: item 1's TDF-SPO-B02 (full payment → CLEARED).
- Flow: call `partner_aging('customer', as_of)`.
- Expected: the customer's outstanding for that invoice is 0 (leaves the aging).
- Purpose: confirm clearing is reflected in the read.

### TDF-RR-B03 — Partial reflected in aging (partner_aging)

- Classification: reporting-read.
- Precondition: item 1's TDF-SPO-B03 (partial → PARTIALLY_CLEARED).
- Flow: call `partner_aging`.
- Expected: outstanding = total − partial.
- Purpose: confirm partial-clearing read arithmetic.

### TDF-RR-B04 — Distorted aging over a reversal pair (DEBT-011 read exposure)

- Classification: reporting-read + debt-exposing.
- Precondition: item 1's TDF-SPO-B04 (an active allocation + its active reversal).
- Flow: call `partner_aging` and `document_clearing_status`.
- **Known-defect expectation (DEBT-011 / R-RR1):** because `document_remaining` sums original + reversal positively (no `reverses_allocation_id` check), the outstanding and the clearing status are distorted — the read does not reflect the true net position.
- Design note: this scenario is the read-side detector for DEBT-011. It must document the distorted read as the current reality, not assume a corrected net.
- Purpose: make DEBT-011's reporting impact reproducible for a future fix's before/after.

### TDF-RR-B05 — Balance summary and subledger consistency

- Classification: reporting-read.
- Precondition: items 1's invoices/payments.
- Flow: call `partner_balance_summary()` and `partner_subledger(...)`.
- Expected: the summary's customer/vendor/net agrees with the subledger running_balance for the same partner (subject to the same DEBT-011 caveat where a reversal pair is involved).
- Purpose: confirm cross-function read consistency and note the shared DEBT-011 dependency.

### TDF-RR-B06 — TB/BS/IS SSOT reflect posted entries (R-RR2)

- Classification: reporting-read.
- Precondition: items 1–4's posted journal entries.
- Flow: exercise `accountBalances` / trialBalance / balanceSheet / incomeStatement from `accounting.ts`.
- Expected: TB nets to zero; BS balances (retained = Σrev − Σexp); IS reflects the posted revenue/COGS. All derived from `journal_entry_lines` + `is_posted` (only posted entries count).
- Design note: confirms R-RR2 is the centralized SSOT (already Resolved), reading posted entries only.
- Purpose: confirm the financial statements read the posting layer faithfully.

### TDF-RR-B07 — cashFlow hardcoded accounts (R-RR2b observation)

- Classification: reporting-read + observation.
- Flow: exercise the cashFlow function and observe the hardcoded 1101/1102 account codes.
- **Observation (R-RR2b):** cashFlow references specific account codes literally rather than via account determination; on an install whose cash accounts differ, the read would misattribute. This is the notable R-RR2 candidate.
- Design note: observation of the candidate, not a guard test; documents R-RR2b, does not change its status.
- Purpose: record the hardcoded-account read behaviour for the candidate register.

## 6. Dependencies

- Every scenario depends on the corresponding item-1..4 data existing first (this item reads, it does not create).
- TDF-RR-B04 depends specifically on item 1's reversal-pair scenario (TDF-SPO-B04).
- TDF-RR-B06 depends on posted entries from items 1–4.

## 7. Expected Impact Summary

| Scenario | Reads | Expected | Debt/candidate exposed |
|----------|-------|----------|-------------------------|
| B01 | partner_aging | open outstanding shown | — |
| B02 | partner_aging | cleared → leaves aging | — |
| B03 | partner_aging | partial outstanding | — |
| B04 | partner_aging + clearing_status | distorted (net not reflected) | DEBT-011 / R-RR1 |
| B05 | balance_summary + subledger | cross-consistent (DEBT-011 caveat) | — (shared dep) |
| B06 | TB/BS/IS (accounting.ts) | TB=0, BS balances, IS posted | — (R-RR2 Resolved) |
| B07 | cashFlow | hardcoded 1101/1102 | R-RR2b |

This item's column is "Reads" — reflecting that Reports/RR asserts over existing data rather than creating it. No row is written by any scenario.

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / real financial data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach (trivial here — read-only, nothing to roll back).
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- This item is read-only: its scenarios write nothing, so there is nothing to clean up for the reports themselves.
- The underlying data belongs to items 1–4; its cleanup is governed there.
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation, production changes, external ZATCA calls, or PASS/FAIL judgment. Observing DEBT-011/R-RR1/R-RR2b here does not change their status or schedule a fix.

## 11. Status

```
Reports / RR Read Consistency Phase B Seed Design = Designed / Not executed
Scenarios = TDF-RR-B01..B07 (read-only; B04 exposes DEBT-011 on the read, B07 observes R-RR2b)
Read layer — asserts over items 1–4 data, creates nothing
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
DEBT-011 = distorts partner_aging + document_clearing_status (R-RR1, read exposure)
R-RR2 = Resolved / Centralized SSOT (accounting.ts); R-RR2b = cashFlow hardcoded 1101/1102 (observed)
Posting Engine = Under Audit / Partially Audited
```
