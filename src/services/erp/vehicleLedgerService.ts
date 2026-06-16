/**
 * vehicleLedgerService — دفتر المركبة V1 (قراءة فقط).
 *
 * يجمع كل أحداث مركبة واحدة (= inventory_items.id) من المصادر المختلفة،
 * يطبّعها لنموذج موحّد (LedgerEvent)، يرتّبها زمنياً، ويحسب الملخّص المالي.
 *
 * لا يلمس A9/A10. لا تعديل DB. قراءة فقط.
 * المرجع المعماري: VEHICLE_LEDGER_DESIGN.md.
 */

import { supabase } from "@/integrations/supabase/client";
import { computeNetRevenueFromLines } from "@/services/erp/revenueService";

export type LedgerEventType =
  | "SALES_ORDER" | "INVOICE" | "JOURNAL_ENTRY"
  | "CUSTOMER_RECEIPT" | "OPEN_ITEM_ALLOCATION" | "DELIVERY";

export type FinancialCategory = "revenue" | "settlement" | "accounting" | "operational";
export type Severity = "info" | "primary" | "success" | "warning";

export interface LedgerEvent {
  event_id: string;
  event_type: LedgerEventType;
  event_date: string;
  document_type: string;
  document_id: string | null;
  document_no: string;
  description: string;
  debit: number;
  credit: number;
  amount: number;
  status: string | null;
  financial_category: FinancialCategory;
  severity: Severity;
  source_table: string;
}

export interface VehicleLedgerSummary {
  sales_value: number;       // قيمة المبيعات (الفاتورة)
  collected_amount: number;  // المحصّل (السدادات)
  outstanding_amount: number;// المتبقّي
  journal_impact: number;    // الأثر المحاسبي (إجمالي مدين القيود)
  event_count: number;
}

export interface VehicleLedgerResult {
  vehicle: any;
  events: LedgerEvent[];
  summary: VehicleLedgerSummary;
}

