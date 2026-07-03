# Sarat Automotive ERP — Security Remediation Plan

> **Status: Draft / Under Review**
> **Not Executed · No Remediation Performed** · 2026-07-02
>
> يخصّ هذا المستند ثلاثة ديونٍ أمنيّةٍ رسميّة: **DEBT-008 (Critical)** · **DEBT-009 (High)** · **DEBT-010 (High)**،
> من `docs/ERP_TECHNICAL_DEBT_REGISTER.md`. يخضع لـ `ERP_PRODUCT_CONSTITUTION.md` §6 (Governance).
>
> **هذه خطوة تصميمٍ وتوثيقٍ فقط.** لا يُنفَّذ أيّ REVOKE / GRANT / ALTER FUNCTION / ALTER DEFAULT
> PRIVILEGES / migration / DB change / code change بناءً على هذا المستند إلا بعد اكتمال Phase 0
> وموافقةٍ صريحةٍ منفصلةٍ لكلّ خطوة.

---

## ⛔ Governing Preconditions (شروط حاكمة)

قبل أيّ علاجٍ واسع، هذه القواعد **حاكمة** ولا تُتجاوَز:

- **Phase 0 is a governing precondition before broad remediation.** لا يُنفَّذ أيّ تغييرٍ في
  المستوى B (إعادة كتابة الدوالّ / company scope) قبل اكتمال جمع الأدلّة في Phase 0.
- **REVOKE anon/PUBLIC is containment, not final remediation.** إزالة صلاحيّة anon/PUBLIC تُغلق
  التعرّض الأخطر، لكنها **لا تكفي** — `authenticated` يبقى واسعاً، وبلا فحص دورٍ داخليٍّ أيّ مستخدمٍ
  مسجّلٍ قد يستدعي الدوالّ مباشرة.
- **Rollback must restore the exact previous EXECUTE privilege state from the captured Phase 0
  baseline** — لا استعادةٌ عامّةٌ بـ "GRANT يعيده"، لأن الحالة الراهنة تشمل PUBLIC / anon /
  authenticated / service_role، ولا نريد rollback عشوائيّاً يمنح للجميع.
- **Data-integrity guards ≠ Authorization controls.** `can_cancel` · `document_remaining` · قيود
  UNIQUE · تمرير `p_created_by` كلّها ضوابط سلامة بياناتٍ أو UX، **ليست** ضوابط تصريح.
- **UI guards ≠ Security boundary.** فحص `isAccounting` في الواجهة UX لا أمن — لا يمنع استدعاء الـ
  RPC مباشرةً عبر REST.

---

## Post-Phase-0 Findings — OQ-P0-1 / OQ-P0-2

Phase 0 evidence collected so far changes the interpretation of the remediation plan, but does **not** reduce the severity of DEBT-008 / DEBT-009 / DEBT-010.

### OQ-P0-1 — Tenant / Company Model

`get_current_company_id()` does not map `auth.uid()` to a user-specific company. It returns the active company with code `DEFAULT`.

No verified user → company mapping table was found in the current schema.

**Interpretation:** the system is effectively single-tenant today, even though the product architecture uses multi-company language.

**Impact on remediation:**

- Core security debts remain active and severe:
  - anon/PUBLIC EXECUTE exposure.
  - no `auth.uid()` null rejection.
  - no internal role authorization.
  - unsafe `search_path`.
  - caller-controlled `created_by` in `create_allocation`.
- Cross-company / tenant-isolation risk is currently latent, not the primary active exposure.
- Company scope remediation requires a real user → company mapping model and redesign of `get_current_company_id()`.
- Company scope must not be treated as a simple `WHERE company_id = get_current_company_id()` patch until the tenant model exists.

### OQ-P0-2 — run_monthly_depreciation Caller

No legitimate caller was found for `run_monthly_depreciation`:

- No frontend/service RPC call site.
- No Edge Function / backend caller.
- No SQL function caller except its own definition.
- No pg_cron job table available / no scheduled job found.
- No trigger caller.

**Interpretation:** `run_monthly_depreciation` is currently a DB-only exposed financial RPC. No legitimate scheduled/server-side caller was found.

**Impact on remediation option:**

- Option A — finance/admin RPC with company scope — depends partly on the future tenant/company model.
- Option B — scheduled/server-side controlled job — remains valid but requires building a scheduled path.
- Option C — service-role-only backend process with explicit audit trail — is the preferred Track 1 direction for now, because it removes client-callable exposure without waiting for full multi-tenant architecture.

This is a design preference, not an executed decision.

### Track Split

Based on OQ-P0-1 and OQ-P0-2, remediation is split into two tracks:

**Track 1 — Immediate Security Remediation**

Items independent of tenant model:

- REVOKE anon/PUBLIC as containment.
- `auth.uid()` null rejection.
- finance/admin role authorization.
- safe `search_path`.
- `create_allocation.created_by` derived from `auth.uid()`.
- audit trail normalization.
- `run_monthly_depreciation` moved away from general client-callable RPC exposure.

**Track 2 — Multi-Tenant Architecture Remediation**

Items dependent on a real tenant model:

