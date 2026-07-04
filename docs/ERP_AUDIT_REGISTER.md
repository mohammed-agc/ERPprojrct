# Sarat Automotive ERP — Audit Register

> **يجيب: ما الحالة الحالية لكلّ Module؟** يخضع لـ ERP_PRODUCT_CONSTITUTION.md.
> Completed = اجتاز البوابات الثماني بالأدلّة. Approved = اعتُمِد رسميّاً (لا شيء بعد — ينتظر Release Approval).
> Not Audited = لم نُصدِر حكماً بعد (لا ناقص، لا سليم).
>
> آخر تحديث: 2026-07-02

| Module | Status | Criticality | Last Audit | Decision / Notes | Next Review |
|---|---|---|---|---|---|
| General Ledger | **Completed** | Critical | Audit-003 | متوازن للريال؛ ينتظر Approved (Release Approval) | عند Production Freeze |
| Vehicle Profitability | **Completed** | High | VP Audit | بعد VP-001؛ VP-002 مؤجّل (DEBT-004) | مع تدقيق Reports |
| Posting Engine | Not Audited | Critical | — | DEBT-003 (VERIFIED) — الوحدة نفسها لم تُدقَّق بالكامل | مقترح مبكّراً |
| Accounts Receivable | Not Audited | Critical | — | لم يُدقَّق تحت المعيار الحالي | Pending |
| Accounts Payable | Not Audited | Critical | — | DEBT-001 (VERIFIED) — الوحدة نفسها لم تُدقَّق بالكامل | Pending |
| Sales | Not Audited | Critical | — | — | Pending |
| Purchasing | Not Audited | Critical | — | — | Pending |
| Inventory | Not Audited | Critical | — | لم يُدقَّق تحت المعيار الحالي | Pending |
| Inventory Valuation ↔ GL | Not Audited | Critical | — | لم يُدقَّق؛ التطابق مع الدفتر غير مُثبت | مقترح مبكّراً |
| Document Flow | Not Audited | Critical | — | لم يُدقَّق تحت المعيار الحالي | Pending |
| ZATCA | Not Audited | Critical | — | لم يُدقَّق؛ القبول الحيّ غير مُثبت | Pending |
| Approval Workflow | Not Audited | High | — | CANDIDATE-004 only; requires evidence | Pending |
| Reports | Not Audited | High | — | Income Statement مُثبت ضمن Audit-003؛ بقية التقارير لم تُدقَّق | Pending |
| Fixed Assets (Minimum) | Not Audited | Medium | — | Prior note, not audited under current standard | Pending |
| Banking / Treasury | Not Audited | High | — | Prior note, not audited under current standard | Pending |
| Expenses | Planned | High | — | ضمن Release 1.0 (Draft)؛ Gap بعد تجميد النطاق | عند Release Scope Approval |
| Workshop | Deferred | High | — | Release 2.0 | Release 2.0 |
| Spare Parts | Deferred | High | — | Release 2.0 | Release 2.0 |
| Warranty / Insurance | Deferred | Medium | — | Release 2.0 | Release 2.0 |
| Service Contracts / Vehicle History / Job Costing | Deferred | Medium | — | Release 2.0 | Release 2.0 |
| CRM | Future | Medium | — | Release 3.0 | — |
| Budgeting | Future | Medium | — | Release 3.0 | — |
| BI | Future | Low | — | Release 3.0 | — |
| Financing / Leasing / Fleet | Future | Medium | — | Release 3.0 | — |

---

## سجلّ الأودِتات المنفّذة

| Audit | التاريخ | النطاق | النتيجة |
|---|---|---|---|
| Audit-003 | 2026-07-02 | Ledger Integrity | PASS — التوازن الرياضي مُثبت للريال (Σ=3,575,750، Trial Balance net=0، Balance Sheet فرق=0) |
| VP Audit | 2026-07-02 | Vehicle Profitability revenue model | PASS — VP-001 مُصلَح؛ VP-002 مؤجّل (DEBT-004) |
| AUDIT-RR-001 | 2026-07-03 | GL to AR Subledger Reconciliation | **Designed / Not Executed** — No SQL run, No PASS/FAIL |

> **حدود Audit-003:** أثبت **التوازن الرياضي** لدفتر GL، لا **صحّة التصنيف الدلاليّ**
> لكلّ معاملة — ذلك تدقيقٌ منفصلٌ لاحق.

---

## AUDIT-RR-001 — GL to AR Subledger Reconciliation

> **Status: Designed / Not Executed**
> **Result: No PASS / FAIL** · 2026-07-03

