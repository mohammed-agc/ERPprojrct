# TECH-DEBT-AP-001 — Redefinition Review

**Status:** Redefined / Previous asymmetry assumption NOT supported by live evidence
**Date:** 2026-07-07
**Nature:** Documentation only — no remediation, no DB writes, no schema change proposed.

---

## 1. Purpose

TECH-DEBT-AP-001 was registered as "generalize SAP Open Item Standard onto
purchase_invoices (AP)", on the assumption that Accounts Receivable (AR /
invoices) had adopted an explicit SAP Open Item column model
(original_amount / cleared_amount / open_amount / document_status) while
Accounts Payable (AP / purchase_invoices) had not — an AR↔AP asymmetry.

This review records what a live read of the database actually shows, corrects
that assumption, and restates what the real (much narrower) findings are, so the
debt register does not drive a future remediation built on a false premise.

---

## 2. Previous assumption (as registered)

- AR adopted SAP Open Item with explicit columns
  (original_amount / cleared_amount / open_amount / document_status) and a
  document_status state machine (OPEN / PARTIALLY_CLEARED / CLEARED / CANCELLED).
- AP (purchase_invoices) still used a legacy pattern
  (status: draft / confirmed / partially_paid / paid) and therefore lagged AR.
- Remediation implied: add the four Open Item columns + state machine to AP,
  migrate data, rewire callers — a large table-level restructuring.

---

## 3. Live evidence reviewed (read-only, ard-erp-dev)

1. **purchase_invoices columns:** id, code, po_id, grn_id, supplier_id,
   supplier_name, invoice_no, invoice_date, due_date, subtotal, vat_amount,
   total, paid_amount, status (default 'draft'), currency, notes, contact_id,
   allocation_id, discount fields. No original_amount / cleared_amount /
   open_amount / document_status columns.
2. **purchase_invoices status CHECK:** draft / confirmed / issued /
   partially_paid / paid / cancelled.
3. **invoices (AR) columns queried:** status (default 'draft'), paid_amount,
   subtotal, total — and NO original_amount / cleared_amount / open_amount /
   document_status either.
4. **partner_aging:** computes outstanding for BOTH sides via
   document_remaining('purchase_invoice'|'sales_invoice', id, total), filtering
   only status NOT IN ('cancelled','draft'). Identical treatment for AR and AP.
5. **create_supplier_payment_journal_entry (AP payment trigger):** posts a GL
   entry only (Dr PURCHASE_AP / Cr cash-bank). Does NOT create an
   open_item_allocation and does NOT update paid_amount.
6. **create_payment_journal_entry (AR payment trigger):** posts a GL entry only
   (Dr cash-bank / Cr SALES_AR). Does NOT create an open_item_allocation and
   does NOT update paid_amount.
7. **create_allocation callers:** a search for DB functions calling
   create_allocation(...) returned none. It is invoked only from outside the
   database (UI / service / manual), for both AR and AP.

---

## 4. AR / AP symmetry finding

Contrary to the registered assumption, AR and AP are structurally symmetric:

- Neither table has the four explicit Open Item columns; both carry
  status (text) + paid_amount + total.
- Both are aged and cleared the same way — through document_remaining, which is
  derived from open_item_allocations (the SSOT), not from paid_amount.
- Both payment paths (customer and supplier) post GL only and create no
  allocation automatically.

There is no AR↔AP asymmetry of the kind AP-001 assumed. The "AP-specific Open
Item gap" is not confirmed in its previous form.

---

## 5. create_allocation caller finding

`create_allocation` has no in-database caller. Allocations (including PAYMENT
allocations) are created by an external caller (UI / service / manual step),
separately from the payment event, for both AR and AP. The allocation layer is
decoupled from the payment layer on both sides.

---

## 6. Real findings replacing AP-001

The audit did surface two genuine observations — but neither is AP-specific, so
neither is TECH-DEBT-AP-001:

- **paid_amount is not the source of truth.** It exists on both AR and AP but is
  ignored by document_remaining (which reads allocations). It is a
  dead / potentially misleading column on both sides. Low-severity cleanup,
  affects AR and AP equally.
- **Payment does not auto-allocate.** A payment posts GL only; the open-item
  allocation that clears the invoice is a separate, external/manual step. A paid
  invoice therefore stays "open" in the subledger until someone allocates. This
  affects AR and AP identically. Whether this is intentional design (flexible
  manual matching) or a workflow/UX gap is NOT yet determined — see §7.

---

## 7. Recommended next investigation

Investigate whether "payment without automatic allocation" is intended design or
a workflow/UX gap, referenced against how a professional automotive company
would expect it to behave (the constitutional operational reference). If it is a
gap, it is broader than AP — a candidate cross-cutting item provisionally named
(NOT yet registered):

> TECH-DEBT-OI-001 — Manual allocation required after payment across AR/AP

Do not name or register it until the design-vs-gap question is answered.

---

## 8. Status

```
TECH-DEBT-AP-001            = Redefined / Previous asymmetry assumption not
                             supported by live evidence
AP-specific open item gap  = Not confirmed in previous form
Actual findings            = paid_amount ignored across AR/AP
                           + allocation is manual/external for both AR/AP
Remediation                = None
DB writes                  = None
Schema change              = Not proposed
```

This document records a redefinition only. AP-001 is NOT fixed, NOT closed as
resolved, and NOT production-anything — it is corrected. Next step is the §7
investigation, not a remediation.
