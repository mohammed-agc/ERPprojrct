# Sarat Test Factory — Reports/RR Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md` §7): views · report functions · reporting impact of known debts · risks. No seed is designed here. This is the seventh module reviewed — the reporting/read layer over the six data modules.

---

## 1. Purpose

Document the Reports/RR Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed.

## 2. Views Evidence

Only 3 views exist in `public`: `customers`, `suppliers` (compatibility views over `contacts`), and `vw_zatca_expiring_credentials` (ZATCA). There are no central financial views for trial_balance, balance_sheet, income_statement, aging, GL, or reconciliation. The financial reporting layer relies on functions plus code/service, not on views alone.

## 3. Report Functions Evidence

- `partner_aging(p_kind, p_as_of)` — partner aging with buckets + total + open item count.
- `partner_balance_summary()` — customer/vendor/net balances per partner.
- `partner_subledger(...)` — detailed partner ledger with running balance (overloaded: with and without `p_kind`).
- `document_clearing_status(...)` — SSOT status (original/cleared/open + document_status).
- `document_allocated(...)` — sum of active allocations for a document.
- `document_remaining(...)` — document total minus allocated.

## 4. partner_aging Evidence

Vendor aging is drawn from `purchase_invoices`; customer aging from `invoices` (UNION ALL, filtered by `p_kind`). The outstanding amount = `document_remaining(...)`. Aging buckets are current / 1-30 / 31-60 / 61-90 / 91-120 / over 120. Aging uses `due_date`/`invoice_date` (via COALESCE). Filters: status not in (cancelled, draft), outstanding > 0.01, partner present. This means DEBT-011 directly affects aging, because the outstanding value flows through `document_remaining`.

## 5. DEBT-011 Reporting Impact

- `partner_aging` uses `document_remaining`.
- `document_clearing_status` uses open-item allocation status/reversal logic.
- Active original + active reversal pairs can distort the outstanding amount and the document status.
- Examples: CLR-2026-00003 + REV-CLR-2026-00003; CLR-2026-00005 + REV-CLR-2026-00005.

This is a confirmation of DEBT-011's impact on the read/reporting side, not a new debt.

## 6. AUDIT-RR-001 Relevance

There is no ready DB function that reconciles GL AR control vs AR invoice open balance vs open allocations. Therefore AUDIT-RR-001 needs an independent query design. A Trial Balance alone is not enough to judge GL / Subledger / Open Items. AUDIT-RR-001 = Redesign In Progress / Not Executed.

## 7. Scenario Matrix (outline — filled in Phase B, not now)

| report | source | DEBT-011 affected? |
|--------|--------|--------------------|
| partner aging | invoices/purchase_invoices + document_remaining | yes |
| document clearing status | open_item_allocations | yes |
| partner balance summary | partner-level balances | needs Phase B / service review |
| partner subledger | journal_entry_lines / running balance | GL-side report |
| trial balance | likely code/service over journal_entry_lines | R-RR2 candidate |
| AUDIT-RR-001 | custom reconciliation design | not executed |

## 8. Risks / Candidates

- **R-RR1 (= DEBT-011):** DEBT-011 reporting impact confirmed (partner_aging + document_clearing_status).
- **R-RR2 (candidate):** Trial Balance / Balance Sheet / Income Statement are not DB functions/views; likely code/service. Candidate for an SSOT review (does the code apply the same classification logic centrally?).
- **R-RR3 (note):** aging / open amount is derived from invoice total and `document_remaining`, not a stored SAP-style open amount.

Note: R-RR1 is part of DEBT-011, not a new debt.

## 9. Recommendation

Reports/RR Phase A is Read-only Reviewed: the views (3 only), the report functions (aging / balance / subledger / clearing status), the reporting impact of DEBT-011, and the AUDIT-RR-001 context are all read. Document now. Phase B should inspect the service/code for Trial Balance, Balance Sheet, Income Statement, and the Reports Center. Do not execute RR-001 yet. Do not issue PASS/FAIL.

## 10. Status

```
Reports/RR Phase A = Read-only Reviewed / No seed designed / Not Executed
AUDIT-RR-001 = Redesign In Progress / Not Executed
DEBT-011 = Confirmed live / impacts document_remaining, partner_aging, and document_clearing_status
DEBT-012 = High / Active GL Impact / Not Implemented
Candidates = R-RR2 / R-RR3
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
