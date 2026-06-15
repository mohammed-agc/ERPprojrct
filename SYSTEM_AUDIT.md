# تدقيق النظام الشامل — ERP أرض المبارك

> **الغرض:** توثيق كل ملاحظة/مشكلة/تعارض أثناء اختبار الشاشات شاشةً شاشة، تمهيداً لخطّة توحيد وتنقيح شاملة قبل النقل للإنتاج.
> **بدأ:** 14/06/2026
> **آخر commit عند البدء:** 9d9ffee

---

## مفتاح الأولويات
- 🔴 **حرج** — يكسر وظيفة أساسية أو يخل بسلامة البيانات
- 🟡 **متوسط** — تعارض/ازدواج/سلوك غير متوقّع لا يكسر فوراً
- 🟢 **تجميلي** — تحسين واجهة/تسمية/تجربة استخدام

---

## مشاكل معمارية مكتشفة سابقاً (قبل بدء التدقيق المنهجي)

| # | الوصف | الأولوية | الحالة |
|---|-------|----------|--------|
| A1 | `invoice_lines.vehicle_id = NULL` — يكسر سلسلة VIN، ربحية المركبة، تزامن qty_on_hand | 🔴 | مفتوح |
| A2 | `sales_order_lines` بلا snapshot (vin/brand/model NULL) — عكس جانب الشراء | 🔴 | مفتوح |
| A3 | ازدواج جداول الدفعات: `payments` (عملاء) / `purchase_payments` (موردون) — يُوحّد بـ partner_id | 🟡 | مفتوح |
| A4 | جداول مهجورة: `sales_invoices` (0)، `sales_payments` (0)، `_suppliers_backup`، `_suppliers_deprecated`، `supplier_to_contact_map` | 🟡 | مفتوح |
| A5 | حالات المركبة غير موحّدة (on_order/active/sold/delivered)، لا تحويل on_order→active | 🟡 | مفتوح |
| A6 | `inventory_movements` فارغ — لا audit trail لحركة المخزون | 🟡 | مفتوح |
| A7 | `audit_logs` فارغ — سجل تدقيق غير مُفعّل | 🟡 | مفتوح |

---

## تدقيق الشاشات (منهجي — شاشة بشاشة)

<!-- نموذج التسجيل:
### [القسم] الشاشة — المسار
- 🔴/🟡/🟢 [الوصف]
-->


### [الإدارة] مركز إدارة النظام — /admin
- 🟢 الصفحة تعمل بشكل ممتاز: 8 بطاقات KPI + روابط سريعة + سايدبار فرعي منظّم.
- 🔴 بطاقة "الذمم المدينة = ٠" خاطئة — البحر الأحمر عليه 20,075 مفتوحة (مثبتة في سيناريو 1). مصدر البطاقة لا يقرأ open_amount الصحيح.
- 🟡 بطاقة "قيمة المخزون = ٠" مشبوهة رغم وجود مركبات (مرتبط بـ qty_on_hand/cost).

### [ازدواج مسارات] المستخدمون والصلاحيات
- 🟡 المستخدمون مكرّر: `/users` (سايدبار رئيسي) و `/admin/users` (مركز الإدارة). **القرار: `/admin/users` هو الأساس** — يُحذف `/users` من السايدبار الرئيسي.
- 🟡 الصلاحيات مكرّر: `/permissions` (سايدبار رئيسي) و `/admin/permissions` (مركز الإدارة). يحتاج توحيد (الأرجح اعتماد /admin/permissions).
- 🟡 التدقيق مكرّر محتمل: `/admin/audit` و `/governance/audit`. يحتاج تأكيد إن كانا نفس الشيء.
- 🟡 المستودعات مكرّر محتمل: `/admin/settings/warehouses` و `/inventory/warehouses`. يحتاج تأكيد.


### [مقارنة المسارات من App.tsx — حاسمة]