- user → company mapping.
- branch mapping if required.
- redesign of `get_current_company_id()`.
- company / branch scope enforcement.
- cross-company clearing prevention.
- per-company depreciation filtering.
- multi-company authorization model.

Track 2 is an architectural requirement for future multi-company readiness. It is not a substitute for Track 1 security remediation.

---

## Affected Functions

الدوالّ الستّ (SECURITY DEFINER، owner postgres، EXECUTE مُتاح حاليّاً لـ PUBLIC/anon/authenticated/service_role):

`create_manual_journal_entry` · `reverse_journal_entry` · `cancel_sales_invoice` ·
`create_partner_settlement` · `create_allocation` · `run_monthly_depreciation`.

---

## 1. Phase 0 — Evidence Collection Before Remediation (شرط حاكم)

جمع الأدلّة **قبل** أيّ تنفيذٍ واسع. بلا هذه الأدلّة، لا يُنفَّذ company scope ولا depreciation filter (الأعلى خطراً).

- Confirm legitimate callers for each RPC (من call sites الفعليّة + سلوك التطبيق).
- Confirm user_roles model and finance/admin role values (القيم النصّيّة الفعليّة للأدوار الماليّة في `user_roles`).
- Confirm company_id presence and completeness in affected tables (journal_entries, invoices, purchase_invoices, fixed_assets, open_item_allocations).
- Confirm current authenticated users who legitimately need these operations.
- Confirm whether any scheduled/server-side process legitimately uses `run_monthly_depreciation`.
- Confirm whether service_role is used intentionally anywhere.
- **Capture current function signatures + current GRANT/ACL state (proacl) لكلّ دالّةٍ قبل أيّ تغيير**
  = baseline دقيقٌ يُبنى عليه الـ rollback (لا صياغةٌ عامّة).

---

## 2. Immediate Containment Plan (المستوى A — احتواءٌ سريع)

نطاقٌ محدودٌ عمداً: REVOKE فقط — لا company scope، لا إعادة كتابة دوالّ.

- **الإجراء:** REVOKE EXECUTE FROM PUBLIC, anon على الدوالّ الستّ.
- **Compatibility evidence:** كلّ call sites الحاليّة authenticated (supabase.auth) — لا استدعاء من anon.
  فالإزالة **لا تكسر تدفّقاً قائماً**.
- **Test after revoke (staging):** anon → كلّ دالّة → EXECUTE denied ✅ · authenticated مصرّح → يعمل كالسابق ✅.
- **Rollback:** استعادة الحالة **من baseline الملتقَط في Phase 0** (لا GRANT عامّة).
- **service_role — قرارٌ صريحٌ مطلوب:** *Should service_role keep EXECUTE on these RPCs, and under what
  backend-only conditions?* — service_role ليس مشكلةً مثل anon، لكنه قويٌّ جداً. يجب أن يبقى فقط
  لعمليّات backend/server-side مبرّرةٍ ومراقَبة، ويُحسَم في Phase 0 هل يُستعمَل عمداً.
- **قاعدة:** REVOKE anon/PUBLIC is containment, **not** final remediation — authenticated يبقى واسعاً (يُعالَج في المستوى B).

---

## 3. Full Remediation Plan (المستوى B — علاجٌ معماريٌّ كامل)

منفصلٌ عن الاحتواء (لا نخلط السريع بالكامل). يُنفَّذ بعد Phase 0:

- **auth.uid() null rejection:** في كلّ دالّةٍ (رفض المستدعي غير المُصادَق).
- **role checks:** دالّة مساعدة `has_finance_role(uid)` (SSOT) تُستدعى في الستّ؛ لا يُعتمَد على
  authenticated الواسع بلا فحص دور.
- **company/branch scope:** فرض أن المستند/الأصل/الطرف ضمن شركة المستخدم (بعد تأكيد completeness في Phase 0).
- **audit normalization:** created_by=auth.uid() في كلّ INSERT + governance_log للعمليّات الحسّاسة
  (settlement/reverse/depreciation ينقصها حاليّاً).
- **allocation created_by fix:** (القسم 5 المستقلّ).
- **search_path hardening (DEBT-009):** search_path آمنٌ صريحٌ عبر trusted schemas (مع pg_temp أخيراً
  عند الحاجة)؛ schema-qualification للكائنات المرجعيّة. لا تُثبَّت `public, pg_temp` كتصميمٍ نهائيٍّ الآن —
  تُراجَع القائمة قبل التنفيذ. يشمل أيّ دالّةٍ مساعدةٍ جديدة (has_finance_role).
- **test plan + rollback plan:** (القسمان 6، 7).

---

## 4. Special Decision: run_monthly_depreciation (مسارٌ خاصّ)

**run_monthly_depreciation requires a special architectural decision and may be better executed as a
controlled administrative/batch operation, not as a general client-callable RPC.** فهي عمليّةٌ دوريّةٌ
إداريّةٌ (batch على كلّ الأصول)، لا فعلٌ تفاعليٌّ لمستخدم.