**Purpose:** Validate that the GL AR control balance reconciles to the AR subledger / open-item balance.

**Formula:**
```
Σ(GL debit − credit on AR control accounts)  =  Σ(AR invoice open balance)
```

**Scope:**
- AR only.
- Posted GL entries only.
- Sales invoices / customer receivables.
- Open-item allocations.
- No AP, VAT, COGS, inventory, aging buckets, or cancel/reverse scenario execution in this audit yet.

**Tolerance:** 0.01 SAR.

**Execution:** Not executed. No SQL run. No PASS/FAIL judgment.

**Risks / Known Limitations:**
1. AR control account must be evidence-based, not guessed.
2. GL side must not be limited to `source_type = sales_invoice`, because the AR control account is affected by invoices, receipts, settlements, cancellations, and reversals.
3. Direct calculation from `open_item_allocations` is preferred before relying solely on `document_remaining` / `document_allocated`.
4. DEBT-010 may cause Open Items / Aging to diverge from GL if unauthorized allocation occurs.
5. Trial Balance balanced (Audit-003) does not prove GL ↔ Subledger reconciliation.
6. AP is excluded because AP Open Item migration is a known technical debt (TECH-DEBT-AP-001).

**Next step (when executed, with separate approval):** evidence-based identification of the AR control account(s) and table-structure verification, before running any reconciliation query.

### Step 2 — open_item_allocations Structure Review

**Status: Structure Inspected / Reconciliation Not Executed**

**Evidence:**
- `open_item_allocations` contains allocation rows for `PAYMENT`, `SETTLEMENT`, and `CREDIT_NOTE`.
- `target_document_type` includes both `sales_invoice` and `purchase_invoice`, so AR reconciliation must filter AR targets explicitly.
- Active `PAYMENT` allocations were observed with `journal_entry_id = NULL`.
- `SETTLEMENT` allocations were observed with `created_by = NULL`.
- Reversal-like allocation rows exist through `reverses_allocation_id`, including `CREDIT_NOTE` rows.

**Finding:** The table is structurally sufficient to support direct AR open-item calculation, but the calculation cannot be a naïve sum of `allocated_amount`. Allocation sign and business meaning must account for `allocation_type`, `status`, and `reverses_allocation_id`.

**Important:** Active PAYMENT allocations without `journal_entry_id` provide live data evidence that Open Items can move without a linked GL journal entry. This confirms the practical reporting risk described in DEBT-010.

**Note (AR structure):** The absence of SAP-style `open_amount` / `original_amount` fields on `invoices` is noted as a potential AR open-item migration discrepancy for later review, not a concluded debt in this step.

**Result:** No reconciliation SQL has been executed. No PASS / FAIL judgment has been made.

### Step 4 — document_remaining Reversal Handling

**Status: Confirmed with live data evidence / Reconciliation Not Executed**

**Evidence:**
- Invoice `INV-2026-0002` has total `57,500`, credited amount `57,500`, and status `cancelled`.
- The invoice has two active allocation rows:
  - original `PAYMENT` allocation `CLR-2026-00005` for `57,500`;
  - reversal-like `CREDIT_NOTE` allocation `REV-CLR-2026-00005` for `57,500`, referencing the original allocation through `reverses_allocation_id`.
- `document_allocated('sales_invoice', <invoice_id>, NULL)` returned `115,000`.
- `document_remaining('sales_invoice', <invoice_id>, 57,500)` returned `-57,500`.

**Finding:** `document_allocated` sums active allocation rows as positive amounts and does not account for reversal semantics through `reverses_allocation_id`. As a result, `document_remaining` can produce impossible negative remaining balances in reversal scenarios.

**Scope note:** The observed invoice is cancelled and should be excluded from AR open-balance reconciliation. However, the defect is structural and may affect any active document with a similar reversal pattern.

**Impact on RR-001:** `document_remaining` must not be used as the authoritative calculation for AR_Open_Balance. RR-001 must use a direct calculation with explicit reversal/sign logic.

**This is separate from DEBT-010.** DEBT-010 = allocation creation / created_by / journal linkage risk. This finding (tracked as CANDIDATE-RR-001) = allocation remaining calculation / reversal semantics defect.

**Result:** No final reconciliation SQL has been executed. No PASS / FAIL judgment has been made.

### DB Call-Site Review — Promotion to DEBT-011

A DB call-site review confirmed that `document_remaining` / `document_allocated` are consumed not only by display code but also by DB business logic, open-item status derivation, and reporting: `create_allocation` (over-allocation guard), `document_clearing_status` (derives `cleared_amount` / `open_amount` / `document_status`), and `partner_aging` (outstanding amount and aging entry filter), in addition to `InvoiceDetail.tsx` and `purchaseInvoicesDb.ts` display.

