// ============================================================
// invoiceUblMapper.ts — S2.1
// ============================================================
// التحويل من InvoiceData (شكل DB) إلى UblInvoice (شكل UBL تقني).
// نقي: لا I/O، لا async، لا side-effects.
//
// خرائط التحويل الحاسمة (الميثاق - بند 2: DB → UBL، لا العكس):
//
//   DB invoice_type           →  ZATCA TypeName (name="" attribute)
//   ───────────────────         ─────────────────────────────────
//   "standard"     (B2B)      →  "0100000"
//   "simplified"   (B2C)      →  "0200000"
//
//   DB invoice_category       →  ZATCA TypeCode (element value)
//   ───────────────────         ─────────────────────────────────
//   "tax_invoice"             →  "388"
//   "credit_note"   [S2.2]    →  "381"
//   "debit_note"    [S2.2]    →  "383"
//
//   line.vat_pct = 15         →  taxCategoryId = "S" (standard rate)
//   line.vat_pct = 0          →  taxCategoryId = "Z" (zero rated)
// ============================================================

import {
  XmlBuilderError,
  type InvoiceData,
  type DbInvoiceType,
  type DbInvoiceCategory,
  type ZatcaInvoiceTypeCode,
  type ZatcaInvoiceTypeName,
  type TaxCategoryId,
  type UblInvoice,
  type UblLine,
  type UblParty,
  type UblTaxSubtotal,
  type UblTotals,
  type CompanyRow,
  type ContactRow,
  type InvoiceLineRow,
  type InvoiceRow,
} from "./xmlBuilder.types";

interface MapResult {
  ubl: UblInvoice;
  warnings: string[];
}

// ─────────────────────────────────────────────────────────────
// خرائط التحويل (DB → ZATCA UBL)
// ─────────────────────────────────────────────────────────────

/**
 * يحوّل invoice_type (DB) → ZATCA TypeName (name attribute).
 */
const TYPE_NAME_MAP: Record<DbInvoiceType, ZatcaInvoiceTypeName> = {
  standard: "0100000",
  simplified: "0200000",
};

/**
 * يحوّل invoice_category (DB) → ZATCA TypeCode (element value).
 */
const TYPE_CODE_MAP: Record<DbInvoiceCategory, ZatcaInvoiceTypeCode> = {
  tax_invoice: "388",
  credit_note: "381",
  debit_note: "383",
};

// ─────────────────────────────────────────────────────────────
// نقطة الدخول
// ─────────────────────────────────────────────────────────────

/**
 * يحوّل InvoiceData إلى UblInvoice.
 * نقي: نفس المدخل يُنتج نفس المخرج (deterministic).
 */
export function mapInvoiceToUbl(data: InvoiceData): MapResult {
  const warnings: string[] = [];
  const { invoice, lines, company, customer } = data;

  // 1) ZATCA codes (محسوبة من DB types)
  const zatcaTypeName = mapZatcaTypeName(invoice.invoice_type);
  const zatcaTypeCode = mapZatcaTypeCode(invoice.invoice_category);

  // 2) Parties
  const seller = mapSeller(company);
  const { party: buyer, warnings: buyerWarnings } = mapBuyer(customer, invoice.invoice_type);
  warnings.push(...buyerWarnings);

  // 3) Lines
  const ublLines = lines.map((l) => mapLine(l));

  // 4) Totals + Tax breakdown
  const totals = mapTotals(invoice, ublLines);
  const taxSummary = mapTaxSummary(ublLines);
  const totalTaxAmount = round2(taxSummary.reduce((s, t) => s + t.taxAmount, 0));

  // 5) Issue date/time
  const issueDate = invoice.invoice_date;
  const issueTime = extractTimeFromTimestamp(invoice.issue_timestamp);
  const deliveryDate = invoice.supply_date ?? invoice.invoice_date;

  const ubl: UblInvoice = {
    profileId: "reporting:1.0",
    invoiceNo: invoice.invoice_no,
    uuid: invoice.uuid,
    issueDate,
    issueTime,
    zatcaTypeCode,
    zatcaTypeName,
    documentCurrencyCode: company.currency_code || "SAR",
    taxCurrencyCode: "SAR",

    icv: invoice.icv,
    pih: invoice.pih,

    seller,
    buyer,

    deliveryDate,
    paymentMeansCode: "30",

    lines: ublLines,
    totals,
    taxSummary,
    totalTaxAmount,
  };

  return { ubl, warnings };
}

// ─────────────────────────────────────────────────────────────
// التحويلات الفرعية (مُصدَّرة للاختبار)
// ─────────────────────────────────────────────────────────────

/**
 * يُحوّل invoice_type (DB) إلى ZATCA TypeName (الـ 7 خانات).
 */
export function mapZatcaTypeName(dbType: DbInvoiceType): ZatcaInvoiceTypeName {
  const mapped = TYPE_NAME_MAP[dbType];
  if (!mapped) {
    throw new XmlBuilderError(
      "INVOICE_TYPE_INVALID",
      `قيمة invoice_type غير مدعومة في Mapper: '${dbType}'`,
      { dbType }
    );
  }
  return mapped;
}

/**
 * يُحوّل invoice_category (DB) إلى ZATCA TypeCode (388/381/383).
 */
