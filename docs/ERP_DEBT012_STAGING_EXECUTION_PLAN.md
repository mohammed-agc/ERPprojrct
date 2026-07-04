# DEBT-012 Staging Execution Plan — Draft (Planning Only / Do Not Execute)

**Status:** Draft. Planning only. No DB change, no code change, no migration execution, no remediation, no commit, no PASS/FAIL.
**Date:** 2026-07-04
**Scope:** staging only. Production is never touched by this plan. Historical data fix remains a separate, independently-approved step.
**Reference:** `docs/ERP_DEBT012_REMEDIATION_DESIGN.md` (functional design + resolved decisions).

> **This plan is not an execution authorization.**
> **This plan does not approve production remediation.**
> **All execution must occur on staging first and requires a separate explicit approval.**

---

## 1. Purpose and Scope

Turn the DEBT-012 remediation design into an ordered, executable plan **for staging only**. The functional defect: cancelling a sales invoice that has prior payment/settlement effects leaves the prior AR credit posted with no offsetting GL leg (negative AR control). The remediation adds a GL clearing step (payment → Customer Deposits; settlement → reverse settlement) plus an allocation-aware cancellation guard.

In scope: prerequisites (determination key + seed data), function change drafts, guard/posting logic, the eight test cases, and RR-001 staging validation. Out of scope: production execution, historical `-174,025` correction (deferred, separate approval), and any PASS/FAIL judgment prior to staging evidence.

## 2. Current Evidence Baseline

Confirmed by live reads (2026-07-04):

- **Account determination gap:** `CUSTOMER_DEPOSITS` (or equivalent) does NOT exist in `account_determinations`. Present keys: `CUSTOMER_PAYMENT_RECEIVE` (→ cash/bank), `SUPPLIER_PAYMENT_PAY`. The Customer-Deposits account exists in the chart of accounts (live evidence: `2141`, `requires_partner=true`) but is not linked via a determination key.
- **Settlement counter-account:** resolved from the original settlement JE (via allocation `journal_entry_id`); no determination key needed. Live evidence: all current settlement entries are clean two-line (one entry, `line_count=2`, `non_ar=1`).
- **AR control:** resolved from the cancelled invoice's own posting; no determination key needed.
- **Test data gap:** only active unpaid invoices exist (ZINV-TEST-001/002/003, `issued`, no payments/allocations). All paid/settled invoices are already `cancelled` (they are the historic cases that revealed DEBT-012). 6 of 8 test cases need fresh seed data.
- **Partner tracking:** `journal_entry_lines` carries `contact_id` + `partner_type`; the deposits account `requires_partner`.

Governing principle (constitution): Evidence may mention account numbers; Design uses account roles; Implementation uses account determination. Account codes below (`1131/2111/2141/1111`) are evidence examples for the current company, never constants.

## 3. Phase 0A — Account Determination Prerequisites

- Add a `CUSTOMER_DEPOSITS` (or equivalently-named) `account_determination` key **on staging**, resolving to the company's customer-deposits/liability account by role — NOT hardcoded.
- The resolved account must support partner tracking (`requires_partner`, or at minimum accept `contact_id`/`partner_type`).
- Validation: after seeding the key, a resolution query must return exactly one deterministic account for the company/branch context.
- Deployment guard: if this key is missing at deploy time (e.g. in production later), the deployment/remediation must **block**, not fall back to a constant.
- Settlement leg and AR control require NO new key (resolved from original JEs) — documented so no one adds redundant keys.

## 4. Phase 0B — Staging Test Data Seed Plan

Seed on **staging only** (production untouched). Build one dataset per test case:

