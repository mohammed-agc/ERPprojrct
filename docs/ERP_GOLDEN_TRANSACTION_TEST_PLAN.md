# Sarat Automotive ERP — Golden Transaction Test Plan

> جزء من AUDIT-PE-001 / Phase 4 — Runtime Transaction Validation.
> أداة حكم رسمية على Production Readiness. لا Module يقترب من "Completed" إلا بعد:
> **Structural Audit + Runtime Transaction Test + Report Reconciliation.**
>
> **الحالة: Draft Official Test Plan (Not Approved / Not Executed)** · 2026-07-02
>
> Posting Engine = Under Audit / Partially Audited. هذه الوثيقة أداةُ قياسٍ للـ Runtime لاحقاً
> على بيئة Supabase staging معزولة — لا تُنفَّذ على قاعدة أدلّة التدقيق الحالية.

---

## ⛔ الشرط الحاكم (Governing Precondition)

> **Runtime tests must not be executed on the current audit-evidence database
> unless an explicit rollback-controlled exception is approved.**

قاعدة البيانات الحالية صارت **مصدر أدلّة تدقيق** (Audit-003، AUDIT-PE-001، دفتر الأستاذ،
source traceability، account determination، duplicate protection). أيّ عملية كتابةٍ
عليها تخلط Existing Audit Evidence بـ Runtime Test Evidence وتُضعِف كلّ النتائج.
**على البيئة الحالية: قراءة فقط.**

---

## 1. Purpose

إثبات **السلوك الفعليّ** لـ Posting Engine عبر عمليات حقيقية معروفة ومضبوطة، وتتبّع أثرها
من المستند → القيد → المخزون → AR/AP → التقارير → الإلغاء/العكس. لأن:
- Structural Evidence يثبت التصميم؛ Runtime Evidence يثبت السلوك.
- دالّة صحيحة لا تعني أن الخدمة/الواجهة تستدعيها صحيحاً، ولا أن الدورة تكتمل.

---

## 2. Test Environment

**Preferred Environment:** Dedicated Supabase staging/test project — نفس الـ schema/الدوال/
triggers/account determination، ببيانات اختبار منظمة، قابلة للمسح وإعادة البناء، بلا بيانات
عميل حقيقية، غير مرتبطة بـ ZATCA production.

**Fallback Environment:** Isolated test company داخل القاعدة الحالية — **فقط** إن تعذّر staging،
وبشروط صارمة: snapshot قبل الاختبار · test company منفصلة · test prefix واضح لكل مستند ·
لا بيانات حقيقية · rollback plan · لا إرسال ZATCA · وسم كل القيود الناتجة كـ Runtime Test Evidence.
(ليس الخيار المفضّل.)

**ZATCA:** ممنوع نهائياً استخدام ZATCA Production. الاختبار على Sandbox/Simulation/Mock فقط،
أو فحص linkage داخلياً دون إرسال حقيقي. أيّ إرسال لبيئة حكومية خارج sandbox ممنوع.

**Reset & Snapshot:** قبل كل دورة اختبار: snapshot/baseline. بعدها: rollback أو إعادة بناء.
لا تراكم بيانات بين الدورات.

---

## 3. Test Master Data (ثابتة، معروفة مسبقاً)

| النوع | قيمة الاختبار |
|---|---|
| Company | TEST-CO (منفصلة) |
| Branch | TEST-BR-01 |
| Warehouse | TEST-WH-01 |
| Customer | TEST-CUST-01 |
| Supplier | TEST-SUPP-01 |
| Vehicle | TEST-VEH-01 (VIN فريد) |
| Spare Part | TEST-PART-01 |
| Fixed Asset | TEST-FA-01 |
| Employee | TEST-EMP-01 |
| VAT | 15% |
| Accounts | من account_determinations القياسية (لا hardcode) |

كل مستند اختبار يحمل بادئة **TEST-** لتمييزه.

---

## 4. Transaction Matrix

