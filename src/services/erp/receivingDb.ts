// Phase 13c — Authoritative Supabase-backed GRN + Inspection service.
import { supabase } from "@/integrations/supabase/client";

export type GrnStatus = "draft" | "received" | "inspected" | "closed" | "cancelled";
export type GrnLineCondition = "ok" | "damaged" | "missing" | "wrong_item";
export type InspectionStatus = "pending" | "in_progress" | "approved" | "rejected" | "cancelled";
export type InspectionResult = "pending" | "passed" | "rejected";

export const GRN_LABEL: Record<GrnStatus, string> = {
  draft: "مسودة", received: "مستلم", inspected: "مفحوص", closed: "مغلق", cancelled: "ملغي",
};
export const GRN_TONE: Record<GrnStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  received: "bg-primary/10 text-primary border border-primary/30",
  inspected: "bg-info/10 text-info border border-info/30",
  closed: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export const INS_LABEL: Record<InspectionStatus, string> = {
  pending: "بانتظار", in_progress: "قيد الفحص", approved: "معتمد", rejected: "مرفوض", cancelled: "ملغي",
};
export const INS_TONE: Record<InspectionStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-warning/10 text-warning border border-warning/30",
  approved: "bg-success/10 text-success border border-success/30",
  rejected: "bg-destructive/10 text-destructive border border-destructive/30",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export const INS_RESULT_LABEL: Record<InspectionResult, string> = {
  pending: "بانتظار", passed: "ناجح", rejected: "مرفوض",
};
export const INS_RESULT_TONE: Record<InspectionResult, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  passed: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
};

export interface GrnRow {
  id: string;
  grn_no: string;
  shipment_id: string;
  allocation_id: string;
  po_id: string;
  supplier_id: string;
  received_at: string;
  warehouse: string | null;
  receiver_id: string | null;
  status: GrnStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GrnLineRow {
  id: string;
  grn_id: string;
  allocation_line_id: string | null;
  line_no: number;
  vin: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  engine_no: string | null;
  unit_cost: number;
  condition: GrnLineCondition;
  notes: string | null;
}

export interface InspectionRow {
  id: string;
  insp_no: string;
  grn_id: string;
  inspector_id: string | null;
  status: InspectionStatus;
  started_at: string;
  completed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionLineRow {
  id: string;
  inspection_id: string;
  grn_line_id: string;
  line_no: number;
  vin: string;
  result: InspectionResult;
  condition: string | null;
  remarks: string | null;
  vehicle_id: string | null;
}

// ============ GRN ============
export async function listGRNs(): Promise<GrnRow[]> {
  const { data, error } = await supabase
    .from("goods_receipts").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as GrnRow[];
}

export async function getGRN(id: string): Promise<{ header: GrnRow; lines: GrnLineRow[] } | null> {
  const { data: h, error: e1 } = await supabase
    .from("goods_receipts").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!h) return null;
  const { data: lines, error: e2 } = await supabase
    .from("goods_receipt_lines").select("*").eq("grn_id", id).order("line_no");
  if (e2) throw e2;
  return { header: h as GrnRow, lines: (lines ?? []) as GrnLineRow[] };
}

export async function createGRNFromShipment(input: {
  shipment_id: string;
  warehouse?: string;
  notes?: string;
  line_ids?: string[]; // allocation_line ids to include; defaults to all
}): Promise<GrnRow> {
  // Resolve shipment chain
  const { data: shp, error: eShp } = await supabase
    .from("shipments").select("id, po_id, allocation_id").eq("id", input.shipment_id).single();
  if (eShp) throw eShp;
  if (!shp.allocation_id) throw new Error("الشحنة بدون تخصيص — لا يمكن إنشاء مذكرة استلام");

  // Load allocation header (supplier) + lines
  const { data: alloc, error: eA } = await supabase
    .from("allocations").select("id, supplier_id").eq("id", shp.allocation_id).single();
  if (eA) throw eA;

  const { data: aLines, error: eAL } = await supabase
    .from("allocation_lines").select("*").eq("allocation_id", shp.allocation_id).order("line_no");
  if (eAL) throw eAL;

  const wanted = input.line_ids?.length
    ? (aLines ?? []).filter(l => input.line_ids!.includes(l.id))
    : (aLines ?? []);
  if (wanted.length === 0) throw new Error("لا توجد بنود مخصصة لاستلامها");

  // Skip lines already received (have allocation_lines.status='stocked' or already in a GRN)
  const { data: existing } = await supabase
    .from("goods_receipt_lines")
    .select("allocation_line_id")
    .in("allocation_line_id", wanted.map(w => w.id));
  const already = new Set((existing ?? []).map(r => r.allocation_line_id));
  const fresh = wanted.filter(w => !already.has(w.id));
  if (fresh.length === 0) throw new Error("جميع البنود المحددة تم استلامها مسبقاً");

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data: header, error: eH } = await supabase
    .from("goods_receipts")
    .insert({
      grn_no: "",
      shipment_id: shp.id,
      allocation_id: shp.allocation_id,
      po_id: shp.po_id,
      supplier_id: alloc.supplier_id,
      warehouse: input.warehouse ?? null,
      notes: input.notes ?? null,
      status: "received" as GrnStatus,
      created_by: uid,
    })
    .select("*").single();
  if (eH) throw eH;

