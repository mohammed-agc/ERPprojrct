# تحليل الوضع الحالي للنظام + خطة التثبيت والتحسين التدريجي

## 1) ملخص المعمارية الحالية

**التقنيات:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Router + TanStack Query + Lovable Cloud (Supabase: Postgres + Auth + RLS).

**التوجيه (Routing):** `BrowserRouter` بمسار عام `/auth` ومسارات محمية داخل `AppLayout` (الذي يحرس الجلسة عبر `useAuth` ويُعيد التوجيه إلى `/auth`).

**هرمية المكونات:**
```
App → AuthProvider → AppLayout (Sidebar + Header + <Outlet/>)
                       ├─ Dashboard
                       ├─ Customers / Vehicles / SalesOrders → SalesOrderDetail
                       ├─ Invoices · Accounts · Journals
                       └─ UsersAdmin · ComingSoon (parts/workshop/inventory/reports)
```

**حالة التطبيق:** `AuthContext` يحمّل `profile + department + roles` مرة واحدة من DB ويُعرّضها للتطبيق. الصفحات تستخدم `useState/useEffect` + `supabase-js` مباشرة (لا توجد طبقة خدمات/Repos، ولا يُستعمل React Query رغم تركيبه).

**الأقسام والصلاحيات (Department isolation):**
- `departments` enum: `vehicles`, `spare_parts`, `workshop`, `accounting`, `inventory`.
- `profiles.department_id` يربط الموظف بقسم واحد.
- `user_roles` enum مستقل (`admin`/`manager`/`employee`).
- العزل في الباك-اند عبر RLS باستخدام `is_manager_or_admin()` و`user_department()` (Security Definer — صحيح).
- العزل في الفرونت عبر `canAccessDept(code)` في `AppSidebar` فقط (إخفاء الروابط).

**RTL:** `<html dir="rtl" lang="ar">`، خط Cairo، `pr-9` للأيقونات داخل البحث، `text-left` للأرقام، `dir="ltr"` على VIN/الجوال/البريد/الرقم الضريبي/كلمة المرور. الشريط الجانبي يستخدم `border-l` (يمين بصرياً في RTL).

**نموذج المحاسبة:** دليل حسابات سعودي + `journal_entries` و`journal_entry_lines` + Triggers (`validate_balanced_entry`, `prevent_posted_journal_edit`, `prevent_posted_line_edit`) — صحيح ومتين.

**سير أمر البيع الحالي:**
1. زر "أمر بيع جديد" → ينشئ صف مع **أول عميل في DB تلقائياً** و`department_code='vehicles'` ثابتاً.
2. صفحة التفاصيل تحمّل العميل والمركبات والبنود، تحسب الإجماليات في `useMemo`.
3. حفظ = **حذف كل البنود ثم إعادة إدراجها** + تحديث الرأس.
4. تأكيد → `status='confirmed'` (يغلق التحرير).
5. إصدار فاتورة → يولّد QR في المتصفح (TLV Base64) ويُنشئ `invoices`+`invoice_lines` ويحدّث الحالة إلى `invoiced`.

---

## 2) نقاط القوة

- معمارية DB سليمة: enums، RLS، Security Definer Functions، Triggers محاسبية صارمة.
- فصل واضح للأقسام على مستوى DB.
- UI كثيف على نمط ERP (`erp-table`, `erp-input`)، خطوط عربية صحيحة، RTL أصلي.
- توليد ZATCA QR موجود (Phase 1 TLV).
- محاسبة مزدوجة القيد محمية بشروط توازن.

---

## 3) نقاط الضعف والثغرات

### أ. سير أمر البيع (الأولوية القصوى)
1. **اختيار العميل قسري:** `create()` يأخذ أول عميل من DB دون اختيار — خطأ منطقي.
2. **القسم ثابت `vehicles`:** لا يحترم قسم المستخدم — يكسر العزل عند توسيع المبيعات لقطع الغيار.
3. **استراتيجية الحفظ "delete-then-insert"** للبنود تُفقد المعرّفات وتسبب رِكوض (race conditions) ومشاكل عند ربط المخزون لاحقاً. لا تستخدم `upsert`.
4. **منتقي المنتج (Product Selector):** `<Select>` shadcn — قائمة كاملة بلا بحث/keyboard-typeahead/lazy. لن يصلح لـ500+ مركبة أو لقطع غيار لاحقاً.
5. **`onPickVehicle` لا يمنع تكرار المركبة** في بنود متعددة (مركبة واحدة = VIN فريد، لا يجوز بيعها مرتين).
6. **بنود البيع لا تُغيّر حالة المركبة** عند التأكيد إلى `reserved`/`sold` (تبقى `available` فتظهر مكرراً في الـSelector لأوامر أخرى).
7. **لا يوجد Auto-save / تحذير عند الخروج** بتعديلات غير محفوظة.
8. **تأكيد يستدعي `save()` ثم `update(status)`** — عمليتان غير ذريّتين؛ قد يحدث تأكيد بدون حفظ ناجح.
9. **توليد QR في المتصفح** يستخدم بيانات شركة ثابتة في الكود. يجب نقله إلى Edge Function + جدول إعدادات المنشأة.
10. **إصدار الفاتورة لا يُنشئ قيد يومية** رغم وجود البنية المحاسبية — ثغرة جوهرية.

