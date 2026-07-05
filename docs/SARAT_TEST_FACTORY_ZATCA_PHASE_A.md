# Sarat Test Factory — ZATCA Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md`): tables · structure · functions · service/code call-sites · live state · risks. No seed is designed here, and no external ZATCA call, submission, resend, onboarding, or renewal was performed. This is the ninth module reviewed — the ZATCA compliance layer. All fingerprints below are masked; no `signed_xml`, `binary_security_token`, or `secret_*` material is printed.

---

## 1. Purpose

Document the ZATCA Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed. The review is split into Part 1 (core structure) and Part 2 (remaining tables, functions, service/code, live state).

## 2. Tables Evidence (10 tables)

A live inventory returned 10 ZATCA tables — broader than the six documented DB layers; live evidence decides.

Core (Part 1):

- `zatca_document_chain` — the cryptographic chain, one row per document: `icv`, `pih`, `artifact_hash`, `uuid`, `artifact_id`, `company_id`, `environment`.
- `zatca_chain_state` — the fast chain head per company + environment: `current_icv`, `last_hash`, `version` (optimistic concurrency).
- `zatca_signed_artifacts` — signed XML store: `signed_xml`, `artifact_hash`, `signing_time`, `credential_id`, `certificate_fingerprint`, company + environment.
- `zatca_projection_outbox` — projection error outbox: `artifact_id`, `error_code`, `error_message`, `attempt_count`, `occurred_at`, `resolved_at`.
- `zatca_credentials` — credentials (no private key): certificate metadata, `secret_encrypted` + `secret_encryption_iv` + `secret_encryption_version`, `status`, `is_active`, lifecycle timestamps.
- `zatca_submission_log` — append-only Fatoora submission tracking: `submission_type`, `http_status`, `zatca_status`, `zatca_response_code`, `success`, `error_code`, `retryable`, `response_json`, `attempt_number`.

Remaining (Part 2):

- `zatca_icv_counter` — atomic ICV counter: `company_id`, `current_icv`, `updated_at`. Note: no `environment` column (chain_state has it).
- `zatca_onboarding_sessions` — full CSID cycle: `otp_requested_at` → `csr_generated_at` → `ccsid_received_at` → `pcsid_received_at`, EGS data, `onboarding_status`, `ccsid_credential_id`, `pcsid_credential_id`.
- `zatca_credential_renewals` — rotation audit log: `old_credential_id`, `new_credential_id`, `renewal_type`, `reason`, `performed_by`, `renewed_at`.
- `zatca_error_codes` — reference data: `code` (PK), `category`, `severity`, `retryable`, `arabic_message`, `description`.

No `company_id` is absent here — every ZATCA table is company-aware, and most are environment-aware (production / sandbox / simulation).

## 3. Functions / RPC Evidence

- Atomic chain: `next_zatca_icv(company)`, `zatca_read_head(company, environment)`, `zatca_append(company, environment, doc_type, doc_id, uuid, artifact_id, artifact_hash, token)`.
- State machines: `transition_credential_status(...)`, `update_zatca_submission_status(...)`, `advance_onboarding(session, new_status, data)`, `mark_expired_credentials()`.
- Gatekeeper: `prepare_zatca_invoice(invoice_id)`.
- Guards (trigger functions): `zatca_artifacts_immutable`, `zatca_lifecycle_append_only`, `zatca_submission_log_append_only`, `zatca_onboarding_guard`.

There are no signing or submission functions in the DB — signing and Fatoora submission live in the service layer, consistent with the constitution (DB owns facts + state machines; service owns cryptography + external integration).

## 4. Service / Code Call-site Evidence

A live `src` search shows a full ZATCA service layer under `src/services/zatca/`:

- `chain/` — DocumentChainService + SupabaseDocumentChainService (calls `zatca_append`).
- `artifact/` — ArtifactStore + SupabaseArtifactStore (writes signed_artifacts).
- `composer/` — InvoiceSigningComposer (signing orchestration).
- `submission/` — SubmissionCoordinator + DefaultSubmissionCoordinator + FetchZatcaComplianceClient (a Fatoora HTTP client) + SupabaseSubmissionLogWriter + SupabaseSignedDocumentReader + SupabaseSubmissionProjectionWriter.
- `policy/` — InvoiceRoutingPolicy (reporting vs clearance) + SubmissionStatusPolicy.
- `reconciliation/` — ProjectionReconciler + SupabaseProjectionRepairer + SupabaseTruthSnapshotReader.
- `enrollment/` — EnvironmentEndpointResolver. Plus `invoiceUblMapper` and `xmlBuilder.types`.
- Integration tests exist (firstInvoice, firstSubmission) plus several unit test suites.