لكل سيناريو: Business Process · Input · Expected Document · Expected JE · Expected Inventory ·
Expected AR/AP · Expected Reports · Expected Locking · Expected Reversal · Evidence Query · Pass/Fail.

> **القيد المتوقّع يُوصَف بمفاتيح Account Determination (الأدوار)، لا بأرقام حسابات ثابتة** —
> لأن الأرقام تختلف بين الشركات، والاختبار يجب أن يُثبِت أن النظام يستعمل account_determinations.
> **Expected account codes must be resolved from the staging account_determinations setup
> before executing the test.**

| # | Scenario | القيد المتوقّع (بمفاتيح Determination) |
|---|---|---|
| 1 | Vehicle Purchase | Dr PURCHASE_INVENTORY / Cr PURCHASE_AP |
| 2 | Goods Receipt | حركة مخزون + (حسب التصميم) قيد استلام |
| 3 | Purchase Invoice | Dr PURCHASE_INVENTORY + Dr VAT_INPUT / Cr PURCHASE_AP |
| 4 | Vendor Payment | Dr PURCHASE_AP / Cr (PAYMENT_CASH أو PAYMENT_BANK حسب payment_method) |
| 5 | Sales Quotation | Expected JE: **None** · Control: must not create accounting entry · + يتحوّل صحيحاً لـ SO/Invoice |
| 6 | Sales Order | Expected JE: **None** · Control: must not create accounting entry · + يتحوّل لـ Invoice/Delivery/Reservation |
| 7 | Sales Invoice (vehicle) | Dr SALES_AR / Cr SALES_REVENUE / Cr VAT_OUTPUT + Dr COGS_EXPENSE / Cr COGS_INVENTORY_OUT |
| 8 | Customer Receipt | Dr (PAYMENT_CASH أو PAYMENT_BANK) / Cr SALES_AR + open-item allocation |
| 9 | Sales Credit Note | عكس متناسب: Dr SALES_REVENUE + VAT_OUTPUT / Cr SALES_AR (+ عكس COGS إن انطبق) |
| 10 | Goods Issue | حركة مخزون خارجة + قيد إن انطبق |
| 11 | Inventory Adjustment | Dr/Cr حسب فرق الجرد (مفاتيح حسب التصميم) |
| 12 | Expense Posting | Expected Result: **Not Supported / Planned Capability** — لا يوجد مسار ترحيل مصروفات مكتمل بعد (Expenses = Planned، ليس Gap حتى اعتماد Release 1.0) |
| 13 | Fixed Asset Acquisition | Dr FIXED_ASSET_COST / Cr (credit account حسب payment) |
| 14 | Fixed Asset Depreciation | Dr DEPRECIATION_EXPENSE / Cr ACCUMULATED_DEPRECIATION |
| 15 | Document Cancellation | قيد عكسي + المستند Cancelled + منع التعديل |
| 16 | Journal Entry Reversal | قيد عكسي (لا حذف) + audit trail |
| 17 | Duplicate Posting Attempt | محاولة ترحيل مرّتين → **قيد واحد فقط** أو رفض محكوم |

> يُضاف أيّ سيناريو يدعمه النظام ويُكتشَف أثناء التنفيذ.
> كل الأرقام (1141/511/2111...) أُزيلت عمداً — تُشتقّ من account_determinations وقت الاختبار.

---

## 5. Expected Journal Entries (نموذج التحقّق الدلاليّ)

قبل كل تنفيذ، يُكتَب القيد المتوقّع صراحةً (الحساب + النوع + الاتّجاه)، ثمّ يُقارَن بالفعليّ:
- **Sales Invoice (vehicle):** Dr AR / Cr Revenue / Cr VAT Output ; Dr COGS / Cr Inventory-Out.
- **Vendor Payment:** Dr AP / Cr Cash-Bank.
- **Customer Receipt:** Dr Cash-Bank / Cr AR.
- **Fixed Asset Depreciation:** Dr Depreciation Expense / Cr Accumulated Depreciation.
- **Credit Note:** عكس متناسب للإيراد والضريبة (+ COGS إن انطبق).

