# Sarat RR-001 Reconciliation — Design Deepening (GL ↔ AR Subledger)

**Status:** Design Deepening only / No code change / No DB writes / Reconciliation NOT executed · AUDIT-RR-001 = Diagnostic Inspected / Redesign In Progress · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document deepens the existing "RR-001 Final Query Design" (recorded in `docs/ERP_AUDIT_REGISTER.md` under AUDIT-RR-001) using the live-read findings from the 2026-07-06 remediation review session. It does not re-design RR-001 from scratch, does not execute any reconciliation query, and does not read reconciliation data. It sharpens three points that the prior design predates: the cash/clearing bucket source, the valid-allocation rule's consistency with the live cancellation flow, and the expected variance signature of DEBT-012.

---

## 1. Purpose and Boundary

RR-001 reconciles the GL AR control accounts (`1131` trade-vehicle receivables, `1132` parts unused) against the AR subledger (invoice open amounts). Its design is already documented. This deepening applies the session's live evidence so that, when execution is later authorized in a confirmed staging environment, the query rests on the current code behaviour rather than on the earlier wording.

Boundary: design only. No query is run; no reconciliation totals are computed here. The `-174,025` net on `1131` and the two stranded credits (`129,425` on INV-2026-0001 settlement, `57,500` on INV-2026-0002 payment) are cited from prior recorded evidence, not re-queried.

## 2. The Existing Design (restated for reference)

- **GL side:** posted lines on `1131` + `1132`, decomposed by `source_type` into buckets: `trade_invoice` (sales_invoice), `trade_reversal` (credit_note / credit_note_cogs), `trade_clearing` (payment + settlement effects), `non_trade_ar_artifact` (fixed_asset_disposal — RR-003, isolated), `other`.
- **AR subledger side (Design A):** active invoices only (status not cancelled/draft); `open = total − Σ(valid active allocations)`, where valid allocations are active originals with `reverses_allocation_id IS NULL` and not pointed to by any active reversal. This deliberately avoids `document_remaining` / `document_allocated` (DEBT-011). Tolerance 0.01.
- **Governing principle:** RR-001 will not balance while DEBT-012 is live — stranded payment/settlement credits sit in `trade_clearing`, so `variance_trade_only` stays non-zero. That is DEBT-012 detection, not a reconciliation failure.

## 3. Deepening Point 1 — The clearing bucket must source from `payments`, not `sales_payments`

The session's live read of `can_cancel_sales_invoice` confirmed (DEBT-012 dimension 3) that real customer payments post through the `payments` table (with the `create_payment_journal_entry` AFTER INSERT trigger), while `sales_payments` carries no trigger and is effectively empty for these flows. Evidence: INV-2026-0002 had 57,500 in `payments` (0 in `sales_payments`), and its payment JE-2026-0006 posted Dr 1111 / Cr 1131.

Implication for RR-001: the GL `trade_clearing` bucket is defined by the GL lines themselves (posted credits to `1131` from payment/settlement journal entries), so it already captures the real effect regardless of which application table originated them — the GL is the source of truth for the bucket. The deepening is to state this explicitly: RR-001 must classify the clearing bucket by the **journal entry** `source_type` (e.g. `sales_payment`, settlement), not by joining to `sales_payments`. Any RR-001 implementation that tried to size the clearing bucket from `sales_payments` would under-count it and mask the DEBT-012 residual. Classify from the GL/JE side.

## 4. Deepening Point 2 — Valid-allocation rule is consistent with the live cancellation flow

The session's live read of `cancel_sales_invoice` confirmed that F5.5 inserts `REV-*` reversal allocations **with `reverses_allocation_id` set**, filtering `reverses_allocation_id IS NULL` on its source set. This is exactly the shape the RR-001 subledger side assumes: valid allocations are active originals with `reverses_allocation_id IS NULL`, excluding both reversal rows and originals that a reversal points to.

Implication: the subledger `open` computation and the cancellation flow agree on the semantics of `reverses_allocation_id`. RR-001's Design A is therefore consistent with how cancellations actually record reversals — it will not double-count a reversed allocation, and it stays on the correct side of DEBT-011 (the same side `cancel_sales_invoice` is on). The deepening records this as a positive cross-check: the reconciliation's allocation rule and the cancellation engine share one definition of a "live" allocation.

## 5. Deepening Point 3 — Expected variance signature of DEBT-012

Because DEBT-012 leaves prior payment/settlement credits on `1131` after an invoice is cancelled (the invoice's revenue is reversed and the invoice drops out of the active subledger, but the cash credit remains), the reconciliation's `variance_trade_only` is expected to be non-zero by approximately the sum of stranded credits on cancelled paid/settled invoices. From recorded evidence that is on the order of `129,425 + 57,500` for the two known cases (contributing to the `-174,025` net on `1131`).

Implication: RR-001 should report `variance_trade_only` alongside a per-source-type and per-cancelled-invoice breakdown, so the variance is legible as "stranded clearing on cancelled invoices" rather than an opaque mismatch. When DEBT-012 is remediated (payment reclassified to Customer Deposits 2141 or settlement reversed, per the remediation design), this specific variance component should resolve — which gives RR-001 a concrete post-remediation success criterion: `variance_trade_only` returns to within tolerance once the stranded clearing is cleared. This is a design expectation, not a executed result.

## 6. What This Deepening Does NOT Do

- It does not execute RR-001 or any reconciliation query.
- It does not read reconciliation data or re-query GL/subledger totals.
- It does not alter the RR-001 design's structure (buckets, Design A, tolerance) — it sharpens three points.
- It does not change AUDIT-RR-001's status (remains Diagnostic Inspected / Redesign In Progress).
- It does not write to the database or authorize staging execution.
- It does not make a PASS/FAIL reconciliation judgment.

## 7. Readiness Checklist (for when execution is authorized in a confirmed staging environment)

- Clearing bucket classified from JE `source_type` (payment/settlement), not from `sales_payments`.
- Subledger `open` uses valid active allocations (`reverses_allocation_id IS NULL`, not reversed), never `document_remaining`.
- `non_trade_ar_artifact` (fixed_asset_disposal) excluded from trade variance (RR-003).
- Output includes `variance_trade_only` + per-source-type + per-cancelled-invoice breakdown.
- Expectation documented: `variance_trade_only` non-zero while DEBT-012 live; resolves after DEBT-012 remediation.
- Executed only in a confirmed staging environment with explicit approval (currently blocked).

## 8. Status

```
RR-001 Design Deepening = Complete (design only)
Deepening 1: clearing bucket classified from JE source_type (payment/settlement), not sales_payments (DEBT-012 dim 3 evidence)
Deepening 2: valid-allocation rule (reverses_allocation_id IS NULL) consistent with cancel_sales_invoice F5.5 (DEBT-011 correct side)
Deepening 3: variance_trade_only expected non-zero ≈ stranded clearing on cancelled invoices; resolves after DEBT-012 remediation
RR-001 design structure unchanged (buckets + Design A + tolerance 0.01)
AUDIT-RR-001 status = Diagnostic Inspected / Redesign In Progress / Not Executed (unchanged)
No code change / No DB writes / Reconciliation NOT executed / No PASS/FAIL judgment
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
