# CredentialResolver — Contract Note

> **الحالة:** مُجمَّد (Frozen). **Design Record، لا ADR.**
> **سبب التصنيف:** يُجمّد عقد سلطة واحدة مشتقّاً من معمارية مثبتة سلفاً (One Authority، No Secrets in DB، Workflow-chooses-type). لا يغيّر نموذج المجال ولا حدود السلطات ولا يفرض Invariant معمارياً جديداً — فيُسجَّل كوثيقة عقد لا كـ ADR.
> **مرجع التنفيذ والاختبارات مباشرةً.**

---

## 1. Purpose — سؤال الـ Resolver الوحيد

> **"هل يوجد اعتماد صالح يمكن استخدامه الآن لهذه الثلاثية `(company, environment, credentialType)`؟"**

يحوّل **هوية اعتماد منطقية** إلى **مرجع اعتماد فعلي** (`credentialId` + بيانات تعريف آمنة). يقرأ `zatca_credentials` فقط. لا يجيب عن "لماذا لا يوجد؟" ولا عن "أيّ نوع أحتاج؟".

---

## 2. Invariant

> **For any `(companyId, environment, credentialType)`, there exists at most one active credential. Therefore credential resolution is deterministic but partial.**

تفرضه السكيمة عبر الفهرس الفريد الجزئي `uq_active_credential ... WHERE is_active=true`.
- **deterministic:** لا منطق اختيار — مرشّح واحد على الأكثر.
- **partial:** قد لا يجد شيئاً (نتيجة `NO_ACTIVE_CREDENTIAL` مشروعة، لا خرق للـ Invariant).

---

## 3. Contract

```
resolve(companyId, environment, credentialType) -> ResolvedCredential | throws
```

**Preconditions** (أخطاء استدعاء → استثناءات، لا نتائج):
- `companyId` صالح.
- `environment ∈ { sandbox, simulation, production }`.
- `credentialType ∈ { CCSID, PCSID }`.

---

## 4. Success Payload

```
ResolvedCredential = { credentialId, environment, credentialType, certificateFingerprint, expiresAt }
```
- `credentialId` = `zatca_credentials.id` (وهو أيضاً مفتاح Vault للتوقيع).
- **لا `status`:** نجاح `resolve` يضمن الصلاحية، فـ `status: active` لا يضيف معلومة.
- **لا `secret` / `binary_security_token`:** بيانات استعمال لاحق (مصادقة API)، لا بيانات حلّ.

---

## 5. Failure Semantics

- **`NO_ACTIVE_CREDENTIAL`** — لا اعتماد صالح للاستعمال. يشمل: لا صفّ / لا صفّ active / آخر اعتماد revoked / آخر اعتماد inactive / كلّها historical / لم يُنشأ أصلاً. كلّها تعني للمُستدعي الشيء نفسه: *"لا أستطيع حلّ اعتماد صالح."*
- **`CREDENTIAL_EXPIRED`** — يوجد صفّ active (الصفّ الذي كان `resolve` سيعيده) لكن `certificate_expiry_at <= now()`.

---

## 6. Non-Goals

- **لا يختار `credentialType`** — شأن Workflow (Composer/Submission يعرف غرض العملية).
- **لا يفكّ الأسرار ولا يتعامل مع مصادقة API** (`secret` / `binary_security_token` — شأن استعمال لاحق).
- **لا يفسّر سبب غياب الاعتماد** (تمييز REVOKED / INACTIVE — شأن دورة الحياة/الإدارة).
- **لا يتعامل مع دورة الحياة** (تدوير، إعداد، كنس الانتهاء).

---

## 7. Rationale

**لماذا `CREDENTIAL_EXPIRED` وحده يُميَّز:**

> الانتهاء هو البُعد الوحيد للصلاحية الذي يمكن أن يتغيّر بمرور الزمن دون أي عملية كتابة؛ لذلك لا يمكن الاعتماد على `is_active` وحده للحكم على صلاحية الاعتماد.

- **REVOKED / INACTIVE** تنتجان عن كتابة صريحة تضبط `is_active=false` ذرّياً معها (الخيار A) — فلا نافذة انجراف، و`is_active` يعكسهما؛ يثق بهما الـ Resolver عبر `is_active`.
- **EXPIRED** قد يصبح صحيحاً دون أي كتابة (بين لحظة الانتهاء وكنس دورة الحياة)، فيبقى **فحص الزمن `certificate_expiry_at > now()` جزءاً من مسؤولية الـ Resolver**.

**لماذا لا حالتا REVOKED / INACTIVE:**

> إنتاجهما يغيّر سؤال الـ Resolver من *"أين الاعتماد الصالح؟"* إلى *"ما حالة الاعتماد السابق؟"* — وهذا يستلزم **سياسة اختيار** على صفوف غير نشطة (قد تتعدّد). ذلك تشخيص، لا حلّ.

**مبدأ التصميم المتكرّر (قاد هذا القرار وقرارات S5.2 السابقة):**

> **إذا احتاجت سلطة إلى تغيير السؤال الذي تجيب عنه كي تضيف حالة جديدة، فهي بدأت تتجاوز حدود شأنها.**

أقصى هذا المبدأ من الـ Resolver: حالتَي REVOKED/INACTIVE، واختيار `credentialType`، وتشخيص دورة الحياة — كما أقصى Retry من `append`. القدرة التشخيصية **لا تُفقَد**، بل تُنقَل إلى سلطة **Lifecycle / Administration** (`explainCredentialState` / `listCredentials` / `auditCredentials`) — **محجوزة (مسمّاة) لا مبنيّة**، تُبنى حين تظهر حاجة مقاسة، تطبيقاً لمبدأ حوكمة التحسينات.