معيار النجاح: الحسابات الفعليّة = المتوقّعة **نوعاً ورمزاً واتّجاهاً**، والقيد متوازن.

---

## 6. Verification Queries (لكل عملية)

لكل سيناريو، SQL للتحقّق من: المستند · القيد (journal_entries) · السطور (journal_entry_lines) ·
source_type/source_id · totals (debit=credit) · account codes+types · status ·
inventory movement · open_item_allocation · أثر التقارير. (تُصاغ بالتفصيل عند التنفيذ،
على بيئة الاختبار فقط.)

---

## 7. Idempotency Tests

**مبدأ حاكم: Idempotency keys are event-specific.** لا يُفترَض أن (source_type, source_id)
صالحٌ لكل الحالات — Phase 4-A أثبت أن المفتاح يختلف حسب نوع الحدث:

| الحدث | مفتاح الـ Idempotency |
|---|---|
| Invoice / Payment | source_type + source_id |
| Depreciation | asset_id + period |
| Reversal | original_entry_id + reversal state (is_reversed) |
| Allocation / Clearing | target document + allocation model / remaining amount |
| Credit Note / Cancellation | original invoice + cancellation state / generated credit note |

**الاختبار العامّ:** Post once → Post again → عدّ السجلّات بالمفتاح الصحيح للحدث.
**المتوقّع:** سجلّ واحد صالح، أو رفض/تخطٍّ محكوم. **سجلّان = Finding خطير** (يؤكّد خطر DEBT-006 عمليّاً).

**اختبار خاصّ للإهلاك (مفتاح asset_id + period):**
> Run depreciation twice for the same asset and same period.
> Expected result: Only one depreciation record for asset_id + period, or controlled skip.
> (fixed_asset_depreciation له UNIQUE(asset_id, period) — الحماية ذرّية طبقتان: IF EXISTS + DB constraint.)

يُختبَر أيضاً — قدر الإمكان — سيناريو التزامن (استدعاءان متقاربان) لكشف race condition،
خاصّةً على ترقيم القيود (DEBT-007: MAX+1 غير ذرّي).

---

## 8. Reversal Tests

نلغي/نعكس المستند ونفحص:
- هل حُذف القيد؟ → **مرفوض**.
- هل أُنشئ قيد عكسيّ؟ → **الصحيح**.
- هل بقي audit trail؟
- هل صار المستند Cancelled/Reversed؟
- هل مُنِع التعديل بعد الإلغاء؟

---

## 9. Pass / Fail Criteria

سيناريو **Pass** إذا: القيد الفعليّ = المتوقّع (نوعاً/رمزاً/اتّجاهاً) · متوازن · مربوط بمصدره ·
أثر المخزون/AR/AP صحيح · التقارير تعكسه · الترحيل idempotent · الإلغاء يعكس لا يحذف ·
المستند يُقفَل بعد الترحيل. أيّ إخفاق → **Fail** مع Evidence، ويُسجَّل Finding/Debt.

---

## 10. Discovered Posting Events — Structurally Reviewed in AUDIT-PE-001 / Phase 4-A, Runtime Validation Pending

Phase 4-A راجع هذه الأحداث **بنيويّاً على مستوى function definitions** (لم تعد بلا تدقيق):

| source_type | المولّد (مُراجَع بنيوياً Phase 4-A) |
|---|---|
| credit_note / credit_note_cogs | cancel_sales_invoice (+ create_allocation للربط) |
| depreciation | run_monthly_depreciation (idempotency asset_id+period، UNIQUE constraint) |
| fixed_asset_acquisition | acquire_fixed_asset (متوازن، حسابات ديناميكية) |
| fixed_asset_disposal | dispose_fixed_asset (متوازن جبرياً، idempotency status=disposed) |
| settlement | create_partner_settlement (contra Dr AP/Cr AR + FIFO allocations) |
| sales_invoice_cogs | create_invoice_journal_entry (+ عكسه في cancel_sales_invoice) |

