// Phase 13a — Authoritative Supabase-backed Purchase Request / Purchase Order service.
// Replaces the localStorage purchasingService for PR/PO only. Other LS workflows
// (allocation, shipments, GRN, inspection) remain in purchasing.ts until Phase 13b/13c.
import { supabase } from "@/integrations/supabase/client";

export type PRStatus = "draft" | "submitted" | "approved" | "rejected" | "converted" | "cancelled";
export type POStatus = "draft" | "sent" | "acknowledged" | "partially_received" | "received" | "cancelled";

export const PR_STATUS_LABEL: Record<PRStatus, string> = {
  draft: "مسودة",
  submitted: "بانتظار الاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  converted: "محوّل لأمر شراء",
  cancelled: "ملغي",
};
export const PR_STATUS_TONE: Record<PRStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  submitted: "bg-warning/10 text-warning border border-warning/30",
  approved: "bg-success/10 text-success border border-success/30",
  rejected: "bg-destructive/10 text-destructive border border-destructive/30",
  converted: "bg-primary/10 text-primary border border-primary/30",
  cancelled: "bg-muted text-muted-foreground",
};

export const PO_STATUS_LABEL: Record<POStatus, string> = {
  draft: "مسودة",
  sent: "أُرسل للمورد",
  acknowledged: "أكّده المورد",
  partially_received: "مستلم جزئياً",
  received: "مستلم بالكامل",
  cancelled: "ملغي",
};
export const PO_STATUS_TONE: Record<POStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-warning/10 text-warning border border-warning/30",
  acknowledged: "bg-primary/10 text-primary border border-primary/30",
  partially_received: "bg-info/10 text-info border border-info/30",
  received: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-muted text-muted-foreground",
};

export interface PRLineInput {
  brand: string;
  manufacturer?: string | null;
  model: string;
  trim?: string | null;
  year?: number | null;
  color?: string | null;
  quantity: number;
  estimated_unit_cost: number;
  notes?: string | null;
}

export interface POLineInput {
  pr_line_id?: string | null;
  brand: string;
  manufacturer?: string | null;
  model: string;
  trim?: string | null;
  year?: number | null;
  color?: string | null;
  quantity: number;
  unit_cost: number;
  vat_pct?: number;
}

export interface PRRow {
  id: string;
  pr_no: string;
  request_date: string;
  requested_by: string | null;
  requester_name: string | null;
  branch: string | null;
  urgency: string;
  suggested_supplier_id: string | null;
  department_code: string;
  status: PRStatus;
  notes: string | null;
  total_estimated: number;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PRLineRow {
  id: string;
  pr_id: string;
  line_no: number;
  brand: string;
  manufacturer: string | null;
  model: string;
  trim: string | null;
  year: number | null;
  color: string | null;
  quantity: number;
  estimated_unit_cost: number;
  notes: string | null;
}

export interface PORow {
  id: string;
  po_no: string;
  pr_id: string | null;
  supplier_id: string;
  order_date: string;
  expected_delivery: string | null;
  status: POStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  notes: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface POLineRow {
  id: string;
  po_id: string;
  pr_line_id: string | null;
  line_no: number;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  quantity: number;
  unit_cost: number;
  vat_pct: number;
  line_total: number;
}

function sumPR(lines: PRLineInput[]): number {
  return lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.estimated_unit_cost) || 0), 0);
}

function sumPO(lines: POLineInput[]) {
  const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
  const vat_amount = lines.reduce((s, l) => {
    const lineSub = (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0);
    return s + lineSub * ((l.vat_pct ?? 15) / 100);
  }, 0);
  return { subtotal, vat_amount, total: subtotal + vat_amount };
}

// ============= PURCHASE REQUESTS =============

export async function listPurchaseRequests(): Promise<PRRow[]> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PRRow[];
}

export async function getPurchaseRequest(id: string): Promise<{ header: PRRow; lines: PRLineRow[] } | null> {
  const { data: header, error: e1 } = await supabase
    .from("purchase_requests").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!header) return null;
  const { data: lines, error: e2 } = await supabase
    .from("purchase_request_lines").select("*").eq("pr_id", id).order("line_no");
  if (e2) throw e2;
  return { header: header as PRRow, lines: (lines ?? []) as PRLineRow[] };
}

export async function createPurchaseRequest(input: {
  notes?: string;
  department_code?: string;
  lines: PRLineInput[];
  submit?: boolean;
}): Promise<PRRow> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const total_estimated = sumPR(input.lines);

  const { data: header, error: e1 } = await supabase
    .from("purchase_requests")
    .insert({
      pr_no: "",
      requested_by: uid,
      created_by: uid,
      department_code: (input.department_code ?? "vehicles") as any,
      status: (input.submit ? "submitted" : "draft") as any,
      notes: input.notes ?? null,
      total_estimated,
    })
    .select("*")
    .single();
  if (e1) throw e1;

  if (input.lines.length) {
    const linesPayload = input.lines.map((l, i) => ({
      pr_id: header.id,
      line_no: i + 1,
      brand: l.brand,
      model: l.model,
      year: l.year ?? null,
      color: l.color ?? null,
      quantity: l.quantity,
      estimated_unit_cost: l.estimated_unit_cost,
      notes: l.notes ?? null,
    }));
    const { error: e2 } = await supabase.from("purchase_request_lines").insert(linesPayload);
    if (e2) throw e2;
  }
  return header as PRRow;
}

