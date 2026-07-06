# Sarat Remediation Design — R-FA2 (Depreciation Future-Period Guard)

**Status:** Remediation Design only / No code change / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document designs the remediation for candidate R-FA2, observed during the Fixed Assets review (Phase A, aac54a3) and reproduced as observation TDF-FA-B07 in Phase B. It is design only — no function is altered, no database is written, and no candidate is promoted to a debt without explicit permission.

---

## 1. Candidate Restated (confirmed by live evidence)

A live read of `run_monthly_depreciation(p_period text)` (via `pg_get_functiondef`) confirms R-FA2: the function accepts `p_period` and immediately builds `v_period_date := to_date(p_period||'-01','YYYY-MM-DD')` with no check that the period is not in the future. A caller can pass a future period (e.g. `'2030-01'`) and the function will post depreciation journal entries dated at that future month-end, `is_posted=true`, for every active depreciable asset.

## 2. What the Live Function Actually Does (context for the fix)

The function is otherwise mature:

- `p_period` is text `'YYYY-MM'`; `v_period_date` is the first day of that month.
- Accounts resolve via account determination (DEPRECIATION_EXPENSE, and ACCUMULATED_DEPRECIATION specific→default by `asset_class`) — no hardcoded numbers.
- Idempotent: skips an asset if `fixed_asset_depreciation` already has a row for (asset_id, period).
- Straight-line with a final-installment guard that never takes book value below salvage.
- Entry date = month-end (`date_trunc('month',v_period_date)+interval '1 month -1 day'`), `is_posted=true`, `source_type='depreciation'`.
- Returns `{success, period, processed, skipped}`.

The only missing safeguard is the future-period check. Everything else is sound and must remain untouched.

## 3. Root Cause

There is no period validation between reading `v_period_date` and the asset loop. The function trusts the caller's `p_period`. Because the entries are posted immediately (`is_posted=true`), a future period silently creates future-dated posted GL — a period-integrity violation.

## 4. Design Question — What Counts as "Future"?

Depreciation is normally run at (or after) the end of the month being depreciated. So the guard should reject a period whose month has not yet ended. Two reasonable boundaries:

- **Strict (recommended):** reject any period whose month starts after the current month — i.e. `v_period_date > date_trunc('month', CURRENT_DATE)`. This blocks all genuinely future months while still allowing the current month (useful for month-end runs on the last day) and all past months (back-fill/catch-up remains possible).
- **Stricter alternative:** also block the current month until it has ended (`v_period_date >= date_trunc('month', CURRENT_DATE)`). This is cleaner accounting (never depreciate an unfinished month) but removes the ability to run on the last day of the month itself.

The recommended design is Strict (allow current month, block later months), because month-end runs on the final day are a normal operational pattern and the stricter form would reject them.

## 5. Recommended Design

Add a single guard immediately after `v_period_date` is computed, before the account-determination lookups:

- If `v_period_date > date_trunc('month', CURRENT_DATE)` then `RAISE EXCEPTION` with a clear, bilingual-friendly message identifying the rejected period (e.g. a `FUTURE_PERIOD_NOT_ALLOWED` style error including `p_period`).
- Nothing else changes: the loop, idempotency, account determination, and posting all stay exactly as they are.

This is a minimal, localized change — one validation block — consistent with the constitution's "No Silent Assumptions" principle (the function must not silently accept a future period).

## 6. Why a Guard, Not a Silent Skip

The function should reject (RAISE), not silently skip, a future period. A silent skip would return `{processed:0}` and look like a successful no-op, hiding the caller's mistake. An explicit exception surfaces the error to the caller (UI or batch job) so it can be corrected — matching how the function already RAISEs when an account determination is missing.

## 7. What This Design Does NOT Do

- It does not alter the function or create a migration.
- It does not write to the database.
- It does not change the idempotency, straight-line math, or account determination.
- It does not promote R-FA2 from candidate to debt (that needs explicit permission).
- It does not execute in any environment (staging not confirmed).

## 8. Verification Plan (for when execution is authorized in staging)

- Confirm a past period still processes normally (regression: same processed/skipped as today).
- Confirm the current month still runs (month-end pattern preserved) under the Strict boundary.
- Confirm a clearly future period (e.g. next year) raises the exception and creates no journal entries and no `fixed_asset_depreciation` rows.
- Confirm idempotency is unaffected (re-running an allowed period still skips already-depreciated assets).

## 9. Status

```
R-FA2 Remediation Design = Complete (design only)
Live evidence: run_monthly_depreciation builds v_period_date with no future check
Root cause: no period validation before the asset loop; entries post immediately (is_posted=true)
Recommended: single guard v_period_date > date_trunc('month', CURRENT_DATE) → RAISE (Strict: allow current month, block later)
Reject not skip (surface the caller's error, consistent with existing RAISEs)
Everything else (idempotency, straight-line, account determination) unchanged
R-FA2 status = Candidate (unchanged; not promoted)
No code change / No DB writes / No migration / No execution
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
