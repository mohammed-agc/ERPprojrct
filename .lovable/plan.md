# مركز إدارة النظام (System Administration)

بناء قسم إداري موحّد متاح للمسؤولين فقط، يجمع كل أدوات الحوكمة والمستخدمين والإعدادات والبيانات الرئيسية والتدقيق وأدوات الـ UAT في واجهة واحدة بنمط ERP المؤسسي.

## 1. البنية والتنقل

مسار جذر جديد `/admin` محمي بـ `isAdmin` فقط (redirect إلى Dashboard إن لم يكن مسؤولاً). يُضاف في الشريط الجانبي قسم منفصل **"إدارة النظام"** بأيقونة `ShieldCheck`، يظهر فقط حين `isAdmin === true`.

```text
/admin                         → Admin Dashboard (KPIs)
/admin/users                   → المستخدمون
/admin/roles                   → الأدوار
/admin/permissions             → مصفوفة الصلاحيات
/admin/sessions                → الجلسات النشطة
/admin/login-history           → سجل تسجيل الدخول
/admin/audit                   → مركز التدقيق
/admin/settings/company        → بيانات الشركة
/admin/settings/branches       → الفروع
/admin/settings/warehouses     → المستودعات
/admin/settings/tax            → إعدادات الضريبة
/admin/settings/sequences      → تسلسل المستندات
/admin/settings/templates      → قوالب الطباعة
/admin/master-data             → مركز البيانات الرئيسية (روابط)
/admin/uat                     → أدوات UAT
```

## 2. لوحة المسؤول (KPIs)

بطاقات أعلى الصفحة:
- إجمالي المستخدمين / المستخدمون النشطون (آخر 30 يوم)
- الموافقات المعلّقة
- أوامر الشراء المفتوحة
- قيمة المخزون
- الذمم المدينة المستحقة
- الذمم الدائنة المستحقة

كل بطاقة قابلة للنقر تنقل إلى الوحدة المعنية. تُجمع القيم من الخدمات الحالية: `purchasingService`, `salesService`, `inventoryService`, `accountingService`, وعدد المستخدمين من `profiles`.

## 3. إدارة المستخدمين

تطوير `UsersAdmin.tsx` الحالي إلى صفحة موسّعة:
- جدول: الاسم • البريد • القسم • الأدوار • آخر دخول • الحالة
- إجراءات: تعيين قسم • إضافة/إزالة دور • إعادة تعيين كلمة مرور (عبر `supabase.auth.admin` في Edge Function) • تعطيل/تفعيل
- تبويبات فرعية: **الجلسات النشطة** و**سجل تسجيل الدخول** (يُقرأ من `auth.audit_log_entries` عبر Edge Function بصلاحية service_role).

## 4. الأدوار الافتراضية

توسيع enum `app_role` ليشمل القائمة المطلوبة:
`admin, general_manager, purchasing_officer, purchasing_manager, sales_officer, sales_manager, accountant, treasury_officer, inventory_officer, receiving_officer, inspection_officer, workshop_manager, spare_parts_manager, employee`.

صفحة `/admin/roles` تعرض الأدوار مع وصف عربي ومعدل المستخدمين لكل دور.

## 5. مصفوفة الصلاحيات

استخدام `usePermissionMatrix` الموجود مع توسيع البُعدين:
- **الأفعال السبعة:** View, Create, Edit, Approve, Delete, Print, Export.
- **الوحدات:** Purchasing, Sales, Inventory, Accounting, Treasury, Master Data, Admin.

شبكة قابلة للتحرير (Checkbox) مع زر حفظ موحّد. الحفظ يبقى في `permissions` provider الحالي (mock) مع إعداد البنية للهجرة لاحقاً إلى جدول `role_permissions`.

## 6. مركز التدقيق

تطوير `AuditCenter.tsx` ليقرأ من جدول جديد `audit_log` (user_id, action, module, document_type, document_id, document_code, payload jsonb, created_at) مع فلاتر: المستخدم • الوحدة • النوع • النطاق الزمني • بحث نصي. تصدير CSV.

## 7. إعدادات النظام

كل صفحة في `/admin/settings/*` تعرض نموذجاً قابلاً للحفظ مخزّن في localStorage envelope `sarat.admin.settings.v1` (نمط بقية الـ ERP) مع توحيد الواجهة:
- بيانات الشركة (الاسم، الرقم الضريبي، السجل، العنوان، الشعار، أرقام التواصل).
- الفروع، المستودعات: CRUD بسيط.
- الضريبة: نسبة افتراضية، طريقة احتساب، رقم تسجيل.
- تسلسل المستندات: لكل نوع (PR, PO, GRN, SI, ...) بادئة + رقم بداية + طول الرقم.
- قوالب الطباعة: اختيار شعار/ألوان/تذييل لكل مستند.

## 8. مركز البيانات الرئيسية

صفحة هبوط `/admin/master-data` تعرض شبكة بطاقات تنقل إلى الصفحات الموجودة: المنتجات، الشركات المصنعة، الموديلات، الفئات، الألوان، جهات الاتصال.

## 9. أدوات UAT

صفحة `/admin/uat` تجمع:
- زر "تهيئة بيئة الاختبار" (يستدعي `resetTransactional`).
- زر "زرع بيانات تجريبية" (يستدعي دوال seed الموجودة في كل service).
- لوحة "فحص سلامة البيانات" تشغّل تحقّقات: فواتير بلا قيود، حركات مخزون بلا VIN، تخصيصات يتيمة، ...

## 10. الأمان

- جميع مسارات `/admin/*` محمية بـ `RequireAdmin` wrapper يستخدم `useAuth().isAdmin`.
- إعادة تعيين كلمات المرور وقراءة سجلات auth تتم حصراً عبر Edge Function `admin-users` التي تتحقق من JWT + صلاحية admin قبل استخدام service_role.
- جدول `audit_log` بـ RLS: قراءة لـ admin/manager فقط، إدراج للجميع المصادَق عليهم.

## التفاصيل التقنية

**ملفات جديدة:**
- `src/pages/admin/AdminLayout.tsx` (RequireAdmin + sub-sidebar)
- `src/pages/admin/AdminDashboard.tsx`
- `src/pages/admin/Users.tsx` (يستبدل UsersAdmin)
- `src/pages/admin/Roles.tsx`
- `src/pages/admin/Sessions.tsx`
- `src/pages/admin/LoginHistory.tsx`
- `src/pages/admin/AuditLog.tsx`
- `src/pages/admin/settings/{Company,Branches,Warehouses,Tax,Sequences,Templates}.tsx`
- `src/pages/admin/MasterDataHub.tsx`
- `src/pages/admin/UatTools.tsx`
- `src/services/erp/adminSettings.ts` (localStorage envelope)
- `src/services/erp/auditLog.ts`
- `supabase/functions/admin-users/index.ts`

**ملفات معدّلة:**
- `src/App.tsx` (مسارات `/admin/*`)
- `src/components/layout/AppSidebar.tsx` (قسم إدارة النظام)
- `src/lib/erpPermissions.ts` (إضافة الأدوار)

**هجرات DB:**
1. توسيع `app_role` enum بالأدوار الجديدة.
2. إنشاء `public.audit_log` + RLS + GRANT.

## ما هو خارج النطاق
- تنفيذ منطق صلاحيات كامل في الـ backend لكل عملية (يظل في الطبقة الأمامية حالياً مع جاهزية للترحيل).
- واجهة تحرير قوالب الطباعة بالـ drag-and-drop (يُكتفى بالحقول الأساسية).
