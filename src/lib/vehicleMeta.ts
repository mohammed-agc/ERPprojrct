/**
 * Vehicle extended metadata helper.
 *
 * The backend `vehicles` table currently has only a `notes` text column for
 * extra data. To deliver the ERP frontend UX contract without changing the
 * backend schema, we encode the extended master-data fields (chassis, engine,
 * trim, transmission, fuel type, branch, supplier, photos, free notes) as a
 * JSON envelope inside `notes`.
 *
 * Envelope shape:
 *   ###VMETA###{"chassis":"...", ...}
 * followed optionally by free-form notes on subsequent lines.
 *
 * When the backend later promotes these to real columns, this helper can be
 * swapped without touching UI components.
 */

export type VehicleMeta = {
  chassis?: string;
  engine?: string;
  trim?: string;
  transmission?: "automatic" | "manual" | "cvt" | "";
  fuel_type?: "petrol" | "diesel" | "hybrid" | "electric" | "";
  branch?: string;
  supplier?: string;
  photos?: string[];
  note?: string;
};

const MARKER = "###VMETA###";

export function parseVehicleMeta(notes: string | null | undefined): VehicleMeta {
  if (!notes) return {};
  if (!notes.startsWith(MARKER)) {
    return { note: notes };
  }
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
    const v = meta[k];
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return;
    (clean as any)[k] = v;
  });
  if (Object.keys(clean).length === 0) return "";
  return MARKER + JSON.stringify(clean);
}
