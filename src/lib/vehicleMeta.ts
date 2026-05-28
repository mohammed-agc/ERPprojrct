/**
 * Vehicle extended metadata helper.
 *
 * Backend `vehicles` table has only `notes` (text). To deliver the ERP
 * frontend UX contract without schema changes we encode extended
 * master-data, reservation tracking and media references as a JSON
 * envelope inside `notes`:
 *
 *   ###VMETA###{...json...}
 *   (optional free-form text on following lines)
 *
 * When the backend later promotes these fields to real columns, swap this
 * helper without touching UI.
 */

export type VehicleMeta = {
  // master data
  chassis?: string;
  engine?: string;
  trim?: string;
  transmission?: "automatic" | "manual" | "cvt" | "";
  fuel_type?: "petrol" | "diesel" | "hybrid" | "electric" | "";
  branch?: string;
  supplier?: string;
  purchase_source?: string;

  // ERP virtual status overlay
  // Extends DB enum with: ready_for_delivery / delivered / maintenance / transit / returned
  status_overlay?: "ready_for_delivery" | "delivered" | "maintenance" | "transit" | "returned" | "";
  status_overlay_at?: string;
  status_overlay_by?: string;
  status_overlay_note?: string;

  // reservation overlay (UX contract — backend engine will own this later)
  reservation?: {
    reserved_by?: string;       // user/sales person display name
    customer_name?: string;
    customer_id?: string;
    sales_order_no?: string;
    sales_order_id?: string;
    expires_at?: string;        // ISO date
    note?: string;
    created_at?: string;
  };

  // delivery workflow (UX contract for delivery & ownership)
  delivery?: {
    ready_at?: string;
    ready_by?: string;
    officer?: string;              // assigned delivery officer
    invoice_no?: string;
    payment_verified?: boolean;
    checklist?: {
      payment?: boolean;
      id?: boolean;
      insurance?: boolean;
      registration?: boolean;
      accessories?: boolean;
      spare_key?: boolean;
      inspection?: boolean;
    };
    customer_name?: string;
    customer_id_number?: string;
    customer_signature_name?: string;  // typed signature placeholder
    delivered_at?: string;
    delivered_by?: string;
    note?: string;
  };

  // ownership transfer history
  ownership?: {
    current_owner?: string;
    previous_owner?: string;
    transferred_at?: string;
    customer_id?: string;
  };

  // media
  photos?: string[];            // public URLs in vehicle-media bucket
  documents?: { name: string; url: string; size?: number; type?: string; kind?: "delivery_form" | "id_copy" | "insurance" | "registration" | "other" }[];

  note?: string;
};

const MARKER = "###VMETA###";

export function parseVehicleMeta(notes: string | null | undefined): VehicleMeta {
  if (!notes) return {};
  if (!notes.startsWith(MARKER)) return { note: notes };
  try {
    const rest = notes.slice(MARKER.length);
    const nl = rest.indexOf("\n");
    const jsonPart = nl >= 0 ? rest.slice(0, nl) : rest;
    const trailing = nl >= 0 ? rest.slice(nl + 1).trim() : "";
    const parsed = JSON.parse(jsonPart) as VehicleMeta;
    if (trailing && !parsed.note) parsed.note = trailing;
    return parsed;
  } catch {
    return { note: notes };
  }
}

export function serializeVehicleMeta(meta: VehicleMeta): string {
  const clean: VehicleMeta = {};
  (Object.keys(meta) as (keyof VehicleMeta)[]).forEach((k) => {
    const v = meta[k] as any;
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v) && v.length === 0) return;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0) return;
    (clean as any)[k] = v;
  });
  if (Object.keys(clean).length === 0) return "";
  return MARKER + JSON.stringify(clean);
}

/** Effective ERP status: overlay wins if set, otherwise DB status. */
export type EffectiveStatus =
  | "available" | "reserved" | "sold"
  | "ready_for_delivery" | "delivered" | "maintenance" | "transit" | "returned";

export function effectiveStatus(dbStatus: string, meta: VehicleMeta): EffectiveStatus {
  if (meta.status_overlay) return meta.status_overlay;
  return (dbStatus as EffectiveStatus) ?? "available";
}

/** Reservation expiry helpers. */
export function reservationDaysLeft(meta: VehicleMeta): number | null {
  const exp = meta.reservation?.expires_at;
  if (!exp) return null;
  const ms = new Date(exp).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Delivery checklist completion (0..1). */
export const DELIVERY_CHECKLIST_KEYS = [
  "payment", "id", "insurance", "registration", "accessories", "spare_key", "inspection",
] as const;
export type DeliveryChecklistKey = (typeof DELIVERY_CHECKLIST_KEYS)[number];

export function deliveryProgress(meta: VehicleMeta): { done: number; total: number; pct: number } {
  const cl = meta.delivery?.checklist ?? {};
  const total = DELIVERY_CHECKLIST_KEYS.length;
  const done = DELIVERY_CHECKLIST_KEYS.filter((k) => cl[k]).length;
  return { done, total, pct: Math.round((done / total) * 100) };
}
