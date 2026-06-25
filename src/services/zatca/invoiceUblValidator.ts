// ============================================================
// invoiceUblValidator.ts — S2.2
// ============================================================
// التحقق الصارم من InvoiceData قبل تحويلها لـ UBL.
// يرفض البناء عند نقص أي حقل إلزامي.
//
// الضابط الأول من S2:
//   "لا نسمح ببناء XML ناقص"
//
// قيم DB المعتمدة (مطابقة CHECK constraints):
//   invoice_type ∈ ('standard', 'simplified')
//   invoice_category ∈ ('tax_invoice', 'credit_note', 'debit_note')
//
// S2.2 يدعم:
//   invoice_category ∈ ('tax_invoice', 'credit_note')
//   (debit_note → S2.3)
//
// فحوصات Credit Note الإضافية (ZATCA Schematron):
//   BR-KSA-56  → BillingReference إلزامي
//   BR-KSA-17  → سبب الإصدار (KSA-10) إلزامي
//   BR-KSA-F-06-C13 → السبب 1-1000 حرف
//   BR-KSA-F-06-C22 → BillingReference.invoiceId 1-5000 حرف
// ============================================================

import { XmlBuilderError, type InvoiceData } from "./xmlBuilder.types";

const SAUDI_VAT_REGEX = /^3\d{13}3$/;
const VALID_INVOICE_TYPES = ["standard", "simplified"] as const;
const VALID_INVOICE_CATEGORIES = ["tax_invoice", "credit_note", "debit_note"] as const;
const SUPPORTED_CATEGORIES = ["tax_invoice", "credit_note"] as const; // S2.2

// ZATCA BR-KSA حدود الطول
const REASON_MAX_LENGTH = 1000; // BR-KSA-F-06-C13
const BILLING_REF_ID_MAX_LENGTH = 5000; // BR-KSA-F-06-C22
const BILLING_REF_ID_MIN_LENGTH = 1;
const REASON_MIN_LENGTH = 1;

// الفئات التي تتطلب BillingReference + Reason (BR-KSA-17 + BR-KSA-56)
const CATEGORIES_REQUIRING_BILLING_REF = ["credit_note", "debit_note"] as const;

/**
 * يتحقق من InvoiceData ويرفع XmlBuilderError عند أي خرق.
 * Side-effect-free: لا I/O، لا تعديل.
 */
export function validateInvoiceData(data: InvoiceData): void {
  const { invoice, lines, company, customer } = data;
  const isNote = (CATEGORIES_REQUIRING_BILLING_REF as readonly string[]).includes(
    invoice.invoice_category
  );

  // ─── 1. Lines ───────────────────────────────────────────────
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new XmlBuilderError(
      "INVOICE_HAS_NO_LINES",
      `المستند ${invoice.invoice_no} بلا بنود — لا يمكن بناء XML.`,
      { documentId: invoice.id, documentNo: invoice.invoice_no }
    );
  }

  // ─── 2. Company ──────────────────────────────────────────────
  if (!company.name || company.name.trim().length === 0) {
    throw new XmlBuilderError(
      "COMPANY_NAME_MISSING",
      "اسم الشركة غير محدّد في الإعدادات. يرجى إكمال بيانات الشركة.",
      { companyId: company.id }
    );
  }

  if (!company.vat_number || company.vat_number.trim().length === 0) {
    throw new XmlBuilderError(
      "COMPANY_VAT_MISSING",
      "الرقم الضريبي للشركة غير محدّد. يرجى إكماله في إعدادات الشركة.",
      { companyId: company.id }
    );
  }

  if (!SAUDI_VAT_REGEX.test(company.vat_number)) {
    throw new XmlBuilderError(
      "COMPANY_VAT_INVALID",
      `الرقم الضريبي للشركة لا يطابق نمط ZATCA السعودي (15 رقم، يبدأ وينتهي بـ 3): ${company.vat_number}`,
      { companyId: company.id, vatNumber: company.vat_number }
    );
  }

  // ─── 3. Customer ─────────────────────────────────────────────
  if (!customer.name || customer.name.trim().length === 0) {
    throw new XmlBuilderError(
      "CUSTOMER_NAME_MISSING",
      "اسم العميل غير محدّد — لا يمكن بناء XML.",
      { customerId: customer.id }
    );
  }

  // ─── 4. Document header ──────────────────────────────────────
  if (!invoice.invoice_date) {
    throw new XmlBuilderError(
      "ISSUE_DATE_MISSING",
      `المستند ${invoice.invoice_no} بلا تاريخ إصدار.`,
      { documentId: invoice.id }
    );
  }

  // ─── 5. ZATCA chain (ICV + PIH) ─────────────────────────────
  if (invoice.icv == null || invoice.icv < 1) {
    throw new XmlBuilderError(
      "CHAIN_ICV_MISSING",
      `المستند ${invoice.invoice_no} بلا ICV صحيح. يجب تسجيله في zatca_document_chain أولاً.`,
      { documentId: invoice.id, icv: invoice.icv }
    );
  }

  if (!invoice.pih || invoice.pih.trim().length === 0) {
    throw new XmlBuilderError(
      "CHAIN_PIH_MISSING",
      `المستند ${invoice.invoice_no} بلا PIH (Previous Invoice Hash). يجب تسجيله في zatca_document_chain أولاً.`,
      { documentId: invoice.id }
    );
  }

  // ─── 6. Invoice type (DB profile: standard/simplified) ──────
  if (!VALID_INVOICE_TYPES.includes(invoice.invoice_type as any)) {
    throw new XmlBuilderError(
      "INVOICE_TYPE_INVALID",
      `invoice_type غير صحيح: '${invoice.invoice_type}'. القيم المعتمدة: ${VALID_INVOICE_TYPES.join(", ")}.`,
      { documentId: invoice.id, invoiceType: invoice.invoice_type }
    );
  }

  // ─── 7. Invoice category (DB document type) ─────────────────
  if (!VALID_INVOICE_CATEGORIES.includes(invoice.invoice_category as any)) {
    throw new XmlBuilderError(
      "INVOICE_CATEGORY_INVALID",
      `invoice_category غير صحيح: '${invoice.invoice_category}'. القيم المعتمدة: ${VALID_INVOICE_CATEGORIES.join(", ")}.`,
      { documentId: invoice.id, invoiceCategory: invoice.invoice_category }
    );
  }

  // S2.2 يدعم tax_invoice + credit_note — debit_note في S2.3
  if (!(SUPPORTED_CATEGORIES as readonly string[]).includes(invoice.invoice_category)) {
    throw new XmlBuilderError(
      "INVOICE_CATEGORY_UNSUPPORTED",
      `invoice_category '${invoice.invoice_category}' غير مدعوم في S2.2. حالياً يُدعم: ${SUPPORTED_CATEGORIES.join(", ")}. debit_note مخطط لـ S2.3.`,
      { documentId: invoice.id, invoiceCategory: invoice.invoice_category }
    );
  }

  // ─── 8. Totals consistency ──────────────────────────────────
  const sumLineTotals = lines.reduce((s, l) => s + Number(l.total ?? 0), 0);
  const documentTotal = Number(invoice.total ?? 0);
  const diff = Math.abs(sumLineTotals - documentTotal);

  if (diff > 0.01) {
    throw new XmlBuilderError(
      "TOTALS_MISMATCH",
      `عدم تطابق الإجماليات: مجموع بنود المستند (${sumLineTotals.toFixed(2)}) لا يطابق إجمالي المستند (${documentTotal.toFixed(2)}). الفرق: ${diff.toFixed(4)}`,
      {
        documentId: invoice.id,
        sumOfLines: sumLineTotals,
        documentTotal,
        diff,
      }
    );
  }

  // ─── 9. Credit/Debit Note: BR-KSA-56 (BillingReference) ─────
  // ─── 10. Credit/Debit Note: BR-KSA-17 (Reason / KSA-10) ─────
  if (isNote) {
    validateBillingReference(data);
    validateReason(data);
  }
}

