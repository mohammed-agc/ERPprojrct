# Sarat Automotive ERP — Release Roadmap

> **يجيب: ماذا نبني ومتى؟** يخضع لـ ERP_PRODUCT_CONSTITUTION.md.
> حالة كلّ Module الآن → انظر ERP_AUDIT_REGISTER.md.
>
> آخر تحديث: 2026-07-02 · **نطاق Release 1.0 = Draft Scope** (لم يُجمَّد رسميّاً بعد)

---

## Release 1.0 — القلب (Draft Scope؛ عند اعتماده يمنع الإطلاق إن لم يكتمل)

Finance · General Ledger · Accounts Receivable · Accounts Payable ·
Purchasing · Sales · Inventory · Posting Engine · Document Flow ·
Approval Workflow · Reports · Fixed Assets (Minimum) · Expenses ·
Banking / Treasury · ZATCA.

> **ملاحظة اعتماد:** حتى يُعتمَد هذا النطاق رسميّاً، تبقى الوحدات غير المبنيّة
> **Planned** (لا Gap). بعد الاعتماد، أيّ وحدةٍ ضمن النطاق وغير مكتملة → Gap.

## Release 2.0 — عمليات السيارات (Deferred بقرار معماري)

Workshop · Spare Parts · Warranty · Insurance · Service Contracts ·
Vehicle Service History · Job Costing.

> مؤجّلة عمداً: تعتمد على القلب المحاسبيّ/المخزون/Posting (انظر قاعدة الاعتماد في الدستور §2).

## Release 3.0 — القدرة التنافسية (Future)

CRM · Budgeting · BI · Forecasting · Leasing · Financing · Fleet · Mobile Apps.

---

## مسار الاعتماد (Approval Path)

نطاق Release 1.0 حاليّاً **Draft Scope**. مرحلتان رسميّتان بترتيبٍ سببيّ:

1. **Release Scope Approval** — تجميد نطاق Release 1.0. بعده: أيّ وحدةٍ Planned ضمن
   النطاق وغير مكتملة تتحوّل إلى **Gap**.
2. **Release Approval** — بعد اجتياز كلّ وحدات النطاق لبوابات التدقيق الثماني (الدستور §5)،
   تُمنَح **Approved** وتُطلَق. لا وحدةَ Not Audited في القلب تُطلَق.
