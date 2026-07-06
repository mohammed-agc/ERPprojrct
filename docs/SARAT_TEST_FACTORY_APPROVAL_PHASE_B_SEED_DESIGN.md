# Sarat Test Factory — Approval Workflow Request Lifecycle (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the sixth item in the Phase B order (§8): Approval workflow request lifecycle. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. Approval is a dual-nature item: like item 4 (JE safety) it documents maturity (SoD, logged admin override), and like items 1–3 it exposes candidates where a defined behaviour is not yet implemented (R-AP1/2/3). The seed is an honest measure of both.

---

## 1. Purpose

- Design safe seed scenarios for the approval request lifecycle: submit → step → approve → document posting.
- Document the protection maturity: Segregation of Duties (SoD), logged admin override, amount-tiered workflows, multi-step progression.
- Expose the candidates where a defined behaviour is not applied: approval_mode any/all (R-AP1), approver_id check (R-AP2), timeout/escalate SLA (R-AP3).
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from APPROVAL review, commit 92813c5)

A mature workflow engine, function-driven (no triggers):

- Four core tables: `approval_workflows` (name/module/document_type NN + amount_min/max amount-tiered + active) + `approval_workflow_steps` (workflow_id/step_order/step_name NN + approver_type/id/role + approval_mode default `'any'` + timeout_hours 24 + escalate_to) + `approval_requests` (code APR-YYYYMMDD-* + polymorphic document_type/document_id + current_step + status default `'pending'`) + `approval_actions` (request_id + step_id/order + action + action_by + delegated_to). Plus `governance_log`.
- 🔴 No `company_id` on the approval tables.
- 🟢 Live trigger check = No rows → function-driven.
- `approve_request` (full read): 🟢 SoD (SUBMITTER_CANNOT_APPROVE) + approver_role check via `user_roles` + logged admin override (ADMIN_OVERRIDE + governance_log, not silent) + multi-step (current_step → total) + last step → document `approval_status = 'approved'` → triggers posting.
- Live: 10 active workflows (amount-tiered) + 13 steps + 3 requests + 4 actions.
- Candidates: R-AP1 (approval_mode any/all defined but not implemented), R-AP2 (approver_id not checked, only role), R-AP3 (timeout/escalate SLA not implemented), R-AP4 (GRN/CLOSE no document-update branch), R-AP5 (sales invoice/credit_note/goods_return not in the generic workflow).

## 3. Dual-Nature Statement (explicit)

This is the governing distinction for this item:

- Maturity side (like item 4): scenarios that assert SoD, the logged admin override, amount-tier selection, and multi-step progression behave as designed.
- Candidate side (like items 1–3): scenarios that expose R-AP1/R-AP2/R-AP3 — where a column/behaviour is defined but not enforced. These are documented as the current reality, not assumed to work.
- Documenting R-AP candidates here does not change their status or schedule a fix.

## 4. Master Data (design — not executed)

- A test workflow with two amount tiers (e.g. a low tier single-step, a high tier two-step) for a chosen module/document_type.
- Test approver users with the required roles (via `user_roles`), and a distinct submitter user (to exercise SoD).
- A test document to submit (e.g. a journal entry or purchase document already designed in items 1/2/4).
- Accounts/roles referenced by role only (per the constitution).

## 5. Scenario Set

### TDF-APPR-B01 — Submit for approval (request created)

- Classification: approval-workflow.
- Flow: `submit_for_approval` for a document whose amount selects a tier.
- Expected: an `approval_requests` row (code APR-YYYYMMDD-*), status `'pending'`, current_step 1, the correct workflow chosen by amount tier.
- Purpose: establish the lifecycle baseline and amount-tier selection.

### TDF-APPR-B02 — Approve single-step (request approved → document posts)

- Classification: approval-workflow + accounting.
- Flow: an authorized approver (correct role, not the submitter) calls `approve_request` on a single-step tier.
- Expected: last step reached → document `approval_status = 'approved'` → posting triggers; request status resolved.
- Purpose: prove the happy-path approve-to-post chain.

### TDF-APPR-B03 — Segregation of Duties (SoD) rejects submitter (maturity)

- Classification: negative / guard.
- Flow: the submitter attempts to approve their own request.
- Expected: SUBMITTER_CANNOT_APPROVE — rejected.
- Purpose: confirm the SoD guard fires (protection maturity).