export function mapZatcaTypeCode(dbCategory: DbInvoiceCategory): ZatcaInvoiceTypeCode {
  const mapped = TYPE_CODE_MAP[dbCategory];
  if (!mapped) {
    throw new XmlBuilderError(
      "INVOICE_CATEGORY_INVALID",
      `قيمة invoice_category غير مدعومة في Mapper: '${dbCategory}'`,
      { dbCategory }
    );
  }
  return mapped;
}

/**
 * يُحوّل نسبة VAT إلى TaxCategoryId (UN/ECE 5305).
 */
export function mapTaxCategoryId(vatPct: number): TaxCategoryId {
  if (vatPct === 15) return "S";   // Standard rate (السعودية)
  if (vatPct === 0) return "Z";    // Zero rated
  if (vatPct < 0) {
    throw new XmlBuilderError("MAPPING_FAILED", `نسبة VAT سالبة غير مدعومة: ${vatPct}`);
  }
  return "S";
}

function mapSeller(c: CompanyRow): UblParty {
  return {
    identifier: c.commercial_registration
      ? { schemeId: "CRN", value: c.commercial_registration }
      : null,

    streetName: c.street_address,
    buildingNumber: c.building_number,
    plotIdentification: c.additional_number,
    citySubdivisionName: c.district,
    cityName: c.city,
    postalZone: c.postal_code,
    countryCode: c.country_code || c.country || "SA",

    vatNumber: c.vat_number,
    registrationName: c.name,
  };
}

function mapBuyer(
  c: ContactRow,
  dbType: DbInvoiceType
): { party: UblParty; warnings: string[] } {
  const warnings: string[] = [];

  let identifier: UblParty["identifier"] = null;
  if (c.cr_number) {
    identifier = { schemeId: "CRN", value: c.cr_number };
  } else if (c.national_id) {
    identifier = { schemeId: "NAT", value: c.national_id };
  } else if (dbType === "standard" && !c.vat_number) {
    warnings.push(
      "Standard (B2B) Invoice بدون CRN ولا National ID للعميل — قد يُرفض من ZATCA إن لزم تعريف العميل."
    );
  }

  if (dbType === "standard" && !c.vat_number) {
    warnings.push(
      "Standard (B2B) Invoice بدون VAT للعميل — يُسمح لكن قد يُرفض إن كان B2B حقيقياً."
    );
  }

  const party: UblParty = {
    identifier,
    streetName: c.address,
    buildingNumber: c.building_no,
    plotIdentification: null,
    citySubdivisionName: c.district,
    cityName: c.city,
    postalZone: c.postal_code,
    countryCode: c.country || "SA",

    vatNumber: c.vat_number,
    registrationName: c.name,
  };

  return { party, warnings };
}

function mapLine(l: InvoiceLineRow): UblLine {
  const qty = Number(l.quantity ?? 1);
  const unitPrice = Number(l.unit_price ?? 0);
  const discount = Number(l.discount ?? 0);
  const vatPct = Number(l.vat_pct ?? 15);

  const lineExtension = round2(qty * unitPrice - discount);
  const vatAmount = round2(lineExtension * (vatPct / 100));
  const roundingAmount = round2(lineExtension + vatAmount);

  const extras = [l.brand, l.model, l.trim, l.year ? String(l.year) : null]
    .filter((x): x is string => !!x && x.length > 0);
  const itemName =
    extras.length > 0 && l.description?.trim()
      ? `${l.description.trim()} (${extras.join(" ")})`
      : l.description?.trim() || extras.join(" ") || "—";

  return {
    id: l.line_no,
    quantity: qty,
    unitCode: "PCE",
    lineExtensionAmount: lineExtension,
    itemName,
    vatPct,
    vatAmount,
    roundingAmount,
    unitPrice,
    discount,
    taxCategoryId: mapTaxCategoryId(vatPct),
  };
}

function mapTotals(invoice: InvoiceRow, lines: UblLine[]): UblTotals {
  const lineExtensionAmount = round2(lines.reduce((s, l) => s + l.lineExtensionAmount, 0));
  const allowanceTotalAmount = round2(lines.reduce((s, l) => s + l.discount, 0));
  const taxExclusiveAmount = lineExtensionAmount;
  const taxInclusiveAmount = round2(Number(invoice.total));
  const payableAmount = round2(Number(invoice.total) - Number(invoice.paid_amount ?? 0));

  return {
    lineExtensionAmount,
    taxExclusiveAmount,
    taxInclusiveAmount,
    allowanceTotalAmount,
    payableAmount,
  };
}

function mapTaxSummary(lines: UblLine[]): UblTaxSubtotal[] {
  const buckets = new Map<string, UblTaxSubtotal>();

  for (const l of lines) {
    const key = `${l.taxCategoryId}|${l.vatPct}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.taxableAmount = round2(existing.taxableAmount + l.lineExtensionAmount);
      existing.taxAmount = round2(existing.taxAmount + l.vatAmount);
    } else {
      buckets.set(key, {
        taxableAmount: l.lineExtensionAmount,
        taxAmount: l.vatAmount,
        taxCategoryId: l.taxCategoryId,
        taxCategoryPercent: l.vatPct,
      });
    }
  }

  return Array.from(buckets.values());
}

// ─────────────────────────────────────────────────────────────
// مساعدات
// ─────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function extractTimeFromTimestamp(ts: string | null | undefined): string {
  if (!ts) return "00:00:00";
  const match = ts.match(/T(\d{2}:\d{2}:\d{2})/);
  if (match) return match[1];
  try {
    const d = new Date(ts);
    return d.toISOString().slice(11, 19);
  } catch {
    return "00:00:00";
  }
}