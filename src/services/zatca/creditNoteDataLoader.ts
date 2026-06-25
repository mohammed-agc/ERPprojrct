// ============================================================
// creditNoteDataLoader.ts — S2.2
// ============================================================
// Adapter Pattern: يقرأ من credit_notes + credit_note_lines + invoices
// ويُرجع InvoiceData موحّد يفهمه Validator/Mapper/Builder.
//
// مبادئ معمارية:
//   - يلتزم بواجهة DocumentLoader (Loader Registry Pattern)
//   - Snapshot Pattern: يقرأ من credit_note_lines فقط، لا hydrate من invoice_lines
//   - يجلب الفاتورة الأصلية لـ BillingReference (BR-KSA-56)
//   - يحوّل أكواد reason إلى عربية واضحة (KSA-10)
//   - VAT% مُشتقّ من المبالغ (warning + fallback 15% with warning)
//
// ما لا يفعله:
//   - لا يتحقق من منطق الأعمال (يفعل ذلك Validator)
//   - لا يحوّل بيانات لـ UBL (يفعل ذلك Mapper)
//   - لا يكتب في DB (read-only)
//
// قاعدة بيانات مصدر:
//   credit_notes        (الرأس + uuid + icv + pih + reason + invoice_id)
//   credit_note_lines   (البنود — snapshot مستقل عن invoice_lines)
//   invoices            (الفاتورة الأصلية للـ BillingReference + invoice_type)
//   companies, contacts (نفس الطبقات من invoiceDataLoader)
//
// TECH-DEBT-S2.2-01: credit_note_lines يفتقد عمود vat_rate
//   → نشتقّه من vat_amount/subtotal أو fallback 15% مع warning واضح
//
// TECH-DEBT-S2.2-03: F5/F6 لا يستدعي register_document_hash لـ credit_notes
//   → credit_notes الموجودة لها icv/pih = null حالياً
//   → الـ Validator سيرفض البناء حتى تُسجّل في zatca_document_chain
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import {
  XmlBuilderError,
  type DocumentLoader,
  type InvoiceData,
  type InvoiceRow,
  type InvoiceLineRow,
  type CompanyRow,
  type ContactRow,
  type BillingReference,
  type BuildWarning,
} from "./xmlBuilder.types";

// ─────────────────────────────────────────────────────────────
// قاموس تحويل أكواد الأسباب → نص عربي واضح (KSA-10)
// ─────────────────────────────────────────────────────────────
/**
 * يحوّل أكواد reason الإنجليزية المُخزّنة في credit_notes.reason
 * إلى نص عربي قابل للقراءة. النص الحر العربي يبقى كما هو.
 */
const REASON_CODE_TO_ARABIC: Record<string, string> = {
  invoice_cancellation: "إلغاء فاتورة",
  goods_return: "إرجاع بضاعة",
  discount_correction: "تصحيح خصم",
  price_correction: "تصحيح سعر",
  quantity_correction: "تصحيح كمية",
  partial_return: "إرجاع جزئي",
};

/**
 * يحوّل reason الخام إلى نص KSA-10 صالح:
 *   - إن كان كوداً معروفاً → نص عربي
 *   - إن كان نصاً حراً → يبقى كما هو
 *   - إن كان فارغاً → null (يكشفه Validator BR-KSA-17)
 */
function humanizeReason(raw: string | null | undefined): string | null {
  if (!raw || raw.trim().length === 0) return null;
  const trimmed = raw.trim();
  return REASON_CODE_TO_ARABIC[trimmed] ?? trimmed;
}

// ─────────────────────────────────────────────────────────────
// شكل صف credit_notes (مطابق Schema الفعلي)
// ─────────────────────────────────────────────────────────────
interface CreditNoteRow {
  id: string;
  cn_no: string;
  invoice_id: string | null;
  customer_id: string | null;
  cn_date: string | null;
  amount: number | null;
  vat_amount: number | null;
  total: number | null;
  reason: string | null;
  status: string | null;
  created_at: string | null;
  uuid: string | null;
  icv: number | null;
  invoice_category: string | null; // "credit_note"
  pih: string | null;
}

interface CreditNoteLineRow {
  id: string;
  credit_note_id: string;
  invoice_line_id: string | null;
  vehicle_id: string | null;
  vin: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  vat_amount: number;
  line_total: number;
  reason: string | null;
}

