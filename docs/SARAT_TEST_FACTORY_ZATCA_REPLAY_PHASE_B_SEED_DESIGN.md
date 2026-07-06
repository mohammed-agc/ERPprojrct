# Sarat Test Factory — ZATCA Sandbox Replay (Review-Only) (Phase B Seed Design)

**Status:** Seed Design only / Review-only / No seed execution / No DB writes / No external ZATCA calls · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the seventh item in the Phase B order (§8): ZATCA sandbox artifact/submission replay — review only, no external call. It designs review-only scenarios over already-recorded ZATCA artifacts and submission logs. It is the most sensitive item in Phase B (it touches tax compliance), so it carries extra constraints: no external Fatoora call of any kind, no printing of signed XML / tokens / secrets, fingerprints masked, and no PASS judgment (sandbox acceptance ≠ production readiness).

---

## 1. Purpose

- Design review-only scenarios that read the recorded ZATCA chain, artifacts, submission log, and credential state.
- Confirm the recorded chain is internally consistent (ICV/PIH linkage, hashes present, append-only integrity) — by reading, not by re-signing or re-submitting.
- Observe the candidates: R-Z1 (icv_counter no environment), R-Z2 (last_used_at null despite signing), R-Z3 (production PCSID with no linked onboarding), R-Z4 (error path not exercised — all recorded submissions succeeded).
- Seed Design only. Review-only. No execution, no external call. Execution deferred until staging confirmation.

## 2. Extra Safety Constraints (this item specifically)

- **Review-only, literally:** read the recorded rows only. No re-sign, no re-submit, no clearance, no reporting, no onboarding, no renewal.
- **No external Fatoora call of any kind.** The Service Layer's submission client is not invoked here.
- **No printing of `signed_xml`, tokens, secrets, or private keys.** Certificate fingerprints are masked (e.g. E44E3675…).
- **No PASS judgment.** Sandbox acceptance recorded (reported + CLEARED) is not production readiness (PCSID active but last_used_at null = not submitted in production).
- **"Replay" here means re-reading / re-inspecting the recorded chain**, not re-sending anything.

## 3. Phase A Evidence Basis (from ZATCA review, commit 8c24b47)

Service Layer is built and active (a prior material correction). DB side: 10 tables — `zatca_document_chain` (icv+pih+artifact_hash+uuid+artifact_id) + `zatca_chain_state` (head: current_icv+last_hash+version) + `zatca_signed_artifacts` (signed_xml stored + signing_time + credential_id + certificate_fingerprint) + `zatca_projection_outbox` + `zatca_credentials` (secret_encrypted, no private_key; status/is_active State Machine) + `zatca_submission_log` (append-only: http_status+zatca_status+success+error_code+retryable) + `zatca_icv_counter` (company+current_icv; no environment = R-Z1) + `zatca_onboarding_sessions` + `zatca_credential_renewals` + `zatca_error_codes` (20 codes/7 categories). 12 functions (next_zatca_icv + read_head + append + State Machines + prepare_zatca_invoice + 4 guard triggers). No signing/submission functions in DB → Service Layer handles those. Live recorded state: signed_artifacts=4 (sandbox, one masked cert fingerprint, signing late Jun–early Jul), submission_log=4 (one reporting → 'reported'; three clearance → CLEARED; all success, error_code null), credentials=6 (production PCSID active + revoked; sandbox CCSID active + revoked×2; simulation CCSID expired; last_used_at null across all = R-Z2), onboarding=1 (sandbox 'ccsid_received', pcsid null), outbox=2 (both resolved), error_codes=20.

## 4. Master Data (design — not executed)

- No new master data. This item reads the already-recorded ZATCA rows (chain, artifacts, submission log, credentials).
- No credentials are created, rotated, or activated. No CSR/OTP/CSID flow is exercised.

## 5. Scenario Set (all review-only)

### TDF-ZATCA-B01 — Chain integrity read (document_chain + chain_state)

- Classification: ZATCA sandbox-artifact review only.
- Flow: read `zatca_document_chain` and `zatca_chain_state`; verify each entry's ICV increments and PIH links to the prior entry's hash, and the head matches the last entry.
- Expected: the recorded chain is internally consistent (ICV monotonic, PIH linkage intact, head = last).
- Design note: this is a read verification of the recorded chain, not a re-hash or re-sign.
- Purpose: confirm the recorded chain's internal consistency by reading.

### TDF-ZATCA-B02 — Signed artifact metadata read (signed_artifacts)

- Classification: review only.
- Flow: read `zatca_signed_artifacts` metadata (artifact_id, signing_time, credential_id, certificate_fingerprint) — **fingerprint masked, signed_xml never printed**.
- Expected: 4 sandbox artifacts, each linked to a credential and a masked fingerprint; signing times in the recorded window.
- Design note: metadata only; the stored signed_xml is never displayed.
- Purpose: confirm artifacts are recorded and linked, without exposing content.

### TDF-ZATCA-B03 — Submission log read (submission_log)

- Classification: review only.
- Flow: read `zatca_submission_log` (http_status, zatca_status, success, error_code, retryable).
- Expected: 4 entries — one reporting ('reported'), three clearance (CLEARED); all success, error_code null, attempt 1.
- Design note: this records that sandbox submissions succeeded; it is not a production-readiness statement.
- Purpose: confirm the recorded submission outcomes by reading.

