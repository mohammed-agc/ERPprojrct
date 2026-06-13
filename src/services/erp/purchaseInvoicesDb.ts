// خدمة فواتير الشراء — Supabase
// الفاتورة تُنشأ من تخصيص مؤكّد (كل مركباته). عند التأكيد تُنشئ المركبات في المخزون (on_order).
import { supabase } from "@/integrations/supabase/client";
import { getAllocation } from "@/services/erp/allocationsDb";

export type PurchaseInvoiceStatus = "draft" | "confirmed" | "partially_paid" | "paid" | "cancelled";

export const PINV_STATUS_LABEL: Record<PurchaseInvoiceStatus, string> = {
  draft: "مسودة",
  confirmed: "مؤكّدة (غير مدفوعة)",
  partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};
export const PINV_STATUS_TONE: Record<PurchaseInvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-warning/10 text-warning border border-warning/30",
  partially_paid: "bg-info/10 text-info border border-info/30",
  paid: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export interface PurchaseInvoiceRow {
  id: string;
  code: string;
  allocation_id: string | null;
  po_id: string | null;
  supplier_id: string | null;
  contact_id: string | null;
  supplier_name: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  due_date: string | null;
  subtotal: number;
  lines_discount: number;
  discount_pct: number;
  discount_amount: number;
  vat_amount: number;
  total: number;
  paid_amount: number;
  status: PurchaseInvoiceStatus;
  currency: string | null;
  notes: string | null;
  created_at: string;
}

export interface PurchaseInvoiceLineRow {
  id: string;
  invoice_id: string;
  allocation_line_id: string | null;
  line_no: number;
  vin: string | null;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  color: string | null;
  engine_no: string | null;
  unit_cost: number;
  discount_pct: number;
  discount_amount: number;
  net_cost: number;
  vat_pct: number;
  line_total: number;
}

// بند مدخل عند الإنشاء (مع خصم اختياري)
export interface InvoiceLineInput {
  allocation_line_id: string;
  vin: string;
  brand: string | null;
  manufacturer: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  color: string | null;
  engine_no: string | null;
  unit_cost: number;
  discount_pct?: number;     // خصم البند نسبة
  discount_amount?: number;  // خصم البند مبلغ (إن لم تُعطَ النسبة)
  vat_pct?: number;
}

// حساب الإجماليات (بند + خصم إجمالي)
export function computeInvoiceTotals(
  lines: InvoiceLineInput[],
  headerDiscountPct = 0,
  headerDiscountAmount = 0,
) {
  let subtotal = 0;          // مجموع unit_cost قبل أي خصم
  let linesDiscount = 0;     // مجموع خصومات البنود
  const computed = lines.map(l => {
    const gross = Number(l.unit_cost) || 0;
    const dPct = Number(l.discount_pct) || 0;
    const dAmt = dPct > 0 ? gross * (dPct / 100) : (Number(l.discount_amount) || 0);
    const net = Math.max(0, gross - dAmt);
    subtotal += gross;
    linesDiscount += dAmt;
    return { ...l, gross, discount_amount: dAmt, net_cost: net, vat_pct: Number(l.vat_pct) || 15 };
  });

  // الخصم الإجمالي على (المجموع بعد خصومات البنود)
  const afterLineDisc = subtotal - linesDiscount;
  const headerDisc = headerDiscountPct > 0 ? afterLineDisc * (headerDiscountPct / 100) : (headerDiscountAmount || 0);
  const netBeforeVat = Math.max(0, afterLineDisc - headerDisc);

  // الضريبة على الصافي (نسبة موحّدة 15% افتراضاً)
  const vatAmount = computed.reduce((s, l) => {
    // نوزّع الخصم الإجمالي نسبياً للضريبة الدقيقة
    const share = afterLineDisc > 0 ? (l.net_cost / afterLineDisc) : 0;
    const lineNetAfterHeader = l.net_cost - headerDisc * share;
    return s + Math.max(0, lineNetAfterHeader) * (l.vat_pct / 100);
  }, 0);

  const total = netBeforeVat + vatAmount;

  return {
    subtotal,
    linesDiscount,
    headerDiscount: headerDisc,
    netBeforeVat,
    vatAmount,
    total,
    lines: computed,
  };
}

