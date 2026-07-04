# Sarat Automotive ERP — Track 1 Security Design

> **Status: Draft / Under Review**
> **Not Executed · No Remediation Performed** · 2026-07-03
>
> يخصّ هذا المستند **Track 1 — Immediate Security Remediation** لثلاثة ديونٍ أمنيّةٍ رسميّة:
> **DEBT-008 (Critical)** · **DEBT-009 (High)** · **DEBT-010 (High)**. يُقرأ مع
> `ERP_SECURITY_REMEDIATION_PLAN.md` (قسم Post-Phase-0 Findings / Track Split).
>
> **هذه خطوة تصميمٍ وتوثيقٍ فقط — ليست تنفيذ remediation ولا privilege changes.** لا يُنفَّذ
> أيّ REVOKE / GRANT / ALTER FUNCTION / CREATE OR REPLACE / migration / DB change / code change
> بناءً على هذا المستند إلا بموافقةٍ صريحةٍ منفصلةٍ لكلّ خطوة، بعد اكتمال Pre-Execution Checklist.

---

## 1. Purpose

تحديد نموذج التصريح (authorization model) للدوالّ المالية الستّ الحسّاسة، بحيث يُغلَق التعرّض
غير المصرّح (anon/PUBLIC) وتُفرَض صلاحيّاتٌ داخليّةٌ صحيحة — دون انتظار بناء نموذج multi-tenant
(المؤجَّل إلى Track 2). المستند يحسم: **من يُسمح له بتنفيذ أيّ دالّة، وبأيّ مستوى تصريح.**

## 2. Evidence Basis

مبنيٌّ على أدلّة Phase 0 (قراءة فقط، AUDIT-PE-001):
- **Baseline #1:** الدوالّ الستّ SECURITY DEFINER · owner postgres · proconfig=null · EXECUTE لـ PUBLIC/anon/authenticated/service_role.
- **Baseline #2:** `user_roles(id, user_id, role text)` — 5 أدوار: admin · finance_manager · accountant · general_manager · purchasing_manager. لا company_id/branch_id.
- **OQ-P0-1:** النظام single-tenant فعليّاً (`get_current_company_id()` تُرجِع DEFAULT).
- **OQ-P0-2:** `run_monthly_depreciation` بلا caller شرعيّ (DB-only exposed).
- **OQ-P0-3:** service_role مستخدَمٌ عمداً في backend شرعيّ (`runtime/` + incentive Edge Functions) — لكن لا يستدعي الدوالّ الستّ.
- **OQ-P0-4:** authenticated users + role assignments review — البيئة الحاليّة تستعمل عمليّاً حساباً واحداً بنمط super-user (كلّ الأدوار الخمسة لمستخدمٍ واحد). Track 1 لا يُتوقَّع أن يكسر تدفّقاً ماليّاً شرعيّاً متعدّد المستخدمين في هذه البيئة. لكنها **ليست عيّنة كافية للاختبار السلبيّ** (انظر §14).
- **Phase 5 (Application-Layer):** كلّ call sites تستعمل anon client بلا service-layer role guard.

### OQ-P0-4 — Authenticated Users / Role Assignments

Phase 0 authenticated-user review found the current environment effectively uses a single super-user style account / role setup. Based on the currently observed users and role assignments, the Track 1 authorization model is not expected to break an existing legitimate multi-user finance workflow in this environment.

However, this does not remove the need for role-based security. It means the current environment is not a sufficient negative-test sample.

Before executing Track 1 remediation, create or provision at least one additional test user with a limited finance role, and one authenticated non-finance user if possible, to validate:
- authorized finance access;
- unauthorized authenticated rejection;
- action-level permission rejection;
- accountant cannot execute high-risk functions;
- finance_manager/admin can execute high-risk functions;
- general_manager oversight does not imply direct execution.

## 3. Scope

Track 1 يعالج، دون الاعتماد على نموذج tenant:
- REVOKE anon/PUBLIC (احتواء).
- auth.uid() null-rejection.
- authorization داخليّ (has_finance_role / has_finance_permission).
- create_allocation.created_by من auth.uid().
- search_path hardening.
- audit trail normalization.
- run_monthly_depreciation باتجاه Option C.

