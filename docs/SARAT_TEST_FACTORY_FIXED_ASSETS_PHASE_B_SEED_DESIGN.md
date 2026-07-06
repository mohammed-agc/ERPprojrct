# Sarat Test Factory — Fixed Assets Lifecycle (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the eighth and final item in the Phase B order (§8): Fixed Assets lifecycle. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. Fixed Assets is a mature function-driven engine (like items 4 and 6 it primarily documents maturity — idempotent depreciation, per-period posting, correct land handling), with a few light candidate observations (R-FA2). With this item, all eight Phase B modules are designed.

---

## 1. Purpose

- Design safe seed scenarios for the full asset lifecycle: acquire → monthly depreciation (repeatable + idempotent) → dispose.
- Document the protection maturity: per-period idempotency, straight-line depreciation, correct land handling (useful_life=0 → 0 periods), dynamic account resolution.
- Observe the candidates: R-FA2 (p_period has no future guard), TECH-DEBT-FA-001, FA3-001.
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from FIXED ASSETS review, commit aac54a3)

A mature function-driven engine:

- Two real tables (not ghost). `fixed_assets`: 🟢 `company_id` present with default `get_current_company_id` (R-FA1 — unlike most other modules, this one is company-aware by default).
- 🟢 Live trigger check = No rows → function-driven.
- Three functions:
  - `acquire_fixed_asset(13 args)` — acquisition.
  - `run_monthly_depreciation(p_period)` — per-period + idempotent + straight_line + Dr DEPRECIATION_EXPENSE / Cr ACCUMULATED_DEPRECIATION (dynamic via account determination); `entry_no = next_je_no`. Land with `useful_life = 0` → 0 periods = correct (land is not depreciated).
  - `dispose_fixed_asset(7 args)` — disposal (RR-003 = sound, not a defect).
- Candidates: R-FA2 (`p_period` has no future-date guard), TECH-DEBT-FA-001, FA3-001.

## 3. Lifecycle + Maturity Nature Statement (explicit)

This is the governing distinction for this item:

- Like items 4 (JE) and 6 (Approval), Fixed Assets primarily documents maturity: idempotent depreciation, per-period posting, correct straight-line arithmetic, and correct land handling.
- The key maturity property is idempotency: running depreciation twice for the same period must not double-post — the second run is a no-op for that period.
- A few light candidates are observed (R-FA2), documented as the current reality, not assumed fixed.
- The accounting is real here (unlike Inventory): acquisition and depreciation post journal entries.

## 4. Master Data (design — not executed)

- One depreciable asset: an `fixed_assets` row via `acquire_fixed_asset` with a cost, an acquisition date, a positive `useful_life`, straight-line method, `company_id` defaulted.
- One non-depreciable asset (land): `useful_life = 0`, to assert the zero-period path.
- Accounts referenced by role only (per the constitution): DEPRECIATION_EXPENSE, ACCUMULATED_DEPRECIATION, the asset and cash/payable accounts. Implementation resolves via account determination, not literals.

## 5. Scenario Set

### TDF-FA-B01 — Acquire a depreciable asset (baseline)

- Classification: transaction + accounting.
- Flow: `acquire_fixed_asset(...)` for a depreciable asset (positive useful_life).
- Expected: a `fixed_assets` row with company_id defaulted; the acquisition posts its journal entry per the engine.
- Purpose: establish the asset baseline.

### TDF-FA-B02 — Acquire land (non-depreciable)

- Classification: transaction + accounting.
- Flow: `acquire_fixed_asset(...)` with `useful_life = 0` (land).
- Expected: the asset exists; it will not depreciate (0 periods).
- Purpose: establish the land baseline for the zero-period assertion.

### TDF-FA-B03 — Run monthly depreciation (period posts)