**حالة هذه الأحداث:**
- ✅ تمّت تغطيتها **بنيويّاً** على مستوى function definitions (Phase 4-A).
- ⏳ **لم تُختبَر Runtime بعد.**
- ⏳ تحتاج تحقّقاً من: التقارير (Report Reconciliation) · الصلاحيات (Security/Permissions) ·
  ZATCA linkage · على بيئة staging معزولة.

> تغطية الأحداث الحقيقية = 11 نوعاً (عدا manual). المسح البنيوي اكتمل؛ يتبقّى Runtime.

---

## 10-B. Phase 4-A Derived Runtime Scenarios

سيناريوهات Runtime إضافية مشتقّة مباشرةً من الدوال التي دُقّقت بنيويّاً في Phase 4-A.
تُدرَج للتنفيذ لاحقاً على staging معزول (ليست مفصّلةً بالكامل الآن):

| السيناريو | الدالّة | نقطة التحقّق الأساسية |
|---|---|---|
| Manual Journal Entry | create_manual_journal_entry | Debit=Credit مفروض · يبدأ draft/is_posted=false · رفض غير المتوازن (UNBALANCED) · رفض الصفر · ACCOUNT_NOT_FOUND rollback · من يعتمده draft→posted؟ |
| Reverse Journal Entry | reverse_journal_entry | قيد عكسي لا حذف · reverses_entry_id · منع عكس-العكس (is_reversed) · توازن تلقائي |
| Cancel Sales Invoice | cancel_sales_invoice | عكس Revenue+VAT+COGS+Inventory+OpenItems atomic · VEHICLE_COUNT_MISMATCH · reversed_at/by · يحترم delivered · credit_note بترقيم ذرّي |
| Partner Settlement | create_partner_settlement | contra Dr AP/Cr AR متوازن · يشترط رصيدين متقابلين · FIFO allocations · أثر partner_balances |
| Open Item Allocation | create_allocation | Clearing لا Posting · over-allocation guard (document_remaining) · لا تجاوز المتبقّي |
| Monthly Depreciation | run_monthly_depreciation | Dr DEPRECIATION_EXPENSE/Cr ACCUMULATED_DEPRECIATION · idempotency asset_id+period · salvage floor · fully_depreciated |
| Fixed Asset Disposal | dispose_fixed_asset | متوازن في كل الحالات (ربح/خسارة/تعادل) · GAIN/LOSS ديناميكي · idempotency status=disposed |

> كل سيناريو يخضع لنفس معيار Pass/Fail (§9) ويُوثَّق بـ Evidence Query على staging.

---

## 11. Risks & Preconditions

- **[حاكم]** لا تنفيذ على قاعدة أدلّة التدقيق (القسم أعلى) دون استثناء rollback معتمد.
- بيئة معزولة قابلة لإعادة الضبط + snapshot قبل/بعد.
- ZATCA sandbox/mock فقط — لا production.
- بيانات TEST- فقط، لا بيانات عميل.
- **Expense Posting (#12):** Expected = Not Supported / Planned Capability — لا نكتب FAIL؛ Expenses حالياً Planned (Release 1.0 لا يزال Draft Scope). يصبح FAIL فقط بعد اعتماد النطاق واعتبار Expenses داخله.
- الأحداث المكتشفة في AUDIT-PE-001 / Phase 4-A دُقّقت بنيويّاً على مستوى تعريفات الدوال،
  لكنها لا تزال تحتاج Runtime validation وReport reconciliation وSecurity / Permission review
  والتحقّق من ZATCA linkage عند الحاجة.

---

*هذه الخطة أداة حكم متكرّرة. كل Module يجتاز Structural + Runtime + Report Reconciliation
قبل الاقتراب من Completed.*
