# Sarat Automotive ERP — Product Constitution

> **دستور المنتج.** مرجعٌ حاكمٌ يخضع له كلّ قرار تطوير. يجيب: كيف نفكّر؟ كيف نقرّر؟
> ما الذي لا نسمح به؟ ما معنى الجودة؟ لا يشرح التفاصيل — تلك في الوثائق الأخرى.
> لا يتغيّر إلا بقرارٍ معماريٍّ كبير.
>
> آخر تحديث: 2026-07-02

---

## المبادئ الأسمى

1. **كلّ قرار يجعل النظام أسهل للمستخدم، وأصعب على الخطأ المحاسبيّ.**
   عند التعارض → **نختار صحّة المحاسبة**.
2. **لا نبحث عن الأسرع ولا الأعقد، بل عن الحلّ الذي يبقى صحيحاً بعد خمس سنوات.**

---

## 1. الهوية

ERP متخصّص لقطاع السيارات في السوق السعودي. **ليس** نسخة SAP/Odoo ولا ERP عامّاً.
المرجع التشغيليّ = شركة سيارات احترافية (لا SAP). نستلهم التنظيم، لا نقلّد.
كلّ قرار يبدأ بـ: «كيف تعمل هذه العملية في شركة سيارات احترافية؟»

الفلسفة: صارمٌ محاسبيّاً كـSAP · أبسط استخداماً منه · أوضح من Odoo · متخصّصٌ لا عامّ.

---

## 2. كيف نبني (Design Philosophy)

**نبني Business Capabilities، لا Features.** الترتيب — الكود آخِراً:
```
Business Process → Documents → Accounting Entries → Audit Trail → Reports → Security → UI → Code
```

**قاعدة الاعتماد (Dependency Rule):** Workshop / Spare Parts / Warranty / Insurance
تعتمد على: Accounting · Inventory · Posting Engine · Employees · Approvals · Document Flow.
لذلك هي **Deferred بقرارٍ معماريّ، لا Missing** — بناؤها قبل تثبيت ما تعتمد عليه = إعادة كتابة مزدوجة.

---

## 3. المبادئ الحاكمة (12)

Accounting First · Business Process First · SSOT · No Duplicate Business Logic ·
One Owner لكلّ Business Rule · Service Layer Only · Document Flow First ·
Every Financial Event → Journal Entry · Audit First · Review Before Build ·
Zero Magic · Simplicity for End Users.

---

## 4. كيف نقرّر (Decision Framework)

**محاور القرار الأربعة:** Business ✓ · Accounting ✓ · Architecture ✓ · UX ✓.
عند التعارض → رأيٌ معماريٌّ نهائيٌّ مبرَّر (بتغليب المبدأ الأسمى).

**قبل أيّ تطوير:** راجع Business Process · Accounting Impact · Document Flow ·
Reporting Impact · Audit Impact.

---

## 5. تصنيف الوحدات (Module Classification)

| التصنيف | المعنى |
|---|---|
| **Approved** | اجتاز التدقيق واعتُمِد رسميّاً (أعلى ختم؛ في جلسة Release Approval فقط). |
| **Completed** | اجتاز بوابات التدقيق الثماني بالأدلّة — بانتظار الاعتماد. |
| **Not Audited** | لم نُصدِر فيه حكماً بعد. لا ناقص ولا سليم — لم يُدقَّق. |
| **Planned** | ضمن نطاق إصدارٍ مخطّط، لم يُبنَ. (يصبح Gap بعد اعتماد نطاق إصداره.) |
| **Gap** | ضمن نطاقٍ **معتمَد**، مطلوبٌ وغير مكتمل — يمنع الإطلاق. |
| **Deferred** | مؤجّل بقرارٍ معماريٍّ لإصدارٍ لاحق — ليس نقصاً. |
| **Future** | خارج الخطة. |

**بوابات "Completed" الثماني (بالأدلّة):** Business · Accounting · Architecture ·
UI/UX · Security · Performance · Reports · Integration.

**مبدأ:** لا يُصنَّف Module إلا بعد تدقيقه. وجود الكود/الجداول ليس تدقيقاً.

---

## 6. الحوكمة (Governance)

- **لا حلّ مؤقّتٍ غير موثّق.** كلّ حلٍّ مؤقّتٍ يُسجَّل بـ: سببه · سبب تأجيل النهائيّ ·
  نطاقه · مخاطره · مالكه · خطّة استبداله. **لا يُغلَق إصدارٌ إنتاجيٌّ وفيه حلٌّ مؤقّتٌ منسيّ.**
- **Every Technical Debt Must Have an Owner** — يُسجَّل في Technical Debt Register.
  لا `TODO`/`Fix Later`/`Temporary` دون تسجيل.
- **كلّ استثناءٍ قرارٌ موثّق، لا صدفة.** استثناءٌ لا يُفسَّر بعد سنة = خطأ تصميم.
- **Every Important Decision Must Be Traceable** — لماذا/متى/بأيّ دليل/من وافق.
- **Product Naming Rule:** Governance documents must describe the *product*, not a
  specific customer deployment. Customer names, VAT numbers, CR numbers, ZATCA
  credentials, branches, and deployment-specific data belong in configuration,
  onboarding, or deployment documents — not in the product constitution.

---

## 7. ما لن نفعله أبداً

- لن نكرّر Business Logic.
- لن نضع Business Rules داخل Pages.
- لن نعتمد حلّاً مؤقّتاً غير موثّق.
- لن نكسر المبادئ المحاسبيّة من أجل سهولة البرمجة.
- لن نضيف Features لا تخدم دورة عمل شركة السيارات.
- لن نقلّد SAP حرفيّاً.
- لن نضحّي بسهولة الاستخدام من أجل إبهارٍ تقنيّ.
- لن نصدر حكماً على Module قبل تدقيقه.

---

## 8. تطوّر المنتج فكريّاً (نقاط تحوّل)

جداول → Business Capabilities · تبنّي SSOT · تبنّي Posting Engine ·
تبنّي Open Item · مراجعة الكود → مراجعة Business Process أوّلاً ·
تبنّي "Not Audited" · الفصل بين Completed و Approved ·
الدَّين التقنيّ: أثرٌ جانبيّ → قرارٌ واعٍ مُسجَّل بدليل.

---

## 9. دور الشريك المعماريّ

Claude شريكٌ معماريّ، لا مراجع كود. إذا رأى قراراً يقود لدَينٍ تقنيٍّ/محاسبيٍّ/إداريّ،
لا يوافق لمجرّد الطلب — بل يعترض ويناقش ويقدّم البديل، ولو طال النقاش.
الهدف: نظامٌ يعيش عشر سنواتٍ دون ندم.

---

## المرجعيّة

الكود يشرح **كيف** يعمل النظام. وثائق الحوكمة تشرح **لماذا** يعمل بهذه الطريقة.
**إذا تعارض الكود مع الدستور، فإمّا أن الكود يحتاج تصحيحاً، أو أن الدستور يحتاج
قراراً معماريّاً جديداً.** هذه الوثائق مرجع قرار، لا زينة.

الوثائق الشقيقة (تخضع لهذا الدستور):
`ERP_RELEASE_ROADMAP.md` (ماذا/متى) · `ERP_AUDIT_REGISTER.md` (الحالة الآن) ·
`ERP_TECHNICAL_DEBT_REGISTER.md` (الديون المعتمدة بدليل).