- Classification: transaction + accounting.
- Flow: `run_monthly_depreciation(p_period)` for a period after B01's acquisition.
- Expected: Dr DEPRECIATION_EXPENSE / Cr ACCUMULATED_DEPRECIATION for the straight-line amount; a journal entry with `entry_no = next_je_no`.
- Purpose: prove the depreciation posting for one period.

### TDF-FA-B04 — Idempotent re-run (maturity)

- Classification: regression / maturity.
- Flow: call `run_monthly_depreciation(p_period)` again for the same period already run in B03.
- Expected: no double-posting — the second run is a no-op for that period (idempotency).
- Design note: this is the key maturity property of the engine; the scenario asserts the idempotent behaviour.
- Purpose: confirm depreciation cannot double-post for a period.

### TDF-FA-B05 — Land yields zero periods (maturity)

- Classification: accounting + maturity.
- Flow: run depreciation for a period; observe the land asset (B02).
- Expected: the land asset produces 0 depreciation (useful_life=0 → 0 periods) — correct, land is not depreciated.
- Purpose: confirm the correct land handling.

### TDF-FA-B06 — Dispose the asset (dispose_fixed_asset)

- Classification: transaction + accounting.
- Flow: `dispose_fixed_asset(...)` for B01's asset after some depreciation.
- Expected: the disposal posts per the engine (RR-003 confirmed sound); the asset reaches a disposed state.
- Purpose: prove the disposal path closes the lifecycle.

### TDF-FA-B07 — Future-period guard gap (R-FA2 observation)

- Classification: candidate-exposing + observation.
- Flow: call `run_monthly_depreciation(p_period)` with a future `p_period`.
- **Candidate observation (R-FA2):** `p_period` has no future-date guard; a future period is accepted rather than rejected.
- Design note: observation of R-FA2; documents the missing future guard, does not change its status.
- Purpose: record the R-FA2 gap for the candidate register.

## 6. Dependencies

- TDF-FA-B03..B07 depend on an acquired asset (B01); B05 on land (B02).
- TDF-FA-B04 depends on B03 having run for the same period.
- TDF-FA-B06 depends on B01 (and optionally some depreciation from B03).

## 7. Expected Impact Summary

| Scenario | Nature | Aspect | Expected |
|----------|--------|--------|----------|
| B01 | lifecycle | acquire | asset created, posts |
| B02 | lifecycle | acquire land | asset created, non-depreciable |
| B03 | lifecycle | depreciation | Dr exp / Cr accum, one period |
| B04 | maturity | idempotency | re-run is a no-op |
| B05 | maturity | land handling | 0 periods (correct) |
| B06 | lifecycle | dispose | disposal posts (RR-003) |
| B07 | candidate | R-FA2 | future period accepted (gap) |

This item's columns are "Nature" (lifecycle / maturity / candidate) — reflecting that Fixed Assets primarily documents a mature engine (B04/B05) while observing a light candidate (B07).

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / real asset data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- Depreciation and acquisition post journal entries which are immutable (Posting Engine guards); cleanup requires un-posting first — staging only, never production.
- Cleanup order reverses creation order (disposal → depreciation entries → asset row → master).
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation (including adding a future-period guard for R-FA2), production changes, external ZATCA calls, or PASS/FAIL judgment. Observing R-FA2/TECH-DEBT-FA-001/FA3-001 here does not change their status or schedule a fix.

## 11. Status

```
Fixed Assets Lifecycle Phase B Seed Design = Designed / Not executed
Scenarios = TDF-FA-B01..B07 (B04/B05 document maturity: idempotency + land; B07 observes R-FA2)
Mature function-driven engine; real accounting (acquire + depreciation post)
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Maturity = idempotent per-period depreciation + straight-line + correct land (0 periods)
Candidates = R-FA2 (no future-period guard) / TECH-DEBT-FA-001 / FA3-001 — documented, not fixed
This is the eighth and final Phase B module — all eight now designed
Posting Engine = Under Audit / Partially Audited
```
