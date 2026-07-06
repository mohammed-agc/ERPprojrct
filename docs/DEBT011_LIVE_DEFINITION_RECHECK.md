# DEBT-011 Live Definition Recheck

**Status:** Live definition recheck only / Read-only / No code change / No DB writes / No remediation / No PASS/FAIL · DEBT-011 = Confirmed live / Deepened evidence · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document re-verifies DEBT-011 against live function definitions and live allocation metadata (read-only, 2026-07-06). It deepens the existing evidence; it does not change DEBT-011's classification, does not modify the DebtRegister or AuditRegister, and does not implement any fix.

---

## 1. Purpose

DEBT-011 (High, confirmed) states that `document_allocated` / `document_remaining` mishandle reversal allocations: an original allocation and its reversal, both active, are summed as positive amounts instead of cancelling out, because the calculation does not inspect `reverses_allocation_id`. This recheck reads the live function definitions and the live allocation pairs to confirm the defect is still present exactly as described, and to record the positive cross-reference that `cancel_sales_invoice` is on the correct side of the same column.

## 2. Function Definition Evidence (live, read-only)

**`document_allocated(p_doc_type, p_doc_id, p_alloc_type)`** — LANGUAGE sql STABLE. Body:
```
SELECT COALESCE(SUM(allocated_amount), 0)
FROM public.open_item_allocations
WHERE target_document_type = p_doc_type
  AND target_document_id = p_doc_id
  AND status = 'active'
  AND (p_alloc_type IS NULL OR allocation_type = p_alloc_type);
```
The filter is `status = 'active'` (plus document match and optional type). There is **no** reference to `reverses_allocation_id`. A reversal row that carries `status = 'active'` is summed exactly like an original.

**`document_remaining(p_doc_type, p_doc_id, p_total)`** — LANGUAGE sql STABLE. Body:
```
SELECT p_total - public.document_allocated(p_doc_type, p_doc_id, NULL);
```
It delegates to `document_allocated(..., NULL)` (all allocation types) and inherits the defect directly. `remaining = total − allocated`, so an over-counted `allocated` produces an impossible negative `remaining`.

## 3. open_item_allocations Schema Evidence (live, read-only)

Relevant columns (from `information_schema.columns`):
- `reverses_allocation_id uuid YES` — exists and is available; NULL on originals, set to the original's id on reversals.
- `allocated_amount numeric NO` — always positive; no negative sign is used to represent a reversal.
- `status text NO` — `'active'` is what `document_allocated` filters on.
- `journal_entry_id uuid YES` — nullable (this is the separate DEBT-010 surface).
- No `original_allocation_id` column — the reversal linkage is carried solely by `reverses_allocation_id`.

The key point: `reverses_allocation_id` is a present, usable column. Ignoring it in `document_allocated` is an optional defect in the read function, not a structural limitation of the table.

## 4. Live Reversal Pair Evidence (metadata only, read-only)

Two active original+reversal pairs on the same target document confirm the defect is live:

Target `570be658` (a sales invoice):
- `CLR-2026-00003` — SETTLEMENT, status active, amount 129,425, is_reversal false (original).
- `REV-CLR-2026-00003` — CREDIT_NOTE, status active, amount 129,425, is_reversal true (reversal, `reverses_allocation_id` set).
- `document_allocated` on this target sums both → 129,425 + 129,425 = 258,850, instead of netting to 0.

Target `c8e09d0b` (a sales invoice):
- `CLR-2026-00005` — PAYMENT, status active, amount 57,500, is_reversal false (original).
- `REV-CLR-2026-00005` — CREDIT_NOTE, status active, amount 57,500, is_reversal true (reversal).
- `document_allocated` sums both → 57,500 + 57,500 = 115,000 on an invoice of 57,500, so `document_remaining = 57,500 − 115,000 = −57,500` — an impossible negative remaining.

Internal-consistency note: `CLR-2026-00004` carries `status = 'reversed'` (not active), so it is correctly excluded by the `status = 'active'` filter. This shows two reversal mechanisms coexist — some allocations are reversed by setting `status = 'reversed'` (correctly excluded), others by inserting a new `REV-*` row with `status = 'active'` + `reverses_allocation_id` (incorrectly summed). The defect lives in that coexistence: `document_allocated` catches the `reversed`-status mechanism but misses the active `REV-*` mechanism.

## 5. document_allocated / document_remaining Finding

