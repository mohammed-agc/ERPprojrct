# Sarat Remediation Design — R-Z2 (Credential last_used_at Tracking)

**Status:** Remediation Design only / No code change / No DB writes / No external ZATCA call · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document designs the remediation for candidate R-Z2, observed during the ZATCA review (Phase A, 8c24b47) and reproduced as observation TDF-ZATCA-B04 in Phase B. It is design only — no function or table is altered, no database is written, no external ZATCA/Fatoora call is made, and no candidate is promoted to a debt without explicit permission. No signed XML, token, secret, or credential fingerprint is printed anywhere in this design.

---

## 1. Candidate Restated (corrected by live evidence — metadata only)

A live read of the `zatca_credentials` schema (metadata only — no secret column values were read) refines R-Z2. The prior wording ("last_used_at null for all six rows") is accurate about the symptom, but the schema shows the root is not a missing column:

- `zatca_credentials` already has a full lifecycle-tracking shape: `issued_at`, `last_used_at`, `last_rotated_at`, `secret_rotated_at`, `status`, `is_active`, plus `environment` and `credential_type` (all present).
- `last_used_at` (timestamptz, nullable) **exists** but is never populated — nothing writes to it when a credential is used to sign or submit.

So R-Z2 is not a missing field; it is a defined field that no code updates — the same shape as R-AP1-3 (the data models more than the logic maintains).

## 2. Why This Matters

`last_used_at` is an operational and security signal:

- It surfaces dormant credentials (issued/active but never actually used) — useful before a production cutover and for cleanup.
- It supports usage auditing (which credential signed/submitted, and when) alongside the existing `submission_log`.
- It informs rotation decisions: a credential unused for a long time is a candidate for revocation.

Without it, the credential lifecycle columns tell only part of the story (issued/rotated/status) but not "actively in use."

## 3. Root Cause

The Service Layer resolves and uses a credential (to sign or submit) but does not stamp `last_used_at` on the row it used. The column is part of the schema's intended lifecycle model, but no write path maintains it.

## 4. Remediation Options

### Option A — Stamp on use in the Service Layer (recommended)

When the Service Layer selects a credential to sign/submit, after a successful use it updates that credential's `last_used_at = now()` (a targeted update by credential id). This keeps the write at the point of truth (the Service Layer owns credential use) and is a minimal, non-cryptographic write.

- Pros: accurate — reflects real use; aligns with "Service Layer owns the operation"; no schema change (column already exists).
- Cons: requires the Service Layer to perform one extra lightweight update per use (or batch it).

### Option B — A small DB helper `touch_zatca_credential(p_credential_id)`

Provide a tiny SECURITY DEFINER function that stamps `last_used_at = now()` for a given credential id, called by the Service Layer after use.

- Pros: centralizes the write in one auditable place; the Service Layer calls one function; consistent with the existing pattern of DB functions for credential state (e.g. transition/rotate).
- Cons: one more function to maintain.

### Recommended

Option B (a `touch_zatca_credential` helper) — it centralizes the write, matches the existing DB-function pattern for credential lifecycle (status transitions, rotations already live in DB functions), and keeps the Service Layer's call site simple. The stamp is metadata only — it never touches `secret_encrypted` or any signing material.

## 5. Recommended Design (Option B)

- A minimal function `touch_zatca_credential(p_credential_id uuid)` that sets `last_used_at = now()` (and `updated_at = now()`) for the given credential, and nothing else.
- The Service Layer calls it immediately after a credential is successfully used to sign or submit (not merely when resolved, so it reflects actual use).
- No secret, token, or signing material is read or written — only the `last_used_at` timestamp.
- Idempotent by nature (repeated calls just advance the timestamp); safe to call once per use.

## 6. What This Design Does NOT Do

- It does not alter the table or create the function or a migration.
- It does not write to the database.
- It does not make any external ZATCA/Fatoora call.
- It does not read or print any secret, token, signed XML, or credential fingerprint.
- It does not change credential status, rotation, or the signing chain.
- It does not promote R-Z2 from candidate to debt (that needs explicit permission).
- It does not judge production readiness (sandbox acceptance ≠ production readiness).
- It does not execute in any environment (staging not confirmed).

## 7. Verification Plan (for when execution is authorized in staging)

- Confirm that after a credential is used to sign/submit, its `last_used_at` is set to the time of use and no other column (especially no secret) changed.
- Confirm a credential that is never used keeps `last_used_at` null (dormant-credential signal works).
- Confirm the stamp does not interfere with the signing/submission result (it is a side write, not on the critical path's output).
- Confirm no secret material is read or logged by the touch path.

## 8. Status

```
R-Z2 Remediation Design = Complete (design only)
Live evidence (metadata only): last_used_at column EXISTS (timestamptz, nullable) but is never populated
Root cause: Service Layer uses a credential but does not stamp last_used_at — defined field, no write path (same shape as R-AP1-3)
Recommended: Option B — touch_zatca_credential(p_credential_id) stamps last_used_at = now(), called after successful use
Metadata-only write; never touches secret_encrypted or signing material
R-Z2 status = Candidate (unchanged; not promoted)
No code change / No DB writes / No migration / No external ZATCA call / No secrets printed or read
sandbox acceptance ≠ production readiness
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