## 4. Non-goals / Track 2 Boundaries

**خارج نطاق Track 1** (مؤجَّل إلى Track 2 — Multi-Tenant Architecture):
- company/branch scope · tenant isolation · cross-company clearing prevention.
- per-company depreciation filtering.
- real user → company mapping · redesign of `get_current_company_id()`.
- multi-company authorization model.

Track 1 **لا يبني workflow اعتماد** (approval workflow) — يقيّد التنفيذ فقط. أيّ workflow
(accountant يطلب / finance_manager ينفّذ) بندٌ مستقبليٌّ منفصل.

## 5. Authorization Model

**Track 1 authorization model = Hybrid.**

- `has_finance_role(uid)` — بوّابةٌ ماليّةٌ عامّةٌ للعمليّات اليوميّة.
- `has_finance_permission(uid, action)` — تصريحٌ على مستوى الفعل للعمليّات عالية الخطورة.

**لا يُستخدَم `has_finance_role` وحده لكلّ الدوالّ** — فهو واسعٌ أكثر من اللازم؛ العمليّات عالية
الخطورة تتطلّب تصريحاً على مستوى الفعل (action-level). النموذج hybrid **من البداية**، لا
has_finance_role أوّلاً ثمّ تأجيل action-level (ذلك يترك فجوة صلاحيّاتٍ داخليّةٍ بعد إغلاق anon/PUBLIC).

### general_manager
`general_manager` = **oversight / approval role by default, not direct executor of high-risk
financial RPCs.** لا يدخل تلقائيّاً في تنفيذ: `reverse_journal_entry` · `cancel_sales_invoice` ·
`create_partner_settlement` · `run_monthly_depreciation`. صلاحيّته إشرافٌ واعتماد؛ التنفيذ الماليّ
المباشر يبقى عند `finance_manager` / `admin`. لو لزم لاحقاً تنفيذٌ استثنائيّ، يُمنَح permission صريح
أو دورٌ خاصّ — لا خلطٌ افتراضيٌّ مع finance_manager.

### cancel_sales_invoice
`cancel_sales_invoice` = **finance_manager / admin only.** لا يُعتمَد نموذج F5.1 الحاليّ الذي يسمح
ضمنيّاً لـ accountant عبر `isAccounting`. **UI guard is not a security boundary.** إلغاء الفاتورة
عمليّةٌ عالية الأثر (Revenue reversal + VAT reversal + COGS reversal + Inventory reversal +
Open-item reversal / credit note linkage). **accountant may prepare or request cancellation later,
but must not directly execute the cancel_sales_invoice RPC.**

## 6. Function-by-Function Permission Table

| Function | Allowed roles | Permission key | Level |
|---|---|---|---|
| create_manual_journal_entry | accountant, finance_manager, admin | finance.journal.create | finance role enough |
| create_allocation | accountant, finance_manager, admin | finance.allocation.create | finance role enough + created_by from auth.uid |
| reverse_journal_entry | finance_manager, admin | finance.journal.reverse | action-level permission required |
| cancel_sales_invoice | finance_manager, admin | finance.invoice.cancel | action-level permission required |
| create_partner_settlement | finance_manager, admin | finance.settlement.create | action-level permission required |
| run_monthly_depreciation | admin / finance_manager only if temporarily callable | finance.depreciation.run | action-level permission required if any user-triggered path remains |

`run_monthly_depreciation` preferred direction: **service-role-only backend process (Option C)** —
انظر §9.

## 7. service_role Per-Function Decision

**هذا تصميمٌ فقط، وليس تنفيذ privilege changes.**

- `run_monthly_depreciation` = **Keep / Defer for Option C** (backend الوحيد المخطَّط له).
- الدوالّ الخمس الأخرى = **Remove candidate unless a defined backend use case is discovered.**

الأساس: OQ-P0-3 أثبت أن service_role مستخدَمٌ في backend شرعيّ (`runtime/` + incentive) لكنه لا
يستدعي الدوالّ الستّ. فإبقاء أو إزالة EXECUTE لـ service_role على هذه الدوالّ **لا يكسر** backend
الحاليّ — والمبدأ least-privilege يرجّح الإزالة إلا حيث يوجد استخدامٌ backend مبرَّر.

