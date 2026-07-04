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
