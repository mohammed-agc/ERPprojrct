# DEBT-012 Remediation Design — Draft (Design Only / Do Not Implement)

**Status:** Design Only. No DB change, no code change, no migration, no remediation, no commit.
**Date:** 2026-07-04
**Policy selected by owner:** Payment leg → Reclassify to Customer Deposits (2141). Settlement leg → Reverse Settlement (restore original counter-account). The two paths are NOT unified.

---

## 1. Problem Statement

When a sales invoice that already has payment or settlement effects is cancelled, `cancel_sales_invoice` reverses the invoice revenue (via credit note) and creates Open Item reversal rows (`REV-*`), but does NOT create any GL treatment for the prior payment/settlement entries that credited AR (`1131`). The prior credit remains posted with no offsetting debit, producing a negative AR control balance (live: `-174,025` on `1131`).

## 2. Existing Defective Behavior

- `cancel_sales_invoice` performs F5.2 revenue reversal, F5.3 COGS reversal, F5.4 inventory reversal, F5.5 Open Item reversal (`REV-*`), F5.6 governance — but has **no GL leg** for prior payment/settlement.
- `can_cancel_sales_invoice` guards only on `SUM(sales_payments.amount) > 0`. It does not inspect `open_item_allocations` for `SETTLEMENT` allocations, so settlement-only invoices (e.g. INV-2026-0001) pass the guard and get cancelled, leaving the AP↔AR contra half-undone.
- Net effect (INV-2026-0002, cash): invoice `+57,500` / payment `−57,500` (JE-0006 stays) / revenue reversal `−57,500` = `−57,500` residual.
- Net effect (INV-2026-0001, settlement): invoice `+129,425` / settlement `−129,425` (JE-0004 stays) / revenue reversal `−129,425` = `−129,425` residual.

## 3. Accounting Policy Decision (owner-confirmed)

- **Cash payment received then invoice cancelled:** the cash physically entered the treasury and is still held by the company. Do NOT reverse the original cash receipt (do not reduce `1111`). Instead reclassify the amount from AR to a customer credit liability. The customer holds a deposit balance to be used on a later invoice or refunded later via a separate voucher/refund process.
- **Settlement (contra AR↔AP) then invoice cancelled:** the settlement was not cash — it was a mutual offset between the party's AR (`1131`) and AP (`2111`) balances. When the invoice disappears, the offset's basis disappears, so the settlement must be reversed and the AP restored to its prior state.

## 3a. Account Resolution Policy (governing constraint)

**Governing principle (three layers):**
- **Evidence** may mention account numbers (they are what was observed live).
- **Design** must use account roles (AR control, Customer Deposits, settlement counter-account).
- **Implementation** must use account determination (dynamic resolution at run time).

The account codes `1131`, `2111`, `2141`, `1111` that appear throughout this document are **Live Evidence from the current company's database only**. They are NOT design constants and MUST NOT be hardcoded.

1. **No hardcoded account codes** in posting or remediation logic.
2. Account numbers and names are **company-specific** and may differ between companies (the product is installable by any customer).
3. Posting logic MUST resolve accounts **dynamically** through: the original journal entry lines; `account_determinations`; account role / account type / nature; and `company_id` / `branch_id` context.
4. Live account codes such as `1131`, `2111`, `2141`, `1111` may be cited **only as evidence examples** from the current database — never as constants.
5. If required accounts cannot be resolved **deterministically**, cancellation MUST be blocked and routed to manual review (no guessing, no fallback constant).

**Evidence mapping (current live DB only — examples, not constants):**
- `1131` = AR — Customers (Vehicles)
- `2141` = Customer Deposits
- `2111` = AP — Vendor (Vehicles)
- `1111` = Main Cash (treasury)

All treatment logic below is written in terms of **resolved roles**, not codes.

## 4. Payment Cancellation Treatment

For each active `PAYMENT` allocation on the cancelled invoice:

```
Dr  <original AR control account resolved from the cancelled invoice posting>   <allocation amount>
Cr  <Customer Deposits account resolved from account_determinations key CUSTOMER_DEPOSITS>   <allocation amount>
```

- The original cash receipt (original treasury debit / AR credit) is left untouched — cash is real and still held.
- The AR debit offsets the credit that the credit-note revenue reversal will leave, so AR nets to zero for this invoice.
- Net result: AR = 0 after cancellation; cash unchanged; customer has a Customer-Deposits credit balance.
- *(Live evidence example: `Dr 1131 / Cr 2141`, with original receipt `Dr 1111 / Cr 1131` untouched — example, not constant.)*

## 5. Settlement Cancellation Treatment

