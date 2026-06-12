# معيار النظام المحاسبي: SAP Open Item Accounting (معتمد)

## المبدأ الجوهري
حالة المستند تعكس **تقدّم التصفية (Clearing)**، لا طريقة الدفع.
كل تخفيض على مستند = **نشاط تصفية (Clearing Activity)**، أياً كان نوعه:
PAYMENT / SETTLEMENT / CREDIT_NOTE / DEBIT_NOTE / REBATE / WRITE_OFF /
INSURANCE_SETTLEMENT / CONSIGNMENT_SETTLEMENT / INTERCOMPANY_SETTLEMENT

## الحقول المعتمدة (لكل مستند AR/AP)
- original_amount : القيمة الأصلية (= total)
- cleared_amount  : مجموع كل التخصيصات النشطة (أي نوع)
- open_amount     : original - cleared
- document_status : OPEN | PARTIALLY_CLEARED | CLEARED | CANCELLED

## قواعد الحالة
- cleared=0 و open=original  => OPEN
- cleared>0 و open>0         => PARTIALLY_CLEARED
- open=0                     => CLEARED
- المستند ملغى               => CANCELLED

## الحالات المهجورة (لا تُستخدم)
PARTIALLY_PAID, PAID, PARTIALLY_SETTLED, SETTLED, PARTIALLY_CLOSED, unpaid, partial, paid

## مصدر الحقيقة
cleared/open يُشتقّان ديناميكياً من open_item_allocations (status='active') — لا تُخزّن ثابتة.

## التطبيق (كل شيء بلا استثناء)
كل الشاشات والتقارير والكشوف والأعمار وأرصدة الأطراف تُقاد بـ:
open_amount و cleared_amount فقط. ممنوع: paid_amount أو (total - paid_amount).

## العرض الموحّد في الشاشات
الأصلي (Original) | المصفّى (Cleared) | المفتوح (Open) | الحالة (Status)