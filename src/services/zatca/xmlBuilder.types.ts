// ============================================================
// xmlBuilder.types.ts — S2.2 ZATCA XML Builder Service
// ============================================================
// عقد TypeScript يربط أربع طبقات XmlBuilder:
//   DocumentDataLoader  — Registry/Dispatcher يختار Loader حسب نوع المستند
//   ├── invoiceDataLoader     — للـ tax_invoice (388)
//   └── creditNoteDataLoader  — للـ credit_note (381)  [S2.2]
//   Loader   — يجلب من DB ويبني InvoiceData (دون أي تحويل)
//   Validator — تحقق صارم قبل البناء (No Silent Assumptions)
//   Mapper   — يحوّل InvoiceData إلى UblInvoice (مفاهيم UBL تقنية)
//   Builder  — يحوّل UblInvoice إلى string XML نظيف
//
// قرار معماري (الميثاق - بند 2 DB Owns Rules):
//   - أنواع DB تطابق CHECK constraints الفعلية في الجداول
//   - الـ Mapper يحوّل من DB types إلى ZATCA UBL types
//   - لا migration للبيانات — Schema هو المرجع
//
// الفصل المعماري الحاسم:
//   ┌──────────────────────────┬───────────────────────────┐
//   │ Database (DB)            │ ZATCA UBL                 │
//   ├──────────────────────────┼───────────────────────────┤
//   │ invoice_type:            │ InvoiceTypeCode name attr:│
//   │   "standard"             │   "0100000" (B2B)         │
//   │   "simplified"           │   "0200000" (B2C)         │
//   │                          │                           │
//   │ invoice_category:        │ InvoiceTypeCode element:  │
//   │   "tax_invoice"          │   "388"                   │
//   │   "credit_note"  [S2.2]  │   "381"                   │
//   │   "debit_note"   [S2.3]  │   "383"                   │
//   └──────────────────────────┴───────────────────────────┘
//
// S2.2 إضافات:
//   - DocumentType (نوع المستند للـ Dispatcher: tax_invoice | credit_note)
//   - BillingReference (الفاتورة الأصلية للسند)
//   - InvoiceData.billingReference و InvoiceData.documentNote
//   - BuildWarning structured (code + message)
//   - أكواد خطأ جديدة لـ BR-KSA-17 و BR-KSA-56
// ============================================================

// ─────────────────────────────────────────────────────────────
// واجهة الاستخدام العامة (Public API)
// ─────────────────────────────────────────────────────────────

/**
 * نوع المستند الذي يبنيه XmlBuilder.
 * Dispatcher يختار Loader المناسب بناءً عليه.
 *
 * S2.1: tax_invoice فقط
 * S2.2: credit_note مُضاف
 * S2.3: debit_note (لاحقاً)
 */
export type DocumentType = "tax_invoice" | "credit_note";

export interface XmlBuildInput {
  /** نوع المستند (يحدد أي Loader يُستخدم) */
  documentType: DocumentType;
  /**
   * UUID المستند في جدوله الأصلي:
   *   - tax_invoice → invoices.id
   *   - credit_note → credit_notes.id
   */
  documentId: string;
}

/**
 * ناتج البناء الكامل: artifact مركّب، الـ xml أحد مكوّناته.
 * UblInvoice هو الأصل (Invoice → mapInvoiceToUbl → UblInvoice) الذي يُبنى منه
 * كلٌّ من xml و QR وأي مستهلك مستقبلي — لا يُعاد اشتقاقه من الـ xml (SSOT).
 *   xml      → XadesSigner
 *   ubl      → QrAssembler (Tags 1–5) وأي مستهلك يحتاج القيم المصدرية
 *   metadata → S5 / التدقيق
 *   warnings → الطبقة العليا
 */
export interface XmlBuildOutput {
  /** UBL 2.1 XML نهائي (UTF-8, unsigned). يُمرَّر لاحقاً لـ XadesSignerService */
  xml: string;

