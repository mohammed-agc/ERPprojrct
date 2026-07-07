# DEBT-013 — F5.7 SETTLEMENT_REVERSAL leaves opposite-side allocation active

**Status:** Open (design required before fix)
**Severity:** High (GL ↔ subledger inconsistency)
**Discovered:** 2026-07-07, controlled test SET-A on ard-erp-dev
**Related:** DEBT-012 (remediation, PAYMENT path proven), F5.7 GL Clearing

---

## Statement

`cancel_sales_invoice` F5.7 SETTLEMENT_REVERSAL reverses the GL counter-account
(the non-AR line of the original settlement journal entry), but does **not**
reverse the opposite-side settlement allocation on `purchase_invoice`. This
causes the AP subledger (open_item_allocations) to remain `cleared` while the
AP **GL** balance is correctly restored — an inconsistency between the general
ledger and the open-item subledger.

## Root cause

`create_partner_settlement` produces, for a single settlement JE:
- one GL entry (Dr AP / Cr AR), and
- **two** SETTLEMENT allocations sharing that JE: one on the `sales_invoice`
  (AR side), one on the `purchase_invoice` (AP side).

When the AR invoice is cancelled:
- F5.5 reverses only the allocations whose target is the cancelled invoice
  (the AR-side SETTLEMENT allocation) → a REV allocation is created for it.
- F5.7 reverses the GL counter (Cr AP 2111 [vendor]) → AP GL balance restored.
- **But** the AP-side SETTLEMENT allocation (target = purchase_invoice) is not
  touched by either F5.5 (different target) or F5.7 (GL only). It stays `active`.

## Live evidence (SET-A, ard-erp-dev, tagged SETTLE_TEST_F57_SIMPLE)

Setup: one dual partner (customer+supplier), one AR invoice (2300), one AP
invoice (2300), full settlement (2300).

After cancelling the AR invoice:

GL balances for the partner:
- 1131 (AR): net 0 — no stranded balance. Correct.
- 2111 (AP): net -2300 (credit) — vendor debt restored. Correct (the purchase
  invoice was not cancelled, so the vendor is genuinely owed 2300).

F5.7 clearing JE (source_type = invoice_cancellation_settlement_reversal):
- Dr 1131 = 2300 [customer]
- Cr 2111 = 2300 [vendor] — faithful reversal of original counter
  (same account_id + contact_id + partner_type). Correct.

open_item_allocations for the partner after cancellation:
- SETTLEMENT / sales_invoice / 2300 / active (original)  — has a REV (CREDIT_NOTE) → net 0. Correct.
- SETTLEMENT / purchase_invoice / 2300 / active (original) — **no REV. Stays active.**

Consequence: `document_remaining('purchase_invoice', ...)` for the AP invoice =
total - allocated = 2300 - 2300 = 0 → subledger says the purchase invoice is
cleared, while GL says the vendor is owed 2300. **GL ↔ subledger mismatch.**

## Scope note

This is not limited to the multi-document case. Even the simplest settlement
(one AR + one AP, full amount) exhibits the mismatch, because the opposite-side
allocation always exists and is never reversed. The multi-document FIFO case
(originally planned SET-B) would compound this, but SET-A already proves the
core defect, so SET-B was intentionally deferred.

## Proposed fix (preferred)

When cancelling an AR invoice that carries a SETTLEMENT allocation:
1. Reverse the AR-side allocation via F5.5 (already done).
2. Reverse the settlement GL counter via F5.7 (already done).
3. **Additionally**, create a REV allocation for the matched AP-side SETTLEMENT
   allocation linked to the same settlement journal_entry_id, so the purchase
   invoice returns to `open` in the subledger, consistent with its restored GL
   balance.

Design questions to resolve before implementing:
- Matching: how to identify the AP-side allocation(s) that belong to the same
  settlement as the AR-side one (same journal_entry_id; but a settlement JE may
  serve several invoices via FIFO — partial reversal semantics).
- Partial settlements: if the cancelled AR invoice was only part of a larger
  settlement, only the matched portion on the AP side should be reversed.
- This is exactly the SET-B (multi-allocation FIFO) question and must be settled
  here.

## Alternative (block)

Block cancellation of invoices involved in a SETTLEMENT until the settlement is
explicitly reversed as a full business document (a dedicated
"reverse settlement" operation), rather than reversing it as a side effect of
invoice cancellation.

## Recommendation

Fix is preferred over block (better UX, keeps cancellation self-contained), but
requires an independent design pass (matching + partial semantics) before
implementation. Until then, F5.7 SETTLEMENT is **not** complete: the PAYMENT
path is proven (DEBT-012, SET none needed), the SETTLEMENT path reverses GL
correctly but leaves the AP subledger inconsistent.

## Current state of F5.7 (honest)

- PAYMENT path: proven end-to-end (DEBT-012 S5), GL + subledger consistent.
- SETTLEMENT path: GL reversal correct and faithful; **subledger opposite-side
  allocation not reversed** → DEBT-013. Not closed as complete.