**CANDIDATE-RR-001 was promoted to DEBT-011 based on this DB call-site review** (Severity High / Latent). See DEBT-011 in the Technical Debt Register.

AUDIT-RR-001 remains Designed / Structure Inspection In Progress. No final reconciliation SQL executed. No PASS / FAIL judgment.

### Active Reversal-Pair Scan

A follow-up review found that all currently observed active original/reversal allocation pairs are attached to cancelled invoices. No active sales invoice with the same reversal pattern was found.

Result: DEBT-011 remains `High / Latent`. No final reconciliation SQL was executed. No PASS / FAIL judgment was made.

### Completed DB Call-Site Review

The remaining database call sites were reviewed.

Additional findings:
- `create_partner_settlement` uses `document_remaining` for FIFO settlement filtering and settlement amount calculation.
- `partner_balance_summary` uses `document_remaining` for customer/vendor balance calculation and filtering.
- `partner_balance_summary` feeds `create_partner_settlement`, creating a cascade path from balance reporting to settlement business logic.

This expands the documented impact of DEBT-011 to: business-rule validation; Open Item SSOT status; aging/reporting; customer/vendor balance summary; settlement logic; and frontend/service display.

Severity remains `High / Latent`. The expanded impact reinforces High severity, while the active reversal-pair scan supports the Latent qualifier.

### 1131 GL Line Diagnostic

**Status: Diagnostic Inspected / Reconciliation Not Executed**

**Evidence:**
- AR control account `1131` has 14 posted journal lines.
- Total debit on `1131`: `449,900`.
- Total credit on `1131`: `623,925`.
- Net balance: `-174,025`.

**Finding:** The AR control balance is negative, which is abnormal for a receivables control account and requires investigation before a final GL ↔ AR Subledger reconciliation query can be executed.

**Source analysis:**
- Cancelled invoices `INV-2026-0001` and `INV-2026-0002` have original invoice debits and credit-note reversals that balance each other.
- However, prior settlement/payment credits remained posted: `INV-2026-0001` settlement credit `129,425`; `INV-2026-0002` sales payment credit `57,500`.
- This leaves negative AR effects after cancellation.
- A `fixed_asset_disposal` journal entry also posted `6,000` to AR account `1131`.

**Impact:** A simple total-level RR-001 reconciliation query is not ready. The query design must account for source-type breakdown or per-invoice reconciliation and must investigate cancellation/payment/settlement interactions. These findings are tracked as CANDIDATE-RR-002 and CANDIDATE-RR-003 in the Technical Debt Register.

**Result:** No final reconciliation SQL has been executed. No PASS / FAIL judgment has been made.

### CANDIDATE-RR-002 Deep Dive

Review of `cancel_sales_invoice` confirmed that cancellation reverses the invoice and creates Open Item reversal rows, but does not reverse or reclassify prior payment / settlement GL effects.

This explains the negative AR balance observed on account `1131` for cancelled invoices `INV-2026-0001` and `INV-2026-0002`.

Result: `CANDIDATE-RR-002` remains a confirmed structural candidate finding. Severity and final debt promotion are pending review of `can_cancel_sales_invoice` and a formal accounting design decision for paid-invoice cancellation.

### CANDIDATE-RR-002 Promotion

`CANDIDATE-RR-002` was promoted to `DEBT-012` after root cause review of `cancel_sales_invoice` and `can_cancel_sales_invoice`.

The review confirmed both: missing GL treatment for prior payment / settlement effects during cancellation; and incomplete cancellation guard coverage.

Result: `DEBT-012 = High / Active GL Impact / Design Decision Pending`. No final reconciliation SQL was executed. No PASS / FAIL judgment was made.

### CANDIDATE-RR-003 Deep Dive

Review of `JE-2026-0038` (balanced: debit `1131` `6,000` / credit `1213` `5,000` / credit `433` `1,000`) and of `dispose_fixed_asset` confirmed that the disposal function is architecturally sound: cost, accumulated-depreciation, and gain/loss accounts resolve dynamically via `account_determinations`; the proceeds account comes from the caller parameter `p_proceeds_account_code` (default `1121`). The `1131` posting resulted from a caller passing `p_proceeds_account_code='1131'` on a test asset ("أصل اختبار النوع"), not from a code defect.

Result: `CANDIDATE-RR-003` is assessed as a test-data artifact, not a code defect. No promotion. For RR-001, `fixed_asset_disposal` is non-trade and must be excluded via source-type breakdown. No PASS / FAIL judgment was made.