  /** الكائن المصدري المُحوَّل — SSOT لقيم الفاتورة (مصدر xml و QR). */
  ubl: UblInvoice;

  /** بيانات تشخيصية للتدقيق والاختبار */
  metadata: XmlBuildMetadata;

  /** تنبيهات غير قاتلة منظمة (code + message) */
  warnings: BuildWarning[];
}

/**
 * تنبيه منظم (No Silent Assumptions).
 * كل افتراض غير صريح يجب أن يُسجّل بكود واضح.
 */
export interface BuildWarning {
  code: string;
  message: string;
  context?: Record<string, any>;
}

export interface XmlBuildMetadata {
  documentType: DocumentType;
  invoiceNo: string;
  uuid: string;
  icv: number;
  // قيم DB الأصلية (للتدقيق)
  dbInvoiceType: DbInvoiceType;
  dbInvoiceCategory: DbInvoiceCategory;
  // قيم ZATCA المحوَّلة (تظهر في XML)
  zatcaTypeCode: ZatcaInvoiceTypeCode;
  zatcaTypeName: ZatcaInvoiceTypeName;
  lineCount: number;
  totalsValid: boolean;
  // S2.2: ميتاداتا للسندات
  hasBillingReference: boolean;
  reasonProvided: boolean;
  generatedAt: string; // ISO timestamp
}

// ─────────────────────────────────────────────────────────────
// مفاهيم DB (مطابقة 1:1 لـ CHECK constraints الفعلية)
// ─────────────────────────────────────────────────────────────

/**
 * قيمة في DB في حقل invoices.invoice_type.
 * مطابقة CHECK constraint: invoices_type_check
 *   CHECK (invoice_type IN ('standard', 'simplified'))
 *
 * المعنى: Profile (B2B = standard، B2C = simplified)
 */
export type DbInvoiceType = "standard" | "simplified";

/**
 * قيمة في DB في حقل invoices.invoice_category و credit_notes.invoice_category.
 * مطابقة CHECK constraint: invoices_category_check
 *   CHECK (invoice_category IN ('tax_invoice', 'credit_note', 'debit_note'))
 *
 * المعنى: نوع المستند (Document Type)
 * S2.2 يدعم "tax_invoice" + "credit_note". debit_note في S2.3.
 */
export type DbInvoiceCategory = "tax_invoice" | "credit_note" | "debit_note";

// ─────────────────────────────────────────────────────────────
// مفاهيم ZATCA UBL (مطابقة لـ ZATCA Phase 2 spec)
// ─────────────────────────────────────────────────────────────

/**
 * قيمة عنصر <cbc:InvoiceTypeCode> في UBL.
 * 388 = Tax Invoice, 381 = Credit Note, 383 = Debit Note
 */
export type ZatcaInvoiceTypeCode = "388" | "381" | "383";

/**
 * قيمة سمة name في <cbc:InvoiceTypeCode name="...">
 * 7 خانات حسب ZATCA Phase 2.
 *
 *   "0100000" — Standard B2B
 *   "0200000" — Simplified B2C
 */
export type ZatcaInvoiceTypeName = "0100000" | "0200000";

/** فئة الضريبة في UBL (UN/ECE 5305) */
export type TaxCategoryId = "S" | "Z" | "E" | "O";
// S = Standard Rate (15%)
// Z = Zero Rated
// E = Exempt
// O = Out of Scope

// ─────────────────────────────────────────────────────────────
// طبقة Loader: ما يقرأه من DB (شكل "خام" مطابق للجداول)
// ─────────────────────────────────────────────────────────────

export interface InvoiceData {
  invoice: InvoiceRow;
  lines: InvoiceLineRow[];
  company: CompanyRow;
  customer: ContactRow;
  // S2.2: حقول اختيارية للسندات (credit_note/debit_note)
  /** مرجع للفاتورة الأصلية — إلزامي للـ credit/debit notes (BR-KSA-56) */
  billingReference?: BillingReference;
  /** سبب إصدار السند (KSA-10) — إلزامي للـ credit/debit notes (BR-KSA-17) */
  documentNote?: string;
}

