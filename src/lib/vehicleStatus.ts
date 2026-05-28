import type { EffectiveStatus } from "@/lib/vehicleMeta";

export const VEHICLE_STATUS_LABEL: Record<EffectiveStatus, string> = {
  available: "متوفر",
  reserved: "محجوز",
  sold: "مُباع",
  delivered: "مُسلَّم",
  maintenance: "صيانة",
  transit: "ترانزيت",
  returned: "مرتجع",
};

export const VEHICLE_STATUS_CLASS: Record<EffectiveStatus, string> = {
  available:   "bg-success text-success-foreground",
  reserved:    "bg-secondary text-secondary-foreground",
  sold:        "bg-primary text-primary-foreground",
  delivered:   "border border-success/40 text-success bg-success/10",
  maintenance: "border border-warning/40 text-warning bg-warning/10",
  transit:     "border border-primary/40 text-primary bg-primary/10",
  returned:    "border border-destructive/40 text-destructive bg-destructive/10",
};

export const VEHICLE_STATUS_OPTIONS: EffectiveStatus[] = [
  "available", "reserved", "sold", "delivered", "maintenance", "transit", "returned",
];

/** Statuses persisted directly in vehicle_status enum today. */
export const PERSISTED_STATUSES = ["available", "reserved", "sold"] as const;
export type PersistedStatus = (typeof PERSISTED_STATUSES)[number];

/** Statuses delivered via meta.status_overlay until backend ships them. */
export const OVERLAY_STATUSES: EffectiveStatus[] = ["delivered", "maintenance", "transit", "returned"];
