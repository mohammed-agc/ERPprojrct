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

export type ReceivingMethod = "rep_pickup" | "supplier_delivery";

export const RECV_METHOD_LABEL: Record<ReceivingMethod, string> = {
  rep_pickup: "استلام بواسطة مندوب الشركة",
  supplier_delivery: "تسليم من المورد إلى المستودع",
};

export interface AllocationRow {
  id: string;
  alloc_no: string;
  po_id: string;
  supplier_id: string;
  status: AllocationStatus;
  notes: string | null;
  purchase_invoice_id: string | null;
  target_warehouse: string | null;
  receiving_method: ReceivingMethod | null;
  receiver_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeOption { id: string; full_name: string; }

export async function listEmployees(): Promise<EmployeeOption[]> {
  const { data, error } = await supabase
    .from("profiles").select("id, full_name").order("full_name");
  if (error) throw error;
  return (data ?? []) as EmployeeOption[];
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
  target_warehouse?: string | null;
  receiving_method?: ReceivingMethod | null;
  receiver_id?: string | null;
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
      target_warehouse: input.target_warehouse ?? null,
      receiving_method: input.receiving_method ?? null,
      receiver_id: input.receiver_id ?? null,
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

export async function updateAllocationReceiving(id: string, patch: {
  target_warehouse?: string | null;
  receiving_method?: ReceivingMethod | null;
  receiver_id?: string | null;
}): Promise<AllocationRow> {
  const { data, error } = await supabase
    .from("allocations").update(patch).eq("id", id).select("*").single();
  if (error) throw error;
  return data as AllocationRow;
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

// ============ Stage 2: invoice-from-allocation (DB-authoritative) ============

export interface InvoiceableAllocationSummary {
  id: string;
  alloc_no: string;
  supplier_id: string;
  po_id: string;
  line_count: number;
  subtotal: number;
}

export async function listInvoiceableAllocations(): Promise<InvoiceableAllocationSummary[]> {
  const { data: allocs, error } = await supabase
    .from("allocations")
    .select("id, alloc_no, supplier_id, po_id, status, purchase_invoice_id")
    .eq("status", "confirmed")
    .is("purchase_invoice_id", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const ids = (allocs ?? []).map((a: { id: string }) => a.id);
  if (!ids.length) return [];
  const { data: lines, error: e2 } = await supabase
    .from("allocation_lines")
    .select("allocation_id, unit_cost, status")
    .in("allocation_id", ids);
  if (e2) throw e2;
  const agg = new Map<string, { count: number; subtotal: number }>();
  for (const l of (lines ?? []) as { allocation_id: string; unit_cost: number; status: AllocationLineStatus }[]) {
    if (l.status === "cancelled") continue;
    const cur = agg.get(l.allocation_id) ?? { count: 0, subtotal: 0 };
    cur.count += 1;
    cur.subtotal += Number(l.unit_cost) || 0;
    agg.set(l.allocation_id, cur);
  }
  return (allocs ?? []).map((a: { id: string; alloc_no: string; supplier_id: string; po_id: string }) => ({
    id: a.id,
    alloc_no: a.alloc_no,
    supplier_id: a.supplier_id,
    po_id: a.po_id,
    line_count: agg.get(a.id)?.count ?? 0,
    subtotal: agg.get(a.id)?.subtotal ?? 0,
  })).filter(r => r.line_count > 0);
}

export async function createPurchaseInvoiceFromAllocation(input: {
  allocation_id: string;
  vat_pct?: number;
  notes?: string | null;
  supplier_invoice_ref?: string | null;
}): Promise<{ id: string; invoice_no: string }> {
  const alloc = await getAllocation(input.allocation_id);
  if (!alloc) throw new Error("التخصيص غير موجود");
  if (alloc.header.status !== "confirmed") throw new Error("التخصيص ليس بحالة مؤكَّد");
  if (alloc.header.purchase_invoice_id) throw new Error("التخصيص مرتبط بفاتورة مسبقاً");

  const activeLines = alloc.lines.filter(l => l.status !== "cancelled");
  if (!activeLines.length) throw new Error("لا توجد بنود فعّالة في التخصيص");

  // Governance: every allocation line MUST be linked to a vehicle (post-inspection)
  // before a purchase invoice can be issued. This prevents orphan PIs that have
  // no inventory provenance and cannot be posted to GL.
  const missingVehicle = activeLines.filter(l => !l.vehicle_id);
  if (missingVehicle.length > 0) {
    throw new Error("لا يمكن إنشاء فاتورة شراء قبل استلام المركبة واعتماد الفحص");
  }

  const vatPct = Number(input.vat_pct ?? 15);
  const subtotal = activeLines.reduce((s, l) => s + (Number(l.unit_cost) || 0), 0);
  const vatAmount = +(subtotal * vatPct / 100).toFixed(2);
  const total = +(subtotal + vatAmount).toFixed(2);

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data: inv, error: e1 } = await supabase
    .from("purchase_invoices")
    .insert({
      invoice_no: "",
      supplier_id: alloc.header.supplier_id,
      supplier_invoice_ref: input.supplier_invoice_ref ?? null,
      invoice_date: new Date().toISOString().slice(0, 10),
      status: "draft",
      subtotal,
      vat_amount: vatAmount,
      total,
      notes: input.notes ?? `فاتورة شراء من التخصيص ${alloc.header.alloc_no}`,
      created_by: uid,
    })
    .select("id, invoice_no").single();
  if (e1) throw e1;

  const linesPayload = activeLines.map((l, i) => ({
    invoice_id: inv.id,
    line_no: i + 1,
    description: `${l.brand} ${l.model}${l.year ? " " + l.year : ""} — VIN ${l.vin}`,
    vehicle_id: l.vehicle_id,
    quantity: 1,
    unit_cost: Number(l.unit_cost) || 0,
    vat_pct: vatPct,
    line_total: Number(l.unit_cost) || 0,
  }));
  const { error: e2 } = await supabase.from("purchase_invoice_lines").insert(linesPayload);
  if (e2) throw e2;

  const { error: e3 } = await supabase
    .from("allocations")
    .update({ purchase_invoice_id: inv.id, status: "invoiced" as AllocationStatus })
    .eq("id", input.allocation_id);
  if (e3) throw e3;

  // Auto-post to GL (Inventory / Input-VAT / AP journal + vehicle landed cost).
  // Mirrors Sales Invoice behavior: PI issuance = GL recognition.
  const { error: e4 } = await supabase.rpc("post_purchase_invoice_journal", {
    p_invoice_id: inv.id,
  });
  if (e4) throw new Error(`تم إنشاء الفاتورة ${inv.invoice_no} لكن تعذّر ترحيلها محاسبياً: ${e4.message}`);

  return { id: inv.id, invoice_no: inv.invoice_no };
}

// ============ Stage 3: hide already-allocated PO lines ============

export async function listActiveAllocatedPoLineIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("allocation_lines")
    .select("po_line_id, status, allocations!inner(status)")
    .not("po_line_id", "is", null)
    .neq("status", "cancelled")
    .neq("allocations.status", "cancelled");
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data ?? []) as { po_line_id: string }[]) {
    if (r.po_line_id) set.add(r.po_line_id);
  }
  return set;
}