export const vehicleLedgerService = {
  async getLedger(vehicleId: string): Promise<VehicleLedgerResult> {
    // ── المرحلة 1: المركبة + فواتيرها (للجسر) ──
    const { data: vehicle } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", vehicleId)
      .eq("item_type", "vehicle")
      .maybeSingle();

    // بنود الفواتير الخاصّة بالمركبة → نجمع invoice_ids + أرقام الفواتير
    const { data: invLines } = await supabase
      .from("invoice_lines")
      .select("invoice_id, total, unit_price, quantity, discount")
      .eq("vehicle_id", vehicleId);
    const invoiceIds = Array.from(new Set((invLines ?? []).map(l => l.invoice_id).filter(Boolean)));

    // ── المرحلة 2: 5 استعلامات متوازية ──
    const [
      { data: soLines },
      { data: invoices },
      { data: journals },
      { data: payments },
      { data: allocations },
    ] = await Promise.all([
      // أوامر البيع (مباشر بـ vehicle_id)
      supabase.from("sales_order_lines")
        .select("order_id, unit_price, sales_orders(order_no, order_date, status, total)")
        .eq("vehicle_id", vehicleId),
      // الفواتير (عبر invoice_ids)
      invoiceIds.length
        ? supabase.from("invoices").select("id, invoice_no, invoice_date, total, status").in("id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
      // القيود (جسر: source_id IN invoiceIds, source_type='sales_invoice')
      invoiceIds.length
        ? supabase.from("journal_entries")
            .select("id, entry_no, description, is_posted, created_at, source_id")
            .in("source_id", invoiceIds).eq("source_type", "sales_invoice")
        : Promise.resolve({ data: [] as any[] }),
      // السدادات (جسر: invoice_id IN invoiceIds)
      invoiceIds.length
        ? supabase.from("payments").select("id, amount, payment_date, invoice_id, created_at").in("invoice_id", invoiceIds)
        : Promise.resolve({ data: [] as any[] }),
      // التخصيصات (جسر: target/source_document_id IN invoiceIds)
      invoiceIds.length
        ? supabase.from("open_item_allocations")
            .select("id, allocated_amount, created_at, status, source_document_id, target_document_id, source_document_type, target_document_type")
            .or(`source_document_id.in.(${invoiceIds.join(",")}),target_document_id.in.(${invoiceIds.join(",")})`)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // ── المرحلة 3: تطبيع لـ LedgerEvent ──
    const events: LedgerEvent[] = [];

    for (const so of (soLines ?? [])) {
      const o: any = (so as any).sales_orders;
      if (!o) continue;
      events.push({
        event_id: `so:${(so as any).order_id}`,
        event_type: "SALES_ORDER", event_date: o.order_date ?? o.created_at,
        document_type: "sales_order", document_id: (so as any).order_id, document_no: o.order_no ?? "—",
        description: "أمر بيع", debit: 0, credit: 0, amount: Number(o.total ?? 0),
        status: o.status, financial_category: "operational", severity: "info", source_table: "sales_order_lines",
      });
    }

    for (const inv of (invoices ?? [])) {
      events.push({
        event_id: `inv:${(inv as any).id}`,
        event_type: "INVOICE", event_date: (inv as any).invoice_date,
        document_type: "sales_invoice", document_id: (inv as any).id, document_no: (inv as any).invoice_no,
        description: "فاتورة مبيعات", debit: Number((inv as any).total ?? 0), credit: 0, amount: Number((inv as any).total ?? 0),
        status: (inv as any).status, financial_category: "revenue", severity: "primary", source_table: "invoices",
      });
    }

    for (const je of (journals ?? [])) {
      events.push({
        event_id: `je:${(je as any).id}`,
        event_type: "JOURNAL_ENTRY", event_date: (je as any).created_at,
        document_type: "journal_entry", document_id: (je as any).id, document_no: (je as any).entry_no,
        description: (je as any).description ?? "قيد محاسبي", debit: 0, credit: 0, amount: 0,
        status: (je as any).is_posted ? "مُرحّل" : "غير مُرحّل",
        financial_category: "accounting", severity: "info", source_table: "journal_entries",
      });
    }

    for (const p of (payments ?? [])) {
      events.push({
        event_id: `pay:${(p as any).id}`,
        event_type: "CUSTOMER_RECEIPT", event_date: (p as any).payment_date ?? (p as any).created_at,
        document_type: "payment", document_id: (p as any).id, document_no: "سداد",
        description: "سداد عميل", debit: 0, credit: Number((p as any).amount ?? 0), amount: Number((p as any).amount ?? 0),
        status: "مكتمل", financial_category: "settlement", severity: "success", source_table: "payments",
      });
    }

    for (const al of (allocations ?? [])) {
      events.push({
        event_id: `alloc:${(al as any).id}`,
        event_type: "OPEN_ITEM_ALLOCATION", event_date: (al as any).created_at,
        document_type: "allocation", document_id: (al as any).id, document_no: "تخصيص",
        description: "تخصيص/تصفية", debit: 0, credit: 0, amount: Number((al as any).allocated_amount ?? 0),
        status: (al as any).status, financial_category: "settlement", severity: "info", source_table: "open_item_allocations",
      });
    }

    // ترتيب زمني تنازلي (الأحدث أولاً)
    events.sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime());

    // ── الملخّص المالي ──
    // الإيراد الصافي (بلا VAT) من المصدر الموحّد — لا invoices.total (يشمل VAT)
    const sales_value = computeNetRevenueFromLines((invLines ?? []) as any[]);
    const collected_amount = (payments ?? []).reduce((s, p) => s + Number((p as any).amount ?? 0), 0);
    const journal_impact = (journals ?? []).length; // عدد القيود (الأثر المحاسبي عبر الجسر)

    const summary: VehicleLedgerSummary = {
      sales_value,
      collected_amount,
      outstanding_amount: Math.max(0, sales_value - collected_amount),
      journal_impact,
      event_count: events.length,
    };

    return { vehicle, events, summary };
  },
};
