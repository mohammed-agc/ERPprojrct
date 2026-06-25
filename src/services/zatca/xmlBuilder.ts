// ============================================================
// xmlBuilder.ts — S2.1 ZATCA XML Builder
// ============================================================
// الطبقة الأخيرة من السلسلة:
//   Loader → Validator → Mapper → Builder
//
// المسؤولية:
//   - استقبال UblInvoice (نموذج جاهز)
//   - بناء string UBL 2.1 XML بترتيب صحيح حسب ZATCA Phase 2
//
// الضابط الثالث من S2:
//   "عدم استخدام بيانات ZATCA المستقبلية الآن"
//   → لا ds:Signature، لا xades:SignedProperties
//   → فقط Unsigned UBL XML (الإطار جاهز للتوقيع في S3)
// ============================================================

import {
  type UblInvoice,
  type UblLine,
  type UblParty,
  type UblTaxSubtotal,
  type UblTotals,
  type XmlBuildInput,
  type XmlBuildOutput,
} from "./xmlBuilder.types";
import { loadInvoiceData } from "./invoiceDataLoader";
import { validateInvoiceData } from "./invoiceUblValidator";
import { mapInvoiceToUbl } from "./invoiceUblMapper";

// ─────────────────────────────────────────────────────────────
// نقطة الدخول العامة
// ─────────────────────────────────────────────────────────────

/**
 * يبني UBL 2.1 XML لفاتورة محدّدة بـ ID.
 *
 * السلسلة الكاملة:
 *   1. loadInvoiceData()      — قراءة DB
 *   2. validateInvoiceData()  — تحقق صارم
 *   3. mapInvoiceToUbl()      — تحويل لـ UBL domain
 *   4. buildXmlFromUbl()      — string XML
 *
 * @throws XmlBuilderError بأكواد واضحة
 */