For each active `SETTLEMENT` allocation on the cancelled invoice, reverse the original settlement entry:

```
Dr  <original AR control account resolved from the cancelled invoice posting>   <allocation amount>
Cr  <original settlement counter-account resolved from the original settlement journal entry>   <allocation amount>
```

- The counter-account MUST be resolved from the original settlement journal entry, NEVER hardcoded. (The current company's settlements happen to use an AP account, but other companies may use a different liability/counter account.)
- Resolution approach: from the `SETTLEMENT` allocation, follow `journal_entry_id` to the original settlement JE, then take the line whose account is NOT the AR control account as the counter-account (the debit side of the original settlement).
- *(Live evidence example — original JE-2026-0004: `Dr 2111 / Cr 1131`; reversal: `Dr 1131 / Cr 2111` — example, not constant.)*

## 6. Mixed Payment + Settlement Scenario

An invoice may carry multiple allocations of mixed types (payment + settlement, partial payments, multiple settlements). The design treats **each active original allocation independently by its type**:

```
PAYMENT    allocation → Dr <resolved AR control> / Cr <resolved Customer Deposits>
SETTLEMENT allocation → Dr <resolved AR control> / Cr <resolved original counter-account>
```

The sum of all reclass/reversal debits to the AR control account equals the sum of prior allocation credits, so combined with the revenue reversal the invoice's AR nets to zero regardless of how many allocations of which types existed.

## 7. Guard Logic in can_cancel_sales_invoice (design)

Replace the payments-only guard with allocation-aware logic. Conceptually (design only, not code):

- Inspect BOTH `sales_payments` AND `open_item_allocations` (active, `reverses_allocation_id IS NULL`, targeting this invoice) for `PAYMENT` and `SETTLEMENT` types.
- For each such allocation, determine whether the cancellation flow can safely generate the required GL treatment:
  - PAYMENT → needs the Customer-Deposits account (resolved via `account_determinations` CUSTOMER_DEPOSITS) to exist and be postable. If yes → resolvable.
  - SETTLEMENT → needs the original settlement JE and its counter-account to be resolvable. If yes → resolvable.
- Decision:
  - If ALL allocations are resolvable → **allow** cancellation (the flow will post the reclass/reversal legs).
  - If ANY allocation's counter-account / required account cannot be resolved → **block** cancellation with a reason like `CANCELLATION_REQUIRES_MANUAL_REVIEW` and identify the unresolved allocation.
- This replaces absolute prevention with "allow when safe, block when ambiguous."

## 8. Posting Design for cancel_sales_invoice (design)

Add a new step (call it F5.7 GL Clearing) after F5.2 revenue reversal, iterating active original allocations on the invoice:

```
resolve ar_control  := AR control account from the cancelled invoice's own posting
FOR each active allocation (reverses_allocation_id IS NULL) targeting the invoice:
  IF allocation_type = 'PAYMENT':
     resolve deposits_acct := account_determinations key CUSTOMER_DEPOSITS (company/branch context)
     post  Dr ar_control / Cr deposits_acct   for allocated_amount
     source_type = 'invoice_cancellation_payment_reclass'
  ELSIF allocation_type = 'SETTLEMENT':
     resolve counter_acct := non-AR-control line of the original settlement JE (via allocation.journal_entry_id)
     post  Dr ar_control / Cr counter_acct   for allocated_amount
     source_type = 'invoice_cancellation_settlement_reversal'
  END IF
  IF any required account is unresolved → abort and block (manual review)
END FOR
```

- Each treatment JE links to: `cancelled_invoice_id`, `original_allocation_id`, `original_journal_entry_id`, `treatment_type`.
- F5.5 (Open Item `REV-*`) remains unchanged — it is the subledger reversal. F5.7 adds the parallel GL leg that is currently missing. F5.5 is NOT removed.

## 9. Open Item Allocation Behavior

- F5.5 continues to insert `REV-*` rows (subledger reversal) as today.
- The new GL clearing (F5.7) is a separate, parallel concern: subledger says "allocation reversed," GL says "AR credit cleared to deposit/AP." Both are required; neither replaces the other.
- The `REV-*` row and the F5.7 GL entry should cross-reference (via `original_allocation_id`) for traceability.

## 10. Audit Trail Requirements

- Every reclass/reversal JE carries: cancelled invoice id + no, original allocation id, original JE id, treatment_type, and a human-readable reference (e.g. original PMT/SETTLE number).
- A `governance_log` event per cancellation summarizing: invoice, credit note, revenue reversal JE, and the list of clearing JEs with their treatment types and amounts.
- The original payment/settlement JEs are never mutated — only referenced (immutability preserved).

## 11. Idempotency Requirements

- Prevent duplicate treatment entries. Logical key per treatment: `(cancelled_invoice_id, original_allocation_id, treatment_type)`.
- Before posting a treatment leg, check no existing JE already carries that logical key (e.g. via a dedicated columns set or a structured reference), NOT by matching free-text descriptions.
- `payment_reclass` created once per original PAYMENT allocation; `settlement_reversal` created once per original SETTLEMENT allocation.
- Re-invoking cancel on an already-cancelled invoice must be a no-op for GL (the existing `ALREADY_CREDITED` guard in `can_cancel_sales_invoice` already blocks re-entry; the idempotency key is defense-in-depth).

## 12. Required Test Cases

1. Cancel unpaid invoice → only revenue/COGS/inventory reversal; no clearing legs; AR nets to zero.
2. Cancel fully paid cash invoice → one `payment_reclass` (Dr 1131 / Cr 2141); cash `1111` unchanged; AR = 0; `2141` = amount.
3. Cancel partially paid cash invoice → reclass for the paid portion only; remaining invoice AR handled by revenue reversal; AR = 0 overall.
4. Cancel invoice settled against AP → one `settlement_reversal` (Dr 1131 / Cr 2111); AP restored; AR = 0.
5. Cancel invoice with payment + settlement → one reclass + one reversal; both counter-legs correct; AR = 0.
6. Cancel already-cancelled invoice → blocked by guard; no duplicate clearing legs (idempotency holds).
7. Cancel invoice where settlement counter-account cannot be resolved → guard blocks with manual-review reason; nothing posted.
8. RR-001 after remediation → `variance_trade_only` collapses toward zero (within tolerance) once residuals are cleared; `1131` no longer carries orphan payment/settlement credits.

## 13. Success Criteria

- After cancelling any paid/settled invoice, the AR control account for that invoice nets to zero.
- The treasury/cash account is never reduced by a cancellation.
- Paid amounts land in the resolved Customer-Deposits account; settled amounts restore the original counter-account.
- The AR control aggregate negative balance (live evidence: `-174,025`) is explained entirely by pre-remediation data; post-remediation cancellations do not create new negative AR.
- RR-001 `variance_trade_only` is expected to reconcile within tolerance once historic residuals are also corrected (historic correction is a separate data-fix decision, not part of this flow design).

## 14. Rollback / Safety Notes

- This is design only; nothing is applied. Implementation would be a new migration + function revision, developed and tested on `staging` before `frontend-dev`/`main`.
- The design is additive (new F5.7 step + guard extension); it does not alter existing revenue/COGS/inventory reversal logic.
- Historic contaminated data (existing `-174,025`) is NOT auto-corrected by this flow. A separate, explicitly-approved data-remediation step would be required for already-cancelled invoices. This design prevents FUTURE contamination.
- All treatment JEs are reversible in principle (standard JE reversal) if a defect is found post-implementation.

## 15. Items Explicitly NOT Implemented Yet

- No function is created or altered.
- No migration is written.
- No historic data correction for the existing `-174,025`.
- No refund-payable path (owner chose `2141` reclassify, not refund workflow, as the automatic path; a manual refund voucher remains a separate future process).
- No `prevent`-cancellation policy (owner chose allow-with-treatment, block only when unresolvable).
- No change to F5.5 Open Item behavior.

---

## Open Questions (for owner)

1. **Historic data:** the existing `-174,025` on `1131` comes from already-cancelled INV-0001/0002. Correcting it is a separate one-time data-remediation decision — do we address it, and when? (Design proposes: separate approved step, not part of the flow.)
2. **Counter-account resolution robustness:** for settlement, is "take the non-AR-control line of the original settlement JE" always correct, or can a settlement JE have more than two lines? (Live evidence is a clean 2-line entry; multi-line settlements would need a rule.)
3. **Customer-Deposits partner tracking:** should the deposits credit carry `contact_id` so the customer's deposit balance is queryable per-partner? (Recommended yes, for later use/refund.)

## Recommendation

The design is coherent and matches the owner's accounting policy. It is additive and low-risk in structure. Before any implementation: confirm the three open questions, then build on `staging` with the eight test cases as gates. Historic `-174,025` correction should be handled as a distinct, separately-approved data fix.

## Judgment (unchanged)

```
DEBT-012 = High / Active GL Impact / Design Decision Pending
Design policy selected (Payment→2141, Settlement→reverse), implementation not executed
AUDIT-RR-001 = Redesign In Progress / Not Executed
No remediation · No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
