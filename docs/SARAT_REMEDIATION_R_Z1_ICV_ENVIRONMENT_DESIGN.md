# Sarat Remediation Design — R-Z1 (ICV Counter Environment Dimension)

**Status:** Remediation Design only / No code change / No DB writes / No external ZATCA call · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document designs the remediation for candidate R-Z1, observed during the ZATCA review (Phase A, 8c24b47) and reproduced as observation TDF-ZATCA-B05 in Phase B. It is design only — no function or table is altered, no database is written, no external ZATCA/Fatoora call is made, and no candidate is promoted to a debt without explicit permission. No signed XML, token, secret, or credential fingerprint is printed anywhere in this design.

---

## 1. Candidate Restated (confirmed by live evidence — metadata only)

A live read of the `zatca_icv_counter` schema and the `next_zatca_icv(p_company uuid)` function body (metadata only — no secret values) confirms R-Z1:

- `zatca_icv_counter` has three columns: `company_id` (uuid, NOT NULL), `current_icv` (bigint, NOT NULL), `updated_at` (timestamptz). There is no `environment` column.
- `next_zatca_icv(p_company uuid)` takes the company only. It atomically upserts and increments the counter keyed on `company_id` alone (`ON CONFLICT (company_id)`), returning the next ICV.

So there is exactly one ICV counter per company, shared across all environments.

## 2. Why This Matters (the ZATCA constraint)

ZATCA requires the ICV (Invoice Counter Value) to form a contiguous, per-environment chain: each environment (sandbox / simulation / production) has its own sequence starting at 1 and incrementing by 1 with no gaps. A counter keyed on company only cannot express that:

- If a sandbox invoice takes ICV=4 and then a production invoice takes ICV=5 from the same counter, the production chain does not start at 1 and is not contiguous on its own — which risks ZATCA rejecting the production chain.
- The document chain (`zatca_document_chain`) already records environment context per artifact, but the counter that feeds it does not separate by environment, so the two can diverge.

This is a structural gap that matters specifically at the transition from sandbox to production — exactly the boundary the constitution's Product-First and "sandbox ≠ production readiness" principles care about.

## 3. Root Cause

The counter's identity is `company_id` only. The environment is not part of the key, so a single monotonic sequence is shared by every environment a company submits to. The atomic increment logic itself is sound; only the key is too narrow.

## 4. Remediation Options

### Option A — Add environment to the key (recommended)

Add an `environment` column to `zatca_icv_counter` (e.g. text: 'sandbox' | 'simulation' | 'production'), make the primary key `(company_id, environment)`, and add a `p_environment` parameter to `next_zatca_icv` so the upsert/increment is per (company, environment).

- Pros: correct per-environment chains; minimal logic change (the atomic pattern stays); aligns the counter with how the document chain already thinks about environment.
- Cons: schema change (new column + PK change) plus a function-signature change (backward-compatible if `p_environment` defaults, but a default risks silently reusing one environment — better to make it explicit and update callers).

### Option B — Separate counter row per environment via a composite natural key without a column

Not recommended: encoding environment into an existing field (e.g. a synthetic company key) violates SSOT and "No Silent Assumptions."

## 5. Recommended Design (Option A)

- `zatca_icv_counter`: add `environment` (text, NOT NULL, constrained to the allowed set), change PK to `(company_id, environment)`.
- `next_zatca_icv`: add `p_environment` parameter; upsert and increment keyed on `(company_id, environment)`; `ON CONFLICT (company_id, environment)`.
- Callers (the Service Layer that requests an ICV) must pass the environment they are submitting to — no default that could silently mix environments.
- The atomic pattern (INSERT ON CONFLICT DO NOTHING → SELECT FOR UPDATE → UPDATE) is unchanged; only the key widens.

This gives each (company, environment) its own contiguous ICV chain, which is what ZATCA requires, without changing the proven atomic increment behaviour.

## 6. Migration Consideration (design note, not executed)

Existing counter rows are per-company with no environment. A remediation migration would need to decide how to interpret the current `current_icv` value (e.g. assign it to the environment those invoices were actually submitted to — which the live data shows is sandbox). This is a data-mapping decision to make during the implementation review, with the live submission history as evidence, not assumed here. Because production has not been used for real submissions yet (sandbox-only history), the production chain can start clean at 1.

## 7. What This Design Does NOT Do

- It does not alter the table or the function or create a migration.
- It does not write to the database.
- It does not make any external ZATCA/Fatoora call.
- It does not print any signed XML, token, secret, or credential fingerprint.
- It does not promote R-Z1 from candidate to debt (that needs explicit permission).
- It does not judge production readiness (sandbox acceptance ≠ production readiness).
- It does not execute in any environment (staging not confirmed).

## 8. Verification Plan (for when execution is authorized in staging)

- Confirm that requesting an ICV for (company, 'sandbox') and (company, 'production') yields two independent sequences, each starting/continuing correctly.
- Confirm the atomic increment still holds under concurrent calls for the same (company, environment) — no duplicate ICVs.
- Confirm the document chain records match the per-environment counter (no cross-environment ICV reuse).
- Confirm existing sandbox history maps correctly and the production chain starts at 1.

## 9. Status

```
R-Z1 Remediation Design = Complete (design only)
Live evidence (metadata only): zatca_icv_counter keyed on company_id only; next_zatca_icv(p_company) — no environment
Root cause: counter identity is company only; environment not in the key → one sequence shared across environments
ZATCA constraint: ICV must be contiguous per environment (sandbox/production separate, each from 1)
Recommended: Option A — add environment column, PK (company_id, environment), p_environment param; keep atomic pattern
Callers must pass environment explicitly (no silent default)
R-Z1 status = Candidate (unchanged; not promoted)
No code change / No DB writes / No migration / No external ZATCA call / No secrets printed
sandbox acceptance ≠ production readiness
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