/**
 * مرجع الفاتورة الأصلية في سند الإشعار.
 * مطابق لـ cac:BillingReference/cac:InvoiceDocumentReference
 */
export interface BillingReference {
  /** رقم الفاتورة الأصلية (invoice_no) — إلزامي (BR-KSA-56) */
  invoiceId: string;
  /** UUID الفاتورة الأصلية (اختياري) */
  invoiceUuid?: string;
  /** تاريخ إصدار الفاتورة الأصلية (اختياري) */
  issueDate?: string;
}

/** صورة مبسّطة من جدول invoices — الحقول التي يحتاجها UBL */
export interface InvoiceRow {
  id: string;
  invoice_no: string;
  uuid: string;
  icv: number;
  pih: string;
  invoice_type: DbInvoiceType;
  invoice_category: DbInvoiceCategory;
  invoice_date: string;        // YYYY-MM-DD
  issue_timestamp: string;     // ISO with timezone
  supply_date: string | null;  // YYYY-MM-DD (إن null = invoice_date)
  subtotal: number;
  vat_amount: number;
  total: number;
  paid_amount: number;
  customer_id: string;
}

/** صورة مبسّطة من جدول invoice_lines */
export interface InvoiceLineRow {
  id: string;
  line_no: number;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  vat_pct: number;
  vat_amount: number;
  total: number;
  // معلومات وصفية اختيارية للسطر (تُدمج في description إن وُجدت)
  brand: string | null;
  model: string | null;
  year: number | null;
  trim: string | null;
}

/** صورة مبسّطة من جدول companies */
export interface CompanyRow {
  id: string;
  name: string;
  commercial_registration: string | null;
  vat_number: string;
  country: string;
  country_code: string | null;
  currency_code: string;
  street_address: string | null;
  building_number: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  additional_number: string | null;
}

/** صورة مبسّطة من جدول contacts */
export interface ContactRow {
  id: string;
  name: string;
  vat_number: string | null;
  cr_number: string | null;
  national_id: string | null;
  country: string | null;
  city: string | null;
  district: string | null;
  address: string | null;
  postal_code: string | null;
  building_no: string | null;
}

// ─────────────────────────────────────────────────────────────
// طبقة Mapper: شكل UBL داخلي (محايد عن XML)
// ─────────────────────────────────────────────────────────────

export interface UblInvoice {
  // Header
  profileId: "reporting:1.0";
  invoiceNo: string;
  uuid: string;
  issueDate: string;       // YYYY-MM-DD
  issueTime: string;       // HH:mm:ss
  /** قيمة <cbc:InvoiceTypeCode> (388/381/383) */
  zatcaTypeCode: ZatcaInvoiceTypeCode;
  /** قيمة سمة name="" (0100000/0200000) */
  zatcaTypeName: ZatcaInvoiceTypeName;
  documentCurrencyCode: string;  // عادةً SAR
  taxCurrencyCode: "SAR";        // ثابت بـ ZATCA

  // S2.2: سبب الإصدار (KSA-10) - يُكتب في <cbc:Note>
  documentNote?: string;

  // S2.2: مرجع للفاتورة الأصلية (للـ credit/debit notes)
  billingReference?: BillingReference;

  // Additional References (ICV / PIH / QR placeholder)
  icv: number;
  pih: string;             // base64 SHA-256

  // Parties
  seller: UblParty;
  buyer: UblParty;

  // Delivery
  deliveryDate: string;    // YYYY-MM-DD

  // Payment
  paymentMeansCode: "10" | "30";  // 10 = Cash (Credit/Debit Notes), 30 = Credit Transfer (Tax Invoice)
  /** ملاحظة على PaymentMeans — تُستخدم للسبب في credit/debit notes */
  paymentMeansInstructionNote?: string;

  // Lines (محسوبة من InvoiceLineRow)
  lines: UblLine[];

  // Totals (محسوبة من Invoice + Lines)
  totals: UblTotals;