### TDF-ZATCA-B04 — Credential state read (credentials + R-Z2 observation)

- Classification: review only + candidate observation.
- Flow: read `zatca_credentials` state (status, is_active, environment, last_used_at) — **secrets never printed**.
- Expected: 6 credentials (production PCSID active + revoked; sandbox CCSID active + revoked×2; simulation expired).
- **Candidate observation (R-Z2):** `last_used_at` is null across all credentials despite signing having occurred — the usage timestamp is not being updated.
- Design note: observation of R-Z2; documents the null last_used, does not change its status.
- Purpose: record the credential state and the R-Z2 gap.

### TDF-ZATCA-B05 — icv_counter environment gap (R-Z1 observation)

- Classification: review only + candidate observation.
- Flow: compare `zatca_icv_counter` (company + current_icv, no environment column) against `zatca_chain_state` (which is environment-aware).
- **Candidate observation (R-Z1):** the icv_counter is not environment-scoped, unlike the chain state; a multi-environment install could collide.
- Design note: observation of R-Z1; documents the missing environment dimension.
- Purpose: record the R-Z1 gap.

### TDF-ZATCA-B06 — PCSID onboarding linkage gap (R-Z3 observation)

- Classification: review only + candidate observation.
- Flow: read the production PCSID credential and look for a linked `zatca_onboarding_sessions` row.
- **Candidate observation (R-Z3):** the production PCSID is active but has no linked onboarding session (onboarding=1 is sandbox, 'ccsid_received', pcsid null).
- Design note: observation of R-Z3; documents the missing linkage.
- Purpose: record the R-Z3 gap.

### TDF-ZATCA-B07 — Error path not exercised (R-Z4 observation)

- Classification: review only + candidate observation.
- Flow: read `zatca_error_codes` (20 codes/7 categories/6 retryable) and note that `zatca_submission_log` contains no error rows (all recorded submissions succeeded).
- **Candidate observation (R-Z4):** the error-handling path (retryable codes, outbox retries) is defined but not exercised by any recorded submission; its behaviour is unverified by the recorded data.
- Design note: observation of R-Z4; documents the untested error path. No error is injected here (that would require execution).
- Purpose: record the R-Z4 gap for the candidate register.

## 6. Dependencies

- All scenarios read the already-recorded ZATCA rows; none depends on items 1–6 data (ZATCA has its own recorded chain).
- No scenario creates or requires new data.

## 7. Expected Impact Summary

| Scenario | Reads | Expected | Candidate observed |
|----------|-------|----------|--------------------|
| B01 | chain + chain_state | ICV/PIH consistent, head=last | — |
| B02 | signed_artifacts (masked) | 4 linked artifacts | — |
| B03 | submission_log | reported + CLEARED×3, success | — |
| B04 | credentials (masked) | 6 credentials, states | R-Z2 (last_used null) |
| B05 | icv_counter vs chain_state | counter not env-scoped | R-Z1 |
| B06 | PCSID vs onboarding | PCSID no onboarding link | R-Z3 |
| B07 | error_codes + submission_log | no error rows recorded | R-Z4 (error path untested) |

This item's column is "Reads" and every row is review-only — nothing is signed, submitted, or written. Sandbox acceptance (B03) is recorded, not a production-readiness judgment.

## 8. Safety Gates (must all pass before any review execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials are exercised.
- **Confirm no external ZATCA / Fatoora call is made (hard constraint for this item).**
- Confirm no signed_xml / token / secret / private key is printed; fingerprints masked.
- Confirm read-only review (no re-sign, no re-submit, no onboarding, no renewal).
- Confirm rollback approach (trivial — read-only, nothing to roll back).
- No PASS/FAIL judgment; sandbox acceptance ≠ production readiness.

## 9. Rollback / Cleanup Strategy (design)

- This item is strictly read-only: it writes nothing, signs nothing, submits nothing — there is nothing to clean up.
- The recorded ZATCA rows are append-only by design (guard triggers) and are not modified here.
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation, production changes, **any external ZATCA/Fatoora call (sign, submit, clearance, reporting, onboarding, renewal)**, printing of signed_xml/tokens/secrets, or PASS/FAIL judgment. Observing R-Z1/R-Z2/R-Z3/R-Z4 here does not change their status or schedule a fix. Sandbox acceptance recorded in the log is not a statement of production readiness.

## 11. Status

```
ZATCA Sandbox Replay (Review-Only) Phase B Seed Design = Designed / Not executed
Scenarios = TDF-ZATCA-B01..B07 (all review-only; B04-B07 observe R-Z2/R-Z1/R-Z3/R-Z4)
Review-only — reads recorded chain/artifacts/log/credentials; no external call, no secrets printed
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No external ZATCA calls
No remediation
No PASS / FAIL
Sandbox acceptance (reported + CLEARED) ≠ production readiness
Candidates = R-Z1 (icv env) / R-Z2 (last_used null) / R-Z3 (PCSID onboarding) / R-Z4 (error path untested) — documented, not fixed
Posting Engine = Under Audit / Partially Audited
```
