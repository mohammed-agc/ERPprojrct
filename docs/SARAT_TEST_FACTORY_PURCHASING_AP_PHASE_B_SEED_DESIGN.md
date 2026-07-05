# Sarat Test Factory — Purchasing + AP Limitation (Phase B Seed Design)

**Status:** Seed Design only / No seed execution / No DB writes · Staging = Not confirmed · Posting Engine = Under Audit / Partially Audited

This is the second item in the Phase B order (§8): Purchasing + AP limitation documentation. It designs scenarios only — no seed execution, no DB writes, no PASS/FAIL. Critically, it does **not** assume AP is symmetric with AR. AR was built on the SAP Open Item standard (`open_item_allocations` active); AP was not (TECH-DEBT-AP-001). The scenarios here must expose that limitation, not work around it — the seed reveals the current reality, it does not mask it.

---

## 1. Purpose

- Design safe seed scenarios for the Purchasing → AP cycle.
- Document explicitly that AP does **not** use `open_item_allocations` today — it uses a `paid_amount` / status pattern.
- The scenarios must expose TECH-DEBT-AP-001, not bypass it.
- Seed Design only. No execution. Execution deferred until staging confirmation.

## 2. Phase A Evidence Basis (from PURCHASING review, commit 9e9548f)

- `purchase_invoices`: `code` NOT NULL; `supplier_id` + `contact_id` duplication (R-P1); `paid_amount` present — the SAP Open Item standard is **not** applied here (TECH-DEBT-AP-001).
- `purchase_invoice_lines`: `net_cost` NOT NULL (the Cost Bridge source); VIN direct on the line.
- Three triggers on purchasing, including `trg_guard_pinv_from_unapproved_po` — where `po_id = NULL` passes (a direct invoice without a PO is allowed).
- `create_purchase_invoice_journal_entry`: fires on status IN (approved/...), posting Dr inventory + Dr VAT input / Cr AP (vendor).
- `purchase_payments` with a conditional trigger posting the payment journal entry when `approval_status = 'approved'` (Dr AP / Cr cash); no allocation layer.
- The Cost Bridge (purchase net_cost → inventory cost) is code, not a trigger.

## 3. AP Limitation Statement (explicit)

This is the governing distinction for this item:

- AR side: clearing is driven by `open_item_allocations` (active, per the Sales+Payments+Open Items design). Document status flows OPEN → PARTIALLY_CLEARED → CLEARED from active allocations.
- AP side: `purchase_invoices` carries `paid_amount` and a status pattern. There is **no** `open_item_allocations` participation for AP. Clearing on AP is therefore not derived the same way AR is.
- TECH-DEBT-AP-001 = SAP Open Item allocation not implemented on AP.

Consequence for seed design: AP scenarios must be written in `paid_amount`/status terms, and must annotate that this is the current limitation. A scenario must **not** be written as if AP had an active open-item allocation layer.

## 4. Master Data (design — not executed)

- Test vendor: `TDF-PUR-VEND-01` (a contact of vendor type). No real supplier name.
- One inventory item (part or vehicle as the scenario needs) for the purchase line.
- Accounts referenced by role only (per the constitution): inventory, VAT input, AP = 2111, cash = 1111. Implementation must resolve via account determination, not literals.

## 5. Scenario Set

### TDF-PUR-B01 — Direct purchase invoice (baseline, no PO)

- Classification: transaction + accounting.
- Flow: create a purchase invoice with `po_id = NULL` (allowed — `trg_guard_pinv` passes), one line with `net_cost`, move to approved status so the JE fires.
- Expected accounting: Dr inventory + Dr VAT input / Cr AP (2111, vendor).
- Expected AP state: `purchase_invoices.paid_amount = 0`, status reflects unpaid.
- Design note: records the Cost Bridge (net_cost → inventory cost) as code behaviour.
- Purpose: establish the correct AP baseline.

### TDF-PUR-B02 — Purchase invoice via approved PO

- Classification: transaction + accounting + approval.
- Flow: PO → approval → purchase invoice referencing the PO → approved → JE fires.
- Expected accounting: same posting as B01.
- Purpose: prove the PO-linked path and the approval gate.