// إنشاء فاتورة من تخصيص (كل مركباته)
export async function createInvoiceFromAllocation(input: {
  allocation_id: string;
  invoice_no?: string;          // رقم فاتورة المورد
  invoice_date?: string;
  due_date?: string;
  discount_pct?: number;        // خصم إجمالي نسبة
  discount_amount?: number;     // خصم إجمالي مبلغ
  line_discounts?: Record<string, { pct?: number; amount?: number }>; // خصم لكل بند (مفتاح: allocation_line_id)
  notes?: string;
}): Promise<PurchaseInvoiceRow> {
  const alloc = await getAllocation(input.allocation_id);
  if (!alloc) throw new Error("التخصيص غير موجود");
  if (alloc.header.status === "draft") throw new Error("يجب تأكيد التخصيص قبل إنشاء الفاتورة");
  if (alloc.lines.length === 0) throw new Error("التخصيص بلا مركبات");

  // منع تكرار الفاتورة لنفس التخصيص
  const { data: existing } = await supabase
    .from("purchase_invoices").select("id, code").eq("allocation_id", input.allocation_id).maybeSingle();
  if (existing) throw new Error(`سبق إنشاء فاتورة لهذا التخصيص (${existing.code})`);

  // بناء البنود من مركبات التخصيص
  const lineInputs: InvoiceLineInput[] = alloc.lines.map(l => {
    const d = input.line_discounts?.[l.id] ?? {};
    return {
      allocation_line_id: l.id,
      vin: l.vin,
      brand: l.brand,
      manufacturer: l.manufacturer,
      model: l.model,
      trim: l.trim,
      year: l.year,
      color: l.color,
      engine_no: l.engine_no,
      unit_cost: l.unit_cost,
      discount_pct: d.pct ?? 0,
      discount_amount: d.amount ?? 0,
      vat_pct: l.vat_pct ?? 15,
    };
  });

  const calc = computeInvoiceTotals(lineInputs, input.discount_pct ?? 0, input.discount_amount ?? 0);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  // إنشاء رأس الفاتورة (مسودة)
  const { data: header, error: e1 } = await supabase
    .from("purchase_invoices")
    .insert({
      code: "",
      allocation_id: input.allocation_id,
      po_id: alloc.header.po_id,
      supplier_id: alloc.header.supplier_id,
      contact_id: alloc.header.contact_id ?? alloc.header.supplier_id,
      invoice_no: input.invoice_no ?? null,
      invoice_date: input.invoice_date ?? new Date().toISOString().slice(0, 10),
      due_date: input.due_date ?? null,
      subtotal: calc.subtotal,
      lines_discount: calc.linesDiscount,
      discount_pct: input.discount_pct ?? 0,
      discount_amount: calc.headerDiscount,
      vat_amount: calc.vatAmount,
      total: calc.total,
      paid_amount: 0,
      status: "draft" as PurchaseInvoiceStatus,
      currency: "SAR",
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select("*").single();
  if (e1) throw e1;

  // إنشاء بنود الفاتورة
  const linesPayload = calc.lines.map((l, i) => ({
    invoice_id: header.id,
    allocation_line_id: l.allocation_line_id,
    line_no: i + 1,
    vin: l.vin,
    brand: l.brand,
    manufacturer: l.manufacturer,
    model: l.model,
    trim: l.trim,
    year: l.year,
    color: l.color,
    engine_no: l.engine_no,
    unit_cost: l.unit_cost,
    discount_pct: l.discount_pct ?? 0,
    discount_amount: l.discount_amount,
    net_cost: l.net_cost,
    vat_pct: l.vat_pct,
    line_total: l.net_cost * (1 + l.vat_pct / 100),
  }));
  const { error: e2 } = await supabase.from("purchase_invoice_lines").insert(linesPayload);
  if (e2) throw e2;

  return header as PurchaseInvoiceRow;
}

export async function listInvoices(): Promise<PurchaseInvoiceRow[]> {
  const { data, error } = await supabase
    .from("purchase_invoices").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as PurchaseInvoiceRow[];
  // المتبقّي من Open Items (كل التخصيصات النشطة) — مصدر مركزي للقائمة
  const ids = rows.map(r => r.id);
  if (ids.length) {
    const { data: al } = await supabase
      .from("open_item_allocations")
      .select("target_document_id, allocated_amount")
      .eq("target_document_type", "purchase_invoice")
      .eq("status", "active")
      .in("target_document_id", ids);
    const clr: Record<string, number> = {};
    for (const x of (al ?? []) as any[]) clr[x.target_document_id] = (clr[x.target_document_id] ?? 0) + Number(x.allocated_amount || 0);
    for (const r of rows) {
      (r as any).cleared_amount = clr[r.id] ?? 0;
      (r as any).remaining_amount = Math.max(0, Number(r.total) - (clr[r.id] ?? 0));
    }
  }
  return rows;
}

export async function getInvoice(id: string): Promise<{ header: PurchaseInvoiceRow; lines: PurchaseInvoiceLineRow[] } | null> {
  const { data: header, error: e1 } = await supabase
    .from("purchase_invoices").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!header) return null;
  const { data: lines, error: e2 } = await supabase
    .from("purchase_invoice_lines").select("*").eq("invoice_id", id).order("line_no");
  if (e2) throw e2;
  // اسم المورد من السجلّ الموحّد (Business Partner) إن لم يكن مخزّناً
  const h = header as PurchaseInvoiceRow;
  if (!h.supplier_name && (h.contact_id || h.supplier_id)) {
    const { data: c } = await supabase
      .from("contacts").select("name").eq("id", h.contact_id ?? h.supplier_id).maybeSingle();
    if (c?.name) h.supplier_name = c.name;
  }

  // المتبقّي الحقيقي من محرك التخصيصات (Open Items) — المصدر المحاسبي الصحيح
  const { data: rem } = await supabase.rpc("document_remaining" as any, {
    p_doc_type: "purchase_invoice", p_doc_id: id, p_total: Number(h.total),
  });
  if (rem !== null && rem !== undefined) (h as any).remaining_amount = Number(rem);

  return { header: h, lines: (lines ?? []) as PurchaseInvoiceLineRow[] };
}

// تأكيد الفاتورة → إنشاء المركبات في المخزون (on_order) + حالة غير مدفوعة
export async function confirmInvoice(invoiceId: string): Promise<{ created: number }> {
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.header.status !== "draft") throw new Error("الفاتورة مؤكّدة سابقاً");

  let created = 0;
  for (const line of inv.lines) {
    if (!line.vin) continue;
    // تجنّب التكرار
    const { data: exists } = await supabase
      .from("inventory_items").select("id").eq("vin", line.vin).maybeSingle();
    if (exists) {
      // اربط بند التخصيص بالمركبة الموجودة
      if (line.allocation_line_id) {
        await supabase.from("allocation_lines").update({ vehicle_id: exists.id }).eq("id", line.allocation_line_id);
      }
      continue;
    }
    const name = [line.manufacturer || line.brand, line.model, line.trim, line.year, line.color]
      .filter(Boolean).join(" ") || ("مركبة " + line.vin);
    const { data: veh, error } = await supabase.from("inventory_items").insert({
      sku: line.vin,
      name,
      item_type: "vehicle",
      brand: line.brand || line.manufacturer || null,
      model: line.model || null,
      trim: line.trim || null,
      year: line.year || null,
      color: line.color || null,
      vin: line.vin,
      engine_no: line.engine_no || null,
      cost_price: line.net_cost || line.unit_cost || 0,  // التكلفة بعد الخصم
      avg_cost: line.net_cost || line.unit_cost || 0,
      sale_price: 0,
      qty_on_hand: 1,
      qty_reserved: 0,
      status: "on_order",
    }).select("id").single();
    if (error) throw error;
    if (line.allocation_line_id) {
      await supabase.from("allocation_lines").update({ vehicle_id: veh.id }).eq("id", line.allocation_line_id);
    }
    created++;
  }

  // حالة الفاتورة: مؤكّدة (غير مدفوعة)
  const { error: eU } = await supabase
    .from("purchase_invoices").update({ status: "confirmed" }).eq("id", invoiceId);
  if (eU) throw eU;

  return { created };
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from("purchase_invoices").update({ status: "cancelled" }).eq("id", invoiceId);
  if (error) throw error;
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";