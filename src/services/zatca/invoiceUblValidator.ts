// ============================================================
// invoiceUblValidator.ts — S2.1
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
// S2.1 يدعم فقط:
//   invoice_category = 'tax_invoice'
//   (credit_note/debit_note → S2.2)
// ============================================================

import { XmlBuilderError, type InvoiceData } from "./xmlBuilder.types";

const SAUDI_VAT_REGEX = /^3\d{13}3$/;
const VALID_INVOICE_TYPES = ["standard", "simplified"] as const;
const VALID_INVOICE_CATEGORIES = ["tax_invoice", "credit_note", "debit_note"] as const;
const SUPPORTED_CATEGORIES_S2_1 = ["tax_invoice"] as const; // S2.1 يدعم tax_invoice فقط

/**
 * يتحقق من InvoiceData ويرفع XmlBuilderError عند أي خرق.
 * Side-effect-free: لا I/O، لا تعديل.
 */
export function validateInvoiceData(data: InvoiceData): void {
  const { invoice, lines, company, customer } = data;

  // ─── 1. Lines ─────────────────────────────────────────────
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new XmlBuilderError(
      "INVOICE_HAS_NO_LINES",
      `الفاتورة ${invoice.invoice_no} بلا بنود — لا يمكن بناء XML.`,
      { invoiceId: invoice.id, invoiceNo: invoice.invoice_no }
    );
  }

  // ─── 2. Company ───────────────────────────────────────────
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

  // ─── 3. Customer ──────────────────────────────────────────
  if (!customer.name || customer.name.trim().length === 0) {
    throw new XmlBuilderError(
      "CUSTOMER_NAME_MISSING",
      "اسم العميل غير محدّد — لا يمكن بناء XML.",
      { customerId: customer.id }
    );
  }

  // ─── 4. Invoice header ────────────────────────────────────
  if (!invoice.invoice_date) {
    throw new XmlBuilderError(
      "ISSUE_DATE_MISSING",
      `الفاتورة ${invoice.invoice_no} بلا تاريخ إصدار.`,
      { invoiceId: invoice.id }
    );
  }

  // ─── 5. ZATCA chain (ICV + PIH) ───────────────────────────
  if (invoice.icv == null || invoice.icv < 1) {
    throw new XmlBuilderError(
      "CHAIN_ICV_MISSING",
      `الفاتورة ${invoice.invoice_no} بلا ICV صحيح. يجب تسجيلها في zatca_document_chain أولاً.`,
      { invoiceId: invoice.id, icv: invoice.icv }
    );
  }

  if (!invoice.pih || invoice.pih.trim().length === 0) {
    throw new XmlBuilderError(
      "CHAIN_PIH_MISSING",
      `الفاتورة ${invoice.invoice_no} بلا PIH (Previous Invoice Hash). يجب تسجيلها في zatca_document_chain أولاً.`,
      { invoiceId: invoice.id }
    );
  }

  // ─── 6. Invoice type (DB profile: standard/simplified) ────
  if (!VALID_INVOICE_TYPES.includes(invoice.invoice_type as any)) {
    throw new XmlBuilderError(
      "INVOICE_TYPE_INVALID",
      `invoice_type غير صحيح: '${invoice.invoice_type}'. القيم المعتمدة: ${VALID_INVOICE_TYPES.join(", ")}.`,
      { invoiceId: invoice.id, invoiceType: invoice.invoice_type }
    );
  }

  // ─── 7. Invoice category (DB document type) ──────────────
  if (!VALID_INVOICE_CATEGORIES.includes(invoice.invoice_category as any)) {
    throw new XmlBuilderError(
      "INVOICE_CATEGORY_INVALID",
      `invoice_category غير صحيح: '${invoice.invoice_category}'. القيم المعتمدة: ${VALID_INVOICE_CATEGORIES.join(", ")}.`,
      { invoiceId: invoice.id, invoiceCategory: invoice.invoice_category }
    );
  }

  // S2.1 يدعم tax_invoice فقط — credit/debit notes في S2.2
  if (!SUPPORTED_CATEGORIES_S2_1.includes(invoice.invoice_category as any)) {
    throw new XmlBuilderError(
      "INVOICE_CATEGORY_UNSUPPORTED",
      `invoice_category '${invoice.invoice_category}' غير مدعوم في S2.1. الدعم في S2.2 المعتمد لاحقاً. حالياً يُدعم: ${SUPPORTED_CATEGORIES_S2_1.join(", ")}.`,
      { invoiceId: invoice.id, invoiceCategory: invoice.invoice_category }
    );
  }

  // ─── 8. Totals consistency ────────────────────────────────
  const sumLineTotals = lines.reduce((s, l) => s + Number(l.total ?? 0), 0);
  const invoiceTotal = Number(invoice.total ?? 0);
  const diff = Math.abs(sumLineTotals - invoiceTotal);

  if (diff > 0.01) {
    throw new XmlBuilderError(
      "TOTALS_MISMATCH",
      `عدم تطابق الإجماليات: مجموع بنود الفاتورة (${sumLineTotals.toFixed(2)}) لا يطابق إجمالي الفاتورة (${invoiceTotal.toFixed(2)}). الفرق: ${diff.toFixed(4)}`,
      {
        invoiceId: invoice.id,
        sumOfLines: sumLineTotals,
        invoiceTotal,
        diff,
      }
    );
  }
}