## 8. has_finance_role / has_finance_permission Design

**تصميمٌ مفاهيميّ (لا تنفيذ):**
- `has_finance_role(uid)` — تُرجِع true إذا كان للمستخدم دورٌ ماليٌّ عامّ ضمن `{accountant,
  finance_manager, admin}`. تُستعمَل كبوّابةٍ في manual JE و allocation.
- `has_finance_permission(uid, action)` — تُرجِع true إذا كان المستخدم مصرّحاً للفعل المحدّد
  (reverse / cancel_invoice / settlement / depreciation). تُقيّد على `{finance_manager, admin}`
  للأفعال عالية الخطورة.
- كلتا الدالّتين يجب أن تكونا SECURITY DEFINER بـ search_path آمن، وتُقرآن من مصدر أدوار موثوق (user_roles).
- **For Track 1, `has_finance_permission` will use an internal action matrix (Option A).** The
  role_permissions-table approach (Option B) is deferred because the live database does not
  currently contain `public.role_permissions` (see §16, OQ-B1).
- كلّ دالّةٍ ماليّةٍ تبدأ بـ: `auth.uid() null-rejection` ثمّ فحص role/permission المناسب.

### 8.1 SQL Pattern Design — Conceptual Only

> **CONCEPTUAL PATTERN — NOT FOR EXECUTION.** كلّ ما يلي أمثلةٌ توضيحيّةٌ للبنية فقط — ليست
> migration، ليست نصّاً جاهزاً للتطبيق، ولا تُنفَّذ على قاعدة البيانات. الغرض توضيح **شكل** النمط
> قبل أيّ قرار تنفيذٍ منفصل.

**1. Unified Guard Block** (رأس كلّ دالّةٍ ماليّة):
```
-- CONCEPTUAL PATTERN — NOT FOR EXECUTION
--   v_uid uuid := auth.uid();
--   IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE='28000'; END IF;
--   -- authorization check (role أو permission حسب المستوى — انظر أدناه)
--   -- ثم منطق الأعمال الأصلي يبقى كما هو + data-integrity guards (can_cancel/document_remaining/UNIQUE).
```
الطبقة الأمنيّة تُضاف **فوق** المنطق الأصليّ، لا تستبدله.

**2. has_finance_role — Level 1** (بوّابة عامّة: accountant / finance_manager / admin):
```
-- CONCEPTUAL PATTERN — NOT FOR EXECUTION
-- CREATE FUNCTION has_finance_role(p_uid uuid) RETURNS boolean
--   LANGUAGE sql STABLE SECURITY DEFINER SET search_path = <trusted schemas> AS $$
--   SELECT EXISTS (SELECT 1 FROM public.user_roles
--     WHERE user_id = p_uid AND role IN ('accountant','finance_manager','admin'));
--   $$;
```

**3. has_finance_permission — Level 2** (Option A: hardcoded action matrix، fail-safe):
```
-- CONCEPTUAL PATTERN — NOT FOR EXECUTION
-- CREATE FUNCTION has_finance_permission(p_uid uuid, p_action text) RETURNS boolean
--   LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = <trusted> AS $$
-- DECLARE v_allowed text[];
-- BEGIN
--   v_allowed := CASE p_action
--     WHEN 'reverse'        THEN ARRAY['finance_manager','admin']
--     WHEN 'cancel_invoice' THEN ARRAY['finance_manager','admin']
--     WHEN 'settlement'     THEN ARRAY['finance_manager','admin']
--     WHEN 'depreciation'   THEN ARRAY['finance_manager','admin']
--     ELSE ARRAY[]::text[]   -- unknown action = reject (fail-safe)
--   END;
--   RETURN EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=p_uid AND role = ANY(v_allowed));
-- END; $$;
```

**4. Function mapping** (أيّ دالّةٍ تأخذ أيّ مستوى):
```
manual_journal_entry  → has_finance_role
create_allocation     → has_finance_role  (+ created_by := auth.uid)
reverse_journal_entry → has_finance_permission(v_uid,'reverse')
cancel_sales_invoice  → has_finance_permission(v_uid,'cancel_invoice')
partner_settlement    → has_finance_permission(v_uid,'settlement')  (+ created_by := auth.uid)
run_monthly_depreciation → Option C backend (§9)؛ أو has_finance_permission('depreciation') إن بقي مسار user مؤقتاً.
```

