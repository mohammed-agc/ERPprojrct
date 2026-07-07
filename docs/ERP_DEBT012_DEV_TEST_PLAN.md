# DEBT-012 — Controlled Dev Test Plan (on ard-erp-dev)

**Status:** Plan / documentation only · No DB write yet · No remediation yet · No reconciliation execution · No PASS/FAIL · Posting Engine = Under Audit / Partially Audited

This plan governs testing (and later remediating) DEBT-012 **on the `ard-erp-dev` development database itself**, rather than on a separate staging project. This choice follows the confirmed fact that `ard-erp-dev` is a **development environment with test data that will be cleaned before production** — not a live production system with real customers. The environmental Gate 0 (separate-project isolation) is therefore replaced by a **controlled-testing discipline**: strict marking, tested cleanup, ZATCA protection, and step-by-step execution with explicit per-step approval.

The separate fresh database (`qsmzaxiyztkjzhehonta`) remains available for a future, separate "Installable By Any Customer" fresh-install test; it is not required for DEBT-012.

---

## 1. Why Dev, Not a Separate Staging Project

- `ard-erp-dev` holds test data only, to be cleaned before production; there are no real customers to protect.
- Its schema is the real, complete schema (all triggers, `account_determinations`, `open_item_allocations`, guards). Testing DEBT-012 here yields meaningful results.
- Rebuilding a full schema on the empty database by hand (62 migrations, no CLI/pg_dump available) is high-effort and risks missing schema created directly in the DB outside migrations.
- The real need is not full environment isolation but **clean engineering hygiene**: don't pollute dev's reference data, and be able to remove every test row afterwards.

## 2. Governing Principles (replace the environmental Gate 0)

1. **Strict marking.** Every test row carries a clear, queryable marker (e.g. a documented prefix/tag in `remarks` / `reference` / `notes`, such as `DEBT012_TEST_...`) so it is identifiable for teardown.
2. **ZATCA protection.** Do NOT touch `zatca_document_chain`, `zatca_credentials`, `zatca_submission_log`, or `zatca_icv_counter`. DEBT-012 test invoices are simple (no vehicle lines, no signing, no entry into the ZATCA chain). DEBT-012 remediation does not require ZATCA.
3. **Step-by-step execution.** One step at a time, each preceded by an explicit, scoped approval ("run S0"), each followed by verification before the next.
4. **Tested cleanup.** The teardown must cover rows generated indirectly via triggers (`journal_entries` / `journal_entry_lines` from payment/invoice/settlement triggers), and must respect immutability (`trg_prevent_posted_modify` — un-post before delete where required). Cleanup is designed before the first INSERT.
5. **Detector before remediation.** First prove DEBT-012 manifests live on seeded data (detector), then design/apply the fix, then re-test. No remediation is applied before the detector step confirms the defect on fresh test data.

## 3. Step Sequence (each step is a separate, separately-approved action)

- **S0 — Phase 0A prerequisite.** Add the `CUSTOMER_DEPOSITS` account-determination key (by role, resolving to the company's customer-deposits/liability account `2141`; not hardcoded). One marked INSERT into `account_determinations`. This is the first write and requires explicit approval.
- **S1 — Seed a detector case.** Create one simple issued invoice with a full cash payment (via the `payments` table → its trigger posts the payment JE) + a PAYMENT allocation via `create_allocation` (with the fetched `journal_entry_id`, never NULL). All rows marked. Simple invoice only (no vehicle lines).
- **S2 — Run cancellation.** Execute `cancel_sales_invoice` on the seeded invoice and observe the effect (does the prior cash payment stay stranded? does AR control go negative? — the DEBT-012 signature).
- **S3 — Document the detection.** Record that DEBT-012 manifests live on fresh test data (revenue/COGS/inventory/allocations reversed, but the cash payment left with no offsetting GL leg).
- **S4 — Design/apply the remediation.** (Separate approval.) Extend `can_cancel_sales_invoice` (allocation-aware guard: `payments` + active unreversed allocations, not `sales_payments`) and add F5.7 GL clearing to `cancel_sales_invoice` (payment → Customer Deposits; settlement → reverse), per `docs/ERP_DEBT012_REMEDIATION_DESIGN.md`.
- **S5 — Re-test.** Re-seed + re-cancel; verify AR nets to zero, cash untouched, deposits partner-tracked, idempotency holds.
- **S6 — RR-001 validation.** Run the RR-001 design query on the post-remediation state; expect `variance_trade_only` to collapse toward zero for the new (non-historical) cases.
- **S7 — Cleanup.** Run the tested teardown to remove all marked test rows (including trigger-generated JEs), returning dev to its prior reference state.

## 4. Per-Step Safety Gate (before every write step)

- The step is explicitly approved by the owner, by name ("run S0"), not a general "continue".
- The marker convention is applied to every row the step creates.
- The affected objects are re-read (read-only) immediately before the write, so the write rests on current live state.
- After the write, a verification read confirms the intended effect and nothing else.
- ZATCA tables are untouched.
- For any function change (S4), the prior definition is captured first (rollback) and the migration is idempotent (`CREATE OR REPLACE`).

## 5. Cleanup / Teardown Design (prepared before S0)

- Every marked test invoice, payment, allocation, settlement, and credit note is removed by its marker.
- Trigger-generated `journal_entries` / `journal_entry_lines` linked to those documents are removed too; posted entries are un-posted first if `trg_prevent_posted_modify` blocks deletion.
- The `CUSTOMER_DEPOSITS` determination key (S0) may be kept (it is legitimate reference data the product needs) or removed if the test is meant to be fully reverted — decided explicitly at teardown.
- Because dev will be fully cleaned before production anyway, any residual is ultimately removed; the teardown keeps dev usable in the meantime.

## 6. What This Plan Does NOT Do

- It does not write to any database yet.
- It does not apply remediation.
- It does not touch ZATCA tables.
- It does not run on the empty `qsmzaxiyztkjzhehonta` database (that remains for a future fresh-install test).
- It does not authorize any step; each step needs its own explicit approval.

## 7. Status

```
DEBT-012 Controlled Dev Test Plan = Prepared (documentation only)
Target = ard-erp-dev (development database, test data, cleaned before production)
Separate fresh DB (qsmzaxiyztkjzhehonta) = reserved for a future Installable-By-Any-Customer test, not used here
Environmental Gate 0 = replaced by controlled-testing discipline (marking + tested cleanup + ZATCA protection + per-step approval)
Next = S0 (Phase 0A: CUSTOMER_DEPOSITS key), only on explicit per-step approval
Execution = Not started · No DB write · No remediation · No PASS/FAIL
Posting Engine = Under Audit / Partially Audited
```
