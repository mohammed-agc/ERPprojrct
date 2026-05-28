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

/* Procurement / intake operational contract.
 * Vehicles enter the lifecycle via a procurement request. While the
 * `procurement.state` is anything other than `approved` or empty, the
 * effective status reflects the procurement state and the vehicle is
 * considered "in intake" (not yet sellable). On `approved`, the vehicle
 * becomes part of regular inventory (DB status="available").
 */
export type ProcurementState =
  | "requested"
  | "ordered"
  | "in_transit"
  | "received"
  | "inspection_pending"
  | "approved"
  | "rejected"
  | "";

export type InspectionResult = "passed" | "passed_with_notes" | "rejected" | "";

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
  status_overlay?: "ready_for_delivery" | "delivered" | "maintenance" | "transit" | "returned" | "";
  status_overlay_at?: string;
  status_overlay_by?: string;
  status_overlay_note?: string;

  // ---- Procurement / Intake ----
  procurement?: {
    state?: ProcurementState;
    request_no?: string;
    requested_at?: string;
    requested_by?: string;
    buyer?: string;
    branch_destination?: string;
    source_country?: string;
    expected_arrival?: string;
    estimated_cost?: number;
    target_sale_price?: number;
    note?: string;
    // ordering
    ordered_at?: string;
    ordered_by?: string;
    po_reference?: string;
    // transit
    transit_started_at?: string;
    transit_carrier?: string;
    transit_tracking?: string;
    // receiving
    received_at?: string;
    received_by?: string;
    vin_verified?: boolean;
    chassis_verified?: boolean;
    engine_verified?: boolean;
    received_condition?: "good" | "minor_damage" | "major_damage" | "";
    received_mileage?: number;
    fuel_level?: "empty" | "quarter" | "half" | "three_quarters" | "full" | "";
    accessories?: string;
    keys_count?: number;
    receiving_note?: string;
    // inspection
    inspection_at?: string;
    inspection_by?: string;
    inspection_result?: InspectionResult;
    inspection_items?: {
      body?: "ok" | "notes" | "fail" | "";
      paint?: "ok" | "notes" | "fail" | "";
      engine?: "ok" | "notes" | "fail" | "";
      transmission?: "ok" | "notes" | "fail" | "";
      tires?: "ok" | "notes" | "fail" | "";
      battery?: "ok" | "notes" | "fail" | "";
    };
    accident_detected?: boolean;
    maintenance_recommendations?: string;
    inspection_note?: string;
    // approval
    approved_at?: string;
    approved_by?: string;
    rejection_reason?: string;
    // landed cost components
    cost_purchase?: number;
    cost_shipping?: number;
    cost_customs?: number;
    cost_inspection?: number;
    cost_repair?: number;
    cost_accessories?: number;
  };

  // reservation overlay
  reservation?: {
    reserved_by?: string;
    customer_name?: string;
    customer_id?: string;
    sales_order_no?: string;
    sales_order_id?: string;
    expires_at?: string;
    note?: string;
    created_at?: string;
  };

  // delivery workflow
  delivery?: {
    ready_at?: string;
    ready_by?: string;
    officer?: string;
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
    customer_signature_name?: string;
    delivered_at?: string;
    delivered_by?: string;
    note?: string;
  };

  // ownership
  ownership?: {
    current_owner?: string;
    previous_owner?: string;
    transferred_at?: string;
    customer_id?: string;
  };

  // media
  photos?: string[];
  documents?: { name: string; url: string; size?: number; type?: string; kind?: "delivery_form" | "id_copy" | "insurance" | "registration" | "inspection_report" | "purchase_invoice" | "customs" | "other" }[];

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