1. **Active unpaid invoice** — reuse a ZINV-style active issued invoice (no payment/allocation).
2. **Fully paid cash invoice** — active invoice + one full payment via the `payments` table (cash) + a PAYMENT `open_item_allocation`. NOTE (G4/A2): payments seed into `payments` (whose AFTER INSERT trigger posts the payment JE), NOT `sales_payments` (secondary/legacy). The PAYMENT allocation is created via `create_allocation`.
3. **Partially paid cash invoice** — active invoice + partial payment in `payments` + a partial PAYMENT allocation via `create_allocation`.
4. **Invoice settled against AP** — seed a customer AR balance (sales invoice) + a supplier AP balance (purchase invoice) for the same contact, then call `create_partner_settlement` (which builds the two-line settlement JE and the SETTLEMENT allocations). Do not hand-build the settlement JE.
5. **Payment + settlement (mixed)** — active invoice carrying both a PAYMENT (via `payments` + `create_allocation`) and a SETTLEMENT (via `create_partner_settlement`).
6. **Already-cancelled invoice (idempotency)** — an invoice already cancelled once, to prove no duplicate treatment legs.
7. **Unclear/multi-line settlement counter** — a settlement JE deliberately built multi-line (or with missing `journal_entry_id`) to exercise the block/manual-review path. This is the one case that needs a hand-built JE outside `create_partner_settlement` (which only ever builds clean two-line entries).
8. **RR-001 validation dataset** — the aggregate state after the above, used to re-run RR-001 and observe variance behavior.

Seed via workflow, not raw insert (A2): reference data (contacts, determinations) may be inserted directly; business documents (invoices, payments, allocations, settlements) go through the existing triggers/functions (`payments` trigger, `create_allocation`, `create_partner_settlement`) so the seed mirrors real system behavior rather than bypassing the engines under test.

## 5. Phase 1 — Migration / Function Change Draft

Draft only (no execution). Affected objects:

- `can_cancel_sales_invoice` — extend guard (Phase 2).
- `cancel_sales_invoice` — add F5.7 GL clearing step (Phase 3).
- Helper(s) as needed: an account-resolution helper (determination lookup) and a settlement-counter resolver (reads the original settlement JE). Helpers keep the main functions readable and are individually testable.

Migration is idempotent (`CREATE OR REPLACE`, guarded), developed on staging, and reviewed (SQL review) before any apply. No production apply in this plan.

## 6. Phase 2 — Guard Logic Plan (can_cancel_sales_invoice)

Replace the payments-only check with allocation-aware logic:

