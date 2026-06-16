/**
 * revenueService — المصدر الموحّد الوحيد لإيراد المركبة الصافي (Single Source of Truth).
 *
 * القاعدة: الإيراد الصافي = Σ(invoice_lines.unit_price × quantity − discount)، بلا VAT.
 * VAT يُعرض منفصلاً (التزام للدولة، ليس إيراداً).
 * المرتجعات: credit_notes.amount (صافٍ، بلا VAT) — ليس total.
 *
 * كل المستهلكين (VehiclePLCard، VehicleProfitability، vehicleLedgerService، Per-VIN)
 * يستدعون هذه الخدمة. ممنوع تكرار معادلة الإيراد في أي مكوّن.
 *
 * المرجع: F2_REVENUE_SERVICE_DESIGN.md.
 */

import { supabase } from "@/integrations/supabase/client";

export interface InvoiceLineLike {
  unit_price?: number | null;
  quantity?: number | null;
  discount?: number | null;
  vat_amount?: number | null;
}

export interface VehicleRevenueResult {
  net_revenue: number;        // صافي (بلا VAT)
  vat_amount: number;         // الضريبة (منفصلة)
  gross_revenue: number;      // net + vat
  credit_notes_net: number;   // مرتجعات صافية (بلا VAT)
  net_after_returns: number;  // net_revenue − credit_notes_net
  invoice_ids: string[];      // للجسور (COGS، السداد)
}

/** حساب صافي الإيراد من بنود مُمرّرة (بلا استعلام) — للاستخدام داخل الحلقات */
export function computeNetRevenueFromLines(lines: InvoiceLineLike[]): number {
  return (lines ?? []).reduce((sum, l) => {
    const qty = Number(l.quantity ?? 0);
    const price = Number(l.unit_price ?? 0);
    const disc = Number(l.discount ?? 0);
    return sum + Math.max(0, price * qty - disc);
  }, 0);
}

/** حساب صافي الضريبة من بنود مُمرّرة */
export function computeVatFromLines(lines: InvoiceLineLike[]): number {
  return (lines ?? []).reduce((sum, l) => sum + Number(l.vat_amount ?? 0), 0);
}

export const revenueService = {
  /**
   * الإيراد الصافي لمركبة (المصدر الرسمي).
   * يقرأ invoice_lines (مستوى البند، يدعم الفواتير متعدّدة المركبات).
   */
  async getVehicleNetRevenue(vehicleId: string): Promise<VehicleRevenueResult> {
    // بنود الفواتير الخاصّة بالمركبة (المصدر: invoice_lines)
    const { data: lines, error } = await supabase
      .from("invoice_lines")
      .select("invoice_id, unit_price, quantity, discount, vat_amount, invoices!inner(status)")
      .eq("vehicle_id", vehicleId)
      .neq("invoices.status", "cancelled");   // استبعاد الفواتير الملغاة
    if (error) throw error;

    const invoiceLines = (lines ?? []) as (InvoiceLineLike & { invoice_id: string })[];
    const net_revenue = computeNetRevenueFromLines(invoiceLines);
    const vat_amount = computeVatFromLines(invoiceLines);
    const invoice_ids = Array.from(new Set(invoiceLines.map(l => l.invoice_id).filter(Boolean)));

    // TECH-DEBT (CREDIT_NOTE_LINES_MISSING, severity: medium):
    // جدول credit_note_lines غير موجود. التطبيق الحالي يخصم الإشعارات الدائنة
    // على مستوى الفاتورة فقط (credit_notes.amount). صحيح للفاتورة أحادية المركبة.
    // التخصيص الدقيق Per-VIN يتطلّب credit_note_lines أو جدول vehicle allocation.
    let credit_notes_net = 0;
    if (invoice_ids.length > 0) {
      const { data: cns } = await supabase
        .from("credit_notes")
        .select("amount, status, invoice_id")
        .in("invoice_id", invoice_ids)
        .neq("status", "cancelled");
      credit_notes_net = (cns ?? []).reduce((s, c: any) => s + Number(c.amount ?? 0), 0);
    }

    return {
      net_revenue,
      vat_amount,
      gross_revenue: net_revenue + vat_amount,
      credit_notes_net,
      net_after_returns: net_revenue - credit_notes_net,   // قد تكون سالبة — الطبقة المرئية تقرّر العرض
      invoice_ids,
    };
  },
};
