// ============================================================
// xmlBuilder.types.ts — S2.1 ZATCA XML Builder Service
// ============================================================
// عقد TypeScript يربط ثلاث طبقات XmlBuilder:
//   Loader   — يجلب من DB ويبني InvoiceData (دون أي تحويل)
//   Mapper   — يحوّل InvoiceData إلى UblInvoice (مفاهيم UBL تقنية)
//   Builder  — يحوّل UblInvoice إلى string XML نظيف
//
// قرار معماري (الميثاق - بند 2 DB Owns Rules):
//   - أنواع DB تطابق CHECK constraints الفعلية في الجداول
//   - الـ Mapper يحوّل من DB types إلى ZATCA UBL types
//   - لا migration للبيانات — Schema هو المرجع
//
// الفصل المعماري الحاسم:
//   ┌────────────────────────────┬─────────────────────────────┐
//   │ Database (DB)              │ ZATCA UBL                   │
//   ├────────────────────────────┼─────────────────────────────┤
//   │ invoice_type:              │ InvoiceTypeCode name attr:  │
//   │   "standard"               │   "0100000" (B2B)           │
//   │   "simplified"             │   "0200000" (B2C)           │
//   │                            │                             │
//   │ invoice_category:          │ InvoiceTypeCode element:    │
//   │   "tax_invoice"            │   "388"                     │
//   │   "credit_note"  [S2.2]    │   "381"                     │
//   │   "debit_note"   [S2.2]    │   "383"                     │
//   └────────────────────────────┴─────────────────────────────┘
// ============================================================

// ─────────────────────────────────────────────────────────────
// واجهة الاستخدام العامة (Public API)
// ─────────────────────────────────────────────────────────────

export interface XmlBuildInput {
  /** UUID الفاتورة في جدول invoices */
  invoiceId: string;
}

export interface XmlBuildOutput {
  /** UBL 2.1 XML نهائي (UTF-8, unsigned). يُمرَّر لاحقاً لـ XadesSignerService */
  xml: string;

  /** بيانات تشخيصية للتدقيق والاختبار */
  metadata: XmlBuildMetadata;

  /** تنبيهات غير قاتلة (مثلاً: حقل اختياري ناقص) */
  warnings: string[];
}

export interface XmlBuildMetadata {
  invoiceNo: string;
  uuid: string;
  icv: number;
  // قيم DB الأصلية (للتدقيق)
  dbInvoiceType: DbInvoiceType;
  dbInvoiceCategory: DbInvoiceCategory;
  // قيم ZATCA المُحوَّلة (تظهر في XML)
  zatcaTypeCode: ZatcaInvoiceTypeCode;
  zatcaTypeName: ZatcaInvoiceTypeName;
  lineCount: number;
  totalsValid: boolean;
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
 * قيمة في DB في حقل invoices.invoice_category.
 * مطابقة CHECK constraint: invoices_category_check
 *   CHECK (invoice_category IN ('tax_invoice', 'credit_note', 'debit_note'))
 *
 * المعنى: نوع المستند (Document Type)
 * S2.1 يدعم "tax_invoice" فقط. credit_note/debit_note في S2.2.
 */
export type DbInvoiceCategory = "tax_invoice" | "credit_note" | "debit_note";

// ─────────────────────────────────────────────────────────────
// مفاهيم ZATCA UBL (مطابقة لـ ZATCA Phase 2 spec)
// ─────────────────────────────────────────────────────────────

/**
 * قيمة عنصر <cbc:InvoiceTypeCode> في UBL.
 * S2.1 يدعم 388 فقط. 381/383 في S2.2.
 */
export type ZatcaInvoiceTypeCode = "388" | "381" | "383";

/**
 * قيمة سمة name في <cbc:InvoiceTypeCode name="...">
 * 7 خانات حسب ZATCA Phase 2.
 *
 * S2.1 يدعم الصورة الأساسية:
 *   "0100000" — Standard B2B Tax Invoice
 *   "0200000" — Simplified B2C Tax Invoice
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
  address: string | null;       // ملاحظة: contacts يحوي حقلاً واحداً للعنوان
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

  // Additional References (ICV / PIH / QR placeholder)
  icv: number;
  pih: string;             // base64 SHA-256

  // Parties
  seller: UblParty;
  buyer: UblParty;

  // Delivery
  deliveryDate: string;    // YYYY-MM-DD

  // Payment
  paymentMeansCode: "30";  // Credit Transfer (افتراضي)

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
  // معرّف (اختياري للمشتري في Simplified)
  identifier: { schemeId: string; value: string } | null;

  // العنوان
  streetName: string | null;
  buildingNumber: string | null;
  plotIdentification: string | null;
  citySubdivisionName: string | null;
  cityName: string | null;
  postalZone: string | null;
  countryCode: string;       // SA

  // VAT
  vatNumber: string | null;  // إلزامي للبائع، اختياري للمشتري في Simplified

  // Legal name (RegistrationName)
  registrationName: string;
}

export interface UblLine {
  id: number;                    // line_no
  quantity: number;
  unitCode: "PCE";               // Piece (افتراضي للمركبات)
  lineExtensionAmount: number;   // (qty × unit_price) - discount
  itemName: string;              // description + brand/model
  vatPct: number;
  vatAmount: number;             // محسوب: lineExtension × vatPct/100
  roundingAmount: number;        // lineExtension + vatAmount
  unitPrice: number;
  discount: number;
  taxCategoryId: TaxCategoryId;
}

export interface UblTotals {
  lineExtensionAmount: number;    // مجموع line extensions = subtotal
  taxExclusiveAmount: number;     // subtotal
  taxInclusiveAmount: number;     // total
  allowanceTotalAmount: number;   // مجموع الخصومات
  payableAmount: number;          // total - paid_amount
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
  // طبقة Loader
  | "INVOICE_NOT_FOUND"
  | "COMPANY_NOT_CONFIGURED"
  | "CUSTOMER_NOT_FOUND"
  | "DB_ERROR"
  // طبقة Validator
  | "INVOICE_HAS_NO_LINES"
  | "COMPANY_NAME_MISSING"
  | "COMPANY_VAT_MISSING"
  | "COMPANY_VAT_INVALID"
  | "CUSTOMER_NAME_MISSING"
  | "CHAIN_ICV_MISSING"
  | "CHAIN_PIH_MISSING"
  | "INVOICE_TYPE_INVALID"          // invoice_type (DB) ليس standard/simplified
  | "INVOICE_CATEGORY_INVALID"      // invoice_category (DB) ليس من القيم المعتمدة
  | "INVOICE_CATEGORY_UNSUPPORTED"  // S2.1 لا يدعم credit_note/debit_note
  | "TOTALS_MISMATCH"
  | "ISSUE_DATE_MISSING"
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

    // الحفاظ على stack trace في V8
    if (typeof (Error as any).captureStackTrace === "function") {
      (Error as any).captureStackTrace(this, XmlBuilderError);
    }
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}