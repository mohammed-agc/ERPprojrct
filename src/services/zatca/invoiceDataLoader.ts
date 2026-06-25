// ============================================================
// invoiceDataLoader.ts — S2.1
// ============================================================
// المسؤولية الوحيدة: قراءة كل ما يلزم XmlBuilder من Supabase
// وإرجاعه في كائن InvoiceData "خام" (بدون تحويل).
//
// مبادئ معمارية:
//   - SSOT (بند 4): يقرأ من الجداول التشغيلية مباشرة، لا views
//   - Atomic (بند 5): كل القراءات Promise.all في رحلة واحدة
//   - No Silent Assumptions (بند 6): يرفع خطأً واضحاً إن نقص أي شيء
//
// ما لا يفعله:
//   - لا يتحقق من منطق الأعمال (يفعل ذلك validateInvoiceData)
//   - لا يحوّل بيانات (يفعل ذلك invoiceUblMapper)
//   - لا يكتب في DB (read-only)
// ============================================================

import { supabase } from "@/integrations/supabase/client";
import {
  XmlBuilderError,
  type InvoiceData,
  type InvoiceRow,
  type InvoiceLineRow,
  type CompanyRow,
  type ContactRow,
} from "./xmlBuilder.types";

/**
 * يجلب كل البيانات المطلوبة لبناء UBL XML من DB.
 *
 * @throws XmlBuilderError("INVOICE_NOT_FOUND") إن لم توجد الفاتورة
 * @throws XmlBuilderError("COMPANY_NOT_CONFIGURED") إن لم توجد شركة
 * @throws XmlBuilderError("CUSTOMER_NOT_FOUND") إن لم يوجد العميل
 * @throws XmlBuilderError("DB_ERROR") لأي فشل قراءة آخر
 */
export async function loadInvoiceData(invoiceId: string): Promise<InvoiceData> {
  // 1) جلب الفاتورة والسطور والشركة معاً (Atomic read)
  const [invoiceResult, linesResult, companyResult] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, invoice_no, uuid, icv, pih, invoice_type, invoice_category, " +
          "invoice_date, issue_timestamp, supply_date, subtotal, vat_amount, " +
          "total, paid_amount, customer_id"
      )
      .eq("id", invoiceId)
      .maybeSingle(),

    supabase
      .from("invoice_lines")
      .select(
        "id, line_no, description, quantity, unit_price, discount, " +
          "vat_pct, vat_amount, total, brand, model, year, trim"
      )
      .eq("invoice_id", invoiceId)
      .order("line_no", { ascending: true }),

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

  // معالجة أخطاء DB العامة
  if (invoiceResult.error) {
    throw new XmlBuilderError("DB_ERROR", `فشل قراءة الفاتورة: ${invoiceResult.error.message}`, {
      invoiceId,
      error: invoiceResult.error,
    });
  }
  if (linesResult.error) {
    throw new XmlBuilderError("DB_ERROR", `فشل قراءة بنود الفاتورة: ${linesResult.error.message}`, {
      invoiceId,
      error: linesResult.error,
    });
  }
  if (companyResult.error) {
    throw new XmlBuilderError("DB_ERROR", `فشل قراءة بيانات الشركة: ${companyResult.error.message}`, {
      error: companyResult.error,
    });
  }

  // الفاتورة موجودة؟
  if (!invoiceResult.data) {
    throw new XmlBuilderError("INVOICE_NOT_FOUND", `الفاتورة غير موجودة: ${invoiceId}`, {
      invoiceId,
    });
  }
  const invoice = invoiceResult.data as InvoiceRow;

  // الشركة معرَّفة؟
  if (!companyResult.data) {
    // fallback: أول شركة نشطة
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
    companyResult.data = fallback.data;
  }
  const company = companyResult.data as CompanyRow;
  const lines = (linesResult.data ?? []) as InvoiceLineRow[];

  // 2) جلب العميل (لأن نحتاج customer_id من invoice)
  if (!invoice.customer_id) {
    throw new XmlBuilderError("CUSTOMER_NOT_FOUND", "الفاتورة بلا عميل مرتبط", {
      invoiceId,
    });
  }

  const customerResult = await supabase
    .from("contacts")
    .select(
      "id, name, vat_number, cr_number, national_id, country, city, " +
        "district, address, postal_code, building_no"
    )
    .eq("id", invoice.customer_id)
    .maybeSingle();

  if (customerResult.error) {
    throw new XmlBuilderError("DB_ERROR", `فشل قراءة بيانات العميل: ${customerResult.error.message}`, {
      customerId: invoice.customer_id,
      error: customerResult.error,
    });
  }
  if (!customerResult.data) {
    throw new XmlBuilderError("CUSTOMER_NOT_FOUND", `العميل غير موجود: ${invoice.customer_id}`, {
      customerId: invoice.customer_id,
    });
  }
  const customer = customerResult.data as ContactRow;

  return { invoice, lines, company, customer };
}