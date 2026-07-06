# Sarat Remediation Design Review — DEBT-012 (Cancelled Paid/Settled Invoices Leave Prior AR Credits in GL)

**Status:** Design Review only / No code change / No DB writes · DEBT-012 = Confirmed debt (High, Active GL Impact, Not Implemented) · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document reviews the existing DEBT-012 remediation design (`ERP_DEBT012_REMEDIATION_DESIGN.md` + `ERP_DEBT012_STAGING_EXECUTION_PLAN.md`) against the current live code of `can_cancel_sales_invoice` and `cancel_sales_invoice`, read this session via `pg_get_functiondef`. It is a review, not a new design — it confirms what still holds, corrects one dimension whose wording no longer matches the live code, and recommends refinements to the existing plan. No function is altered, no database is written, and the debt is not re-classified.

---

## 1. Purpose and Method

DEBT-012 already has a remediation design and a staging execution plan in the repo. Before any implementation, this review re-verifies the debt against the live functions so the design rests on current evidence, not memory. Live reads this session: `can_cancel_sales_invoice(p_invoice_id)` and `cancel_sales_invoice(p_invoice_id, p_reason)`.

## 2. What the Live Code Confirms (unchanged dimensions)

- **Dimension 2 — CONFIRMED:** `can_cancel_sales_invoice` never inspects `open_item_allocations`. An invoice settled via allocation (not a direct payment) passes the guard.
- **Dimension 3 — CONFIRMED literally:** the guard checks payment via `SELECT COALESCE(SUM(amount),0) ... FROM public.sales_payments WHERE invoice_id=...`. It reads `sales_payments` only. Real payments post through `payments` (evidence INV-2026-0002: 57500 in `payments`, 0 in `sales_payments`; JE-0006 Dr 1111 / Cr 1131). So a payment recorded in `payments` alone yields `v_paid=0` → the guard passes → a paid invoice can be cancelled.

## 3. What the Live Code Corrects (Dimension 1 wording)

The prior wording "cancel creates no reversing GL" is **imprecise and must be corrected**. The live `cancel_sales_invoice` is in fact mature and reverses a great deal:

- F5.2 revenue reversal (mirror clone, `reverses_entry_id`, marks the original `is_reversed=true`).
- F5.3 COGS reversal (sound — keyed on an actual active COGS JE, not the possibly-wrong `cogs_posted` flag).
- F5.4 inventory reversal (distinguishes vehicle Per-VIN assignment vs part cumulative increment).
- F5.5 open-item allocation reversal (inserts `REV-` allocations **with `reverses_allocation_id`**, filtering `reverses_allocation_id IS NULL` — i.e. it avoids the DEBT-011 double-count pattern on its own reversal).
- Posted Credit Note + engine-based numbering + governance log.

So the accurate statement of Dimension 1 is not "no reversing GL." It is: **`cancel_sales_invoice` reverses revenue, COGS, inventory, and allocations, but does nothing about a prior cash payment — it neither reverses nor reclassifies it — because it is built on the assumption that no payment exists (an assumption the broken guard in §2 lets through).** The revenue side is unwound; the cash side (Dr 1111 / Cr 1131 from the original receipt) is left stranded, leaving an AR credit in the GL with no offset.

This is a sharper and more accurate description of DEBT-012 than the original, and it changes the emphasis of the fix.

## 4. Assessment of the Existing Remediation Design

The existing design (Payment → reclassify to Customer Deposits 2141 partner-tracked; Settlement → reverse settlement; F5.7 after F5.2; guard on payments + open_item_allocations; idempotency key) is directionally correct and still applies. Two refinements follow from the live reading:

### 4.1 The guard fix is the load-bearing change

Because `cancel_sales_invoice` calls `can_cancel_sales_invoice` first and returns immediately if it fails, fixing the guard is what actually gates everything. The guard must read the real payment source (`payments`) and `open_item_allocations`, not `sales_payments`. Until it does, the mature reversal body runs on invoices it should have stopped.

