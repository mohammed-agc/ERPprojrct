# TECH-DEBT-OI-001 — Usage Impact Review

**Status:** Confirmed / Usage impact under review
**Date:** 2026-07-07
**Nature:** Code read-only review. No remediation, no DB writes, no PASS/FAIL.

---

## 1. Search scope

Read-only `Select-String` over `src/**/*.ts,*.tsx` for:
`paid_amount`, `partially_paid`, `status='paid'` family, `invoice.status`,
`document_remaining`, `document_clearing_status`. Three patterns produced the
material signal: `partially_paid` (~34 hits), `paid_amount` (~60+ hits),
`document_remaining` / `document_clearing_status` (2 hits total).

---

## 2. paid_amount usages (classified)

### E. Risky — financial calculations that read paid_amount (not SSOT)
- `pages/ERPReports.tsx` 140/142 — pending_amount / overdue_amount =
  Σ(total − paid_amount). A report; blind to settlements.
- `pages/AccountsPayable.tsx` 24 — paid = Σ(paid_amount).
- `pages/AccountsReceivable.tsx` 51 — paid = Σ(paid_amount).
- `pages/accounting/PurchaseInvoicesRegistry.tsx` 68 — paid = Σ(paid_amount).
- `pages/accounting/SalesInvoicesRegistry.tsx` 182 — paid = Σ(paid_amount).
- `services/erp/accounting.ts` 429/883/319/705 — derived_remaining =
  total − paid_amount − credited (AR/AP summaries).
- `pages/purchasing/PurchaseInvoiceDetail.tsx` 52 — remaining =
  remaining_amount ?? (total − paid_amount)  (fallback to legacy).
- `pages/purchasing/PurchaseInvoices.tsx` 38/74 — same fallback.
- `pages/SalesOrderDetail.tsx` 512 — paid_amount >= total − credited (completion).
- `services/zatca/invoiceUblMapper.ts` 302 — payableAmount =
  total − paid_amount. **Highest concern: feeds the ZATCA e-invoice.**

### C. Write / mutation sources
- `services/erp/purchasePaymentsDb.ts` 100 —
  `.update({ paid_amount: newPaid, status: newStatus })` where
  newStatus (line 97) = newPaid >= total ? 'paid' : 'partially_paid'.
  This is the primary origin of the stale fields: it writes them from the
  payment amount only; settlements never pass here.
- `services/erp/accounting.ts` 319/705 — row.paid_amount += paid (aggregation).

### A. Display-only
- `InvoiceDetail` 145, `PurchaseInvoices` 86, `AccountsPayable` 80,
  `AccountsReceivable` 136, `InvoicePrint` 180-188 — show "paid" amount.

### Type defs / mock / tests
- `integrations/supabase/types.ts`, `xmlBuilder.types.ts`, loaders, gate tests.

---

## 3. partially_paid / status usages (classified)

### B. Logic / workflow reading status
- `pages/purchasing/PurchaseInvoiceDetail.tsx` 53 — canPay =
  (status==='confirmed' || 'partially_paid') && remaining>0.01
  (guarded by remaining, so partly protected).
- `pages/purchasing/PurchaseInvoices.tsx` 37 — filter by status.
- `services/erp/purchasing.ts` 1637 — find(status==='partially_paid'||'issued').
- `pages/purchasing/IncentiveManagement.tsx` 95 + `services/erp/incentives.ts` 111
  — .in('status', ['confirmed','partially_paid','paid']).

### C. Derives status from paid (legacy origin)
- `services/erp/purchasePaymentsDb.ts` 97 — status from newPaid.
- `services/erp/purchasing.ts` 839 — if (paid>0) return 'partially_paid'.
- `services/erp/sales.ts` 898 — status = paid>=total ? 'paid' : 'partially_paid'.

### A. Display-only
- Labels / colours / filters across registries, detail pages, print, Invoices.

---

## 4. Correct SSOT usages (document_remaining / document_clearing_status)

- `pages/InvoiceDetail.tsx` 61 — rpc('document_remaining').
- `services/erp/purchaseInvoicesDb.ts` 269 — rpc('document_remaining').
- `document_clearing_status` — **zero** callers in code.

Only two code sites use the SSOT. The DB has the right primitives
(document_remaining, document_clearing_status) but the application layer almost
never calls them — it overwhelmingly reads paid_amount / status instead.

---

## 5. Answers to the six questions

1. **paid_amount — reports or display-only?** Financial reports and
   calculations, not display-only: ERPReports pending/overdue, AP/AR paid
   totals, registry totals, AR/AP summaries, and the ZATCA payableAmount.
2. **status='paid' gate an action?** Yes, partly: canPay, purchase-invoice
   filters, incentive eligibility read status. canPay also checks remaining, so
   it is partly protected; filters/eligibility read status alone.
3. **Is there a correct SSOT alternative in use?** Yes but rare — only two sites
   call document_remaining; document_clearing_status is never called.
4. **Is the stale-status write source confined to payment flows?** Yes —
   primarily purchasePaymentsDb.ts:100 (plus mock/derive helpers). Settlements
   do not pass through it, which is exactly why the fields drift.
5. **Severity?** medium-to-high. Not cosmetic: financial reports and the ZATCA
   e-invoice read paid_amount. A settlement-cleared invoice can show a non-zero
   payable in reports and in the e-invoice XML.
6. **Preferred remediation (preliminary, not final):** leans **B or D**.
   Pure C (redirect all 60+ sites to SSOT) is large and risky. B (sync
   paid_amount/status from allocations via a controlled function/trigger) would
   correct all consumers at once without touching them; C can then be applied
   incrementally to the highest-risk sites (ZATCA mapper, reports). Not designed
   here.

---

## 6. Risk

- **High-value spots:** ZATCA `invoiceUblMapper` payableAmount (compliance),
  ERPReports pending/overdue, AP/AR paid totals — all read paid_amount and are
  blind to settlements.
- **Guarded spots:** canPay (checks remaining), the two document_remaining sites.
- Overall: a settlement-cleared invoice (e.g. PINV-2026-0001) reads as partly
  paid in reports and could carry a wrong payable into the e-invoice.

---

## 7. Recommendation (preliminary)

Preliminary direction: **B (synchronize) as the broad fix, then C
(redirect to SSOT) incrementally for the highest-risk sites** — starting with
the ZATCA mapper and the financial reports. Do NOT design or implement yet;
this is an impact review only.

---

## 8. Status

```
TECH-DEBT-OI-001        = Confirmed / Usage impact under review
Severity                = medium-to-high (financial reports + ZATCA read paid_amount)
SSOT (document_remaining/document_clearing_status) = present in DB, used in only
                          2 code sites; document_clearing_status never called
Stale-field write source = purchasePaymentsDb.ts (payment flow), settlements bypass it
Preferred direction      = B (sync) broad + C (redirect) incremental — not designed
Remediation              = None
DB writes                = None
```

Impact review only. Nothing fixed, closed, or passed. Remediation design is a
separate later step.
