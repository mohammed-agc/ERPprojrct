# R-Z3 — PCSID Without Onboarding Session — Design Review

**Status:** R-Z3 = Candidate / Design Review · Metadata-only read · No remediation · No DB writes · No external ZATCA call · No onboarding · No renewal · No PASS/FAIL · Staging = Not confirmed (treat as production) · Posting Engine = Under Audit / Partially Audited

This document reviews candidate R-Z3, raised in the ZATCA Phase A review: the active production PCSID has no linked onboarding session. It reads live credential/onboarding/renewal metadata only (no secret values, no external ZATCA call) to determine what the missing link actually means, and designs a safe, later documentation/handling direction. It does not implement anything.

---

## 1. Purpose

R-Z3 (ZATCA Phase A review) noted: "the production PCSID (active) has no linked onboarding session — origin not documented by the onboarding path." This review answers three questions from live metadata: (1) is the active PCSID genuinely orphaned, or is its origin documented by another path? (2) where exactly does the missing onboarding link sit? (3) what is the safe way to document/handle this later, without calling ZATCA or exposing secrets?

## 2. Evidence Basis (live metadata, read-only)

Read-only catalog + relational lookups (2026-07-06). No secret column (`secret_encrypted`, `binary_security_token`, IV) was selected. No external ZATCA API was called. No onboarding or renewal was performed.

**Table shapes (metadata only):**
- `zatca_credentials` (21 cols) — has `credential_type`, `environment`, `status`, `is_active`; **no** `onboarding_session_id` column. There is no forward FK from a credential to an onboarding session.
- `zatca_onboarding_sessions` (19 cols) — holds the link in the reverse direction: `ccsid_credential_id` and `pcsid_credential_id` (both uuid, nullable), plus lifecycle timestamps (`otp_requested_at` → `csr_generated_at` → `ccsid_received_at` → `pcsid_received_at`) and `onboarding_status`.
- `zatca_credential_renewals` (9 cols) — a second credential-creation path: `old_credential_id` → `new_credential_id`, `renewal_type`, `performed_by`. Renewals/rotations do not go through an onboarding session.

So a PCSID's origin can be documented by either an onboarding session (`onboarding_sessions.pcsid_credential_id`) **or** a renewal chain (`credential_renewals.new_credential_id`). The absence of the first does not imply an undocumented origin if the second is present.

## 3. Live Link Findings (metadata only)

**Active production PCSID `336f681f…`:**
- `status=active`, `is_active=true`.
- `has_onboarding_session = false` (no row in `onboarding_sessions.pcsid_credential_id` points to it).
- `from_renewal = true` — it **is** the `new_credential_id` of a renewal.

**The renewal that produced it:**
- `renewal_type = 'rotation'`, `old_credential_id = 09d8a493…` → `new_credential_id = 336f681f…`.
- The predecessor `09d8a493…` is `status=revoked`, `is_active=false`, and itself has `has_onboarding_session = false` and `from_renewal = false`.

**Chain reconstructed:**
```
09d8a493 (PCSID, production, revoked, no onboarding session, not from renewal)  ← root
   │  rotation
   ▼
336f681f (PCSID, production, active, no onboarding session, from renewal = true)  ← in use
```

## 4. Finding — R-Z3 Refined

The active PCSID's origin **is** documented — as a `rotation` renewal of a predecessor credential. So the original R-Z3 wording ("origin not documented by the onboarding path") is too strong for the active credential taken alone: its immediate origin is a documented rotation, not a mystery.

The real, narrower R-Z3 sits one link up the chain: the **root** credential `09d8a493…` (now revoked) has no onboarding session and is not itself from a renewal. Its origin is the one that is not documented through either the onboarding path or the renewal path — matching the Phase A note that it was "created by another path" (e.g. a direct import/seed during setup). The active credential inherits a documented rotation from an undocumented root.

This is the same live-evidence pattern seen elsewhere this session (e.g. R-Z2: the column existed rather than being missing): the live read narrows and softens the candidate. R-Z3 is real but scoped to the root credential's provenance, not the active credential's.

