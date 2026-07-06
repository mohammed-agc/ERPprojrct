# Sarat Track 1 Security Design — Deepening / Live Re-Verification

**Status:** Design Deepening only / No code change / No DB writes / No REVOKE·GRANT·ALTER / No remediation executed · Track 1 Security Design remains **Draft / Under Review** · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This document deepens the existing `docs/ERP_TRACK1_SECURITY_DESIGN.md` (dated 2026-07-03) with a live metadata re-verification performed on 2026-07-06. It does not re-design Track 1, does not change any privilege, and does not create the helper functions. It confirms that the design's evidence basis is still literally true against the live database, and records two positive cross-checks from the session's live reads.

The re-verification used read-only catalog queries only (`pg_proc`, `proacl`, `proconfig`) — no `REVOKE`, `GRANT`, `ALTER FUNCTION`, `CREATE`, or migration.

---

## 1. Purpose

The Track 1 design is mature (Hybrid model, per-function permission table, `service_role` per-function decision, Option C for depreciation, Option A for `has_finance_permission`, rollback, tests, pre-execution checklist). It is three days old and rests on Phase-0 baselines. This deepening answers one question: **are those baselines still true today, and has anything been executed since?** If the design still matches the live database, it is confirmed ready to move to execution when a confirmed staging environment and explicit approval are available.

## 2. Live Re-Verification — Results (2026-07-06, read-only)

**Check 1 — helper functions not yet created (design Not Executed):**
A `pg_proc` lookup for `has_finance_role` and `has_finance_permission` returned **zero rows**. Neither helper exists in the live database. This confirms the Track 1 authorization model has not been implemented; the design remains Draft / Not Executed, exactly as the document states.

**Check 2 — DEBT-008 still live (EXECUTE open to anon/PUBLIC):**
A `proacl` read of the six financial functions (`create_manual_journal_entry`, `reverse_journal_entry`, `cancel_sales_invoice`, `create_partner_settlement`, `create_allocation`, `run_monthly_depreciation`) showed every one carrying `=X` (PUBLIC), `anon=X`, `authenticated=X`, and `service_role=X`. This matches Baseline #1 literally. DEBT-008 (Critical) is still live and unmitigated; the leading `=X` PUBLIC grant is the most exposed part (anon inherits from it).

**Check 3 — DEBT-009 still live (no safe search_path):**
A `proconfig` read of the same six functions returned `null` for every one. No safe `search_path` is pinned on any of them. This matches Baseline #1. DEBT-009 (High) is still live and unmitigated.

**Conclusion:** all three baselines the Track 1 design rests on are still exactly true. Nothing has been executed or drifted since 2026-07-03. The design does not need revision on account of database change — it remains accurate and applicable.

## 3. Cross-Check with Session Live Reads (positive)

**cancel_sales_invoice authorization level is well-founded.** The Track 1 design assigns `cancel_sales_invoice` to `finance_manager / admin only` (action-level permission `finance.invoice.cancel`), explicitly rejecting the F5.1 UI `isAccounting` guard as a security boundary. This session's live read of `cancel_sales_invoice` independently confirmed the function is high-impact — it performs revenue reversal (F5.2), COGS reversal (F5.3), inventory reversal (F5.4), open-item allocation reversal (F5.5), a posted Credit Note, and governance logging. The high-impact nature of the operation supports the design's choice to gate it at action-level, not at the general finance-role level. The cross-check strengthens OQ-T1-3.

**create_allocation created_by fix remains correctly scoped (DEBT-010).** The Track 1 design derives `created_by` from `auth.uid()` internally and keeps the `document_remaining` guard as a data-integrity check. The session's DEBT-011 work confirmed `document_remaining` has a reversal-handling defect, but that is a *calculation* defect (DEBT-011), separate from the *authorization* concern DEBT-010 addresses. Track 1's use of `document_remaining` as a data-integrity guard is orthogonal to DEBT-011's calculation fix; the two remediations do not conflict. (Noted so that a future DEBT-011 fix and the Track 1 `create_allocation` change are understood as independent.)

## 4. Pre-Execution Checklist — Status Note

Re-reading the checklist against the live re-verification:
- `[x] OQ-P0-4` (single super-user reviewed) — unchanged.
- `[ ] Pre-execution user test setup` — still open; the single super-user environment is still not a sufficient negative-test sample. This remains the main practical blocker even before the staging-environment blocker.
- `[ ] has_finance_permission storage decision` — effectively resolved by OQ-B1 (Option A internal matrix, because `role_permissions` is absent); the checklist item can be read as satisfied at the design level, pending execution.
- `[ ] baseline EXECUTE saved for rollback` — the current live `proacl` (Check 2 above) is exactly the baseline that must be captured verbatim before any REVOKE; this re-verification re-confirms that baseline.
- `[ ] isolated staging ready` — still open (governing blocker).
- `[ ] service_role per-function confirmation` — still open.
- `[ ] depreciation → backend (Option C) plan` — still open.

No checklist item has regressed. Two items (storage decision, baseline capture) are closer to satisfied at the design level; the environmental items remain open.

## 5. What This Deepening Does NOT Do

- It does not create `has_finance_role` / `has_finance_permission`.
- It does not REVOKE, GRANT, ALTER, or otherwise change any privilege.
- It does not execute Track 1 remediation.
- It does not alter the Track 1 design's structure or decisions.
- It does not promote Track 1 beyond Draft / Under Review.
- It does not write to the database.

## 6. Status

```
Track 1 Design Deepening = Complete (design / live re-verification only)
Check 1: has_finance_role / has_finance_permission = 0 rows (design Not Executed)
Check 2: six functions still =X/anon=X/authenticated=X/service_role=X (DEBT-008 live)
Check 3: six functions proconfig = null (DEBT-009 live)
Cross-check: cancel_sales_invoice high-impact (F5.2-F5.5) supports action-level gating (OQ-T1-3)
Cross-check: Track 1 create_allocation (DEBT-010) orthogonal to DEBT-011 calculation fix
Track 1 Security Design = Draft / Under Review (unchanged)
No code change / No DB writes / No REVOKE·GRANT·ALTER / No remediation executed
Staging = Not confirmed / Pre-Execution Checklist not complete
Posting Engine = Under Audit / Partially Audited
```
