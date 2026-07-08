# TECH-DEBT-OI-001 — paid_amount/status vs Open Item SSOT Review

**Status:** Confirmed by live evidence / Design not started
**Date:** 2026-07-07
**Nature:** Documentation only — read-only review, no remediation, no DB writes.

---

## 1. Purpose

Document a live discovery: the real debt is NOT an AP-specific Open Item
asymmetry. It is that `paid_amount` and `status` on invoice tables are stale /
derived legacy fields that do not stay in sync with `open_item_allocations`, and
can mislead UI / reports / accounting workflow if used as a source of judgement.

Read-only review. No remediation. No DB writes.

---

## 2. Previous assumption

TECH-DEBT-AP-001 assumed AP (purchase_invoices) lacked the SAP Open Item model
that AR (invoices) had. Live evidence did not support this:

- Neither AR nor AP carries explicit Open Item columns
  (original_amount / cleared_amount / open_amount / document_status).
- Both rely on an allocation layer (open_item_allocations) that is separate from
  the payment layer, and both compute remaining via document_remaining.

See docs/TECH_DEBT_AP001_REDEFINITION_REVIEW.md.

---

## 3. Live evidence: PINV-2026-0001

Read-only from ard-erp-dev:

| Field | Value |
|-------|-------|
| invoice total | 229,425 |
| PAYMENT allocation (CLR-2026-00001) | 100,000 |
| SETTLEMENT allocation (CLR-2026-00002) | 129,425 |
| total allocated | 229,425 |
| document_remaining | 0 |

Both allocations are original and active (reverses_allocation_id IS NULL, no
reversals). The invoice is therefore genuinely and correctly fully cleared —
via two different sources (a payment plus a partner settlement).

---

## 4. Contradiction

On the same invoice, three sources disagree:

- `paid_amount` = 100,000  (sees only the payment, not the settlement)
- `status` = 'partially_paid'
- `document_remaining` = 0  (allocations SSOT: fully cleared)

`paid_amount` does not see the settlement. `status` was never advanced to
reflect full clearing. Only document_remaining reflects reality.

---

## 5. Architectural finding

- open_item_allocations + document_remaining are the SSOT for remaining/cleared.
- paid_amount and status are NOT the SSOT.
- Manual / external allocation after a payment appears to be intentional,
  flexible design (an invoice can be cleared by a payment plus a settlement,
  which is hard to auto-match).
- The problem is NOT that payment fails to auto-allocate.
- The problem is that the legacy fields (paid_amount, status) do not stay in
  sync with allocations.

---

## 6. Scope

- The debt affects AR and AP equally.
- It is NOT AP-specific.
- It is NOT evidence that AP is less mature than AR.
- It is NOT DEBT-011: this case has no reversals, and document_remaining is
  correct (0). DEBT-011 concerns reversal double-counting, which is absent here.

---

## 7. Risk

- Any screen or report that reads paid_amount / status could show a fully
  cleared invoice as if it were only partially paid.
- Risk = misleading UI / reporting / accounting workflow.
- No impact wherever the code already uses document_remaining /
  document_clearing_status as the source of truth. The risk is proportional to
  how much code still reads the legacy fields — see §9.

---

## 8. Remediation options (design only, no preference expressed)

- **A.** Deprecate / ignore paid_amount and status; use a derived document
  status computed from allocations (document_clearing_status).
- **B.** Synchronize paid_amount / status from allocations via a controlled
  function or trigger, keeping them as derived mirrors.
- **C.** Document them as legacy-only and audit code usage before any
  remediation.

---

## 9. Recommended next step

Do NOT design the remediation yet. The next step is a Usage Impact Review —
find who depends on these fields. Search the codebase for:

```
paid_amount
partially_paid
status === 'partially_paid'
status = 'partially_paid'
invoice.status
purchase_invoice.status
```

Goal: determine which screens / reports / services read these fields, so the
severity of the misleading-data risk can be measured before choosing A / B / C.

---

## 10. Status

```
TECH-DEBT-OI-001                              = Confirmed by live evidence /
                                                Design not started
TECH-DEBT-AP-001 previous asymmetry assumption = Not supported in previous form
Open Item SSOT                                = open_item_allocations +
                                                document_remaining
paid_amount / status                          = stale legacy derived fields /
                                                not reliable as SSOT
Remediation                                   = None
DB writes                                     = None
```

This document records a discovery only. Nothing is fixed, closed, or passed.
The next step is the §9 Usage Impact Review, not a remediation.