  const payload = fresh.map((l, i) => ({
    grn_id: header.id,
    allocation_line_id: l.id,
    line_no: i + 1,
    vin: l.vin,
    brand: l.brand,
    model: l.model,
    year: l.year,
    color: l.color,
    engine_no: l.engine_no,
    unit_cost: l.unit_cost,
    condition: "ok" as GrnLineCondition,
  }));
  const { error: eL } = await supabase.from("goods_receipt_lines").insert(payload);
  if (eL) throw eL;

  // mark allocation_lines received
  await supabase.from("allocation_lines")
    .update({ status: "received" })
    .in("id", fresh.map(f => f.id));

  await supabase.from("receiving_events").insert({
    event_type: "grn_created", grn_id: header.id, user_id: uid,
    payload: { lines: fresh.length, shipment_id: shp.id },
  });

  return header as GrnRow;
}

export async function setGRNStatus(id: string, status: GrnStatus): Promise<GrnRow> {
  const { data, error } = await supabase
    .from("goods_receipts").update({ status }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as GrnRow;
}

// ============ Inspection ============
export async function listInspections(): Promise<InspectionRow[]> {
  const { data, error } = await supabase
    .from("inspections").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as InspectionRow[];
}

export async function getInspection(
  id: string,
): Promise<{ header: InspectionRow; lines: InspectionLineRow[] } | null> {
  const { data: h, error: e1 } = await supabase
    .from("inspections").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!h) return null;
  const { data: lines, error: e2 } = await supabase
    .from("inspection_lines").select("*").eq("inspection_id", id).order("line_no");
  if (e2) throw e2;
  return { header: h as InspectionRow, lines: (lines ?? []) as InspectionLineRow[] };
}

export async function inspectionForGRN(grnId: string): Promise<InspectionRow | null> {
  const { data, error } = await supabase
    .from("inspections").select("*").eq("grn_id", grnId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as InspectionRow | null) ?? null;
}

export async function createInspectionFromGRN(grnId: string, notes?: string): Promise<InspectionRow> {
  const existing = await inspectionForGRN(grnId);
  if (existing) throw new Error("سبق إنشاء فحص لهذه المذكرة");
  const grn = await getGRN(grnId);
  if (!grn) throw new Error("مذكرة الاستلام غير موجودة");

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data: header, error: eH } = await supabase
    .from("inspections")
    .insert({
      insp_no: "",
      grn_id: grnId,
      status: "in_progress" as InspectionStatus,
      inspector_id: uid,
      created_by: uid,
    })
    .select("*").single();
  if (eH) throw eH;

  const payload = grn.lines.map((l, i) => ({
    inspection_id: header.id,
    grn_line_id: l.id,
    line_no: i + 1,
    vin: l.vin,
    result: "pending" as InspectionResult,
    condition: l.condition,
  }));
  const { error: eL } = await supabase.from("inspection_lines").insert(payload);
  if (eL) throw eL;

  await supabase.from("receiving_events").insert({
    event_type: "inspection_started", grn_id: grnId, inspection_id: header.id, user_id: uid,
  });

  return header as InspectionRow;
}

export async function setInspectionLineResult(
  lineId: string, result: InspectionResult, remarks?: string,
): Promise<void> {
  const { error } = await supabase
    .from("inspection_lines")
    .update({ result, remarks: remarks ?? null })
    .eq("id", lineId);
  if (error) throw error;
}

export async function bulkPassInspection(inspectionId: string): Promise<void> {
  const { error } = await supabase
    .from("inspection_lines")
    .update({ result: "passed" as InspectionResult })
    .eq("inspection_id", inspectionId)
    .eq("result", "pending");
  if (error) throw error;
}

export async function approveInspection(inspectionId: string): Promise<number> {
  const { data, error } = await supabase.rpc("approve_inspection", { p_inspection_id: inspectionId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function rejectInspection(inspectionId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc("reject_inspection", {
    p_inspection_id: inspectionId, p_reason: reason ?? null,
  });
  if (error) throw error;
}

export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";