- Inspect the `payments` table (source of truth for real payments — G4) AND active, unreversed `open_item_allocations` (`reverses_allocation_id IS NULL`) targeting the invoice, of types PAYMENT and SETTLEMENT (plus the existing delivered/credited/JE-present checks). Do NOT use `sales_payments` (secondary/legacy; the current guard's `sales_payments` check is the G4 defect — it reads 0 for real payments).
- For each allocation, determine treatment resolvability:
  - PAYMENT → the Customer-Deposits determination key must resolve. If missing → **block** (`CANCELLATION_REQUIRES_DEPOSITS_ACCOUNT` or similar).
  - SETTLEMENT → the original settlement JE and a single clear counter-account must be resolvable. If multi-line / partial / unclear / missing `journal_entry_id` → **block / manual review**.
- Decision: all resolvable → allow; any unresolvable → block with a specific reason and the offending allocation id.
- Existing guards (not issued / already credited / revenue-JE missing / COGS-JE missing / vehicle delivered) remain.

## 7. Phase 3 — Posting Logic Plan (F5.7 GL Clearing)

New step in `cancel_sales_invoice`, after F5.2 revenue reversal, iterating active original allocations:

```
resolve ar_control := AR control account from the cancelled invoice's own posting
FOR each active allocation (reverses_allocation_id IS NULL) on the invoice:
  IF PAYMENT:
     resolve deposits := account_determinations CUSTOMER_DEPOSITS (company/branch)
     post Dr ar_control / Cr deposits  for allocated_amount
          line carries contact_id + partner_type='customer'
          source_type = 'invoice_cancellation_payment_reclass'
  ELSIF SETTLEMENT:
     resolve counter := non-AR-control line of the original settlement JE (via journal_entry_id)
     post Dr ar_control / Cr counter  for allocated_amount
          carry contact/partner where applicable
          source_type = 'invoice_cancellation_settlement_reversal'
  IF any required account unresolved → abort whole cancellation (guard should have caught earlier)
END FOR
```

No hardcoded account numbers. Live codes cited only as evidence examples. Each treatment JE links cancelled_invoice_id + original_allocation_id + original_journal_entry_id + treatment_type.

## 8. Phase 4 — Open Item Behavior

- F5.5 (Open Item `REV-*` rows) is retained unchanged — it is the subledger reversal.
- F5.7 adds the parallel **GL** layer that was missing. Subledger says "allocation reversed"; GL says "AR credit cleared to deposits / counter."
- `REV-*` row and F5.7 JE cross-reference via `original_allocation_id`. F5.5 is NOT removed.

## 9. Phase 5 — Test Cases (8)

Each case: setup → expected GL → expected open items → expected document status → expected RR-001 effect → failure conditions.

1. **Cancel unpaid** — setup: active unpaid. GL: revenue/COGS/inventory reversal only, no clearing legs. Open items: none. Status: cancelled. RR-001: no residual for this invoice. Fail if any clearing leg is posted.
2. **Cancel fully paid cash** — setup: active + full cash payment. GL: one `payment_reclass` (Dr AR / Cr deposits); cash untouched. Open items: REV-* for the PAYMENT. Status: cancelled, AR nets 0. RR-001: no residual. Fail if cash is reduced or AR ≠ 0.
3. **Cancel partially paid cash** — setup: active + partial payment. GL: reclass for paid portion; revenue reversal covers the rest. Open items: REV-* for the partial PAYMENT. Status: cancelled, AR nets 0. Fail if reclass ≠ paid portion.
4. **Cancel settled-against-AP** — setup: active + SETTLEMENT (two-line JE). GL: one `settlement_reversal` (Dr AR / Cr counter); AP restored. Open items: REV-* for the SETTLEMENT. Status: cancelled, AR nets 0. Fail if counter ≠ original counter or AP not restored.
5. **Cancel payment + settlement** — setup: active + both. GL: one reclass + one reversal. Open items: REV-* for both. Status: cancelled, AR nets 0. Fail if either leg missing/incorrect.
6. **Cancel already-cancelled (idempotency)** — setup: invoice cancelled once. Guard blocks re-entry; no duplicate clearing legs. Fail if a second treatment leg is posted.
7. **Unresolvable settlement counter** — setup: multi-line/unclear settlement. Guard blocks with manual-review reason; nothing posted. Fail if cancellation proceeds or partial legs posted.
8. **RR-001 after remediation** — setup: aggregate post-remediation state. Expect `variance_trade_only` to collapse toward zero (within tolerance) for the new (non-historical) cases. Fail if new cancellations still create orphan AR credits.

## 10. Phase 6 — RR-001 After-Remediation Validation

- Run the RR-001 design query (from `docs/ERP_AUDIT_REGISTER.md`) on **staging only**, after remediation + seed.
- Expectation: the variance previously caused by DEBT-012 reduces or disappears for the newly-cancelled test invoices. Historical production variance is NOT addressed here (functional remediation prevents future contamination only).
- No production PASS/FAIL. Staging result is diagnostic evidence that the fix behaves as designed.

## 11. Rollback / Safety Plan

- **Function rollback:** keep the prior definitions of `can_cancel_sales_invoice` / `cancel_sales_invoice`; a rollback migration restores them (they are `CREATE OR REPLACE`).
- **Seed cleanup:** the staging seed script has a paired teardown to remove test invoices/payments/allocations/JEs.
- **No production data reversal:** this plan never reverses historical production data. The historical `-174,025` fix remains a separate, independently-approved step.
- **Treatment JEs are reversible** in principle (standard JE reversal) if a defect is found post-implementation on staging.

## 12. Go / No-Go Checklist

Proceed to (a later, separately-approved) production step ONLY if, on staging:

- [ ] All required account determinations exist and resolve deterministically (CUSTOMER_DEPOSITS present).
- [ ] Partner tracking works (deposits lines carry contact_id + partner_type; no anonymous deposits balance).
- [ ] All 8 test cases pass on staging.
- [ ] RR-001 staging result is understood (variance behavior matches design).
- [ ] No anonymous customer-deposits balances (every deposits line partner-tracked).
- [ ] No duplicate treatment entries (idempotency holds).
- [ ] Manual-review blocks work (unresolvable counter / missing key → blocked, nothing posted).

Any unchecked item = No-Go.

## Judgment (unchanged)

```
DEBT-012 = High / Active GL Impact / Remediation Design Drafted / Not Implemented
Staging Execution Plan = Draft
Historical Data Fix = Deferred until staging remediation passes / Separate Approval Required
No remediation · No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