### TDF-PUR-B03 — Vendor payment (paid_amount pattern — AP limitation exposure)

- Classification: transaction + accounting + AP-limitation.
- Flow: for B01/B02, insert `purchase_payments`, approve it so the conditional trigger posts Dr AP / Cr cash.
- Expected accounting: AP reduces, cash reduces.
- **AP limitation expectation (TECH-DEBT-AP-001):** clearing is reflected only by `paid_amount`/status on `purchase_invoices` — there is **no** `open_item_allocations` row on the AP side. The vendor's open balance is derived from `paid_amount`, not from an active allocation layer.
- Design note: this scenario is the detector for TECH-DEBT-AP-001. It must document the `paid_amount`-only clearing as the current limitation, not present it as an open-item clearing.
- Purpose: make the AP/AR asymmetry reproducible and explicit.

### TDF-PUR-B04 — Partial vendor payment (paid_amount partial)

- Classification: transaction + AP-limitation.
- Flow: partial `purchase_payments` against B01.
- Expected AP state: `paid_amount = partial`, status partially paid — again by `paid_amount`, not by an allocation.
- Purpose: show partial AP clearing under the `paid_amount` pattern.

### TDF-PUR-B05 — Guard/negative checks

- Classification: negative / guard.
- Flow: attempt a purchase invoice tied to an unapproved PO (should be guarded), and a vendor payment left unapproved (JE should not fire).
- Expected: `trg_guard_pinv` blocks the unapproved-PO case; the payment JE does not post while `approval_status != 'approved'`.
- Purpose: confirm the purchasing guards and the approval-gated posting.

## 6. Dependencies

- TDF-PUR-B03/B04 depend on a posted purchase invoice (B01 or B02).
- TDF-PUR-B02 depends on an approved PO.
- Master data (section 4) precedes all.

## 7. Expected Impact Summary

| Scenario | Accounting | AP state | Open-item | Debt/limitation exposed |
|----------|------------|----------|-----------|--------------------------|
| B01 | Dr inv + Dr VAT / Cr AP | unpaid | none (AP) | — |
| B02 | same as B01 | unpaid | none (AP) | — |
| B03 | Dr AP / Cr cash | paid via paid_amount | none (AP) | TECH-DEBT-AP-001 |
| B04 | partial Dr AP / Cr cash | partial via paid_amount | none (AP) | TECH-DEBT-AP-001 |
| B05 | none (blocked/unposted) | unchanged | none | — (guard) |

Note the "Open-item" column is "none (AP)" throughout — this is the explicit AP limitation, contrasted with the AR item where open-item allocations are active.

## 8. Safety Gates (must all pass before any execution)

- Confirm staging environment (currently Not confirmed → no execution).
- Confirm database target is not production.
- Confirm user authorization.
- Confirm no production credentials.
- Confirm no external ZATCA calls.
- Confirm no production / supplier real data.
- Confirm dry-run / read-only review first.
- Confirm rollback approach.
- PASS/FAIL only after execution evidence.

## 9. Rollback / Cleanup Strategy (design)

- All seed rows carry `TDF-` prefixes for identification.
- Posted journal entries are immutable (Posting Engine guards); cleanup of posted entries requires un-posting first — to be handled only in confirmed staging, never production.
- Cleanup order reverses creation order (payments → invoices → PO → master data).
- No cleanup is executed here; this is design only.

## 10. Non-Authorization Statement

This design does not authorize: seed execution, DB writes, staging execution, migrations, remediation (including any AP Open Item implementation), production changes, external ZATCA calls, or PASS/FAIL judgment. Documenting TECH-DEBT-AP-001 here does not change its status or schedule a fix.

## 11. Status

```
Purchasing + AP Limitation Phase B Seed Design = Designed / Not executed
Scenarios = TDF-PUR-B01..B05 (B03/B04 expose TECH-DEBT-AP-001)
AP uses paid_amount/status, not open_item_allocations (explicit limitation)
Phase B execution = Not authorized / Not executed
Staging = Not confirmed
No DB writes
No remediation
No PASS / FAIL
TECH-DEBT-AP-001 = SAP Open Item not applied to AP (documented, not fixed)
Posting Engine = Under Audit / Partially Audited
```
