// ============================================================
// documentDataLoader.ts — S2.2
// ============================================================
// Registry/Dispatcher Pattern لطبقة الـ Loaders.
//
// لماذا؟ XmlBuilder لا ينبغي أن يعرف من أين جاءت البيانات.
// يطلب فقط InvoiceData بنوع المستند، ويترك Dispatcher يختار Loader المناسب.
//
// الفائدة المعمارية:
//   ✅ Open/Closed: إضافة Debit Note (S2.3) = سطر واحد في Registry
//   ✅ XmlBuilder بريء: لا imports لجداول DB
//   ✅ اختبار مستقل: كل Loader يُختبر بمعزل
//
// نمط التوسع المستقبلي:
//   const LOADERS: Record<DocumentType, DocumentLoader> = {
//     tax_invoice: invoiceDataLoaderAdapter,
//     credit_note: creditNoteDataLoader,
//     debit_note: debitNoteDataLoader,  // ← يُضاف هنا فقط
//   };
// ============================================================

import {
  XmlBuilderError,
  type DocumentLoader,
  type DocumentType,
  type InvoiceData,
} from "./xmlBuilder.types";
import { loadInvoiceData } from "./invoiceDataLoader";
import { creditNoteDataLoader } from "./creditNoteDataLoader";

// ─────────────────────────────────────────────────────────────
// Adapter لـ invoiceDataLoader (يلتزم بواجهة DocumentLoader)
// ─────────────────────────────────────────────────────────────
// loadInvoiceData موجود كدالة من S2.1، نلفّه ليصبح DocumentLoader.
const invoiceLoaderAdapter: DocumentLoader = {
  load: loadInvoiceData,
};

// ─────────────────────────────────────────────────────────────
// السجل (Registry) — مفتاح التوسع
// ─────────────────────────────────────────────────────────────
const LOADERS: Record<DocumentType, DocumentLoader> = {
  tax_invoice: invoiceLoaderAdapter,
  credit_note: creditNoteDataLoader,
  // debit_note: debitNoteDataLoader,  // ← S2.3
};

// ─────────────────────────────────────────────────────────────
// نقطة الدخول الموحّدة
// ─────────────────────────────────────────────────────────────

/**
 * يجلب InvoiceData من المصدر الصحيح حسب نوع المستند.
 *
 * @param documentType نوع المستند (tax_invoice | credit_note)
 * @param documentId UUID المستند في جدوله الأصلي
 * @throws XmlBuilderError("DOCUMENT_TYPE_UNSUPPORTED") إن كان النوع غير معتمد
 * @throws XmlBuilderError(...) أي خطأ من Loader المُختار
 */
export async function loadDocumentData(
  documentType: DocumentType,
  documentId: string
): Promise<InvoiceData> {
  const loader = LOADERS[documentType];

  if (!loader) {
    throw new XmlBuilderError(
      "DOCUMENT_TYPE_UNSUPPORTED",
      `نوع المستند '${documentType}' غير معتمد في XmlBuilder. الأنواع المدعومة: ${Object.keys(LOADERS).join(", ")}`,
      { documentType, supportedTypes: Object.keys(LOADERS) }
    );
  }

  return loader.load(documentId);
}

/**
 * يُرجع قائمة الأنواع المدعومة (للاختبار والتوثيق).
 */
export function getSupportedDocumentTypes(): DocumentType[] {
  return Object.keys(LOADERS) as DocumentType[];
}