Answering the decision questions:
- **A. Do they exclude reversals via `reverses_allocation_id`?** No. They filter on `status = 'active'` only.
- **B. Do they count original + reversal as positive amounts when both are active?** Yes — confirmed with live data (129,425 + 129,425; 57,500 + 57,500).
- **C. Is DEBT-011 still confirmed live?** Yes. Two active original+reversal pairs are present in the live data.

The defect is exactly as DEBT-011 describes: the read functions over-count allocations and can produce impossible negative remaining balances, because they ignore the `reverses_allocation_id` linkage.

## 6. cancel_sales_invoice Positive Cross-Reference

`cancel_sales_invoice` F5.5 inserts its `REV-*` reversal rows with `reverses_allocation_id = oia.id` (linking each reversal to its original), and it selects the source set with `oia.reverses_allocation_id IS NULL` — with the literal in-code comment that it must not reverse an already-reversal allocation, distinguishing via `reverses_allocation_id` rather than `allocation_type`.

- **D. Does `cancel_sales_invoice` exclude allocations that have `reverses_allocation_id`?** Yes (its source filter is `reverses_allocation_id IS NULL`).
- **E. Should `cancel_sales_invoice` be a positive cross-reference for DEBT-011?** Yes. It demonstrates that the same `reverses_allocation_id` linkage the read functions ignore is understood and used correctly by the cancellation engine.

This makes the defect's location precise: DEBT-011 is a defect of the **read/calculation** functions (`document_allocated` / `document_remaining`), not of the cancellation engine. The cancellation engine is on the correct side of the same column, and any DEBT-011 fix must bring the read functions up to the cancellation engine's treatment — not the other way around — and must not regress `cancel_sales_invoice`.

## 7. Impact on Reports / RR

`document_allocated` / `document_remaining` feed `partner_aging` (outstanding = `document_remaining`) and `document_clearing_status`. The over-count therefore propagates into aging and clearing-status reporting (recorded as R-RR1). The RR-001 reconciliation design deliberately avoids these functions on its subledger side (it computes open from valid active allocations with `reverses_allocation_id IS NULL`), which is the correct avoidance given this recheck.

## 8. Impact on DEBT-012

DEBT-011 and DEBT-012 touch the same cancelled invoices but are distinct: DEBT-011 is the allocation-calculation defect (this document); DEBT-012 is the missing GL treatment of a prior cash payment on cancellation. The `cancel_sales_invoice` F5.5 evidence here (respects `reverses_allocation_id`) is the same evidence noted in the DEBT-012 design review as the "correct side" cross-check. The two remediations are independent: fixing DEBT-011's read functions does not address DEBT-012's stranded cash leg, and vice versa.

## 9. Recommendation

- DEBT-011 remains **Confirmed live**; this recheck deepens the evidence (live definitions + live pairs) but does not change its classification, priority, or status.
- When a DEBT-011 fix is later designed (separate, with explicit approval in a confirmed environment), the read functions should exclude active reversal rows — either by adding `AND reverses_allocation_id IS NULL` and separately netting reversals, or by an equivalent netting that matches the cancellation engine's treatment. The fix must preserve `cancel_sales_invoice` behaviour.
- Proposed DebtRegister line (for a **future** documentation update, not applied here): "Live definition recheck (2026-07-06) confirmed `document_allocated`/`document_remaining` filter on `status='active'` only and ignore `reverses_allocation_id`; live pairs CLR-2026-00003/REV-CLR-2026-00003 and CLR-2026-00005/REV-CLR-2026-00005 (both active) are summed positively. `cancel_sales_invoice` F5.5 is on the correct side (filters `reverses_allocation_id IS NULL`); the DEBT-011 fix must bring the read functions to that treatment without regressing cancellation."

## 10. Status

```
DEBT-011 = Confirmed live / Deepened evidence
document_allocated / document_remaining: filter status='active' only, ignore reverses_allocation_id (A=no, B=yes)
Live pairs both active: CLR-2026-00003+REV-CLR-2026-00003 (129,425 x2), CLR-2026-00005+REV-CLR-2026-00005 (57,500 x2 -> remaining -57,500)
cancel_sales_invoice F5.5 = Positive cross-reference / respects reverses_allocation_id IS NULL (D=yes, E=yes)
Defect location = read/calculation functions, not the cancellation engine (F = deepened, not changed)
Impact: R-RR1 (partner_aging + document_clearing_status); RR-001 correctly avoids these functions
Independent of DEBT-012 (distinct defect on same cancelled invoices)
No remediation / No DB writes / No PASS/FAIL / DebtRegister + AuditRegister unchanged
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