### ب. الصلاحيات والعزل
11. **`canAccessDept` في الواجهة لا يحرس المسارات** — مستخدم قسم المركبات يمكنه كتابة `/accounts` يدوياً (RLS يحميه من البيانات لكن UI سيُظهر صفحة فارغة بلا رسالة).
12. **`changeDept` في UsersAdmin يفشل بصمت في RLS** لأن `profiles` UPDATE policy تسمح فقط لـ`auth.uid()=id` (المستخدم نفسه). لا يوجد Admin override policy.
13. **لا توجد سياسات INSERT/UPDATE/DELETE لـ`user_roles`** — لا يمكن للمسؤول منح/سحب أدوار من الواجهة.

### ج. RTL وتناسق الواجهة
14. أيقونات الأكشن (`ArrowRight` في "رجوع"، `Plus`، `Eye`) تستخدم `ml-1` بدل `mr-1` — في RTL تأتي الأيقونة بعد النص بدل قبله.
15. ترتيب أعمدة الأرقام: استخدم `text-left` (جيد للأرقام)، لكن `font-mono` على `invoice_no`/`order_no` بدون `dir="ltr"` قد يكسر العرض لو بدأت بحروف لاتينية مختلطة.
16. الشريط الجانبي يستخدم `border-r-2` لمؤشر النشط — في RTL مع `border-l` للحاوية، الحدّ النشط يقع على اليسار البصري بدل اليمين.

### د. الأداء وتجربة المستخدم
17. كل الصفحات تستخدم `useEffect` خام بدلاً من React Query (مع أنه مُهيَّأ) — لا يوجد cache/invalidate موحّد، تحميل متكرر، لا realtime.
18. لا يوجد مؤشر تحميل (skeleton) في الجداول.
19. لا يوجد تأكيد قبل حذف بند أو إصدار فاتورة.
20. الـToasts بالإنجليزية أحياناً (رسائل Postgres الخام عبر `error.message`).
21. Dashboard يجلب كل صفوف `vehicles` و`sales_orders` (`head:false`) لحساب الإجماليات على الـclient — كلفة عند نمو البيانات. يجب استخدام `select` مع `sum` عبر RPC أو حقول مُجمعة.

### هـ. سير عمل مكسور
22. لا يوجد إلغاء (`cancelled`) لأمر بيع من الواجهة، رغم وجود الحالة في enum.
23. لا توجد إعادة فتح أمر مرحَّل (Re-open) — التأكيد قرار نهائي.
24. لا يوجد جدول `company_settings` (مطلوب لـZATCA).
25. لا توجد سياسة ترقيم تسلسلية للفواتير (الاعتماد على `Date.now()` يسبب احتمال تكرار وفجوات).

### و. ثغرات ERP منطقية
26. لا يوجد ربط بين الأقسام والمنتجات (المركبات مرتبطة فقط بـ`department_code='vehicles'` ضمناً).
27. لا يوجد جدول `payments`/`payment_terms` — الفاتورة تنتقل من `draft` إلى `paid` بلا آلية.
28. لا يوجد سجل تدقيق (`audit_log`) لتتبع من غيّر ماذا متى — مطلوب لـERP محاسبي.

---

## 4) الأولويات المقترحة (بدون إعادة بناء)

التركيز فقط على **تثبيت سير أمر البيع + العزل + RTL + الحفظ** كما طلبت:

