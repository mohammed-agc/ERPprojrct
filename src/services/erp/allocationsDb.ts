// Phase 13b — Authoritative Supabase-backed allocations + confirmations service.
// Replaces the localStorage allocationService.
import { supabase } from "@/integrations/supabase/client";

export type AllocationStatus =
  | "draft" | "confirmed" | "invoiced" | "in_transit" | "received" | "closed" | "cancelled";
export type AllocationLineStatus =
  | "pending" | "confirmed" | "in_transit" | "received" | "inspected" | "stocked" | "cancelled";

export const ALC_STATUS_LABEL: Record<AllocationStatus, string> = {
  draft: "مسودة",
  confirmed: "مؤكَّد",
  invoiced: "مفوتر",
  in_transit: "قيد النقل",
  received: "مستلم",
  closed: "مغلق",
  cancelled: "ملغي",
};
export const ALC_STATUS_TONE: Record<AllocationStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  confirmed: "bg-primary/10 text-primary border border-primary/30",
  invoiced: "bg-info/10 text-info border border-info/30",
  in_transit: "bg-warning/10 text-warning border border-warning/30",
  received: "bg-success/10 text-success border border-success/30",
  closed: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export const ALC_VSTATUS_LABEL: Record<AllocationLineStatus, string> = {
  pending: "بانتظار",
  confirmed: "مؤكَّد",
  in_transit: "قيد النقل",
  received: "مستلم",
  inspected: "مفحوص",
  stocked: "في المخزون",
  cancelled: "ملغي",
};
export const ALC_VSTATUS_TONE: Record<AllocationLineStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  confirmed: "bg-primary/10 text-primary border border-primary/30",
  in_transit: "bg-warning/10 text-warning border border-warning/30",
  received: "bg-success/10 text-success border border-success/30",
  inspected: "bg-info/10 text-info border border-info/30",
  stocked: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export interface AllocationRow {
  id: string;
  alloc_no: string;
  po_id: string;
  supplier_id: string;
  status: AllocationStatus;
  notes: string | null;
  purchase_invoice_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AllocationLineRow {
  id: string;
  allocation_id: string;
  po_line_id: string | null;
  line_no: number;
  brand: string;
  manufacturer: string | null;
  model: string;
  trim: string | null;
  year: number | null;
  color: string | null;
  vin: string;
  engine_no: string;
  unit_cost: number;
  vat_pct: number;
  status: AllocationLineStatus;
  vehicle_id: string | null;
}

export interface AllocationConfirmationRow {
  id: string;
  conf_no: string;
  allocation_id: string;
  supplier_id: string;
  po_id: string;
  allocation_date: string;
  vehicle_count: number;
  vin_list: string[];
  purchase_invoice_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface AllocationLineInput {
  po_line_id?: string | null;
  brand: string;
  manufacturer?: string | null;
  model: string;
  trim?: string | null;
  year?: number | null;
  color?: string | null;
  vin: string;
  engine_no: string;
  unit_cost: number;
  vat_pct?: number;
}

// ============ ALLOCATIONS ============

export async function listAllocations(): Promise<AllocationRow[]> {
  const { data, error } = await supabase
    .from("allocations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AllocationRow[];
}

export async function getAllocation(
  id: string,
): Promise<{ header: AllocationRow; lines: AllocationLineRow[] } | null> {
  const { data: header, error: e1 } = await supabase
    .from("allocations").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!header) return null;
  const { data: lines, error: e2 } = await supabase
    .from("allocation_lines").select("*").eq("allocation_id", id).order("line_no");
  if (e2) throw e2;
  return { header: header as AllocationRow, lines: (lines ?? []) as AllocationLineRow[] };
}

export async function createAllocation(input: {
  po_id: string;
  supplier_id: string;
  notes?: string;
  lines: AllocationLineInput[];
  confirm?: boolean;
}): Promise<AllocationRow> {
  if (!input.po_id) throw new Error("أمر الشراء مطلوب");
  if (!input.supplier_id) throw new Error("المورد مطلوب");
  if (!input.lines.length) throw new Error("يجب إضافة مركبة واحدة على الأقل");

  const seen = new Set<string>();
  for (const l of input.lines) {
    const v = l.vin.trim().toUpperCase();
    if (!v) throw new Error("VIN مطلوب لكل مركبة");
    if (!l.engine_no.trim()) throw new Error(`رقم المحرك مطلوب (VIN ${v})`);
    if (seen.has(v)) throw new Error(`VIN مكرر: ${v}`);
    seen.add(v);
  }

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data: header, error: e1 } = await supabase
    .from("allocations")
    .insert({
      alloc_no: "",
      po_id: input.po_id,
      supplier_id: input.supplier_id,
      status: "draft" as AllocationStatus,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select("*").single();
  if (e1) throw e1;

  const linesPayload = input.lines.map((l, i) => ({
    allocation_id: header.id,
    po_line_id: l.po_line_id ?? null,
    line_no: i + 1,
    brand: l.brand,
    manufacturer: l.manufacturer ?? l.brand,
    model: l.model,
    trim: l.trim ?? null,
    year: l.year ?? null,
    color: l.color ?? null,
    vin: l.vin.trim().toUpperCase(),
    engine_no: l.engine_no.trim().toUpperCase(),
    unit_cost: l.unit_cost,
    vat_pct: l.vat_pct ?? 15,
    status: "pending" as AllocationLineStatus,
  }));
  const { error: e2 } = await supabase.from("allocation_lines").insert(linesPayload);
  if (e2) throw e2;

  if (input.confirm) {
    await setAllocationStatus(header.id, "confirmed");
    return { ...(header as AllocationRow), status: "confirmed" };
  }
  return header as AllocationRow;
}

export async function setAllocationStatus(id: string, status: AllocationStatus): Promise<AllocationRow> {
  const { data, error } = await supabase
    .from("allocations").update({ status: status as AllocationStatus }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as AllocationRow;
}

// ============ CONFIRMATIONS ============

export async function listConfirmations(): Promise<AllocationConfirmationRow[]> {
  const { data, error } = await supabase
    .from("allocation_confirmations").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toConfirmationRow);
}

export async function getConfirmation(id: string): Promise<AllocationConfirmationRow | null> {
  const { data, error } = await supabase
    .from("allocation_confirmations").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? toConfirmationRow(data) : null;
}

export async function confirmationForAllocation(allocationId: string): Promise<AllocationConfirmationRow | null> {
  const { data, error } = await supabase
    .from("allocation_confirmations").select("*")
    .eq("allocation_id", allocationId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toConfirmationRow(data) : null;
}

/**
 * إنشاء مركبات في المخزون من بنود التخصيص (نقطة ميلاد المركبة بـ VIN).
 * تُستدعى عند تأكيد التخصيص. كل بند بلا vehicle_id → صف جديد في inventory_items
 * بحالة on_order (مخصّصة، لم تصل بعد). تُحفظ vehicle_id في البند.
 */
export async function createInventoryFromAllocation(allocationId: string): Promise<{ created: number; skipped: number }> {
  const alloc = await getAllocation(allocationId);
  if (!alloc) throw new Error("التخصيص غير موجود");
  let created = 0, skipped = 0;

  for (const line of alloc.lines) {
    if (line.vehicle_id) { skipped++; continue; }            // مُنشأة مسبقاً
    if (!line.vin) { skipped++; continue; }                  // بلا VIN لا تُنشأ

    // تجنّب التكرار: هل يوجد صف بنفس الـ VIN؟
    const { data: existing } = await supabase
      .from("inventory_items").select("id").eq("vin", line.vin).maybeSingle();
    if (existing) {
      await supabase.from("allocation_lines").update({ vehicle_id: existing.id, status: "confirmed" }).eq("id", line.id);
      skipped++; continue;
    }

    const name = [line.manufacturer || line.brand, line.model, line.trim, line.year, line.color]
      .filter(Boolean).join(" ") || ("مركبة " + line.vin);
    const { data: veh, error } = await supabase.from("inventory_items").insert({
      sku: line.vin,                  // الـ VIN معرّف فريد طبيعي
      name,
      item_type: "vehicle",
      brand: line.brand || line.manufacturer || null,
      model: line.model || null,
      trim: line.trim || null,
      year: line.year || null,
      color: line.color || null,
      vin: line.vin,
      engine_no: line.engine_no || null,
      cost_price: line.unit_cost || 0,
      avg_cost: line.unit_cost || 0,
      sale_price: 0,
      qty_on_hand: 1,
      qty_reserved: 0,
      status: "on_order",             // مخصّصة، لم تصل بعد
    }).select("id").single();
    if (error) throw error;

    await supabase.from("allocation_lines").update({ vehicle_id: veh.id, status: "confirmed" }).eq("id", line.id);
    created++;
  }
  return { created, skipped };
}

export async function createConfirmation(allocationId: string, notes?: string): Promise<AllocationConfirmationRow> {
  const alloc = await getAllocation(allocationId);
  if (!alloc) throw new Error("التخصيص غير موجود");
  if (alloc.header.status === "draft") throw new Error("يجب تأكيد التخصيص أولاً");

  const existing = await confirmationForAllocation(allocationId);
  if (existing) throw new Error("سبق إصدار وثيقة تأكيد لهذا التخصيص");

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const vin_list = alloc.lines.map(l => l.vin);
  const { data, error } = await supabase
    .from("allocation_confirmations")
    .insert({
      conf_no: "",
      allocation_id: allocationId,
      supplier_id: alloc.header.supplier_id,
      po_id: alloc.header.po_id,
      allocation_date: new Date().toISOString().slice(0, 10),
      vehicle_count: alloc.lines.length,
      vin_list,
      notes: notes ?? null,
      created_by: uid,
    })
    .select("*").single();
  if (error) throw error;

  // ★ نقطة ميلاد المركبات: إنشاؤها في المخزون من بنود التخصيص (حالة on_order)
  await createInventoryFromAllocation(allocationId);

  return toConfirmationRow(data);
}

function toConfirmationRow(row: Record<string, unknown>): AllocationConfirmationRow {
  return {
    ...(row as Omit<AllocationConfirmationRow, "vin_list">),
    vin_list: Array.isArray(row.vin_list) ? (row.vin_list as string[]) : [],
  };
}

export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";