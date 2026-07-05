# Sarat Test Factory — Journal Entries Safety Tests (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the fourth item in the Phase B order (§8): Journal Entries safety tests. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. This item differs in direction from items 1–3: those combined a healthy path with debt-exposing scenarios, whereas this item is primarily negative/guard — its goal is to assert that the five protective triggers reject what they must reject. Where items 1–3 exposed weakness (debts/limitations), this item documents the maturity of the protection layer (the five SAP-like guards), a complementary purpose.

---

## 1. Purpose

- Design safe seed scenarios that assert the five protective triggers on `journal_entries` / `journal_entry_lines`.
- Confirm that each guard rejects the invalid case it is designed to block.
- Document the protection maturity (this item exposes no new debt; it validates existing strength).
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from JOURNAL ENTRIES / POSTING ENGINE review, commit 4e38c3a)

The posting engine is the backbone. Confirmed live, five protective triggers (SAP-like maturity):

- `trg_check_je_balanced` — on the header: enforces Σdebit = Σcredit; rejects an unbalanced entry.
- `trg_je_approval_status` — on the header: governs the approval status on insert.
- `trg_prevent_posted_modify` — on the header: immutability; prevents modifying a posted entry.
- `trg_enforce_partner` — on the lines: enforces a partner (contact) on AR/AP control accounts.
- `trg_prevent_posted_lines` — on the lines: immutability; prevents modifying the lines of a posted entry.

Other Phase A notes carried in: `entry_no` NOT NULL per-year; `is_posted` default false; `approval_status` default `'approved'` (R-JE1); no `company_id` (R-JE4); `next_je_no` exists but engines use MAX+1 (R-JE2).

## 3. Test Direction Statement (explicit)

This is the governing distinction for this item:

- Items 1–3 asserted successful operations plus debt detectors. This item is primarily negative/guard: most scenarios are an **expected rejection**, not a successful operation.
- Each guard has a paired design: a valid case that must be accepted (baseline) and an invalid case that must be rejected (the guard firing).
- This item exposes no new debt. It documents that the five guards behave as designed — the opposite value of items 1–3.

## 4. Master Data (design — not executed)

- A small chart-of-accounts subset by role: a balanced pair of ordinary accounts, plus one AR control account (1131) and one AP control account (2111) to exercise the partner guard.
- A test partner (contact) for the AR/AP partner scenarios.
- Accounts referenced by role only (per the constitution). Implementation must resolve via account determination, not literals.

## 5. Scenario Set

### TDF-JE-B01 — Balanced entry accepted (baseline for trg_check_je_balanced)

- Classification: accounting + baseline.
- Flow: insert a journal entry whose lines satisfy Σdebit = Σcredit.
- Expected: the entry is accepted.
- Purpose: establish the valid baseline the balance guard must allow.

### TDF-JE-B02 — Unbalanced entry rejected (trg_check_je_balanced)

- Classification: negative / guard.
- Flow: attempt an entry where Σdebit ≠ Σcredit.
- Expected: `trg_check_je_balanced` rejects it.
- Purpose: confirm the balance guard fires.

### TDF-JE-B03 — Approval status governed (trg_je_approval_status)

- Classification: guard.
- Flow: insert an entry and observe the approval-status handling on insert.
- Expected: the status is governed per the trigger (per R-JE1, default `'approved'` — the scenario asserts the observed behaviour, not an assumed one).
- Purpose: document the approval-status guard behaviour.

### TDF-JE-B04 — Posted header immutable (trg_prevent_posted_modify)

- Classification: negative / guard + regression.
- Flow: post an entry (is_posted true), then attempt to modify the header.
- Expected: `trg_prevent_posted_modify` rejects the modification.
- Purpose: confirm header immutability after posting.

### TDF-JE-B05 — Posted lines immutable (trg_prevent_posted_lines)

- Classification: negative / guard + regression.
- Flow: post an entry, then attempt to modify or delete a line.
- Expected: `trg_prevent_posted_lines` rejects the change. (Cleanup of posted entries therefore requires un-posting first, per the documented Posting Engine behaviour — staging only.)
- Purpose: confirm line immutability after posting.

### TDF-JE-B06 — Partner enforced on control accounts (trg_enforce_partner)

- Classification: negative / guard.
- Flow: attempt a line on an AR (1131) or AP (2111) control account without a partner (contact); then a valid line with a partner.
- Expected: `trg_enforce_partner` rejects the partner-less control line; the valid line is accepted.
- Purpose: confirm the partner-enforcement guard on control accounts.

### TDF-JE-B07 — Numbering observation (R-JE2, non-guard)

- Classification: regression / observation.
- Flow: create two entries and observe `entry_no` assignment.
- Expected: per-year sequential numbering via the engines' MAX+1 (R-JE2), not via `next_je_no`.
- Design note: this is an observation of the numbering candidate, not a guard test; it documents R-JE2 behaviour, does not change its status.
- Purpose: record the numbering path for the candidate register.

## 6. Dependencies

- TDF-JE-B04/B05 depend on a posted entry (build on TDF-JE-B01 then post).
- TDF-JE-B06 depends on the control accounts + partner master data.
- All negative scenarios depend on the corresponding valid baseline for contrast.

## 7. Expected Impact Summary

| Scenario | Direction | Guard | Expected |
|----------|-----------|-------|----------|
| B01 | positive | trg_check_je_balanced | accepted |
| B02 | negative | trg_check_je_balanced | rejected |
| B03 | observation | trg_je_approval_status | status governed |
| B04 | negative | trg_prevent_posted_modify | rejected |
| B05 | negative | trg_prevent_posted_lines | rejected |
| B06 | negative+positive | trg_enforce_partner | rejected / accepted |
| B07 | observation | (numbering) | MAX+1 per-year (R-JE2) |

This item's column is "Direction" (positive/negative/observation), not "Debt exposed" — because it validates protection strength rather than exposing a defect.

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / real financial data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- Posted entries are immutable by design (B04/B05 confirm this); cleanup of a posted entry requires un-posting first — staging only, never production.
- Rejected scenarios (B02/B04/B05/B06 negative cases) leave no committed row, so no cleanup is needed for them.
- Cleanup order reverses creation order (lines → header → master).
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation, production changes, external ZATCA calls, or PASS/FAIL judgment. Observing R-JE1/R-JE2 here does not change their status or schedule a fix.

## 11. Status

```
Journal Entries Safety Phase B Seed Design = Designed / Not executed
Scenarios = TDF-JE-B01..B07 (primarily negative/guard; validates the five protective triggers)
This item documents protection maturity, exposes no new debt
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Five guards = trg_check_je_balanced / trg_je_approval_status / trg_prevent_posted_modify / trg_enforce_partner / trg_prevent_posted_lines
Posting Engine = Under Audit / Partially Audited
```