interface OriginalInvoiceMini {
  id: string;
  invoice_no: string;
  uuid: string;
  invoice_date: string;
  invoice_type: string; // "standard" | "simplified"
}

// ─────────────────────────────────────────────────────────────
// CreditNoteDataLoader — يلتزم بواجهة DocumentLoader
// ─────────────────────────────────────────────────────────────

/**
 * Loader للـ Credit Notes (سندات إشعار دائن).
 * نقطة الدخول: load(creditNoteId).
 *
 * @throws XmlBuilderError("CREDIT_NOTE_NOT_FOUND")
 * @throws XmlBuilderError("CREDIT_NOTE_HAS_NO_LINES")
 * @throws XmlBuilderError("ORIGINAL_INVOICE_NOT_FOUND")
 * @throws XmlBuilderError("COMPANY_NOT_CONFIGURED")
 * @throws XmlBuilderError("CUSTOMER_NOT_FOUND")
 * @throws XmlBuilderError("DB_ERROR")
 */
export const creditNoteDataLoader: DocumentLoader = {
  async load(creditNoteId: string): Promise<InvoiceData> {
    // 1) جلب رأس السند والبنود معاً (Atomic read)
    const [cnResult, cnLinesResult, companyResult] = await Promise.all([
      supabase
        .from("credit_notes")
        .select(
          "id, cn_no, invoice_id, customer_id, cn_date, amount, vat_amount, " +
            "total, reason, status, created_at, uuid, icv, invoice_category, pih"
        )
        .eq("id", creditNoteId)
        .maybeSingle(),

      supabase
        .from("credit_note_lines")
        .select(
          "id, credit_note_id, invoice_line_id, vehicle_id, vin, description, " +
            "quantity, unit_price, vat_amount, line_total, reason"
        )
        .eq("credit_note_id", creditNoteId)
        .order("id", { ascending: true }),

      supabase
        .from("companies")
        .select(
          "id, name, commercial_registration, vat_number, country, country_code, " +
            "currency_code, street_address, building_number, district, city, " +
            "postal_code, additional_number"
        )
        .eq("code", "DEFAULT")
        .maybeSingle(),
    ]);

    // معالجة أخطاء DB
    if (cnResult.error) {
      throw new XmlBuilderError(
        "DB_ERROR",
        `فشل قراءة سند الإشعار الدائن: ${cnResult.error.message}`,
        { creditNoteId, error: cnResult.error }
      );
    }
    if (cnLinesResult.error) {
      throw new XmlBuilderError(
        "DB_ERROR",
        `فشل قراءة بنود سند الإشعار الدائن: ${cnLinesResult.error.message}`,
        { creditNoteId, error: cnLinesResult.error }
      );
    }
    if (companyResult.error) {
      throw new XmlBuilderError(
        "DB_ERROR",
        `فشل قراءة بيانات الشركة: ${companyResult.error.message}`,
        { error: companyResult.error }
      );
    }

    // السند موجود؟
    if (!cnResult.data) {
      throw new XmlBuilderError(
        "CREDIT_NOTE_NOT_FOUND",
        `سند الإشعار الدائن غير موجود: ${creditNoteId}`,
        { creditNoteId }
      );
    }
    const cn = cnResult.data as CreditNoteRow;

    // السند له بنود؟
    const cnLines = (cnLinesResult.data ?? []) as CreditNoteLineRow[];
    if (cnLines.length === 0) {
      throw new XmlBuilderError(
        "CREDIT_NOTE_HAS_NO_LINES",
        `سند الإشعار الدائن ${cn.cn_no} بلا بنود — لا يمكن بناء XML.`,
        { creditNoteId, cnNo: cn.cn_no }
      );
    }

    // العميل موجود في صف السند؟
    if (!cn.customer_id) {
      throw new XmlBuilderError(
        "CUSTOMER_NOT_FOUND",
        `سند الإشعار الدائن ${cn.cn_no} بلا عميل مرتبط.`,
        { creditNoteId, cnNo: cn.cn_no }
      );
    }

    // الفاتورة الأصلية موجودة في صف السند؟
    if (!cn.invoice_id) {
      throw new XmlBuilderError(
        "BILLING_REFERENCE_MISSING",
        `سند الإشعار الدائن ${cn.cn_no} بلا فاتورة أصلية — BR-KSA-56 يستوجبها.`,
        { creditNoteId, cnNo: cn.cn_no }
      );
    }

    // 2) جلب الفاتورة الأصلية (لـ BillingReference + invoice_type)
    const originalInvoiceResult = await supabase
      .from("invoices")
      .select("id, invoice_no, uuid, invoice_date, invoice_type")
      .eq("id", cn.invoice_id)
      .maybeSingle();

    if (originalInvoiceResult.error) {
      throw new XmlBuilderError(
        "DB_ERROR",
        `فشل قراءة الفاتورة الأصلية: ${originalInvoiceResult.error.message}`,
        { originalInvoiceId: cn.invoice_id, error: originalInvoiceResult.error }
      );
    }
    if (!originalInvoiceResult.data) {
      throw new XmlBuilderError(
        "ORIGINAL_INVOICE_NOT_FOUND",
        `الفاتورة الأصلية للسند ${cn.cn_no} غير موجودة (id: ${cn.invoice_id}).`,
        { creditNoteId, originalInvoiceId: cn.invoice_id }
      );
    }
    const origInv = originalInvoiceResult.data as OriginalInvoiceMini;

    // 3) جلب العميل
    const customerResult = await supabase
      .from("contacts")
      .select(
        "id, name, vat_number, cr_number, national_id, country, city, " +
          "district, address, postal_code, building_no"
      )
      .eq("id", cn.customer_id)
      .maybeSingle();

    if (customerResult.error) {
      throw new XmlBuilderError(
        "DB_ERROR",
        `فشل قراءة بيانات العميل: ${customerResult.error.message}`,
        { customerId: cn.customer_id, error: customerResult.error }
      );
    }
    if (!customerResult.data) {
      throw new XmlBuilderError(
        "CUSTOMER_NOT_FOUND",
        `العميل غير موجود: ${cn.customer_id}`,
        { customerId: cn.customer_id }
      );
    }
    const customer = customerResult.data as ContactRow;

    // 4) الشركة (مع fallback)
    let companyData = companyResult.data;
    if (!companyData) {
      const fallback = await supabase
        .from("companies")
        .select(
          "id, name, commercial_registration, vat_number, country, country_code, " +
            "currency_code, street_address, building_number, district, city, " +
            "postal_code, additional_number"
        )
        .eq("is_active", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback.error || !fallback.data) {
        throw new XmlBuilderError(
          "COMPANY_NOT_CONFIGURED",
          "لا توجد شركة معرَّفة في قاعدة البيانات. يرجى إكمال الإعدادات قبل بناء XML.",
          { triedCode: "DEFAULT" }
        );
      }
      companyData = fallback.data;
    }
    const company = companyData as CompanyRow;

    // 5) بناء InvoiceRow من credit_notes (Adapter Pattern)
    // ملاحظة: invoice_type نأخذه من الفاتورة الأصلية (السند يرث نوع الفاتورة)
    const dbInvoiceType: "standard" | "simplified" =
      origInv.invoice_type === "simplified" ? "simplified" : "standard";

    const invoice: InvoiceRow = {
      id: cn.id,
      invoice_no: cn.cn_no, // رقم سند الإشعار يلعب دور invoice_no في XML
      uuid: cn.uuid ?? "",
      icv: cn.icv ?? 0, // Validator يرفض إن صفر
      pih: cn.pih ?? "",
      invoice_type: dbInvoiceType,
      invoice_category: "credit_note",
      invoice_date: cn.cn_date ?? "",
      issue_timestamp: cn.created_at ?? new Date().toISOString(),
      supply_date: null,
      subtotal: Number(cn.amount ?? 0),
      vat_amount: Number(cn.vat_amount ?? 0),
      total: Number(cn.total ?? 0),
      paid_amount: 0, // السندات ليست مدفوعة - معكوسة محاسبياً
      customer_id: cn.customer_id,
    };

    // 6) تحويل credit_note_lines → InvoiceLineRow[]
    //   مع اشتقاق vat_pct وتسجيل warnings
    const warnings: BuildWarning[] = [];
    const lines: InvoiceLineRow[] = cnLines.map((cnl, idx) => {
      const lineRow = mapCreditNoteLine(cnl, idx + 1, warnings);
      return lineRow;
    });

    // 7) بناء BillingReference (BR-KSA-56)
    const billingReference: BillingReference = {
      invoiceId: origInv.invoice_no,
      invoiceUuid: origInv.uuid,
      issueDate: origInv.invoice_date,
    };

    // 8) سبب الإصدار (KSA-10)
    const documentNote = humanizeReason(cn.reason) ?? undefined;

    // ملاحظة: warnings تُمرَّر عبر InvoiceData بطريقة منظمة
    // الـ Mapper سيمررها للـ Builder
    const result: InvoiceData = {
      invoice,
      lines,
      company,
      customer,
      billingReference,
      documentNote,
    };

    // إرفاق warnings ك metadata غير قياسي (الـ Mapper سيقرأها)
    (result as any).__loaderWarnings = warnings;

    return result;
  },
};