**5. create_allocation** (DEBT-010):
```
-- CONCEPTUAL PATTERN — NOT FOR EXECUTION
-- created_by يُشتقّ داخلياً: v_created_by := auth.uid();  (لا يُقبل p_created_by من المستدعي — يُتجاهَل/يُهمَل)
-- document_remaining guard يبقى (سلامة بيانات، تكمّل التصريح).
-- توافقية: call sites الثلاثة تمرّر userId الصحيح → الاشتقاق الداخلي = نفس القيمة للمستخدم الشرعي.
```

**6. search_path** (DEBT-009):
```
-- CONCEPTUAL PATTERN — NOT FOR EXECUTION
-- الدوال المساعدة (has_finance_role/has_finance_permission) + الست RPCs يجب أن تحمل search_path آمناً صريحاً.
-- ALTER FUNCTION <fn>(<args>) SET search_path = <trusted schema list>؛ القائمة تُراجَع قبل التنفيذ.
```

**7. role_permissions:** غير مستخدَمٍ في Track 1 لأن قاعدة البيانات الحيّة لا تحوي
`public.role_permissions` (OQ-B1، §16). النمط أعلاه (Option A، matrix داخل الدالّة) هو المعتمد.
جدول role_permissions تحسينٌ مستقبليٌّ اختياريٌّ فقط.

**fail-safe by default:** null uid → رفض · فعلٌ غير معروف → رفض · غياب الدور → رفض. الافتراض دائماً "امنع".

## 9. run_monthly_depreciation — Option C Design

الإهلاك عمليّةٌ دوريّةٌ إداريّةٌ (batch على كلّ الأصول)، لا فعلٌ تفاعليٌّ لمستخدم (OQ-P0-2: لا caller
شرعيّ). **Option C — service-role-only backend process with explicit audit trail** هو الاتّجاه
المفضّل لـ Track 1:
- يُنقَل الاستدعاء إلى backend خادميٍّ (بنية `runtime/` service-role موجودةٌ فعلاً — OQ-P0-3).
- تُزال قابليّة الاستدعاء من client (anon/authenticated/PUBLIC).
- يُضاف أثر تدقيقٍ صريح (من شغّل الإهلاك، متى).
- لا يحتاج نموذج tenant ولا pg_cron.

إن بقي مسارٌ استدعاءٍ من مستخدمٍ مؤقّتاً، فيتطلّب `finance.depreciation.run` (action-level) لـ
admin/finance_manager فقط.

## 10. create_allocation Design (DEBT-010)

- **created_by يُشتقّ من `auth.uid()` داخليّاً** — لا يُقبَل `p_created_by` من المستدعي (يُتجاهَل أو يُزال).
- auth.uid() null-rejection.
- authorization: `has_finance_role` (accountant+).
- **الحفاظ على حاجز `document_remaining`** (سلامة البيانات تبقى — تكمّل ولا تُستبدَل).
- ملاحظة توافقيّة: call sites الثلاثة (purchasePaymentsDb.ts:120, SalesInvoicesRegistry.tsx:127,
  Invoices.tsx:148) تمرّر userId الصحيح — فالاشتقاق الداخليّ = نفس القيمة للمستخدم الشرعيّ.

## 11. Audit Trail Normalization

توحيد أثر التدقيق حيث نقص (من Phase 5):
- settlement: القيد يفتقر created_by → يُضاف created_by = auth.uid().
- reverse: لا governance_log ولا reversed_by على الأصل → يُضافان.
- depreciation: القيد + fixed_asset_depreciation بلا created_by → يُضاف.
- المعيار: كلّ INSERT في journal_entries/allocations يحمل created_by = auth.uid()؛ كلّ عمليّةٍ
  حسّاسةٍ تكتب governance_log.

## 12. Tests

