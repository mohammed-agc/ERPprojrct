/**
 * Resolve per-VIN vehicle units linked to a Purchase Order via the
 * confirmed Allocation(s). Single source of truth for VIN/Engine/Color/Trim
 * propagation into Shipments, GRN, Inspection and Vehicle Intake — so a user
 * never has to re-enter VIN-level data after allocation.
 */
import { allocationService, type AllocVehicleStatus } from "@/services/erp/allocations";

export interface PoVehicleUnit {
  vin: string;
  engine_no: string;
  brand: string;
  manufacturer: string;
  model: string;
  year: number;
  color: string;
  trim?: string;
  cost?: number;
  po_line_id?: string;
  alloc_id: string;
  alloc_code: string;
  alloc_line_id: string;
  status: AllocVehicleStatus;
}

export function getPoVehicleUnits(poId?: string): PoVehicleUnit[] {
  if (!poId) return [];
  const allocs = allocationService.listByPO(poId);
  const out: PoVehicleUnit[] = [];
  for (const a of allocs) {
    if (a.status === "cancelled") continue;
    for (const l of a.lines) {
      out.push({
        vin: l.vin,
        engine_no: l.engine_no,
        brand: l.brand,
        manufacturer: l.manufacturer ?? l.brand,
        model: l.model,
        year: l.year,
        color: l.color,
        trim: l.trim,
        cost: l.cost,
        po_line_id: l.po_line_id,
        alloc_id: a.id,
        alloc_code: a.code,
        alloc_line_id: l.id,
        status: l.status,
      });
    }
  }
  return out;
}

/** Group units by their PO line id (or "_unlinked" when missing). */
export function groupUnitsByPoLine(units: PoVehicleUnit[]): Map<string, PoVehicleUnit[]> {
  const m = new Map<string, PoVehicleUnit[]>();
  for (const u of units) {
    const k = u.po_line_id || "_unlinked";
    const arr = m.get(k) ?? [];
    arr.push(u);
    m.set(k, arr);
  }
  return m;
}

export function formatUnitIdentity(u: PoVehicleUnit): string {
  return `${u.manufacturer} ${u.model} ${u.year} ${u.color}${u.trim ? " · " + u.trim : ""}`;
}