## 5. Risk Assessment (design-level, no execution)

- Operationally, the active PCSID functions (submission_log shows CLEARED submissions in sandbox history; production PCSID is active). R-Z3 is a **provenance/audit-trail completeness** gap, not a functional break.
- The gap is that the credential lifecycle audit trail does not reach all the way back to an onboarding session for this company's PCSID line; it stops at a rotation whose root was imported by another path.
- Severity is low-to-moderate and audit-oriented: for a ZATCA compliance posture, being able to show that every production credential traces to a documented onboarding (or a documented, deliberate import) is desirable, but the absence here does not by itself invalidate signing or submission.

## 6. Safe Handling Direction (design only — NOT executed)

Two complementary, non-ZATCA, no-secret directions for a later, separately-approved step:

**(A) Documentation-only backfill of provenance (preferred first step).** Record, in a governance/audit note or in a provenance field, how the root credential `09d8a493…` was created ("imported during initial setup / created by another path"), so the audit trail is explicit. This is a metadata/annotation action; it does not call ZATCA, does not touch secrets, and does not create an onboarding session retroactively.

**(B) Optional schema affordance for provenance (future, Track-2-like).** If provenance completeness becomes a formal requirement, add a nullable `provenance` / `origin` descriptor on `zatca_credentials` (e.g. enum: `onboarding` / `renewal` / `imported`), populated from the existing links, so a credential with neither an onboarding session nor a renewal parent is explicitly labelled `imported` rather than looking orphaned. Design-only; no execution here.

What must NOT be done as "remediation": creating a fake/backfilled onboarding session, calling ZATCA to re-onboard, or rotating the credential just to obtain a session — none of these are warranted by a provenance-documentation gap, and re-onboarding/rotation are live ZATCA actions explicitly out of scope.

## 7. Relationship to Other ZATCA Candidates

- **R-Z1** (icv_counter has no environment) and **R-Z2** (credential `last_used_at` unpopulated) are separate, already design-reviewed.
- **R-Z4** (error path not exercised live) is separate and still open.
- R-Z3 is independent of all three; it concerns credential provenance, not ICV counting, usage stamping, or error handling.

## 8. Recommendation

- R-Z3 remains a **Candidate** (not promoted to a debt). The live evidence refines it: the active PCSID has a documented rotation origin; the undocumented link is the revoked root credential's provenance.
- Recommended later step (separate approval, no ZATCA call, no secrets): documentation-only provenance backfill (direction A), optionally the provenance descriptor (direction B).
- No remediation, no onboarding, no renewal, no DB write is performed or authorized by this review.
- Proposed AuditRegister/Phase-A note (for a **future** documentation update, not applied here): "R-Z3 live check (2026-07-06): active production PCSID 336f681f is a documented `rotation` (from revoked root 09d8a493); the onboarding-session gap is at the revoked root, which has neither an onboarding session nor a renewal parent ('created by another path'). R-Z3 refined to root-credential provenance; remains Candidate."

## 9. Status

```
R-Z3 = Candidate / Design Review
Active PCSID 336f681f: no onboarding session BUT from_renewal=true (rotation of 09d8a493) — origin documented
Root 09d8a493 (revoked): no onboarding session, not from renewal — undocumented origin ("another path")
Refinement: R-Z3 scoped to root-credential provenance, not the active credential (live-evidence softens it)
Nature: provenance / audit-trail completeness gap, not a functional break
Safe direction: (A) documentation-only provenance backfill; (B) optional provenance descriptor column — both design-only
Forbidden as remediation: fake onboarding session, re-onboarding, rotation-for-session
Independent of R-Z1 / R-Z2 / R-Z4
No remediation / No DB writes / No external ZATCA call / No onboarding / No renewal / No secrets printed / No PASS/FAIL
DebtRegister + AuditRegister unchanged (proposed note is future)
Staging = Not confirmed / Treat as production
Posting Engine = Under Audit / Partially Audited
```
