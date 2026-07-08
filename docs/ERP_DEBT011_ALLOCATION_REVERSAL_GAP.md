# DEBT-011 — document_allocated Ignores Reversal Allocations

**Status:** Confirmed live / remediation design ready / NOT executed
**Severity:** High (distorts open-item remaining, aging, settlement FIFO)
**Date raised:** 2026-07-07
**Execution gate:** Deferred until Gate 0 + staging proof + explicit write permission
(stricter than DEBT-012/013 because the blast radius is wider — six callers,
including live reports and settlement FIFO).

---

## 1. Problem (confirmed live)

`public.document_allocated(p_doc_type, p_doc_id, p_alloc_type DEFAULT NULL)` sums
**all** active allocations for a document without distinguishing an original
allocation from its reversal:

```sql
SELECT COALESCE(SUM(allocated_amount), 0)
FROM public.open_item_allocations
WHERE target_document_type = p_doc_type
  AND target_document_id   = p_doc_id
  AND status = 'active'
  AND (p_alloc_type IS NULL OR allocation_type = p_alloc_type);
```

When an allocation is reversed, F5.5 / F5.7 insert a REV allocation
(`reverses_allocation_id` set, `allocation_type='CREDIT_NOTE'`) while **both** the
original and the REV remain `status='active'`. The function then counts both:

```
original SETTLEMENT active 2300  +  reversal CREDIT_NOTE active 2300  =  4600
document_remaining = total(2300) - 4600 = -2300
```

A document whose allocation was reversed should read **fully open**
(`remaining = total`), not over-allocated (`remaining = -2300`).

This was observed live during the DEBT-013 SET-A test: after a settlement
cancellation, both the sales-invoice and purchase-invoice sides showed
`remaining = -2300` — symmetric (proof DEBT-013 worked) but negative
(proof DEBT-011 distorts the measurement). The negative reading is a DEBT-011
distortion, not a DEBT-013 failure.

`document_remaining(p_doc_type, p_doc_id, p_total)` is a thin wrapper:
`p_total - document_allocated(p_doc_type, p_doc_id, NULL)` — so the defect
propagates through it.

---

## 2. Callers (audited live — all pass p_alloc_type = NULL)

```
document_allocated  <- document_remaining
                    <- document_clearing_status
document_remaining  <- create_allocation
                    <- create_partner_settlement   (FIFO)
                    <- partner_aging               (report)
                    <- partner_balance_summary     (balances)
```

No caller passes a specific `p_alloc_type`. `reverses_allocation_id` is used
elsewhere only in `can_cancel_sales_invoice` and `cancel_sales_invoice`
(to find originals), never inside `document_allocated`.

---

## 3. Remediation design (net-of-reversals, reversed-original safe)

Algebraic net: reversal rows subtract, originals add — but a reversal only
subtracts when its original is **still active**, so an already-reversed original
is never subtracted twice.

Rule:
- original, active, not a reversal              -> + allocated_amount
- reversal, active, AND original still active   -> - allocated_amount
- reversal, active, BUT original already reversed -> 0 (no double subtract)
- original reversed / inactive / cancelled      -> 0

A `LEFT JOIN open_item_allocations orig ON orig.id = oia.reverses_allocation_id`
exposes the original's status. A Hybrid WHERE admits only the two contributing
shapes into SUM (active original, or active reversal whose original is still
active); zero-contribution rows are filtered before aggregation.

Reference SQL: `document_allocated_debt011_final.sql` (111 lines).

### Case coverage
| Case | original | reversal | allocated | correct |
|------|----------|----------|-----------|---------|
| 1 | active, no reversal | — | +amount | document cleared |
| 2 | active | active | 0 | document open (DEBT-013 shape) |
| 3 | reversed | active | 0 | no single-side subtract (guard) |
| 4 | reversed | — | 0 | — |

---

## 4. Two governing owner reviews (both corrected the design)

1. **Reversed-original guard.** The first draft subtracted *any* active reversal.
   That fails when the original is already `status='reversed'` while the REV is
   `active`: it would subtract the reversal alone (original excluded by
   `status='active'`), giving `allocated = -amount`, `remaining > total` —
   deepening DEBT-011. Fix: subtract the reversal **only if** `orig.status='active'`.

2. **p_alloc_type caveat narrowed.** The filter pairs an original with its
   reversal for **economic** types (PAYMENT / SETTLEMENT) via
   `orig.allocation_type`. It does **not** pair them if `CREDIT_NOTE` itself is
   passed as the filter (the original, e.g. SETTLEMENT, is excluded while the
   reversal row matches alone). CREDIT_NOTE is a reversal marker, not an economic
   filter — intentional by design. All current callers pass NULL, so today's
   behaviour is safe.

---

## 5. Verdict (NOT closed)

```
document_allocated DEBT-011 fix = Approved for staging implementation review
DEBT-011                        = Confirmed live / remediation design ready
DEBT-011 closure                = requires staging implementation + regression tests
```

### Regression tests required before closure (not yet executed)
- T1. original active + reversal active            -> allocated = 0
- T2. original reversed + reversal active           -> allocated = 0 (no double subtract)
- T3. no reversal (original active only)            -> allocated = original amount
- T4. p_alloc_type = NULL                           -> net across all types
- T5. p_alloc_type = PAYMENT                        -> pair preserved via orig type
- T6. p_alloc_type = SETTLEMENT                     -> pair preserved via orig type
- T7. document_remaining impact                     -> remaining = total for reversed;
                                                       unchanged for un-reversed
- Re-check callers: partner_aging, partner_balance_summary,
  create_partner_settlement (FIFO), document_clearing_status, create_allocation.

### Honest note
The `original=reversed` state is not confirmed to exist in current ard-erp-dev
data (F5.5 keeps the original active and adds an active REV — seen in SET-A2).
The reversed-original guard is precautionary against a possible state. On return,
the first read should be the status distribution in `open_item_allocations` to
identify actual cases before applying the fix.

---

## 6. Next steps (on execution, after gates + permission)
1. Read status distribution in `open_item_allocations`.
2. Apply `document_allocated` (net-of-reversals) on ard-erp-dev.
3. Run T1–T7 + caller regression.
4. Assemble official migration + git.
Only then may DEBT-011 be marked closed.
