# Sarat Test Factory — Payments/Settlements Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md` §7): schema · triggers · functions · live examples · risks. No seed is designed here. This is the fourth module reviewed (after Sales, Purchasing, Inventory/Vehicles) and closes the four core modules.

---

## 1. Purpose

Document the Payments/Settlements Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed.

## 2. Schema Evidence

**payments** — required: `amount` (`payment_no` default pattern `PAY-<uuid8>`). `customer_id` present (not `contact_id`). No `journal_entry_id` column (the JE is linked by `source_id` in `journal_entries`, not by a column here). No `approval_status` (customer payment is immediate, no approval). No `company_id`. `payment_method` and `method` both present — duplication candidate (R-Pay1).

**open_item_allocations** — required (NOT NULL): `allocation_type`, `target_document_type`, `target_document_id`, `allocated_amount`. `journal_entry_id` nullable (DEBT-010). `reverses_allocation_id` nullable (DEBT-011). `status` default 'active'. `created_by` nullable (DEBT-010). `partner_id`. `company_id` + `branch_id` both present (unlike payments — see R-Pay4).

## 3. Triggers Evidence

- **payments:** `trg_payment_journal_entry` (AFTER INSERT) → `create_payment_journal_entry` posts a Dr cash/bank / Cr AR journal entry.
- **open_item_allocations:** `trg_oia_number` (BEFORE INSERT) → numbering only; no accounting trigger.

So: the **payment** creates the accounting; the **allocation** links open items and does not create GL. The allocation is a linking layer (open-item), not an accounting layer.

## 4. Functions Evidence [read in DEBT-012]

- `create_payment_journal_entry` — the payment → JE (Dr cash / Cr AR).
- `create_allocation` — has `p_journal_entry_id DEFAULT NULL`; writes `journal_entry_id` if provided; the over-allocation guard uses `document_remaining`.
- `create_partner_settlement` — builds the settlement JE (Dr AP / Cr AR, two lines) and the SETTLEMENT allocations (FIFO).
- `document_allocated` / `document_remaining` — affected by DEBT-011 (they sum active allocations positively without checking `reverses_allocation_id`).

## 5. Live Examples Evidence

8 allocations + 1 payment, all for partner 2531b06a:

- **PAYMENT (active):** CLR-2026-00001 (100000), CLR-2026-00005 (57500).
- **SETTLEMENT:** CLR-2026-00002 (active), CLR-2026-00003 (active), CLR-2026-00004 (reversed).
- **CREDIT_NOTE (reversals, active):** REV-CLR-2026-00003, REV-CLR-2026-00004, REV-CLR-2026-00005.
- **payment:** PMT-1414452433 (57500) — note the `PMT-*` pattern, not the `PAY-*` default.

## 6. DEBT-011 Live Confirmation

- CLR-2026-00003 (active) + REV-CLR-2026-00003 (active).
- CLR-2026-00005 (active) + REV-CLR-2026-00005 (active).

In these pairs the original and its reversal are **both active**, so `document_allocated` / `document_remaining` can count both positively (the functions do not inspect `reverses_allocation_id`). By contrast CLR-2026-00004 is different — its original is marked `reversed`. This shows an inconsistent reversal-status marking: some originals are flagged `reversed`, others stay `active` while a reversal exists. This is an expansion / deeper live evidence for DEBT-011, not a new debt currently.

## 7. DEBT-010 Structural Confirmation

- `open_item_allocations.journal_entry_id` is nullable.
- `open_item_allocations.created_by` is nullable.
- `create_allocation` has `p_journal_entry_id DEFAULT NULL`.

This matches the DEBT-010 risk. Phase B must require an explicit `journal_entry_id` for PAYMENT allocations (never NULL).

## 8. Scenario Matrix (outline — filled in Phase B, not now)

| scenario | workflow | accounting | raw SQL status |
|----------|----------|-----------|----------------|
| Customer payment | INSERT payments → trigger creates JE | Dr cash / Cr AR | workflow-consistent on confirmed staging |
| Payment allocation | create_allocation('PAYMENT', p_journal_entry_id => JE) | no new GL, open-item link | function |
| Partner settlement | create_partner_settlement | Dr AP / Cr AR | function |
| Allocation reversal / credit note | reversal allocation using reverses_allocation_id | per type | function (status handling risk — DEBT-011) |
| DEBT-012 cancellation test support | payments + allocation | — | required evidence |

## 9. Risks / Candidates

- **R-Pay1 (candidate):** `payment_method` / `method` duplication on payments.
- **R-Pay2 (= DEBT-011, confirmed live):** active original + reversal pairs (CLR-00003+REV, CLR-00005+REV), plus inconsistent reversed/active marking (CLR-00004 reversed vs 00003/00005 active).
- **R-Pay3 (= DEBT-010, confirmed structurally):** nullable `journal_entry_id`/`created_by` and the `create_allocation` DEFAULT NULL.
- **R-Pay4 (candidate):** `company_id` inconsistency across tables — `open_item_allocations` has `company_id`/`branch_id`, `payments` does not.
- **R-Pay5 (candidate):** `payment_no` pattern inconsistency (PAY default vs PMT custom).

## 10. Recommendation

Payments/Settlements Phase A is Read-only Reviewed: payments, open_item_allocations, triggers, functions, and live examples are all read. This module is the locus of DEBT-010, DEBT-011, and DEBT-012; Phase A documents the structure, it does not remediate. Phase B seed must use: `payments` for the actual payment source; fetch the generated JE by `source_type='sales_payment'` and `source_id=payments.id`; `create_allocation` with an explicit `journal_entry_id`; and `create_partner_settlement` for settlement. No seed execution until staging is confirmed.

## 11. Status

```
Payments/Settlements Phase A = Read-only Reviewed / No seed designed / Not Executed
DEBT-011 = Confirmed live with active original+reversal pairs and inconsistent reversal marking
DEBT-010 = Confirmed structurally via nullable journal_entry_id/created_by and create_allocation default
Candidates = R-Pay1 / R-Pay4 / R-Pay5
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