خياراتٌ تُعرَض (لا تُقرَّر الآن، تُحسَم بعد Phase 0):
- **Option A:** restrict to finance/admin RPC with company scope (يبقى RPC مقيّداً + فلترة شركة).
- **Option B:** move to scheduled/server-side controlled job (خارج client — cron / edge function).
- **Option C:** service-role-only backend process with explicit audit trail.

---

## 5. Allocation Remediation (علاج DEBT-010 المستقلّ)

**create_allocation has its own remediation path because of caller-controlled created_by and
unauthenticated clearing.** ثغرتها فريدة (clearing يزوّر حالة الدفع بلا قيد GL + created_by مزوّر):

- Remove or ignore `p_created_by` from the caller.
- Derive created_by from `auth.uid()` internally.
- Enforce role authorization (has_finance_role).
- Enforce source/target document ownership and company consistency.
- Prevent cross-company clearing (المستندان لنفس الشركة).
- **Preserve the document_remaining guard** (سلامة البيانات تبقى — تكمّل ولا تُستبدَل).
- Add audit/governance log if appropriate.

**ملاحظة توافقيّة:** call sites الثلاثة (purchasePaymentsDb.ts:120, SalesInvoicesRegistry.tsx:127,
Invoices.tsx:148) تمرّر p_created_by=userId الصحيح — فالاشتقاق الداخليّ = نفس القيمة للمستخدم الشرعيّ
(خطرٌ منخفض). توقيع الدالّة يتغيّر (p_created_by يصير متجاهَلاً) لكن لا يكسر call sites (التمرير يصير بلا أثر).

---

## 6. Test Plan

يُبنى على `ERP_GOLDEN_TRANSACTION_TEST_PLAN.md` (§10-B) + سيناريوهات أمنيّة جديدة، على **staging معزول**:

- **Positive:** مستخدمٌ ماليٌّ مصرّحٌ ضمن شركته → كلّ دالّةٍ تعمل كالسابق.
- **Negative (الأهمّ):**
  - anon → كلّ دالّة → رفض EXECUTE.
  - authenticated بلا دورٍ ماليّ → UNAUTHORIZED.
  - مستخدمٌ من شركة أ → عمليّة على شركة ب → رفض (company scope).
  - allocation بـ p_created_by مزوّر → يُتجاهَل، يُشتقّ من auth.uid.
- **Regression:** can_cancel / document_remaining / UNIQUE / idempotency ما زالت تعمل (الطبقة الأمنيّة لم تكسر سلامة البيانات).

---

## 7. Rollback Plan

- **Rollback must restore the exact previous EXECUTE privilege state from the captured Phase 0 baseline**
  — لا "GRANT يعيده" العامّة. الصلاحيّات الحاليّة تشمل PUBLIC / anon / authenticated / service_role،
  ولا نريد rollback عشوائيّاً يمنح للجميع.
- **REVOKE (المستوى A):** يُعكَس باستعادة baseline بدقّة — أدنى خطر.
- **تعديل الدوالّ (المستوى B):** CREATE OR REPLACE + الاحتفاظ بالتعريفات الأصليّة (baseline) لاستعادةٍ فوريّة.
- **search_path:** `ALTER FUNCTION ... RESET search_path` يتراجع.
- **مبدأ:** كلّ خطوةٍ عكوسةٌ منفردةً · snapshot قبل كلّ دفعة · لا تغييرٌ بلا مسار تراجعٍ موثّقٍ من baseline.

---

## 8. Implementation Order

```
Phase 0 (شرط حاكم): جمع الأدلة + التقاط baseline (signatures + GRANT/ACL). لا تنفيذ واسع قبله.
المستوى A — Immediate Containment: REVOKE anon/PUBLIC (عكوس، يغلق الأخطر، لا يكسر شيئاً).
  ├─ اختبار بعد REVOKE.
  └─ قرار service_role الصريح.
المستوى B — Full Remediation (بعد Phase 0):
  1. search_path hardening (مستقل، لا يكسر تدفقاً) + has_finance_role.
  2. auth.uid null-reject + role check (الست).
  3. Allocation Remediation (DEBT-010 — created_by من auth.uid).
  4. company scope (بعد تأكيد company_id كامل — Phase 0).
  5. run_monthly_depreciation (قرار خاص A/B/C — بعد Phase 0).
  6. audit normalization (created_by/governance/reversed_by حيث نقص).
كل خطوة: staging → test → مراجعة → إذن منفصل → تنفيذ → تحقق.
```

**المنطق:** الاحتواء أوّلاً (عكوس، يغلق الأخطر)، ثمّ التقويات المستقلّة (search_path)، ثمّ الطبقات
الأعمق (تصريح/scope) بعد تدقيق البيانات. الأعلى خطراً (company scope / depreciation) آخراً، بعد إثبات
سلامة البيانات القائمة في Phase 0.

---

*هذا المستند خطة تصميمٍ فقط. الحكم الحالي: Security Remediation Plan = Draft / Under Review · No
remediation executed · Posting Engine = Under Audit / Partially Audited. لا يُرقّى إلى Approved/Executed
إلا بعد اكتمال Phase 0 وتنفيذٍ فعليٍّ على staging بموافقاتٍ منفصلةٍ ومراجعة النتائج.*