### المرحلة A — تثبيت أمر البيع (الأكثر إلحاحاً)
- A1. اختيار العميل عند إنشاء أمر جديد عبر Dialog (بدلاً من أول عميل).
- A2. `department_code` يأخذ قيمته من قسم المستخدم (مع fallback للمدير).
- A3. استبدال "delete+insert" بـ **upsert** للبنود مع الاحتفاظ بـ `id`.
- A4. **Combobox** للمنتج (cmdk داخل shadcn) — بحث فوري، keyboard navigation، إخفاء المركبات المُختارة في بنود أخرى من نفس الأمر.
- A5. منع تكرار نفس المركبة داخل الأمر الواحد.
- A6. عملية ذرّية للتأكيد: حفظ → التحقق من ≥1 بند صالح → تأكيد.
- A7. تحذير عند الخروج بتغييرات غير محفوظة (`beforeunload` + React Router blocker).
- A8. عند التأكيد: تحديث حالة المركبات إلى `reserved`؛ عند الفوترة: `sold`.
- A9. زر "إلغاء الأمر" مع تأكيد، يُحرر المركبات.

### المرحلة B — العزل والصلاحيات
- B1. حارس مسارات `<RequireDept code="...">` يُغلّف الراوتات الحساسة ويعرض شاشة "غير مخوّل" بدل صفحة فارغة.
- B2. سياسات RLS إضافية للمسؤولين:
  - `admin updates any profile` على `profiles`.
  - `admin manages user_roles` (INSERT/UPDATE/DELETE) على `user_roles` مع `has_role(auth.uid(),'admin')`.
- B3. واجهة منح/سحب الأدوار في `UsersAdmin` (manager/employee) بعد إضافة السياسات.

### المرحلة C — تثبيت RTL والتناسق
- C1. استبدال `ml-1` بـ `me-1` (logical) أو `mr-1` للأيقونات داخل الأزرار.
- C2. الشريط الجانبي: `border-r-2` للنشط → استخدم `border-s-2` المنطقي.
- C3. توحيد `dir="ltr"` على كل الأرقام/الأكواد/IDs.
- C4. ترجمة رسائل أخطاء Supabase الشائعة (RLS, duplicate, FK) إلى عربية.

### المرحلة D — استقرار الحفظ والفواتير
- D1. جدول `company_settings` (single row) لاسم المنشأة/VAT/CR/العنوان لاستخدامه في QR والفاتورة المطبوعة.
- D2. Edge Function `zatca-generate-qr` ينقل توليد TLV من المتصفح إلى الخادم.
- D3. Sequence Postgres لترقيم `invoice_no` و`order_no` (بدل `Date.now`).
- D4. Edge Function `post-invoice-journal` ينشئ قيد يومية متوازن (مدين الذمم / دائن المبيعات + دائن VAT) عند ترحيل الفاتورة.
- D5. زر "ترحيل" في صفحة الفاتورة + عرض رقم القيد المُولَّد.

### المرحلة E — تحسينات هادئة (Polish)
- E1. اعتماد React Query في الصفحات الأكثر زيارة (SalesOrders, Vehicles, Invoices) — invalidate بعد كل mutation.
- E2. Skeletons في الجداول.
- E3. تأكيد قبل العمليات المدمّرة (حذف، إلغاء، ترحيل).

> الورشة، قطع الغيار، المخزون، CRM، التقارير المتقدمة — **مؤجَّلة** حتى يستقر ما سبق.

---

## ما لن يتغير
- مخطط DB الحالي (سنُضيف فقط، لا نحذف/نعيد تسمية).
- بنية الراوتات والـSidebar.
- نظام الأدوار والأقسام كما هو.
- مكتبات الـUI (shadcn) ونظام الألوان/الخطوط.
- منطق Triggers المحاسبية القائم.

---

## التسلسل المقترح للتنفيذ (دفعات صغيرة قابلة للمراجعة)

1. **Batch 1:** A1+A2+A3 — تثبيت إنشاء/حفظ أمر البيع.
2. **Batch 2:** A4+A5+A8 — Combobox + عدم تكرار + قفل المركبة.
3. **Batch 3:** A6+A7+A9 — التأكيد الذرّي، تحذير الخروج، الإلغاء.
4. **Batch 4:** B1+B2+B3 — حارس المسارات + سياسات الأدوار.
5. **Batch 5:** C1–C4 — تنقيح RTL والترجمات.
6. **Batch 6:** D1–D5 — إعدادات الشركة + Edge Functions + الترحيل التلقائي.
7. **Batch 7:** E — React Query + Skeletons + التأكيدات.

هل أبدأ بـ **Batch 1** (تثبيت إنشاء/حفظ أمر البيع: اختيار العميل، احترام قسم المستخدم، استبدال delete+insert بـ upsert)؟ أم تفضّل ترتيباً مختلفاً للدفعات؟
