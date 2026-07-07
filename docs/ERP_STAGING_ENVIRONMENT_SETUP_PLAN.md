# Sarat ERP — Staging Environment Setup Plan + Gate 0 Proof Checklist

**Status:** Planning / documentation only · No execution · No DB write · No production write · No seed · No remediation · No reconciliation execution · No external ZATCA call · No PASS/FAIL · Staging environment = Not yet created/confirmed · Execution = Not authorized · Posting Engine = Under Audit / Partially Audited

This document plans the creation and identity-proof of an isolated Supabase **staging** environment, separate from production, so that DEBT-012 remediation (and any other future write work) can eventually be executed safely. It does not create anything, does not write to any database, and does not authorize execution. It is the concrete companion to **Gate 0** in `docs/ERP_DEBT012_STAGING_EXECUTION_PLAN.md`.

The immediate goal is environment setup + Gate 0 proof only. It is explicitly NOT Phase 0A, NOT Phase 0B, NOT seed, NOT remediation.

---

## 1. Production Identity Baseline (document the known — so it is never touched)

The current, only-known live database is **production**. It must never be written to by any staging work.

- Production `company_id` = `f40c7eff-57e3-42aa-869b-867d3d77cb84`.
- Production contains live ZATCA data and credentials (active production PCSID, signed artifacts, submission log with cleared submissions).
- Production must not be written to under any circumstance by this plan.
- The two golden ZATCA fixtures (`src/services/zatca/__fixtures__/zatca-golden/*.xml`) remain untracked and must never be `git add`-ed (never `git add .`; add by explicit filename only).
- Production session identity (admin user, test user `ed98ead7…`) is production data, not to be reused as a staging marker.

## 2. Staging Creation Requirement (what staging must be)

Staging must be a genuinely separate environment, not a schema/label inside production:

- An independent Supabase project (or an isolated database), physically separate from production.
- `project_id` different from production.
- DB URL different from production.
- No production ZATCA credentials; no production PCSID/CCSID.
- No real production customer/invoice data.
- Clearly marked as staging.

## 3. Required Staging Proof (to be supplied by the owner after creation)

After the staging project is created, the owner supplies (no full secrets — masked where sensitive):

- Staging Supabase project ref / `project_id`.
- Staging DB host or masked DB URL (do not reveal the full password).
- Staging `company_id` (once seeded/created).
- Proof it is not `f40c7eff`.
- Proof there are no ZATCA production credentials (sandbox-only, or none).
- A specific, written authorization to write to staging only.

## 4. Environment Files

- Create a local, un-committed `.env.staging.local` holding the staging project ref + anon key + DB URL.
- It must NOT be added to Git — confirm it is covered by `.gitignore` before any staging work.
- No full secrets in chat — masked identifiers only.

## 5. Schema Setup Options (two options, no execution)

- **Option A — schema/migrations only, no production data (preferred).** Build staging purely from the migration history / schema, with no copied production data. Test data comes later, only via Phase 0B seed-via-workflow. Cleanest, no risk of leaking production data, and aligns with the "Installable By Any Customer" principle (clean schema + controlled seed).
- **Option B — sanitized clone of production.** Clone production, then delete/disable ZATCA credentials and sensitive data. Riskier: requires rigorous sanitization and risks leaving a production remnant.

Recommendation: **Option A**, unless a specific reason requires real-shaped data that only a sanitized clone can provide.

## 6. Gate 0 Checklist (before any write)

Mirrors Gate 0 in the DEBT-012 staging execution plan. All boxes must be checked before any staging write.

```
[ ] project_id different from production
[ ] DB URL different from production
[ ] company_id is NOT f40c7eff (or an explicitly staging-marked clone)
[ ] no production ZATCA credentials
[ ] no external ZATCA calls
[ ] .env.staging.local is NOT committed (covered by .gitignore)
[ ] explicit, scoped write authorization
[ ] anti-production assertion ready (read-only check aborts if it matches production)
[ ] rollback / cleanup strategy ready
```

Current state: all unchecked → **Gate 0 = Not satisfied**.

## 7. Anti-Production Assertion (design note, no execution)

Before the first write in any later staging script, a read-only check should abort if any of these is true: the DB URL / project_id matches production; `company_id` matches `f40c7eff` without an explicit staging marker; or production ZATCA credentials are present. On failure: abort before the first write, log the reason, do nothing else. This is defence-in-depth on top of the manual Gate 0 proofs, not a replacement for them.

## 8. Next Step After Staging Proof

Only after Gate 0 is fully satisfied (all boxes checked) AND a separate explicit authorization:

- **Phase 0A only** — add the `CUSTOMER_DEPOSITS` account-determination key on staging (by role, not hardcoded).
- **NOT Phase 0B** (separate later authorization).

Until then: no write of any kind.

## 9. Status

```
Staging Environment Setup Plan = Prepared (planning / documentation only)
Staging environment = Not yet created / Not confirmed
Gate 0 = Required · current status = Not satisfied / Not executed
Schema setup = Option A preferred (schema/migrations only, no production data) — not executed
Next after Gate 0 = Phase 0A only, separate explicit authorization
Execution = Not authorized · No DB write · No production write · No seed · No remediation · No external ZATCA call · No PASS/FAIL
Posting Engine = Under Audit / Partially Audited
```