### TDF-APPR-B04 — Logged admin override (maturity)

- Classification: approval-workflow + governance.
- Flow: an admin overrides an approval; observe `governance_log`.
- Expected: the override is recorded as ADMIN_OVERRIDE in `governance_log` (not silent).
- Purpose: confirm the override is auditable, not hidden — a maturity property.

### TDF-APPR-B05 — Multi-step progression (maturity)

- Classification: approval-workflow.
- Flow: a two-step tier; step 1 approver approves (current_step advances), step 2 approver approves (last step → document posts).
- Expected: current_step 1 → 2 → resolved; document posts only after the final step.
- Purpose: prove multi-step progression and that posting waits for the last step.

### TDF-APPR-B06 — approval_mode any/all not enforced (R-AP1 exposure)

- Classification: candidate-exposing.
- Flow: a step with `approval_mode` set (any vs all) and multiple eligible approvers.
- **Candidate expectation (R-AP1):** the mode column exists but the any/all semantics are not implemented; the observed behaviour does not distinguish them.
- Design note: detector for R-AP1; documents the current non-enforcement, does not assume it works.
- Purpose: make R-AP1 reproducible for a future fix.

### TDF-APPR-B07 — approver_id not checked, only role (R-AP2 exposure)

- Classification: candidate-exposing.
- Flow: a step naming a specific `approver_id`; a different user with the same role approves.
- **Candidate expectation (R-AP2):** only the role is checked, not the specific approver_id; the different same-role user is accepted.
- Design note: detector for R-AP2; documents the role-only check.
- Purpose: make R-AP2 reproducible.

### TDF-APPR-B08 — timeout/escalate SLA not enforced (R-AP3 observation)

- Classification: candidate-exposing + observation.
- Flow: a step with `timeout_hours`/`escalate_to` set; observe that no escalation occurs on timeout.
- **Candidate expectation (R-AP3):** the SLA columns exist but timeout/escalation is not implemented; nothing escalates.
- Design note: observation of R-AP3; documents the non-enforcement.
- Purpose: record the SLA gap for the candidate register.

## 6. Dependencies

- All scenarios depend on the test workflow + steps + approver/submitter users (section 4).
- TDF-APPR-B02..B08 depend on a submitted request (B01).
- TDF-APPR-B05 depends on a two-step tier; B06/B07 on the corresponding step configuration.

## 7. Expected Impact Summary

| Scenario | Nature | Aspect | Expected |
|----------|--------|--------|----------|
| B01 | lifecycle | submit | request pending, tier chosen |
| B02 | lifecycle | approve→post | document approved, posts |
| B03 | maturity | SoD | submitter rejected |
| B04 | maturity | admin override | logged in governance_log |
| B05 | maturity | multi-step | posts only after last step |
| B06 | candidate | R-AP1 | any/all not distinguished |
| B07 | candidate | R-AP2 | role-only, approver_id ignored |
| B08 | candidate | R-AP3 | no timeout escalation |

This item's columns are "Nature" (maturity vs candidate) — reflecting that Approval both validates strength (B03–B05) and exposes candidates (B06–B08).

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / real approval data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- Where a request drove a document to posting (B02/B05), the posted entry is immutable (Posting Engine guards); cleanup requires un-posting first — staging only, never production.
- Rejected scenarios (B03) leave no approval action committed.
- Cleanup order reverses creation order (actions → requests → steps → workflow → users/document).
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation (including implementing R-AP1/2/3), production changes, external ZATCA calls, or PASS/FAIL judgment. Documenting the R-AP candidates here does not change their status or schedule a fix.

## 11. Status

```
Approval Workflow Request Lifecycle Phase B Seed Design = Designed / Not executed
Scenarios = TDF-APPR-B01..B08 (B03-B05 document maturity: SoD/override/multi-step; B06-B08 expose R-AP1/2/3)
Dual-nature: validates protection strength AND exposes candidates
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Maturity = SoD (SUBMITTER_CANNOT_APPROVE) + logged admin override + amount tiers + multi-step
Candidates = R-AP1 (mode) / R-AP2 (approver_id) / R-AP3 (SLA) — documented, not fixed
Posting Engine = Under Audit / Partially Audited
```