export async function setPurchaseRequestStatus(id: string, status: PRStatus, rejectedReason?: string): Promise<PRRow> {
  const patch: {
    status: PRStatus;
    approved_by?: string | null;
    approved_at?: string;
    rejected_reason?: string;
  } = { status };
  if (status === "approved") {
    const { data: auth } = await supabase.auth.getUser();
    patch.approved_by = auth.user?.id ?? null;
    patch.approved_at = new Date().toISOString();
  }
  if (status === "rejected" && rejectedReason) patch.rejected_reason = rejectedReason;
  const { data, error } = await supabase
    .from("purchase_requests").update(patch as any).eq("id", id).select("*").single();
  if (error) throw error;
  return data as PRRow;
}

// ============= PURCHASE ORDERS =============

export async function listPurchaseOrders(): Promise<PORow[]> {
  const { data, error } = await supabase
    .from("purchase_orders").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PORow[];
}

export async function getPurchaseOrder(id: string): Promise<{ header: PORow; lines: POLineRow[] } | null> {
  const { data: header, error: e1 } = await supabase
    .from("purchase_orders").select("*").eq("id", id).maybeSingle();
  if (e1) throw e1;
  if (!header) return null;
  const { data: lines, error: e2 } = await supabase
    .from("purchase_order_lines").select("*").eq("po_id", id).order("line_no");
  if (e2) throw e2;
  return { header: header as PORow, lines: (lines ?? []) as POLineRow[] };
}

export async function createPurchaseOrder(input: {
  supplier_id: string;
  pr_id?: string | null;
  expected_delivery?: string | null;
  notes?: string;
  lines: POLineInput[];
}): Promise<PORow> {
  if (!input.supplier_id) throw new Error("المورد مطلوب");
  if (!input.lines.length) throw new Error("يجب إضافة بند واحد على الأقل");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;
  const totals = sumPO(input.lines);

  const { data: header, error: e1 } = await supabase
    .from("purchase_orders")
    .insert({
      po_no: "",
      pr_id: input.pr_id ?? null,
      supplier_id: input.supplier_id,
      expected_delivery: input.expected_delivery ?? null,
      notes: input.notes ?? null,
      status: "draft" as any,
      subtotal: totals.subtotal,
      vat_amount: totals.vat_amount,
      total: totals.total,
      created_by: uid,
    })
    .select("*")
    .single();
  if (e1) throw e1;

  const linesPayload = input.lines.map((l, i) => ({
    po_id: header.id,
    pr_line_id: l.pr_line_id ?? null,
    line_no: i + 1,
    brand: l.brand,
    model: l.model,
    year: l.year ?? null,
    color: l.color ?? null,
    quantity: l.quantity,
    unit_cost: l.unit_cost,
    vat_pct: l.vat_pct ?? 15,
    line_total: (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0) * (1 + (l.vat_pct ?? 15) / 100),
  }));
  const { error: e2 } = await supabase.from("purchase_order_lines").insert(linesPayload);
  if (e2) throw e2;
  return header as PORow;
}

export async function setPurchaseOrderStatus(id: string, status: POStatus): Promise<PORow> {
  const patch: { status: POStatus; acknowledged_by?: string | null; acknowledged_at?: string } = { status };
  if (status === "acknowledged") {
    const { data: auth } = await supabase.auth.getUser();
    patch.acknowledged_by = auth.user?.id ?? null;
    patch.acknowledged_at = new Date().toISOString();
  }
  const { data, error } = await supabase
    .from("purchase_orders").update(patch as any).eq("id", id).select("*").single();
  if (error) throw error;
  return data as PORow;
}

// Convert an APPROVED PR into a draft PO. Moves PR to 'converted'.
export async function convertPRtoPO(pr_id: string, supplier_id: string, expected_delivery?: string | null): Promise<PORow> {
  const pr = await getPurchaseRequest(pr_id);
  if (!pr) throw new Error("طلب الشراء غير موجود");
  if (pr.header.status !== "approved") throw new Error("يجب اعتماد الطلب قبل التحويل لأمر شراء");
  if (!pr.lines.length) throw new Error("لا يوجد بنود في الطلب");

  const po = await createPurchaseOrder({
    supplier_id,
    pr_id,
    expected_delivery,
    notes: pr.header.notes ?? undefined,
    lines: pr.lines.map(l => ({
      pr_line_id: l.id,
      brand: l.brand,
      model: l.model,
      year: l.year,
      color: l.color,
      quantity: Number(l.quantity),
      unit_cost: Number(l.estimated_unit_cost),
      vat_pct: 15,
    })),
  });
  await setPurchaseRequestStatus(pr_id, "converted");
  return po;
}

// ============= SUPPLIERS (read-through) =============
export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
}
export async function listActiveSuppliers(): Promise<SupplierRow[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,code,name,vat_number,phone,email,is_active")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return (data ?? []) as SupplierRow[];
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";
