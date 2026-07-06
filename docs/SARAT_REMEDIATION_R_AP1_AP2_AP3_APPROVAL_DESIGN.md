# Sarat Remediation Design — R-AP1 / R-AP2 / R-AP3 (Approval Engine Enforcement)

**Status:** Remediation Design only / No code change / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document designs the remediation for three related candidates in the approval engine — R-AP1 (approval mode), R-AP2 (specific approver), R-AP3 (SLA/escalation) — observed during the Approval review (Phase A, 92813c5) and reproduced as observations TDF-APPR-B06/B07/B08 in Phase B. The three share one function (`approve_request`) and one table (`approval_workflow_steps`), so they are designed together. It is design only — no function is altered, no database is written, and no candidate is promoted to a debt without explicit permission.

---

## 1. Candidates Restated (confirmed by live evidence)

A live read of `approve_request(p_request_id, p_comment)` (via `pg_get_functiondef`) plus the `approval_workflow_steps` schema confirms all three. The columns exist on the step table but are not consumed by the function:

- **R-AP1 (approval_mode):** the function's own comment states "mode=ALL: الخطوة تكتمل (موافق واحد لكل دور)". A single role-holder completes the step immediately; `approval_mode` (text, nullable) is never read. A step meant to require several approvers ('all') is satisfied by one.
- **R-AP2 (approver_id):** authorization is checked only via `v_has_role` against `approver_role`. `approver_id` (uuid, nullable — the specific assigned person) is never read. Any holder of the role can approve, even a step assigned to a named individual. Note `approver_type` (text, NOT NULL) exists as the discriminator but is also not consulted.
- **R-AP3 (SLA):** neither `timeout_hours` (int, nullable) nor `escalate_to` (uuid, nullable) is referenced anywhere. There is no escalation logic; a request stays `pending` indefinitely if never actioned.

## 2. What the Live Function Already Does Well (must be preserved)

The engine is mature in several respects and the remediation must not regress these:

- Separation of duties: `SUBMITTER_CANNOT_APPROVE` (except admin, logged as `ADMIN_OVERRIDE`).
- Admin override with explicit `APPROVAL_ADMIN_OVERRIDE` in `governance_log`.
- Multi-step advance: `current_step` → next, or final step → document approved.
- Document posting on final approval (PO / payment / JE `approval_status='approved'`).
- Idempotency of resolution: rejects if `status <> 'pending'`.

## 3. Root Cause (shared)

`approve_request` treats every step as "single role-holder, no assignee, no deadline." It reads `approver_role` only, ignoring `approver_type`, `approver_id`, `approval_mode`, `timeout_hours`, and `escalate_to`. The step table models a richer policy than the function enforces — the data says more than the code honours.

## 4. Remediation — R-AP2 (Respect approver_type / approver_id)

The step should be authorized according to `approver_type`:

- If `approver_type='role'` (or role-based): keep current behaviour — check `approver_role` via `user_roles`.
- If `approver_type='user'` (or user-based): require `v_uid = approver_id` (the specific assignee), not merely any role-holder.
- Admin override and SoD remain exactly as they are, layered on top.

This makes a step assigned to a named person actually require that person, while role-steps stay unchanged. Design note: the exact string values of `approver_type` must be read from live data before implementation (only the column and its NOT NULL are confirmed here).

## 5. Remediation — R-AP1 (Enforce approval_mode any/all)

The step should complete according to `approval_mode`:

- `approval_mode='any'` (or null → default 'any'): current behaviour — the first valid approval completes the step.
- `approval_mode='all'`: the step completes only when every required approver for that step has recorded an approval in `approval_actions`. Until then, record the approval and keep the step open (do not advance `current_step`).
- The "every required approver" set must be defined explicitly (e.g. all users holding `approver_role`, or an explicit assignee list) — this is a design decision to confirm against how the business wants 'all' to behave, and should be stated in the implementation review rather than assumed here.

Design note: 'all' needs a well-defined approver set; this design flags it as the key open question for R-AP1, not a settled detail.

## 6. Remediation — R-AP3 (SLA / Escalation)

`timeout_hours` + `escalate_to` need an escalation mechanism. Because a pure SQL function only runs when called, escalation cannot be "automatic" inside `approve_request` alone; it needs a driver. Options:

- **Option A — scheduled sweep:** a separate function (run by a scheduler) that finds pending requests whose current step has exceeded `timeout_hours` since it began, and escalates them to `escalate_to` (reassign or notify), logging to `governance_log`.
- **Option B — on-touch check:** evaluate the deadline whenever the request is read/actioned, marking overdue steps — simpler but only fires when someone interacts.
- **Recommended:** Option A (scheduled sweep) for true SLA behaviour, with the escalation target and action (reassign vs notify) defined explicitly. This is a larger change than R-AP1/R-AP2 and would be its own implementation unit.

Design note: R-AP3 is the heaviest of the three (needs a scheduler + a new sweep function); it is designed here at the approach level, with the detailed function deferred to its own implementation review.

## 7. Sequencing of the Three

- R-AP2 (approver_type/approver_id) is the smallest and safest — a localized authorization change.
- R-AP1 (approval_mode 'all') is medium — needs the approver-set definition.
- R-AP3 (SLA) is the largest — needs a scheduler and a new function.

Recommended implementation order when authorized: R-AP2 → R-AP1 → R-AP3, each with its own review and staging test.

## 8. What This Design Does NOT Do

- It does not alter `approve_request` or create a migration or a scheduler.
- It does not write to the database.
- It does not change SoD, admin override, multi-step advance, or document posting.
- It does not promote R-AP1/R-AP2/R-AP3 from candidate to debt (that needs explicit permission).
- It does not execute in any environment (staging not confirmed).

## 9. Verification Plan (for when execution is authorized in staging)

- R-AP2: a user-type step assigned to person A rejects approval by person B (a role-holder who is not A); a role-type step still accepts any role-holder. Admin override still works and is logged.
- R-AP1: an 'all' step does not advance until every required approver has approved; an 'any' step still advances on the first approval. Existing single-step flows unchanged.
- R-AP3: a step past `timeout_hours` is escalated to `escalate_to` and logged; a step within its window is untouched. No effect on normal same-day approvals.
- Regression: existing PO/payment/JE approval flows still post the document on final approval exactly as before.

## 10. Status

```
R-AP1/R-AP2/R-AP3 Remediation Design = Complete (design only)
Live evidence: approve_request reads approver_role only; ignores approver_type/approver_id/approval_mode/timeout_hours/escalate_to
Columns exist on approval_workflow_steps but are not consumed (data models more than code enforces)
R-AP2 = respect approver_type (role vs user → approver_id) — smallest
R-AP1 = enforce approval_mode 'all' (needs approver-set definition) — medium
R-AP3 = SLA escalation via scheduled sweep on timeout_hours→escalate_to — largest, own unit
Preserve: SoD, admin override, multi-step advance, document posting
Recommended order: R-AP2 → R-AP1 → R-AP3
R-AP1/R-AP2/R-AP3 status = Candidates (unchanged; not promoted)
No code change / No DB writes / No migration / No scheduler / No execution
Staging = Not confirmed
Posting Engine = Under Audit / Partially Audited
```