| الزوج | السايدبار الرئيسي → المكوّن | مركز الإدارة → المكوّن | الحكم |
|------|------------------------------|--------------------------|-------|
| المستخدمون | `/users` → **UsersAdmin** | `/admin/users` → **AdminUsers** | 🟡 **مكوّنان مختلفان** — شاشتان منفصلتان لنفس الغرض |
| الصلاحيات | `/permissions` → **Permissions** | `/admin/permissions` → **Permissions** | 🔴 **نفس المكوّن تماماً** — ازدواج مسار صريح |
| التدقيق | `/governance/audit` → **AuditCenter** | `/admin/audit` → **AdminAuditLog** | 🟡 **مكوّنان مختلفان** — AuditCenter (حوكمة) vs AdminAuditLog (تقني) |
| المستودعات | `/inventory/warehouses` → **InventoryWarehouses** | `/admin/settings/warehouses` → **AdminSettingsWarehouses** | 🟡 **مكوّنان مختلفان** — تشغيلي vs إعداد |
| الهيكل/الفروع | `/organization` → **Organization** | `/admin/settings/branches` → **AdminSettingsBranches** | 🟡 **مكوّنان مختلفان** — يحتاج تأكيد الغرض |

**خلاصة:**
- ازدواج صريح واحد فقط (نفس المكوّن): **Permissions** على `/permissions` و `/admin/permissions`.
- البقية مكوّنات منفصلة (قد تكون متعمّدة: تشغيلي vs إداري، أو تكرار وظيفي يحتاج توحيد).
- القرار السابق: `/admin/users` أساس → يُحذف `/users` (UsersAdmin) من السايدبار الرئيسي + يُنظر بحذف المكوّن.

**ملاحظات أخرى من App.tsx:**
- 🟡 `/customers` → **Customers** ما زال موجوداً (يُفترض أن العملاء توحّدوا في contacts) — مرشّح للهجر.
- 🟡 `/erp-reports` → **ERPReports** غير مربوط بالسايدبار (شاشة يتيمة؟).
- 🟡 `/activity` → **ActivityFeed** غير مربوط بالسايدبار.
- 🟡 `/incentives` و `/purchasing/incentives` → مكوّنان مختلفان (IncentiveManagement vs SupplierIncentives) — تشابه مربك.
- 🟢 `ComingSoon` على: `/spare-parts`، `/workshop`، `/reports` (شاشات لم تُبنَ بعد).


### [الإدارة › الإعدادات] بيانات الشركة — /admin/settings/company
- 🔴 **التخزين في localStorage لا DB** — بيانات الشركة (تظهر في الفاتورة الضريبية، مستند قانوني) تُحفظ في متصفّح المستخدم فقط. تُفقد بمسح الكاش، لا تُشارك بين المستخدمين. يجب ترحيلها لـ DB (جدول system_settings أو company_profile). [يُعالج في خطّة التوحيد]
- 🟡 الحقول الأصلية ناقصة لمتطلّبات ZATCA: لا يوجد رقم مبنى، حي، مدينة، رمز بريدي، رقم إضافي (العنوان الوطني)، ولا تراخيص MOMRAH/MHRSD، ولا حقول مصرفية (IBAN). [يُضاف الآن]
- 🟡 القيم الافتراضية باسم "شركة سرات للسيارات" لا "أرض المبارك" — بقايا قالب. [تُحدّث]

### [الإدارة › الإعدادات] الفروع — /admin/settings/branches
- 🟢 الشاشة تعمل: عرض/إضافة/تعديل/حفظ الفروع. الحفظ ناجح.
- 🔴 نفس مشكلة localStorage (الفروع تُخزَّن محلياً لا DB). البيانات القديمة المخزّنة (الرياض/سرات) تتجاوز الافتراضيات الجديدة (جدة) — دليل عملي على المشكلة.
- ملاحظة: لا ازدواج مع /organization — هذه للفروع الجغرافية، تلك للأقسام الإدارية.