// ─────────────────────────────────────────────────────────────
// تحويل credit_note_lines → InvoiceLineRow (مع اشتقاق VAT%)
// ─────────────────────────────────────────────────────────────

/**
 * يحوّل صف credit_note_lines إلى InvoiceLineRow.
 * يشتقّ vat_pct من المبالغ (TECH-DEBT-S2.2-01).
 *
 * المنطق:
 *   subtotal_excl = line_total - vat_amount = quantity * unit_price
 *   vat_pct = (vat_amount / subtotal_excl) * 100
 *
 * فشل الاشتقاق → fallback 15% مع warning واضح (No Silent Assumptions).
 */
function mapCreditNoteLine(
  cnl: CreditNoteLineRow,
  lineNo: number,
  warnings: BuildWarning[]
): InvoiceLineRow {
  const qty = Number(cnl.quantity);
  const unitPrice = Number(cnl.unit_price);
  const vatAmount = Number(cnl.vat_amount);
  const lineTotal = Number(cnl.line_total);

  // اشتقاق نسبة الضريبة من المبالغ
  let vatPct: number;
  const subtotalExcl = lineTotal - vatAmount; // = qty * unit_price نظرياً

  if (subtotalExcl > 0.01 && vatAmount >= 0) {
    const derived = (vatAmount / subtotalExcl) * 100;
    const roundedToWhole = Math.round(derived);

    // قبول الاشتقاق إن كان قريباً جداً من رقم صحيح (تجنب الكسور الغريبة)
    if (Math.abs(derived - roundedToWhole) < 0.5) {
      vatPct = roundedToWhole;
      warnings.push({
        code: "VAT_RATE_DERIVED_FROM_AMOUNTS",
        message: `تم احتساب نسبة الضريبة (${vatPct}%) من مبالغ السطر لعدم وجود vat_rate في credit_note_lines`,
        context: { lineNo, vatAmount, subtotalExcl, derived },
      });
    } else {
      // الاشتقاق غير منطقي → fallback
      vatPct = 15;
      warnings.push({
        code: "VAT_RATE_FALLBACK_15",
        message: `تم استخدام 15% كنسبة ضريبة افتراضية لسطر سند الإشعار الدائن (اشتقاق غير منطقي: ${derived.toFixed(2)}%)`,
        context: { lineNo, derivedRate: derived, fallback: 15 },
      });
    }
  } else {
    // فشل تام في الاشتقاق
    vatPct = 15;
    warnings.push({
      code: "VAT_RATE_FALLBACK_15",
      message: `تم استخدام 15% كنسبة ضريبة افتراضية لسطر سند الإشعار الدائن (subtotal_excl = ${subtotalExcl.toFixed(2)})`,
      context: { lineNo, subtotalExcl, vatAmount, fallback: 15 },
    });
  }

  return {
    id: cnl.id,
    line_no: lineNo,
    description: cnl.description?.trim() || "بند سند إشعار دائن",
    quantity: qty,
    unit_price: unitPrice,
    discount: 0, // credit_note_lines لا يحتوي discount
    vat_pct: vatPct,
    vat_amount: vatAmount,
    total: lineTotal,
    brand: null,
    model: null,
    year: null,
    trim: null,
  };
}

/**
 * استخراج warnings من InvoiceData المُحمَّل (Mapper helper).
 */
export function extractLoaderWarnings(data: InvoiceData): BuildWarning[] {
  return (data as any).__loaderWarnings ?? [];
}