على **staging معزول** (الشرط الحاكم — لا على قاعدة أدلّة التدقيق):
- **Positive:** مستخدمٌ بالدور الصحيح لكلّ دالّة → تعمل كالسابق.
- **Negative:**
  - anon → كلّ دالّة → رفض EXECUTE.
  - authenticated بلا دورٍ ماليّ → UNAUTHORIZED.
  - accountant → reverse/cancel/settlement/depreciation → UNAUTHORIZED (action-level).
  - allocation بـ p_created_by مزوّر → يُتجاهَل، يُشتقّ من auth.uid.
- **Regression:** can_cancel / document_remaining / UNIQUE / idempotency ما زالت تعمل.

## 13. Rollback Notes

- الاستعادة من baseline الملتقَط في Phase 0 (Baseline #1): استرجاع **الحالة الدقيقة** لـ EXECUTE
  (لا "GRANT يعيده" العامّة).
- تعديلات الدوالّ: CREATE OR REPLACE مع الاحتفاظ بالتعريفات الأصليّة.
- search_path: `ALTER FUNCTION ... RESET search_path`.
- كلّ خطوةٍ عكوسةٌ منفردةً؛ snapshot قبل كلّ دفعة.

## 14. Pre-Execution Checklist

قبل أيّ تنفيذٍ فعليّ (لكلٍّ موافقةٌ صريحةٌ منفصلة):
- [x] authenticated users + role assignments review (OQ-P0-4 — منجَز: مستخدمٌ واحدٌ super-user، Track 1 لا يكسر تدفّقاً شرعيّاً في البيئة الحاليّة).
- [ ] **Pre-execution user test setup:** إنشاء أو تحديد مستخدمي اختبار لـ: accountant · finance_manager · admin · general_manager · authenticated non-finance user. الإعداد الحاليّ (super-user واحد) **غير كافٍ للاختبار السلبيّ للتصريح** (negative authorization testing).
- [ ] حسم آلية تخزين has_finance_permission (role_permissions الموجود أم جديد).
- [ ] تأكيد baseline EXECUTE محفوظٌ للـ rollback.
- [ ] بيئة staging معزولة جاهزة.
- [ ] تأكيد service_role per-function (Remove candidates عدا depreciation).
- [ ] خطة نقل depreciation إلى backend (Option C) جاهزة إن نُفِّذت.

## 15. Resolved Open Questions

- **OQ-T1-1:** نموذج hybrid (has_finance_role + has_finance_permission) — معتمد.
- **OQ-T1-2:** general_manager = oversight/approval، ليس منفّذاً مباشراً للعمليّات عالية الخطورة.
- **OQ-T1-3:** cancel_sales_invoice = finance_manager/admin only (UI guard ليس security boundary).
- **OQ-T1-5:** hybrid from the start.

## 16. Remaining Pre-Execution Questions

### OQ-B1 — role_permissions Suitability (Resolved)

Phase 0 / Pre-execution inspection found that `public.role_permissions` does not exist in the live database. `information_schema.columns` and `information_schema.table_constraints` returned no rows, and direct selection failed with `42P01: relation does not exist`.

Therefore, Track 1 will use **Option A** for `has_finance_permission`: an internal, fail-safe action matrix inside the helper function.

The `role_permissions` table approach remains a future optional improvement, but it is not a Track 1 prerequisite.

This also corrects an earlier migration-based assumption: historical migrations contain GRANT statements referencing some tables that are not present in the live database. Live database evidence takes precedence over migration assumptions. Historical migrations may contain GRANTs for non-existent legacy tables; this is noted as migration hygiene, not a current Track 1 security blocker.

### Remaining

- authenticated users review (من يملك أيّ دورٍ فعليّاً) — Phase 0 المتبقّي، لا يعيق التصميم.
- service_role per-function النهائيّ — معتمدٌ مبدئيّاً، يُراجَع قبل التنفيذ.

---

*هذا المستند تصميمٌ فقط. الحكم الحالي: Track 1 Security Design = Draft / Under Review · No
remediation executed · Posting Engine = Under Audit / Partially Audited. لا يُرقَّى إلى
Approved/Executed إلا بعد اكتمال Pre-Execution Checklist وتنفيذٍ فعليٍّ على staging بموافقاتٍ
منفصلةٍ ومراجعة النتائج.*