export async function buildInvoiceXml(input: XmlBuildInput): Promise<XmlBuildOutput> {
  // 1) تحميل
  const data = await loadInvoiceData(input.invoiceId);

  // 2) تحقق
  validateInvoiceData(data);

  // 3) تحويل
  const { ubl, warnings } = mapInvoiceToUbl(data);

  // 4) بناء
  const xml = buildXmlFromUbl(ubl);

  // التحقق من التطابق النهائي
  const totalsValid =
    Math.abs(ubl.totals.taxInclusiveAmount - (ubl.totals.taxExclusiveAmount + ubl.totalTaxAmount)) 
    0.02;

  return {
    xml,
    warnings,
    metadata: {
      invoiceNo: ubl.invoiceNo,
      uuid: ubl.uuid,
      icv: ubl.icv,
      dbInvoiceType: data.invoice.invoice_type,
      dbInvoiceCategory: data.invoice.invoice_category,
      zatcaTypeCode: ubl.zatcaTypeCode,
      zatcaTypeName: ubl.zatcaTypeName,
      lineCount: ubl.lines.length,
      totalsValid,
      generatedAt: new Date().toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// String Builder (نقي، لا I/O، deterministic)
// ─────────────────────────────────────────────────────────────

/**
 * يبني string XML من UblInvoice.
 * النتيجة UBL 2.1 صالحة بالنسبة لـ ZATCA Phase 2 (دون توقيع).
 */
export function buildXmlFromUbl(ubl: UblInvoice): string {
  const parts: string[] = [];

  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"`);
  parts.push(`         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"`);
  parts.push(`         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"`);
  parts.push(`         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">`);

  // UBL Extensions (placeholder للتوقيع في S3)
  parts.push(`  <ext:UBLExtensions>`);
  parts.push(`    <!-- XAdES Signature placeholder - يُملأ في S3 XadesSigner -->`);
  parts.push(`  </ext:UBLExtensions>`);

  // Header (الترتيب إلزامي حسب ZATCA UBL Profile)
  parts.push(`  <cbc:ProfileID>${ubl.profileId}</cbc:ProfileID>`);
  parts.push(`  <cbc:ID>${escapeXml(ubl.invoiceNo)}</cbc:ID>`);
  parts.push(`  <cbc:UUID>${escapeXml(ubl.uuid)}</cbc:UUID>`);
  parts.push(`  <cbc:IssueDate>${ubl.issueDate}</cbc:IssueDate>`);
  parts.push(`  <cbc:IssueTime>${ubl.issueTime}</cbc:IssueTime>`);
  parts.push(
    `  <cbc:InvoiceTypeCode name="${ubl.zatcaTypeName}">${ubl.zatcaTypeCode}</cbc:InvoiceTypeCode>`
  );
  parts.push(`  <cbc:DocumentCurrencyCode>${ubl.documentCurrencyCode}</cbc:DocumentCurrencyCode>`);
  parts.push(`  <cbc:TaxCurrencyCode>${ubl.taxCurrencyCode}</cbc:TaxCurrencyCode>`);

  // Additional Document References
  parts.push(buildAdditionalRefs(ubl));

  // Signature placeholder (يُملأ في S3)
  parts.push(`  <cac:Signature>`);
  parts.push(`    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>`);
  parts.push(`    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>`);
  parts.push(`  </cac:Signature>`);

  // Seller
  parts.push(buildSupplierParty(ubl.seller));

  // Buyer
  parts.push(buildCustomerParty(ubl.buyer));

  // Delivery
  parts.push(`  <cac:Delivery>`);
  parts.push(`    <cbc:ActualDeliveryDate>${ubl.deliveryDate}</cbc:ActualDeliveryDate>`);
  parts.push(`  </cac:Delivery>`);

  // Payment Means
  parts.push(`  <cac:PaymentMeans>`);
  parts.push(`    <cbc:PaymentMeansCode>${ubl.paymentMeansCode}</cbc:PaymentMeansCode>`);
  parts.push(`  </cac:PaymentMeans>`);

  // Tax Total (مكرّر مرتين)
  parts.push(buildTaxTotals(ubl.totalTaxAmount, ubl.taxSummary));

  // Legal Monetary Total
  parts.push(buildLegalMonetaryTotal(ubl.totals));

  // Invoice Lines
  for (const line of ubl.lines) {
    parts.push(buildInvoiceLine(line));
  }

  parts.push(`</Invoice>`);

  return parts.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Section Builders
// ─────────────────────────────────────────────────────────────

function buildAdditionalRefs(ubl: UblInvoice): string {
  const lines: string[] = [];

  // ICV
  lines.push(`  <cac:AdditionalDocumentReference>`);
  lines.push(`    <cbc:ID>ICV</cbc:ID>`);
  lines.push(`    <cbc:UUID>${ubl.icv}</cbc:UUID>`);
  lines.push(`  </cac:AdditionalDocumentReference>`);

  // PIH
  lines.push(`  <cac:AdditionalDocumentReference>`);
  lines.push(`    <cbc:ID>PIH</cbc:ID>`);
  lines.push(`    <cac:Attachment>`);
  lines.push(
    `      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(ubl.pih)}</cbc:EmbeddedDocumentBinaryObject>`
  );
  lines.push(`    </cac:Attachment>`);
  lines.push(`  </cac:AdditionalDocumentReference>`);

  // QR placeholder
  lines.push(`  <cac:AdditionalDocumentReference>`);
  lines.push(`    <cbc:ID>QR</cbc:ID>`);
  lines.push(`    <cac:Attachment>`);
  lines.push(
    `      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"><!-- QR TLV base64 — يُملأ في S4 QrTlvService --></cbc:EmbeddedDocumentBinaryObject>`
  );
  lines.push(`    </cac:Attachment>`);
  lines.push(`  </cac:AdditionalDocumentReference>`);

  return lines.join("\n");
}

function buildSupplierParty(seller: UblParty): string {
  return buildParty("AccountingSupplierParty", seller);
}

function buildCustomerParty(buyer: UblParty): string {
  return buildParty("AccountingCustomerParty", buyer);
}

function buildParty(wrapperName: string, p: UblParty): string {
  const lines: string[] = [];
  lines.push(`  <cac:${wrapperName}>`);
  lines.push(`    <cac:Party>`);

  // Party Identification (اختياري)
  if (p.identifier) {
    lines.push(`      <cac:PartyIdentification>`);
    lines.push(
      `        <cbc:ID schemeID="${escapeXml(p.identifier.schemeId)}">${escapeXml(p.identifier.value)}</cbc:ID>`
    );
    lines.push(`      </cac:PartyIdentification>`);
  }

  // Postal Address
  lines.push(`      <cac:PostalAddress>`);
  if (p.streetName) {
    lines.push(`        <cbc:StreetName>${escapeXml(p.streetName)}</cbc:StreetName>`);
  }
  if (p.buildingNumber) {
    lines.push(`        <cbc:BuildingNumber>${escapeXml(p.buildingNumber)}</cbc:BuildingNumber>`);
  }
  if (p.plotIdentification) {
    lines.push(
      `        <cbc:PlotIdentification>${escapeXml(p.plotIdentification)}</cbc:PlotIdentification>`
    );
  }
  if (p.citySubdivisionName) {
    lines.push(
      `        <cbc:CitySubdivisionName>${escapeXml(p.citySubdivisionName)}</cbc:CitySubdivisionName>`
    );
  }
  if (p.cityName) {
    lines.push(`        <cbc:CityName>${escapeXml(p.cityName)}</cbc:CityName>`);
  }
  if (p.postalZone) {
    lines.push(`        <cbc:PostalZone>${escapeXml(p.postalZone)}</cbc:PostalZone>`);
  }
  lines.push(`        <cac:Country>`);
  lines.push(`          <cbc:IdentificationCode>${escapeXml(p.countryCode)}</cbc:IdentificationCode>`);
  lines.push(`        </cac:Country>`);
  lines.push(`      </cac:PostalAddress>`);

  // Party Tax Scheme (إن وُجد VAT)
  if (p.vatNumber) {
    lines.push(`      <cac:PartyTaxScheme>`);
    lines.push(`        <cbc:CompanyID>${escapeXml(p.vatNumber)}</cbc:CompanyID>`);
    lines.push(`        <cac:TaxScheme>`);
    lines.push(`          <cbc:ID>VAT</cbc:ID>`);
    lines.push(`        </cac:TaxScheme>`);
    lines.push(`      </cac:PartyTaxScheme>`);
  }

  // Party Legal Entity (الاسم القانوني)
  lines.push(`      <cac:PartyLegalEntity>`);
  lines.push(`        <cbc:RegistrationName>${escapeXml(p.registrationName)}</cbc:RegistrationName>`);
  lines.push(`      </cac:PartyLegalEntity>`);

  lines.push(`    </cac:Party>`);
  lines.push(`  </cac:${wrapperName}>`);
  return lines.join("\n");
}

function buildTaxTotals(totalTax: number, taxSummary: UblTaxSubtotal[]): string {
  const lines: string[] = [];

  // TaxTotal #1: الإجمالي فقط (مطلوب من ZATCA)
  lines.push(`  <cac:TaxTotal>`);
  lines.push(`    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>`);
  lines.push(`  </cac:TaxTotal>`);

  // TaxTotal #2: تفصيل per category
  lines.push(`  <cac:TaxTotal>`);
  lines.push(`    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>`);
  for (const t of taxSummary) {
    lines.push(`    <cac:TaxSubtotal>`);
    lines.push(`      <cbc:TaxableAmount currencyID="SAR">${fmt(t.taxableAmount)}</cbc:TaxableAmount>`);
    lines.push(`      <cbc:TaxAmount currencyID="SAR">${fmt(t.taxAmount)}</cbc:TaxAmount>`);
    lines.push(`      <cac:TaxCategory>`);
    lines.push(`        <cbc:ID schemeID="UN/ECE 5305">${t.taxCategoryId}</cbc:ID>`);
    lines.push(`        <cbc:Percent>${fmt(t.taxCategoryPercent)}</cbc:Percent>`);
    lines.push(`        <cac:TaxScheme>`);
    lines.push(`          <cbc:ID schemeID="UN/ECE 5153">VAT</cbc:ID>`);
    lines.push(`        </cac:TaxScheme>`);
    lines.push(`      </cac:TaxCategory>`);
    lines.push(`    </cac:TaxSubtotal>`);
  }
  lines.push(`  </cac:TaxTotal>`);

  return lines.join("\n");
}

function buildLegalMonetaryTotal(t: UblTotals): string {
  const lines: string[] = [];
  lines.push(`  <cac:LegalMonetaryTotal>`);
  lines.push(
    `    <cbc:LineExtensionAmount currencyID="SAR">${fmt(t.lineExtensionAmount)}</cbc:LineExtensionAmount>`
  );
  lines.push(
    `    <cbc:TaxExclusiveAmount currencyID="SAR">${fmt(t.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>`
  );
  lines.push(
    `    <cbc:TaxInclusiveAmount currencyID="SAR">${fmt(t.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>`
  );
  lines.push(
    `    <cbc:AllowanceTotalAmount currencyID="SAR">${fmt(t.allowanceTotalAmount)}</cbc:AllowanceTotalAmount>`
  );
  lines.push(`    <cbc:PayableAmount currencyID="SAR">${fmt(t.payableAmount)}</cbc:PayableAmount>`);
  lines.push(`  </cac:LegalMonetaryTotal>`);
  return lines.join("\n");
}

function buildInvoiceLine(line: UblLine): string {
  const lines: string[] = [];
  lines.push(`  <cac:InvoiceLine>`);
  lines.push(`    <cbc:ID>${line.id}</cbc:ID>`);
  lines.push(`    <cbc:InvoicedQuantity unitCode="${line.unitCode}">${line.quantity}</cbc:InvoicedQuantity>`);
  lines.push(
    `    <cbc:LineExtensionAmount currencyID="SAR">${fmt(line.lineExtensionAmount)}</cbc:LineExtensionAmount>`
  );

  // TaxTotal per line
  lines.push(`    <cac:TaxTotal>`);
  lines.push(`      <cbc:TaxAmount currencyID="SAR">${fmt(line.vatAmount)}</cbc:TaxAmount>`);
  lines.push(
    `      <cbc:RoundingAmount currencyID="SAR">${fmt(line.roundingAmount)}</cbc:RoundingAmount>`
  );
  lines.push(`    </cac:TaxTotal>`);

  // Item
  lines.push(`    <cac:Item>`);
  lines.push(`      <cbc:Name>${escapeXml(line.itemName)}</cbc:Name>`);
  lines.push(`      <cac:ClassifiedTaxCategory>`);
  lines.push(`        <cbc:ID>${line.taxCategoryId}</cbc:ID>`);
  lines.push(`        <cbc:Percent>${fmt(line.vatPct)}</cbc:Percent>`);
  lines.push(`        <cac:TaxScheme>`);
  lines.push(`          <cbc:ID>VAT</cbc:ID>`);
  lines.push(`        </cac:TaxScheme>`);
  lines.push(`      </cac:ClassifiedTaxCategory>`);
  lines.push(`    </cac:Item>`);

  // Price
  lines.push(`    <cac:Price>`);
  lines.push(`      <cbc:PriceAmount currencyID="SAR">${fmt(line.unitPrice)}</cbc:PriceAmount>`);
  lines.push(`      <cac:AllowanceCharge>`);
  lines.push(`        <cbc:ChargeIndicator>false</cbc:ChargeIndicator>`);
  lines.push(`        <cbc:AllowanceChargeReason>Line discount</cbc:AllowanceChargeReason>`);
  lines.push(`        <cbc:Amount currencyID="SAR">${fmt(line.discount)}</cbc:Amount>`);
  lines.push(`      </cac:AllowanceCharge>`);
  lines.push(`    </cac:Price>`);

  lines.push(`  </cac:InvoiceLine>`);
  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toFixed(2);
}

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}