### [الإدارة] الهيكل التنظيمي — /organization
- 🟢 شاشة غنية: 4 تبويبات (الأقسام/الوحدات التشغيلية/الوظائف/التعيينات). تعرض 5 أقسام مع مديريها (مركبات، قطع غيار، ورشة، محاسبة، HR).
- 🟢 منفصلة وظيفياً عن /admin/settings/branches (لا ازدواج).
- ملاحظة: يبدو أنها تقرأ من DB (departments) — تحقّق لاحقاً من حفظ التعديلات.

### [الإدارة › الإعدادات] إعدادات الضريبة — /admin/settings/tax
- 🟢 الشاشة تعمل: نسبة VAT افتراضية، رقم تسجيل ضريبي، خيار شامل/غير شامل.
- 🟡 **ازدواج الرقم الضريبي**: يوجد في 3 أماكن — بيانات الشركة (vat_number) + إعدادات الضريبة (vat_registration_no) + DEFAULTS.tax. يجب توحيده لمصدر واحد (الأفضل: قراءته من بيانات الشركة فقط، أو حقل مشترك). خطر تضارب القيم.
- 🟡 نفس مشكلة localStorage.

---

## ⚠️ تصحيح مهم بخصوص localStorage (توضيح من المالك)

**localStorage في adminSettings مؤقّت ومقصود لأجل اختبار النظام فقط.** الخطّة الأصلية: ترحيله لـ DB قبل الإنتاج. لذا كل ملاحظات "🔴 localStorage" أعلاه ليست عيوباً، بل **حالة اختبار واعية**. يُعاد تصنيفها كبند تحضيري مخطّط:

- **[مخطّط] ترحيل كل الإعدادات (adminSettings) من localStorage إلى DB** قبل الإنتاج — يشمل: بيانات الشركة، الفروع، المستودعات، الضريبة، التسلسلات، القوالب، وإعدادات ZATCA القادمة.

## 🎯 توجّه المنتج: SaaS متعدد العملاء (Multi-tenant)

النظام مصمَّم ليكون **منتجاً قابلاً للبيع لعملاء متعددين**، كل عميل يُعدّه حسب بياناته. ينعكس هذا على:
- كل الإعدادات تُقرأ من DB معزولة لكل عميل (tenant/company_id) — لا قيم hardcoded.
- معالج إعداد أوّلي (onboarding) للعميل الجديد.
- تفعيل/تعطيل الوحدات حسب العميل (ورشة؟ ZATCA؟ تمويل؟).
- إعدادات ZATCA جزء من ملف تكوين العميل (enabled, phase, environment, business_type, EGS credentials).

## 📌 الاستراتيجية المعمارية (مؤكّدة من المالك)

- التخزين الحالي **مزيج مقصود**: بعض الإعدادات في localStorage (مؤقت للاختبار)، والكثير رُحّل لـ DB بالفعل.
- **خطّة الإنهاء**: في نهاية المشروع تُنظَّف قاعدة البيانات وتُجهَّز كقالب نظيف يُباع مع النظام للعميل الجديد.
- لذا: لا تُعتبر حالة التخزين الحالية عيباً. ملاحظات الازدواج والتوحيد تبقى صالحة (تخص جودة البنية لا مكان التخزين).
- مبدأ التصميم لكل ميزة جديدة: **قابلة للإعداد لكل عميل** + بنية حقول ثابتة تسهّل الترحيل لـ DB.

### [البنية التحتية] توثيق الـ Migrations
- 🟡 **فجوة توثيق migrations**: آخر migration محفوظ في supabase/migrations = 20260605 (5 يونيو)، لكن العمل امتدّ من 5→14 يونيو مع migrations شُغّلت يدوياً في Supabase (constraints الفواتير، إصلاح البيع المزدوج، Open Items، REBATE/INSURANCE، company/zatca settings). أُضيف يدوياً ملفّان (REBATE + company/zatca) لكن قد تكون migrations أقدم غير موثّقة.
- **[مخطّط للإنهاء]** تثبيت Supabase CLI + `supabase db pull` لالتقاط الحالة الكاملة لـ DB في migration شامل، يضمن إعادة بناء DB نظيفة لأي عميل SaaS جديد.
- ✅ كل migration جديد يُكتب idempotent (DROP IF EXISTS / ON CONFLICT DO NOTHING).