  // Tax breakdown (تجميع per category)
  taxSummary: UblTaxSubtotal[];

  // الإجمالي الضريبي (يُكرَّر مرتين في XML)
  totalTaxAmount: number;
}

export interface UblParty {
  identifier: { schemeId: string; value: string } | null;
  streetName: string | null;
  buildingNumber: string | null;
  plotIdentification: string | null;
  citySubdivisionName: string | null;
  cityName: string | null;
  postalZone: string | null;
  countryCode: string;
  vatNumber: string | null;
  registrationName: string;
}

export interface UblLine {
  id: number;
  quantity: number;
  unitCode: "PCE";
  lineExtensionAmount: number;
  itemName: string;
  vatPct: number;
  vatAmount: number;
  roundingAmount: number;
  unitPrice: number;
  discount: number;
  taxCategoryId: TaxCategoryId;
}

export interface UblTotals {
  lineExtensionAmount: number;
  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  allowanceTotalAmount: number;
  payableAmount: number;
}

export interface UblTaxSubtotal {
  taxableAmount: number;
  taxAmount: number;
  taxCategoryId: TaxCategoryId;
  taxCategoryPercent: number;
}

// ─────────────────────────────────────────────────────────────
// أخطاء البناء (No Silent Assumptions)
// ─────────────────────────────────────────────────────────────

export type XmlBuildErrorCode =
  // طبقة Loader (مشترك)
  | "INVOICE_NOT_FOUND"
  | "COMPANY_NOT_CONFIGURED"
  | "CUSTOMER_NOT_FOUND"
  | "DB_ERROR"
  // S2.2 - طبقة Loader (credit_note)
  | "CREDIT_NOTE_NOT_FOUND"
  | "CREDIT_NOTE_HAS_NO_LINES"
  | "ORIGINAL_INVOICE_NOT_FOUND"
  // S2.2 - طبقة Dispatcher
  | "DOCUMENT_TYPE_UNSUPPORTED"
  // طبقة Validator
  | "INVOICE_HAS_NO_LINES"
  | "COMPANY_NAME_MISSING"
  | "COMPANY_VAT_MISSING"
  | "COMPANY_VAT_INVALID"
  | "CUSTOMER_NAME_MISSING"
  | "CHAIN_ICV_MISSING"
  | "CHAIN_PIH_MISSING"
  | "INVOICE_TYPE_INVALID"
  | "INVOICE_CATEGORY_INVALID"
  | "INVOICE_CATEGORY_UNSUPPORTED"
  | "TOTALS_MISMATCH"
  | "ISSUE_DATE_MISSING"
  // S2.2 - فحوصات Credit/Debit Note الإلزامية
  | "BILLING_REFERENCE_MISSING"           // BR-KSA-56
  | "BILLING_REFERENCE_ID_INVALID"        // BR-KSA-F-06-C22 (1-5000 char)
  | "REASON_MISSING"                      // BR-KSA-17
  | "REASON_TOO_LONG"                     // BR-KSA-F-06-C13 (1-1000 char)
  // طبقة Mapper/Builder
  | "MAPPING_FAILED"
  | "UNSUPPORTED_FEATURE";

export class XmlBuilderError extends Error {
  public readonly code: XmlBuildErrorCode;
  public readonly details?: Record<string, any>;

  constructor(code: XmlBuildErrorCode, message: string, details?: Record<string, any>) {
    super(message);
    this.name = "XmlBuilderError";
    this.code = code;
    this.details = details;

    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, XmlBuilderError);
    }
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

// ─────────────────────────────────────────────────────────────
// واجهة Loader موحّدة (Loader Registry Pattern)
// ─────────────────────────────────────────────────────────────

/**
 * عقد موحّد لكل DocumentLoader.
 * يسمح بإضافة Loaders جديدة (debitNoteDataLoader) بدون تعديل XmlBuilder.
 */
export interface DocumentLoader {
  load(documentId: string): Promise<InvoiceData>;
}
