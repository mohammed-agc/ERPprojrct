# Sarat Test Factory — Journal Entries / Posting Engine Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md` §7): schema · triggers · functions · live examples · risks. No seed is designed here. This is the fifth module reviewed — the accounting backbone into which the four core modules post.

---

## 1. Purpose

Document the Journal Entries / Posting Engine Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed. This module is the general ledger backbone: every posting engine (sales, purchasing, payments, settlements, fixed assets) writes here.

## 2. Schema Evidence

**journal_entries** — required (NOT NULL): `entry_no` (numbered per-year by `entry_date`). Defaulted: `entry_date`=CURRENT_DATE, `is_posted`=false, `approval_status`='approved', `total_debit`/`total_credit`=0. Reversal machinery: `reverses_entry_id`, `is_reversed`, `reversed_at`, `reversed_by`. Source link: `source_type`, `source_id`. Approval fields present but overridden by the default. No `company_id`.

**journal_entry_lines** — required: `entry_id`, `account_id` (`debit`/`credit` defaulted 0). Analytical dimensions: `contact_id`+`partner_type` (partner-tracked balances), `vehicle_id` (F3 Per-VIN COGS), `document_type`/`document_id`, `branch_id`+`cost_center_id`+`profit_center_id`, `reference_number`, `remarks`. No `company_id`.

## 3. Triggers Evidence (posting-engine core — 5 protective triggers)

**journal_entries** (3):
- `trg_check_je_balanced` (BEFORE UPDATE) → `check_journal_entry_balanced` — enforces Σdebit = Σcredit.
- `trg_je_approval_status` (BEFORE INSERT) → `set_je_approval_status`.
- `trg_prevent_posted_modify` (BEFORE DELETE OR UPDATE) → `prevent_posted_entry_modification` — immutability for a posted entry.

**journal_entry_lines** (2):
- `trg_enforce_partner` (BEFORE INSERT OR UPDATE) → `enforce_partner_on_control_accounts` — control accounts (AR/AP) require a partner.
- `trg_prevent_posted_lines` (BEFORE INSERT OR DELETE OR UPDATE) → `prevent_posted_lines_modification` — immutability for lines of a posted entry.

Together this is a SAP-like accounting maturity: balance + immutability + partner discipline enforced in the database, not only in code.

## 4. Functions Evidence

`next_je_no(p_date date)` — per-year numbering. There is no numbering trigger, however, so the engines build `entry_no` themselves (MAX+1) or call `next_je_no` — a decentralization point (R-JE2). `check_journal_entry_balanced`, `enforce_partner_on_control_accounts`, `set_je_approval_status` (approval defaults to 'approved').

## 5. Live Examples Evidence

Live `source_type` values are a full spread:
- `sales_invoice` (JE-2026-0043/44/45, 3 lines: revenue + VAT + AR, balanced).
- `purchase_payment` (JE-2026-0042, 2 lines).
- `manual` (JE-2026-0039/40/41 — hand-entered; 0040/0041 `is_posted=false` drafts, 0039 posted).
- `fixed_asset_disposal` (JE-2026-0032/33/35/36/38, 2-4 lines).
- `credit_note` (JE-2026-0013/14/15, 3 lines).
- `depreciation` (JE-2030-* / JE-2031-*, future-dated — see R-JE3).

All are balanced (debit=credit). A manual entry starts `is_posted=false` (the default) and is posted by UPDATE (passing the balance trigger), after which it is immutable. Numbering gaps exist (deleted/filtered entries).

## 6. Scenario Matrix (outline — filled in Phase B, not now)

| scenario | workflow | accounting | raw SQL? |
|----------|----------|-----------|----------|
| Manual entry | INSERT journal_entries (is_posted=false) + lines → UPDATE is_posted=true | balance enforced | via workflow (immutability care) |
| Engine-generated entry | (the invoice/payment/... creates it) | per source | no direct seed (comes from the module) |
| Reversal | reverses_entry_id + is_reversed | mirror | function (F5) |

## 7. Risks / Candidates

- **R-JE1 (candidate):** `approval_status` defaults to 'approved' — entries are approved by default (approval workflow not actually enforced despite the fields existing). May be intentional (single-user) or a gap.
- **R-JE2 (candidate):** numbering decentralization — `next_je_no` exists but engines may build MAX+1 directly. Race/pattern risk; needs confirmation of which is used.
- **R-JE3 (note, not a debt):** depreciation created future-dated entries (2030-2031). Intended (a depreciation schedule), but future-dated posted entries affect ORDER BY / time-based reports.
- **R-JE4 (candidate):** no `company_id` in journal_entries/lines — same cross-table inconsistency pattern (see R-Pay4).

No risk in the protections themselves — balance + immutability + partner enforcement are strong.

## 8. Recommendation

Journal Entries / Posting Engine Phase A is Read-only Reviewed: schema, the 5 protective triggers, functions, and live examples (a full spread of source_types) are all read. The posting engine is accounting-mature (balance + immutability + partner enforcement in the database). A direct entry seed requires great care (immutability + prevent_posted_lines on INSERT); entries are best produced by the engines (via workflow), not hand-seeded — a manual draft entry (`is_posted=false`) is possible. Phase B seed remains deferred until staging confirmation.

## 9. Status

```
Journal Entries/Posting Engine Phase A = Read-only Reviewed / No seed designed / Not Executed
Posting Engine = accounting-mature (balance + immutability + partner enforcement; 5 protective triggers)
Candidates: R-JE1 (approval default approved), R-JE2 (decentralized numbering), R-JE4 (no company_id)
Note: R-JE3 (future-dated depreciation, design not debt)
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