This confirms the path invoice → sign (composer) → artifact store → document_chain (`zatca_append`) → submit (coordinator + client) → submission_log.

## 5. Live State Evidence (no secrets)

- `signed_artifacts` = 4 real signed documents (length ~11.9K–12.3K), all `sandbox` / `invoice`, one credential fingerprint (E44E3675…), signing_time 30 Jun – 1 Jul 2026. Two distinct invoices (one signed 3 times).
- `submission_log` = 4 rows, all `http_status=200`, `success=true`: one `reporting` → `reported`; three `clearance` → `PASS` / `CLEARED`. `error_code` null, `attempt_number=1`.
- `credentials` = 6: production PCSID (active + revoked), sandbox CCSID (active E44E3675… + revoked ×2), simulation CCSID (expired). `last_used_at` is null across all rows.
- `onboarding_sessions` = 1: sandbox, `ccsid_received` (2026-06-23), request_id present, pcsid null.
- `projection_outbox` = 2: both `PROJECTION_WRITE_FAILED`, both resolved.
- `error_codes` = 20 across 7 categories, 6 retryable (network 3, server 2, authentication 1).

## 6. Chain / ICV / PIH Consistency

- (A) ICV: `icv_counter` is per-company (no environment); `chain_state.current_icv` is per-company + environment. `zatca_append` updates chain_state; `next_zatca_icv` updates icv_counter. The apparent duplication is a candidate for deeper review (R-Z1).
- (B) `chain_state` = 1 reflects the head (current_icv + last_hash) for one active environment; `document_chain` = 2 records two documents.

## 7. Credentials / Onboarding / Renewal Evidence

- (C) The onboarding session (`ccsid_received`) produced the sandbox CCSID (E44E3675…) that signed the 4 artifacts — path confirmed.
- (D) `credential_renewals` = 1 plus active/revoked pairs in credentials → rotation is actually used, not just planned.
- The production PCSID (active) has no linked onboarding session in this data (created by another path — noted, R-Z3).

## 8. Error Handling & Sandbox Submission Evidence

- (E) `error_codes` (reference data) links logically to `submission_log.error_code` + `retryable` (no hard FK). Live submission_log has `error_code` null (all succeeded), so the error path is not exercised live yet (R-Z4).
- (F) `projection_outbox`: two `PROJECTION_WRITE_FAILED`, both resolved — reconciliation worked; nothing unresolved.
- (G) The code confirms the signing/reporting/clearance path.
- (H) Live submission_log records ZATCA sandbox responses: `reported` + `PASS`/`CLEARED`, all sandbox. The production PCSID is active but `last_used_at` is null → not submitted in production yet.

## 9. Risks / Candidates

- **R-Z1:** `icv_counter` (per-company, no environment) vs `chain_state` (per-company + environment) — possible ICV source duplication / role split; needs deeper review.
- **R-Z2:** `credentials.last_used_at` is null despite actual signing (4 artifacts) — the code does not update last_used; tracking gap.
- **R-Z3:** the production PCSID (active) has no linked onboarding session — origin not documented by the onboarding path.
- **R-Z4:** the error path (submission failure) is not exercised live (all submissions succeeded); error_codes are defined but not live-tested.

## 10. Recommendation

ZATCA Phase A is Read-only Reviewed across Part 1 (structure) and Part 2 (tables, functions, service/code, live state). The live evidence shows a complete system — 10 tables, atomic chain functions, three state machines, immutability/append-only guards, a fully built and tested service layer, and recorded sandbox responses (reported + CLEARED). This corrects the prior checkpoint note that the ZATCA service layer was not yet built. Distinguish clearly: sandbox acceptance is recorded in the log; that is not the same as production readiness (production PCSID is active but unused; the error path is not live-tested; the compliance test suite and the candidates above remain). Phase B and any production submission remain deferred. No PASS/FAIL.

## 11. Status

```
ZATCA Phase A = Read-only Review (Part 1 + Part 2)
signed_artifacts usage = Live artifacts observed (4, sandbox)
submission_log = Live sandbox responses recorded (reported + CLEARED)
ZATCA Service Layer = Live / Used (based on observed artifacts/submissions and built code)
Candidates = R-Z1 / R-Z2 / R-Z3 / R-Z4
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