### [البنية التحتية] RLS على الجداول الجديدة
- 🟡 الجداول الجديدة في Supabase تأتي بـ RLS مفعّل تلقائياً بلا policy → كل وصول ممنوع حتى تُضاف policy. حدث مع `branches`. النمط الموحّد في المشروع: `CREATE POLICY auth_all_<table> FOR ALL TO authenticated USING(true) WITH CHECK(true)`.
- ✅ **إجراء**: كل migration جديد ينشئ جدولاً يجب أن يتضمّن policy الـ RLS مباشرةً (تفادياً لتكرار خطأ "تعذّر الحفظ").

## 🏗️ مشروع: محرّك الترقيم المركزي (Document Numbering Engine)

**المواصفة المعتمدة:** SAP-style centralized sequence engine، 10 مراحل، منهج Option B+ (بناء البنية النهائية → اختبار المالية الحرجة → تعميم).

**المشكلة المُعالَجة:**
- البادئات hardcoded في 6+ ملفات (sales.ts, purchasing.ts, inventory.ts, allocations.ts, incentives.ts...).
- شاشة Sequences (localStorage) منفصلة عن مولّدات الأرقام الفعلية → Settings ≠ Generator.

**البنية المستهدفة:**
- جدول `document_sequences` (company_id, branch_id, document_type, prefix, current_number, yearly_reset...).
- دالة `get_next_document_number()` atomic/concurrency-safe.
- `sequenceService` (load, generate, preview, reset, audit).
- جدول `document_sequence_logs` للتتبّع الكامل.
- تكامل أولي: SALES_INVOICE, PURCHASE_INVOICE, JOURNAL_ENTRY, CUSTOMER_RECEIPT, VENDOR_PAYMENT.
- دعم multi-company (إلزامي) + branch-level (تصميم الآن، تطبيق لاحقاً).

**الحالة:** قيد البناء — المرحلة 1 (الجدول).

## 🏛️ Company Foundation — Phase 1 (مُنفّذ)

**السبب:** النظام منتج SaaS-ready للسيارات. نحتاج company-awareness في كل المستندات المالية من الآن، ليكون الترحيل المستقبلي لـ multi-company/SaaS دون إعادة تصميم أو إعادة كتابة الخدمات.

**القرار المعماري:**
- جدول `companies` = الـ root master record. كل الكيانات المستقبلية تشير لـ company_id (فروع، مستودعات، تسلسلات، محاسبة، مخزون، مبيعات، مشتريات، ورشة، تأمين، ضمان، خزينة، أصول، HR).
- النظام يبقى single-company/single-tenant/single-DB الآن. مؤجّل صراحةً: tenant isolation, company switching, RLS-based multi-tenant security.
- الشركة الافتراضية: code='DEFAULT', name='شركة معرض الخليج العربي للسيارات', SA/SAR/active.

**التوافق المستقبلي (SaaS):**
- `companyContext.getCurrent()` يجلب الشركة ديناميكياً (code='DEFAULT' AND is_active). لا UUID مكتوب، لا افتراض company_id=1.
- مستقبلاً: تُعاد كتابة getCurrent() لتُرجع شركة المستخدم/المستأجر — دون تعديل الخدمات المستهلكة.

**RLS المؤقّتة:**
- policy `auth_all_companies` (authenticated, true/true) مطبّقة فقط لأن Supabase يمنع الوصول للجداول الجديدة بلا policy. موثّقة صراحةً "TO BE REPLACED during SaaS Phase". ليست أمان tenant.