// ─────────────────────────────────────────────────────────────
// فحوصات Credit/Debit Note المخصصة
// ─────────────────────────────────────────────────────────────

/**
 * BR-KSA-56: مرجع الفاتورة الأصلية إلزامي للـ credit/debit notes.
 * BR-KSA-F-06-C22: invoiceId يجب أن يكون 1-5000 حرف.
 */
function validateBillingReference(data: InvoiceData): void {
  const ref = data.billingReference;
  const docNo = data.invoice.invoice_no;

  if (!ref || !ref.invoiceId) {
    throw new XmlBuilderError(
      "BILLING_REFERENCE_MISSING",
      `مرجع الفاتورة الأصلية مفقود في السند ${docNo} — BR-KSA-56 يستوجب وجود مرجع لـ cac:BillingReference.`,
      { documentId: data.invoice.id, documentNo: docNo }
    );
  }

  const len = ref.invoiceId.trim().length;
  if (len < BILLING_REF_ID_MIN_LENGTH || len > BILLING_REF_ID_MAX_LENGTH) {
    throw new XmlBuilderError(
      "BILLING_REFERENCE_ID_INVALID",
      `طول مرجع الفاتورة الأصلية (${len}) خارج النطاق المسموح ${BILLING_REF_ID_MIN_LENGTH}-${BILLING_REF_ID_MAX_LENGTH} — BR-KSA-F-06-C22.`,
      {
        documentId: data.invoice.id,
        documentNo: docNo,
        invoiceIdLength: len,
        min: BILLING_REF_ID_MIN_LENGTH,
        max: BILLING_REF_ID_MAX_LENGTH,
      }
    );
  }
}

/**
 * BR-KSA-17: سبب الإصدار (KSA-10) إلزامي للـ credit/debit notes.
 * BR-KSA-F-06-C13: السبب يجب أن يكون 1-1000 حرف.
 */
function validateReason(data: InvoiceData): void {
  const reason = data.documentNote;
  const docNo = data.invoice.invoice_no;

  if (!reason || reason.trim().length === 0) {
    throw new XmlBuilderError(
      "REASON_MISSING",
      `سبب إصدار السند ${docNo} مفقود — BR-KSA-17 يستوجب وجود سبب (KSA-10).`,
      { documentId: data.invoice.id, documentNo: docNo }
    );
  }

  const len = reason.trim().length;
  if (len < REASON_MIN_LENGTH || len > REASON_MAX_LENGTH) {
    throw new XmlBuilderError(
      "REASON_TOO_LONG",
      `طول سبب الإصدار (${len}) خارج النطاق المسموح ${REASON_MIN_LENGTH}-${REASON_MAX_LENGTH} — BR-KSA-F-06-C13.`,
      {
        documentId: data.invoice.id,
        documentNo: docNo,
        reasonLength: len,
        min: REASON_MIN_LENGTH,
        max: REASON_MAX_LENGTH,
      }
    );
  }
}
