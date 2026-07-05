# Sarat Test Factory — Fixed Assets Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md` §7): schema · triggers · functions · live examples · risks. No seed is designed here. This is the sixth module reviewed.

---

## 1. Purpose

Document the Fixed Assets Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed.

## 2. Schema Evidence

Both tables exist (not ghosts).

**fixed_assets** — required (NOT NULL): `asset_no`, `asset_name`, `asset_class`, `acquisition_date`, `acquisition_cost`. Defaulted: `depreciable`=true, `depreciation_method`='straight_line', `acquisition_source`='manual', `status`='active', `company_id`=`get_current_company_id()`. Acquisition: `acquisition_source`, `purchase_invoice_id`, `acquisition_journal_entry_id`. Depreciation: `salvage_value`, `useful_life_months`, `accumulated_depreciation`, `book_value`. Disposal: `disposed_at`, `disposal_journal_entry_id`, `disposal_no`/`disposal_type`/`disposal_proceeds`/`disposal_gain_loss`/`reason`. Classification: `asset_class`, `cost_center`, `branch_id`.

**fixed_asset_depreciation** — required (NOT NULL): `asset_id`, `period`, `depreciation_amount`. Plus `accumulated_after`, `book_value_after`, `journal_entry_id`, `posted_at`. Each row is one depreciation period with a balance snapshot and its journal entry (entries, not a mere plan).

## 3. Trigger Evidence

A live check of `pg_trigger` for both `fixed_assets` and `fixed_asset_depreciation` returned no rows. Fixed asset lifecycle is function-driven; no `fixed_assets`/`fixed_asset_depreciation` trigger was found in this review. All operations go through explicit RPCs (acquire / depreciate / dispose), so there is no trigger to fire on a direct insert.

## 4. Functions Evidence

- **acquire_fixed_asset** — creates the asset and the acquisition journal entry (credit account via `p_credit_account_code`; links `purchase_invoice_id`/`supplier_id`).
- **run_monthly_depreciation(p_period)** — runs per period across all eligible assets. Straight-line: (acquisition_cost − salvage) / useful_life_months. Idempotent by an asset/period existence check (skips if that period was already depreciated). The final depreciation is protected from going below salvage value. Posts Dr depreciation expense (`DEPRECIATION_EXPENSE`, unified) / Cr accumulated depreciation. The accumulated-depreciation account is dynamic by asset class (`ACCUMULATED_DEPRECIATION` — specific class → default). Entry number via `next_je_no`; a separate `DEP-YYYY-NNNN` batch reference. Updates `accumulated_depreciation`, `book_value`, and `status` (→ `fully_depreciated` when book value reaches salvage).
- **dispose_fixed_asset** — handles disposal with proceeds and gain/loss; relates to RR-003.

## 5. Live Examples Evidence

Five fixed assets, all disposed:

- **FA-2026-0001** — vehicle, cost 120000, accumulated 118000, 59 depreciation periods.
- **FA-2026-0003** — vehicle, cost 120000, accumulated 100000, 60 periods.
- **FA-2026-0002** — land, useful_life=0, 0 depreciation periods.
- **FA-2026-0004 / FA-2026-0005** — computer / equipment, accumulated=0, 0 periods.

All have book_value=0 after disposal. Land shows 0 depreciation, which is correct. The future 2030/2031 depreciation entries seen in the Journal Entries module are explained by pre-running monthly depreciation across an asset's useful life (e.g. FA-0003's 60 monthly periods from 2026 extend into 2031).

## 6. Accounting / Posting Evidence

- Acquisition creates Dr asset / Cr the selected credit account (or AP/cash).
- Depreciation creates Dr depreciation expense / Cr accumulated depreciation.
- Disposal creates a disposal JE with proceeds / gain / loss.
- Account resolution uses account roles / determinations where applicable (DEPRECIATION_EXPENSE, ACCUMULATED_DEPRECIATION by class).
- RR-003 remains Not a Defect / Test-Data Artifact: `dispose_fixed_asset` is structurally sound; the caller passed proceeds account 1131 in test data.

## 7. Scenario Matrix (outline — filled in Phase B, not now)

| scenario | workflow/function | accounting | raw SQL status |
|----------|-------------------|-----------|----------------|
| Acquire asset | acquire_fixed_asset | Dr asset / Cr cash or AP | function only |
| Monthly depreciation | run_monthly_depreciation | Dr expense / Cr accumulated depreciation | function only |
| Land asset | (acquire, depreciable behavior) | no depreciation | expected: 0 depreciation periods |
| Disposal | dispose_fixed_asset | proceeds + accumulated depreciation + asset removal + gain/loss | function only |
| Future-period depreciation | run_monthly_depreciation(future period) | as above | allowed by current function — design note |

## 8. Risks / Candidates

- **R-FA1 (candidate):** `company_id` exists in `fixed_assets` (default `get_current_company_id()`) but this is inconsistent with modules that lack `company_id` (journal_entries, payments, inventory_items).
- **R-FA2 (design note, not promoted):** `run_monthly_depreciation` accepts future periods (this is what produced the 2030/2031 entries). Design note, not a promoted debt.
- **TECH-DEBT-FA-001:** unified document numbering issue.
- **TECH-DEBT-FA3-001:** prorated depreciation not implemented.
- **RR-003:** Not a Defect / Test-Data Artifact.

## 9. Recommendation

Fixed Assets Phase A is Read-only Reviewed: schema (two tables), the three RPCs (acquire / depreciate / dispose), the live trigger check, and the live examples are all read. The module is mature: correct straight-line, idempotent depreciation, dynamic accumulated account by class, land not depreciated, final-installment protection, and company-aware (`company_id` with default). Seed design should use the functions, not raw INSERT — `acquire_fixed_asset` is the correct seed entry point. Do not seed by inserting `fixed_assets` directly unless future evidence explicitly proves it safe. Phase B remains deferred until staging confirmation.

## 10. Status

```
Fixed Assets Phase A = Read-only Reviewed / No seed designed / Not Executed
RR-003 = Not a Defect / Test-Data Artifact
TECH-DEBT-FA-001 and TECH-DEBT-FA3-001 = Existing documented debts
Candidates = R-FA1 / R-FA2
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
