import type { EffectiveStatus, ProcurementState } from "@/lib/vehicleMeta";

export const VEHICLE_STATUS_LABEL: Record<EffectiveStatus, string> = {
  // procurement / intake
  requested:          "طلب شراء",
  ordered:            "تم الطلب",
  in_transit:         "في الطريق",
  received:           "تم الاستلام",
  inspection_pending: "بانتظار الفحص",
  approved:           "معتمد للإدخال",
  rejected:           "مرفوض",
  // inventory
  available:          "متوفر",
  reserved:           "محجوز",
  sold:               "مُباع",
  ready_for_delivery: "جاهز للتسليم",
  delivered:          "مُسلَّم",
  maintenance:        "صيانة",
  transit:            "ترانزيت",
  returned:           "مرتجع",
};

export const VEHICLE_STATUS_CLASS: Record<EffectiveStatus, string> = {
  // procurement / intake — soft, distinct tones
  requested:          "border border-muted-foreground/40 text-muted-foreground bg-muted/40",
  ordered:            "border border-primary/40 text-primary bg-primary/10",
  in_transit:         "border border-primary/40 text-primary bg-primary/10",
  received:           "border border-warning/40 text-warning bg-warning/10",
  inspection_pending: "border border-warning/50 text-warning bg-warning/10",
  approved:           "border border-success/40 text-success bg-success/10",
  rejected:           "border border-destructive/40 text-destructive bg-destructive/10",
  // inventory
  available:          "bg-success text-success-foreground",
  reserved:           "bg-secondary text-secondary-foreground",
  sold:               "bg-primary text-primary-foreground",
  ready_for_delivery: "border border-primary/40 text-primary bg-primary/10",
  delivered:          "border border-success/40 text-success bg-success/10",
  maintenance:        "border border-warning/40 text-warning bg-warning/10",
  transit:            "border border-primary/40 text-primary bg-primary/10",
  returned:           "border border-destructive/40 text-destructive bg-destructive/10",
};

export const VEHICLE_STATUS_OPTIONS: EffectiveStatus[] = [
  "requested", "ordered", "in_transit", "received", "inspection_pending", "approved", "rejected",
  "available", "reserved", "sold", "ready_for_delivery", "delivered", "maintenance", "transit", "returned",
];

/** Statuses persisted directly in the vehicle_status enum today. */
export const PERSISTED_STATUSES = ["available", "reserved", "sold"] as const;
export type PersistedStatus = (typeof PERSISTED_STATUSES)[number];

/** Inventory virtual statuses (post-intake). */
export const OVERLAY_STATUSES: EffectiveStatus[] = [
  "ready_for_delivery", "delivered", "maintenance", "transit", "returned",
];

export const PROCUREMENT_STATE_LABEL: Record<Exclude<ProcurementState, "">, string> = {
  requested:          "طلب شراء",
  ordered:            "تم الطلب",
  in_transit:         "في الطريق",
  received:           "تم الاستلام",
  inspection_pending: "بانتظار الفحص",
  approved:           "معتمد",
  rejected:           "مرفوض",
};

export const PROCUREMENT_FLOW: Exclude<ProcurementState, "">[] = [
  "requested", "ordered", "in_transit", "received", "inspection_pending", "approved",
];
