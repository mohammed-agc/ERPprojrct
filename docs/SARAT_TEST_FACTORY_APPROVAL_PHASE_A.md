# Sarat Test Factory — Approval Phase A (Read-only Review)

**Status:** Read-only Reviewed / No seed designed / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

Phase A per the governance plan (`ERP_STAGING_TEST_DATA_FACTORY_PLAN.md`): tables · structure · triggers · functions · live usage · risks. No seed is designed here. This is the eighth module reviewed — the approval / workflow layer over the accounting and operational modules.

---

## 1. Purpose

Document the Approval Phase A read-only review within the Sarat ERP Test Data Factory. Read-only review only. No seed designed. Not executed.

## 2. Tables Evidence

- `approval_workflows` — workflow templates.
- `approval_workflow_steps` — ordered steps per workflow.
- `approval_requests` — actual approval requests (polymorphic over documents).
- `approval_actions` — approval/reject actions per step.
- `governance_log` — governance audit log (also used by F5/DEBT-012 remediation design).
- Type-specific request tables also exist: `leave_requests`, `overtime_requests` (HR), `purchase_requests` / `purchase_request_lines` (pre-PO).

No `company_id` appears in any of the approval core tables, consistent with the current single-tenant posture.

## 3. Structure Evidence

- `approval_workflows`: `name`, `module`, `document_type` (NN), `amount_min` (default 0), `amount_max` (nullable), `active`. Amount-tiered per module + document type.
- `approval_workflow_steps`: `workflow_id`, `step_order`, `step_name` (NN), `approver_type` (NN), `approver_id`, `approver_role`, `approval_mode` (default 'any'), `timeout_hours` (default 24), `escalate_to`, `active`. Flexible approver (by person or role) + SLA fields.
- `approval_requests`: `code` (default APR-YYYYMMDD-xxxxxx), `workflow_id` (nullable), `document_type` + `document_id` (NN, polymorphic), `document_code`, `document_amount`, `title` (NN), `current_step` (default 1), `status` (default 'pending'), `submitted_by`/`submitted_at`, `completed_at`, `resolved_by`/`resolved_at`, `notes`.
- `approval_actions`: `request_id` (NN), `step_id`/`step_order`, `action` (NN), `action_by`, `action_at`, `comments`, `delegated_to` (delegation).

## 4. Triggers Evidence

A live check of `information_schema.triggers` for the four approval core tables returned no rows. The approval engine is function-driven / code-driven (like Fixed Assets), not trigger-driven. This is documented from live evidence, not inference.

## 5. Functions Evidence

Generic cycle:

- `submit_for_approval(document_type, document_id, document_code, amount, title)`
- `approve_request(request_id, comment)`
- `reject_request(request_id, comment)`

Type-specific:

- `approve_goods_return` (F6)
- `approve_inspection` / `reject_inspection`

Guards / status:

- `set_je_approval_status` (trigger function on journal_entries)
- `trg_guard_pinv_from_unapproved_po` (trigger function in Purchasing)

## 6. approve_request Logic

- **SoD:** the submitter cannot approve their own request (`SUBMITTER_CANNOT_APPROVE`), except an admin override.
- **Role check** through `user_roles` (the acting user must hold the step's `approver_role`, or be admin).
- **Admin override** is logged as `ADMIN_OVERRIDE` in `governance_log`, not silent.
- **Multi-step advancement** through `current_step` — each approval either advances to the next step or, on the last step, completes the request.
- **Final approval** updates the document's `approval_status` = 'approved' for PO / payment / JE, which in turn lets the posting engines fire.
- `governance_log` records every approval action (`APPROVAL_APPROVED` / `APPROVAL_ADMIN_OVERRIDE`).

## 7. Live Usage Evidence

- 10 active workflows.
- 13 steps.
- 3 requests.
- 4 actions.

Amount-tiered workflows:

- JE: 0–50k and 50k+
- CLOSE: 0+
- GRN: 0+
- PO: 0–50k, 50k–200k, 200k+
- payment: 0–10k, 10k–100k, 100k+

The amount tiers are continuous without obvious gaps.

## 8. Coverage Notes

- Covered document types include JE, CLOSE, GRN, PO, payment.
- `approve_request`'s final document-update branch currently covers PO / payment / JE.
- GRN / CLOSE workflows exist but no document-update branch was observed in `approve_request` for them.
- Sales invoice / credit_note / goods_return are not covered by the generic workflow; goods_return has type-specific approval functions.

## 9. Risks / Candidates

- **R-AP1:** `approval_mode` (any/all) is defined but `approve_request` completes a step with one approval; all-mode not implemented.
- **R-AP2:** `approver_id` is defined but `approve_request` checks `approver_role` only.
- **R-AP3:** `timeout_hours` / `escalate_to` exist but no SLA escalation logic was observed.
- **R-AP4:** GRN / CLOSE workflows exist but `approve_request` has no final document-update branch for them.
- **R-AP5:** sales invoice / credit_note / goods_return not covered by the generic workflow; type-specific coverage exists for goods_return.

## 10. Recommendation

Approval Phase A is Read-only Reviewed. Phase B may design seed workflows and approval requests only after staging confirmation. Any remediation for `approval_mode`, `approver_id`, or SLA escalation requires separate design. No execution now.

## 11. Status

```
Approval Phase A = Read-only Reviewed / No seed designed / Not Executed
Approval engine = Centralized / Function-driven / Active workflows observed
Candidates = R-AP1 / R-AP2 / R-AP3 / R-AP4 / R-AP5
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
Posting Engine = Under Audit / Partially Audited
```