### 4.2 The design must choose between "block" and "handle"

Once the guard correctly detects a prior payment/settlement, there are two coherent paths, and the existing design leans toward "handle" (F5.7). The review recommends making the choice explicit:

- **Path A — Block (require prior receipt reversal):** the guard rejects with `INVOICE_PAID_REQUIRE_RECEIPT_REVERSAL`, and the payment must be reversed first (a Customer Receipt Reversal, the F6.1 direction already noted in the debt register). Simpler, keeps `cancel_sales_invoice` single-purpose; matches the guard's existing message.
- **Path B — Handle inline (F5.7):** `cancel_sales_invoice` also reclassifies the payment to Customer Deposits (2141, partner-tracked) or reverses the settlement, inside the same atomic operation. More convenient but enlarges the function and needs its own idempotency.

The existing design chose Path B. The review does not overturn that, but flags that Path A is the lower-risk first step and that Path B should only follow once the guard fix and a Customer Receipt Reversal primitive exist. The sequencing (guard fix → receipt reversal → optional inline handling) should be stated in the implementation review.

## 5. Consistency With Other Findings

- The reversal body already respects `reverses_allocation_id` (F5.5) — so `cancel_sales_invoice` is on the correct side of DEBT-011, and the DEBT-012 fix must not regress that.
- The Customer Deposits account (2141, partner-tracked) is the constitutionally-correct role for a reclassified customer payment (Design account role → Implementation account determination).
- The guard's other checks (idempotency via posted CN, REVENUE_JE_MISSING, COGS_JE_MISSING, VEHICLE_DELIVERED) are mature and must be preserved by any guard change.

## 6. Recommended Refinements to the Existing Design

1. Restate Dimension 1 in the remediation design using the accurate wording from §3 (reverses revenue/COGS/inventory/allocations but leaves the cash payment stranded), so the fix targets the payment leg specifically.
2. Treat the guard fix (source = `payments` + `open_item_allocations`) as the first, load-bearing change — everything else depends on it.
3. Make the block-vs-handle choice explicit and sequence it: guard fix → Customer Receipt Reversal primitive → (optional) inline F5.7 handling.
4. Keep the idempotency key `(cancelled_invoice_id, original_allocation_id, treatment_type)` and confirm it composes with the existing posted-CN idempotency in the guard.
5. Preserve every mature behaviour already in `cancel_sales_invoice` (F5.2–F5.6) and the guard's non-payment checks.

## 7. What This Review Does NOT Do

- It does not alter `can_cancel_sales_invoice`, `cancel_sales_invoice`, or any function; it creates no migration.
- It does not write to the database or execute any seed/gate.
- It does not re-classify DEBT-012 (it remains a confirmed High debt, Not Implemented).
- It does not authorize staging execution (staging not confirmed).
- It does not judge the remediation as complete or verified.

## 8. Status

```
DEBT-012 Design Review = Complete (review only)
Dimension 2 = confirmed live (guard never checks open_item_allocations)
Dimension 3 = confirmed live literally (guard checks sales_payments only; real payments in payments)
Dimension 1 = corrected: cancel_sales_invoice reverses revenue/COGS/inventory/allocations (mature),
              but leaves the prior cash payment stranded (neither reversed nor reclassified) — because
              the broken guard let a paid invoice through on the assumption no payment exists
Existing design (2141 Customer Deposits + settlement reversal + F5.7 + guard + idempotency) = directionally correct
Load-bearing change = guard source fix (payments + open_item_allocations, not sales_payments)
Recommend explicit block-vs-handle choice + sequencing (guard fix → receipt reversal → optional inline)
cancel_sales_invoice already respects reverses_allocation_id (on correct side of DEBT-011 — do not regress)
DEBT-012 status = Confirmed debt (High, Active GL Impact, Not Implemented) — unchanged
No code change / No DB writes / No migration / No execution
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
