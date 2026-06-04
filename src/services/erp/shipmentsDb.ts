// Phase 13b — Authoritative Supabase-backed shipments service.
import { supabase } from "@/integrations/supabase/client";

export type ShipmentStatus =
  | "preparing" | "shipped" | "in_transit" | "at_customs" | "cleared" | "arrived" | "cancelled";
export type CustomsStatus = "not_started" | "in_progress" | "cleared";

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  preparing: "قيد التجهيز",
  shipped: "شُحنت",
  in_transit: "في الطريق",
  at_customs: "في الجمارك",
  cleared: "مخلَّصة",
  arrived: "وصلت",
  cancelled: "ملغية",
};
export const SHIPMENT_TONE: Record<ShipmentStatus, string> = {
  preparing: "bg-muted text-muted-foreground",
  shipped: "bg-primary/10 text-primary border border-primary/30",
  in_transit: "bg-warning/10 text-warning border border-warning/30",
  at_customs: "bg-info/10 text-info border border-info/30",
  cleared: "bg-info/10 text-info border border-info/30",
  arrived: "bg-success/10 text-success border border-success/30",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/30",
};

export const CUSTOMS_LABEL: Record<CustomsStatus, string> = {
  not_started: "لم تبدأ",
  in_progress: "قيد التخليص",
  cleared: "تم التخليص",
};
export const CUSTOMS_TONE: Record<CustomsStatus, string> = {
  not_started: "bg-muted text-muted-foreground border border-border",
  in_progress: "bg-warning/10 text-warning border border-warning/40",
  cleared: "bg-success/10 text-success border border-success/40",
};

export interface ShipmentRow {
  id: string;
  shipment_no: string;
  po_id: string;
  allocation_id: string | null;
  carrier: string;
  reference: string | null;
  origin: string | null;
  destination: string | null;
  eta: string | null;
  status: ShipmentStatus;
  customs_status: CustomsStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function listShipments(): Promise<ShipmentRow[]> {
  const { data, error } = await supabase
    .from("shipments").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ShipmentRow[];
}

export async function getShipment(id: string): Promise<ShipmentRow | null> {
  const { data, error } = await supabase
    .from("shipments").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as ShipmentRow | null;
}

export async function createShipment(input: {
  po_id: string;
  allocation_id?: string | null;
  carrier: string;
  reference?: string;
  origin?: string;
  destination?: string;
  eta?: string;
  notes?: string;
}): Promise<ShipmentRow> {
  if (!input.po_id) throw new Error("أمر الشراء مطلوب");
  if (!input.carrier.trim()) throw new Error("الناقل مطلوب");
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  const { data, error } = await supabase
    .from("shipments")
    .insert({
      shipment_no: "",
      po_id: input.po_id,
      allocation_id: input.allocation_id ?? null,
      carrier: input.carrier.trim(),
      reference: input.reference ?? null,
      origin: input.origin ?? null,
      destination: input.destination ?? null,
      eta: input.eta ?? null,
      notes: input.notes ?? null,
      status: "preparing" as ShipmentStatus,
      customs_status: "not_started" as CustomsStatus,
      created_by: uid,
    })
    .select("*").single();
  if (error) throw error;
  return data as ShipmentRow;
}

export async function setShipmentStatus(id: string, status: ShipmentStatus): Promise<ShipmentRow> {
  const { data, error } = await supabase
    .from("shipments").update({ status }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ShipmentRow;
}

export async function setCustomsStatus(id: string, customs_status: CustomsStatus): Promise<ShipmentRow> {
  const { data, error } = await supabase
    .from("shipments").update({ customs_status }).eq("id", id).select("*").single();
  if (error) throw error;
  return data as ShipmentRow;
}

export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";