**نتائج التحقّق:**
- ✅ جدول companies موجود + الشركة الافتراضية موجودة (id ديناميكي f40c7eff...).
- ✅ الاستعلام (code='DEFAULT' AND is_active) يُرجع صفاً واحداً.
- ✅ companyContext.ts مُضاف، النظام يعمل، لا تأثير على وحدات/تقارير/محاسبة قائمة.

**قاعدة جديدة (من الآن):** لا بيانات أعمال جديدة في localStorage. الإعدادات في DB. localStorage مسموح فقط لـ: theme, user preferences, grid layout, UI settings.

**الخطوة التالية:** المرحلة 2 (محرّك الترقيم) — تبدأ فقط بعد commit المرحلة 1.

---

# 📜 التوجيه الاستراتيجي الحاكم (ERP Development Directive)

> دستور المرحلة الحالية — معتمد. الانتقال من "تثبيت المحاسبة" إلى "توحيد المنصّة".

## القواعد العشر الحاكمة

**RULE 1 — لا وحدات كبرى جديدة قبل تنظيف الأساس.** ممنوع بدء: الورشة، التأمين، توسّع CRM، لوحات متقدّمة — حتى تُعالَج القضايا المعمارية الحرجة.

**RULE 2 — محرّك الترقيم = الأولوية #1.** إنجاز: document_sequences + logs + توليد atomic + ترقيم company-aware + تكامل شاشة الإعدادات. المستندات ذات الأولوية: فواتير البيع، فواتير الشراء، قيود اليومية، سندات القبض، سندات الصرف.

**RULE 3 — سلامة المركبة = الأولوية #2.** بعد محرّك الترقيم: إصلاح `invoice_lines.vehicle_id` (يؤثّر على تتبّع VIN، تزامن المخزون، ربحية المركبة، التتبّع المحاسبي). عيب معماري حرج — لا يُؤجّل.

**RULE 4 — توحيد حالات المركبة.** دورة حياة واحدة موثوقة: Ordered → Allocated → In Transit → At Port → Customs → Received → PDI → Available → Reserved → Sold → Delivered → Returned → Cancelled. لا منطق حالة مكرّر.

**RULE 5 — معمارية Business Partner.** التحوّل من (Customer/Supplier منفصلين) إلى Business Partner واحد بأدوار: Customer, Supplier, Employee, Insurance Company, Investor, Internal Entity. إلزامي قبل توسّع CRM/الورشة.

**RULE 6 — إزالة الدين التقني باستمرار.** تتبّع وحلّ: الجداول اليتيمة، المهجورة، هياكل الدفعات المكرّرة، المسارات المكرّرة، المكوّنات غير المستخدمة. كل تنظيف يُوثّق.

**RULE 7 — لا منطق أعمال جديد في localStorage.** الإعدادات في DB فقط. localStorage مسموح فقط: theme, preferences, layout.

**RULE 8 — كل وحدة جديدة company-aware.** كل جدول جديد يدعم: company_id, branch_id, created_by, created_at, updated_by, updated_at. التدقيق إلزامي.

**RULE 9 — التحقّق قبل التوسّع.** قبل الورشة، إكمال: تحقّق المحاسبة، تحقّق المركبة، تحقّق الترقيم، تحقّق Business Partner, تحقّق تنظيف DB.

**RULE 10 — تفكير المنتج.** هذا منتج ERP تجاري، لا نظام مخصّص. كل قرار يدعم: multi-company, multi-branch, الامتثال السعودي, صناعة السيارات, SaaS مستقبلاً. تجنّب الحلول التي تحلّ اليوم وتخلق ترحيل الغد.

## خارطة الطريق المعتمدة (بالترتيب)
1. ✅ محرّك الترقيم (جارٍ — المرحلة 1 companies مكتملة)
2. إصلاح سلامة المركبة المالية (vehicle_id)
3. توحيد دورة حياة المركبة
4. معمارية Business Partner
5. تنظيف DB والتحقّق
6. وحدة الورشة
7. وحدة التأمين
8. توسّع CRM
9. لوحات تنفيذية
10. تحضير SaaS
