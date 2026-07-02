# Sarat Automotive ERP — Technical Debt Register

> سجلٌّ رسميٌّ لكلّ دَينٍ تقنيٍّ **مقصودٍ ومُثبتٍ بدليل**. يخضع لـ ERP_PRODUCT_CONSTITUTION.md §6 (Governance).
> **قاعدة الإدراج (Evidence Before Judgment):** لا يُسجَّل بندٌ إلا بدليلٍ صريح
> (Audit رقم / نتيجة SQL / ملف+سطر / commit / جلسة مراجعة). الذاكرة وحدها لا تكفي.
>
> Evidence Level: **VERIFIED** (دليلٌ مباشرٌ اليوم) · **PARTIALLY VERIFIED** · **HYPOTHESIS**.
> Technical Owner = المجال (لا شخص) لينتقل بسلاسةٍ لأيّ مطوّرٍ جديد.
>
> آخر تحديث: 2026-07-02

---

## البنود المفتوحة (Open Debts)

### DEBT-001
- **Title:** AP لم ينتقل لمعيار SAP Open Item
- **Category:** Accounting
- **Description:** purchase_invoices ما زال يستعمل الحالة القديمة "partially_paid"، بينما AR اعتمد OPEN/PARTIALLY_CLEARED/CLEARED.
- **Evidence:** types.ts أسطر 2903, 2909, 3135, 3142 = "partially_paid" (Audit-002، 2026-07-02). purchaseInvoicesDb.ts يكتب from("purchase_invoices").
- **Evidence Level:** VERIFIED
- **Risk:** عدم اتساق معيار المحاسبة بين المدينين والدائنين؛ أعمار الدين والمقاصّة في المشتريات على منطق مختلف.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting
- **Priority:** High
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-002
- **Title:** COGS_INVENTORY_OUT بلا تفصيل حسب product_type
- **Category:** Accounting
- **Description:** الجانب الدائن من قيد التكلفة له تعيينٌ افتراضيٌّ واحدٌ (product_type=null) بلا تفصيلٍ لـ used_vehicle/part، بينما COGS_EXPENSE وPURCHASE_INVENTORY مُفصَّلان.
- **Evidence:** استعلام account_determinations (Audit-002، 2026-07-02): COGS_INVENTORY_OUT صفٌّ واحدٌ product_type=null.
- **Evidence Level:** VERIFIED
- **Risk:** خروج مخزون كلّ الأنواع من حسابٍ واحد → عدم دقّةٍ في تصنيف المخزون عند تنوّع المنتجات.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting
- **Priority:** Medium (يظهر أثره عند تفعيل بيع المستعمل/القطع)
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-003
- **Title:** تسلسل triggers الفاتورة يعتمد الترتيب الأبجديّ
- **Category:** Architecture
- **Description:** trg_zz_complete_vehicle_sale سُمّي بـ"zz" ليُنفَّذ بعد trg_invoice_journal_entry أبجديّاً. أيّ trigger جديدٌ باسمٍ أسبق يكسر التسلسل بصمت.
- **Evidence:** pg_trigger على invoices (Audit-002، 2026-07-02): [trg_inv_no, trg_invoice_journal_entry, trg_zz_complete_vehicle_sale]. سلوك Postgres (تنفيذ أبجديّ) موثّقٌ رسميّاً.
- **Evidence Level:** VERIFIED
- **Risk:** هشاشةٌ في تسلسل القيود المحاسبيّة عند إضافة أيّ trigger مستقبلاً.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Architecture
- **Priority:** Medium
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

### DEBT-004
- **Title:** Vehicle Profitability VAT Basis Not Audited
- **Category:** Reporting / Accounting
- **Description:** أساس احتساب ربحيّة المركبة (Gross مقابل Net) لم يُعتمَد محاسبيّاً بعد. التقرير يستعمل invoice_lines.total مقابل تكلفةٍ من cost_price، ولم يُحسَم هل total شاملٌ للضريبة وهل يجب أن تكون الربحيّة صافيةً منها. **الدَّين ليس أن الحساب خاطئ — بل أن الأساس غير معتمد.**
- **Evidence:** جلسة VP Audit (2026-07-02): صفّ invoice_lines لـ TEST-V-001 (unit_price=100000, vat_amount=15000, total=115000). أُجّل صراحةً في commit 144a4c5.
- **Evidence Level:** VERIFIED (وجود القرار المحاسبيّ غير المحسوم مُثبت)
- **Risk Evidence Level:** PARTIALLY VERIFIED (الأثر الماليّ لم يُثبَت بالكامل)
- **Risk:** لو ثبت لاحقاً خلطُ إيرادٍ شاملٍ للضريبة مع تكلفةٍ بدونها → قد يتشوّه الهامش. قد يمسّ SalesAnalytics.
- **Business Owner:** Mohammed Helwan
- **Technical Owner:** Accounting / Reporting
- **Priority:** Medium
- **Status:** Open
- **Target Release:** 1.0
- **Created At:** 2026-07-02
- **Closed At:** —

---

## Evidence Backlog — Not Official Debt

> **ليست ديوناً تقنيّة.** مرشّحاتٌ ذُكِرت في جلساتٍ سابقة (غالباً من الذاكرة) لكن **بلا دليلٍ
> مُتحقَّقٍ في جلسةٍ رسميّة**. لا تحمل Debt ID ولا تُعَدّ ضمن الديون. تُرقَّى إلى DEBT رسميٍّ
> فقط عند جمع دليلٍ (VERIFIED / PARTIALLY VERIFIED). Evidence Level لكلّها الآن: HYPOTHESIS.

| Candidate ID | العنوان | المجال | ملاحظة |
|---|---|---|---|
| CANDIDATE-001 | setRuntimeSupabaseClient bridge (ZATCA Runtime stopgap) | ZATCA/Architecture | يحتاج فحص الكود الحيّ |
| CANDIDATE-002 | credit_notes.amount على مستوى الفاتورة بدل credit_note_lines | Accounting | يحتاج تحقّقاً |
| CANDIDATE-003 | Metadata في notes نصّ (vehicleMeta/contactMeta) | Architecture | لم يُفحَص محتواها |
| CANDIDATE-004 | AW2 — Approval Workflow (mode=ALL + escalation) ناقص | Workflow | يحتاج تدقيقاً |
| CANDIDATE-005 | Normalize Vehicle Status Constants (نصوص الحالة في salesVehicleStatus) | Architecture | مؤجّل بوعي |
| CANDIDATE-006 | get_next_document_number هشّ مع prefix فارغ | Architecture | يحتاج تحقّقاً |

## البنود المغلقة (Closed Debts)

*(لا شيء بعد)*
