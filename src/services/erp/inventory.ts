/**
 * Enterprise Inventory & Warehousing Foundation
 * ---------------------------------------------
 * Frontend operational contract only. Seeded + persisted in localStorage so
 * the UX behaves like a real ERP inventory engine until backend lands.
 *
 * Domains:
 *   - Warehouses (main, branch, yard, transit, inspection, delivery zones)
 *   - Bin / Location management
 *   - Vehicle inventory (VIN-serialized assets)
 *   - Spare parts inventory (qty-based with reservations)
 *   - Stock movements (full audit trail)
 *   - Reservations (vehicles + parts, expiry, release)
 *   - Transfers (inter-warehouse with status flow)
 *   - Availability governance (sellability gates)
 *   - KPIs & intelligence (aging, fast/slow movers, valuation, occupancy)
 */

const LS_KEY = "sarat.inventory.v1";

/* ============================ Domain Types ============================ */

export type WarehouseKind =
  | "main" | "branch" | "yard" | "transit" | "inspection" | "delivery";

export interface Warehouse {
  id: string;
  code: string;             // WH-RUH-01
  name: string;
  kind: WarehouseKind;
  city: string;
  branch: string;
  manager: string;
  capacity_vehicles: number;
  capacity_parts: number;    // bin slots
  active: boolean;
}

export interface Bin {
  id: string;
  warehouse_id: string;
  code: string;             // R1-S3-B12 or YARD-A-014
  zone: string;             // Row / Yard zone
  shelf?: string;
  slot?: string;
  kind: "shelf" | "parking" | "yard" | "transit";
  occupied: boolean;
}

export type VehicleInvStatus =
  | "in_transit" | "received" | "inspection" | "approved"
  | "available" | "reserved" | "sold" | "delivered" | "returned" | "blocked";

export interface VehicleUnit {
  id: string;
  vin: string;              // globally unique
  engine_no: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  color: string;
  mileage: number;
  transmission: "AT" | "MT" | "CVT";
  fuel: "petrol" | "diesel" | "hybrid" | "electric";
  supplier_id?: string;
  warehouse_id: string;
  bin_id?: string;
  purchase_cost: number;     // base
  landed_cost: number;       // incl. freight/customs
  status: VehicleInvStatus;
  reserved_for?: string;     // customer / order ref
  reserved_until?: string;
  received_at?: string;
  approved_at?: string;
  aging_days: number;        // days since receipt
  notes?: string;
}

export interface PartUnit {
  id: string;
  sku: string;               // internal
  oem_no: string;
  barcode: string;
  description: string;
  category: string;          // Brakes / Filters / ...
  compatible: string[];      // makes/models
  warehouse_id: string;
  bin_id?: string;
  on_hand: number;
  reserved: number;
  reorder_level: number;
  safety_stock: number;
  avg_cost: number;          // moving average
  last_movement_at?: string;
}

export type MovementKind =
  // vehicle
  | "v_receive" | "v_inspect" | "v_transfer" | "v_reserve"
  | "v_release" | "v_sell" | "v_deliver" | "v_return" | "v_block"
  // parts
  | "p_receive" | "p_issue" | "p_transfer" | "p_adjust"
  | "p_reserve" | "p_release" | "p_consume" | "p_return";

export interface Movement {
  id: string;
  code: string;              // MV-2026-0001
  at: string;
  kind: MovementKind;
  reference?: string;        // PO/SO/RES code
  warehouse_id: string;
  to_warehouse_id?: string;
  unit_id: string;           // vehicle_id or part_id
  unit_kind: "vehicle" | "part";
  qty: number;               // 1 for vehicle
  user: string;
  notes?: string;
}

export type ReservationStatus = "active" | "expired" | "released" | "fulfilled";

export interface Reservation {
  id: string;
  code: string;              // RES-2026-0001
  kind: "vehicle" | "part";
  unit_id: string;
  qty: number;
  customer: string;
  order_ref?: string;
  branch: string;
  created_at: string;
  expires_at: string;
  status: ReservationStatus;
  notes?: string;
}

export type TransferStatus = "draft" | "in_transit" | "received" | "cancelled";

export interface Transfer {
  id: string;
  code: string;              // TRF-2026-0001
  from_warehouse_id: string;
  to_warehouse_id: string;
  kind: "vehicle" | "part";
  unit_id: string;
  qty: number;
  status: TransferStatus;
  created_at: string;
  shipped_at?: string;
  received_at?: string;
  carrier?: string;
  reference?: string;
  user: string;
}

interface DB {
  warehouses: Warehouse[];
  bins: Bin[];
  vehicles: VehicleUnit[];
  parts: PartUnit[];
  movements: Movement[];
  reservations: Reservation[];
  transfers: Transfer[];
}

/* ============================ Storage ============================ */

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const isoNow = () => new Date().toISOString();
const addDays = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (iso?: string) =>
  iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0;

function seed(): DB {
  const w1: Warehouse = { id: "wh_ruh_main", code: "WH-RUH-01", name: "المستودع المركزي — الرياض", kind: "main", city: "الرياض", branch: "الرياض الرئيسي", manager: "م. ماجد", capacity_vehicles: 250, capacity_parts: 8000, active: true };
  const w2: Warehouse = { id: "wh_jed_main", code: "WH-JED-01", name: "مستودع جدة المركزي", kind: "main", city: "جدة", branch: "جدة", manager: "أ. مشعل", capacity_vehicles: 180, capacity_parts: 6000, active: true };
  const w3: Warehouse = { id: "wh_dmm_branch", code: "WH-DMM-01", name: "مستودع الدمام", kind: "branch", city: "الدمام", branch: "الدمام", manager: "أ. صالح", capacity_vehicles: 90, capacity_parts: 3000, active: true };
  const w4: Warehouse = { id: "wh_yard_ruh", code: "YARD-RUH", name: "ساحة الرياض", kind: "yard", city: "الرياض", branch: "الرياض الرئيسي", manager: "م. فهد", capacity_vehicles: 400, capacity_parts: 0, active: true };
  const w5: Warehouse = { id: "wh_insp_jed", code: "INSP-JED", name: "منطقة الفحص — جدة", kind: "inspection", city: "جدة", branch: "جدة", manager: "م. ناصر", capacity_vehicles: 30, capacity_parts: 0, active: true };
  const w6: Warehouse = { id: "wh_transit_kr", code: "TRN-KR-SA", name: "شحنات عبور — كوريا/السعودية", kind: "transit", city: "—", branch: "—", manager: "—", capacity_vehicles: 200, capacity_parts: 1000, active: true };

  const bins: Bin[] = [
    { id: "bin_1", warehouse_id: "wh_ruh_main", code: "R1-S2-B05", zone: "R1", shelf: "S2", slot: "B05", kind: "shelf", occupied: true },
    { id: "bin_2", warehouse_id: "wh_ruh_main", code: "R1-S2-B06", zone: "R1", shelf: "S2", slot: "B06", kind: "shelf", occupied: false },
    { id: "bin_3", warehouse_id: "wh_jed_main", code: "R3-S1-B11", zone: "R3", shelf: "S1", slot: "B11", kind: "shelf", occupied: true },
    { id: "bin_4", warehouse_id: "wh_yard_ruh", code: "YARD-A-014", zone: "A", slot: "014", kind: "parking", occupied: true },
    { id: "bin_5", warehouse_id: "wh_yard_ruh", code: "YARD-A-015", zone: "A", slot: "015", kind: "parking", occupied: true },
    { id: "bin_6", warehouse_id: "wh_yard_ruh", code: "YARD-B-022", zone: "B", slot: "022", kind: "parking", occupied: false },
    { id: "bin_7", warehouse_id: "wh_insp_jed", code: "INSP-LANE-2", zone: "Lane2", kind: "parking", occupied: true },
  ];

  const v: VehicleUnit[] = [
    { id: "veh_1", vin: "JTDBR32E040123456", engine_no: "EN-1A220-44", make: "Toyota", model: "Camry", trim: "GLE", year: 2026, color: "أبيض لؤلؤي", mileage: 12, transmission: "AT", fuel: "petrol", supplier_id: "sup_toyota", warehouse_id: "wh_yard_ruh", bin_id: "bin_4", purchase_cost: 105_000, landed_cost: 111_500, status: "available", received_at: addDays(-15), approved_at: addDays(-12), aging_days: 12 },
    { id: "veh_2", vin: "JTDBR32E040123457", engine_no: "EN-1A220-45", make: "Toyota", model: "Camry", trim: "GLE", year: 2026, color: "أسود", mileage: 8, transmission: "AT", fuel: "petrol", supplier_id: "sup_toyota", warehouse_id: "wh_yard_ruh", bin_id: "bin_5", purchase_cost: 105_000, landed_cost: 111_500, status: "reserved", reserved_for: "العميل: نواف ا.", reserved_until: addDays(3), received_at: addDays(-10), approved_at: addDays(-7), aging_days: 7 },
    { id: "veh_3", vin: "KMHJ381BBLU222001", engine_no: "EN-2H180-12", make: "Hyundai", model: "Tucson", year: 2026, color: "فضي", mileage: 18, transmission: "AT", fuel: "petrol", supplier_id: "sup_hyundai", warehouse_id: "wh_jed_main", bin_id: "bin_3", purchase_cost: 88_000, landed_cost: 93_200, status: "available", received_at: addDays(-45), approved_at: addDays(-42), aging_days: 42 },
    { id: "veh_4", vin: "JN8AS5MV0CW777321", engine_no: "EN-3N240-09", make: "Nissan", model: "Patrol", trim: "Titanium", year: 2026, color: "ذهبي", mileage: 5, transmission: "AT", fuel: "petrol", supplier_id: "sup_nissan", warehouse_id: "wh_insp_jed", bin_id: "bin_7", purchase_cost: 245_000, landed_cost: 258_000, status: "inspection", received_at: addDays(-2), aging_days: 2 },
    { id: "veh_5", vin: "JTEBU5JR3L5099821", engine_no: "EN-1A130-99", make: "Toyota", model: "Hilux", trim: "DLX", year: 2026, color: "أبيض", mileage: 0, transmission: "MT", fuel: "diesel", supplier_id: "sup_toyota", warehouse_id: "wh_transit_kr", purchase_cost: 138_000, landed_cost: 145_000, status: "in_transit", aging_days: 0 },
    { id: "veh_6", vin: "MALA851CAJM334455", engine_no: "EN-2H200-77", make: "Hyundai", model: "Elantra", year: 2025, color: "أزرق", mileage: 25, transmission: "AT", fuel: "petrol", supplier_id: "sup_hyundai", warehouse_id: "wh_ruh_main", bin_id: "bin_1", purchase_cost: 74_000, landed_cost: 78_500, status: "available", received_at: addDays(-95), approved_at: addDays(-92), aging_days: 92 },
    { id: "veh_7", vin: "JTDKB20U7N3022118", engine_no: "EN-1A210-22", make: "Toyota", model: "Land Cruiser", year: 2026, color: "أسود", mileage: 0, transmission: "AT", fuel: "petrol", supplier_id: "sup_toyota", warehouse_id: "wh_yard_ruh", purchase_cost: 295_000, landed_cost: 312_000, status: "blocked", received_at: addDays(-30), aging_days: 30, notes: "بانتظار تعديلات تخصيص الواردات" },
    { id: "veh_8", vin: "KNALC411BJ5678901", engine_no: "EN-4K220-31", make: "Kia", model: "Sorento", year: 2025, color: "أبيض", mileage: 8, transmission: "AT", fuel: "petrol", warehouse_id: "wh_ruh_main", bin_id: "bin_2", purchase_cost: 118_000, landed_cost: 124_000, status: "sold", received_at: addDays(-60), aging_days: 60 },
  ];

  const p: PartUnit[] = [
    { id: "prt_1", sku: "BP-TOY-001", oem_no: "04465-33471", barcode: "8901234500011", description: "Brake Pad Set — Toyota Camry", category: "الفرامل", compatible: ["Toyota Camry", "Toyota Corolla"], warehouse_id: "wh_ruh_main", bin_id: "bin_1", on_hand: 86, reserved: 12, reorder_level: 40, safety_stock: 25, avg_cost: 185, last_movement_at: addDays(-1) },
    { id: "prt_2", sku: "BD-HYU-005", oem_no: "517123A000", barcode: "8901234500028", description: "Brake Disc — Hyundai Tucson", category: "الفرامل", compatible: ["Hyundai Tucson"], warehouse_id: "wh_jed_main", bin_id: "bin_3", on_hand: 34, reserved: 4, reorder_level: 30, safety_stock: 15, avg_cost: 248, last_movement_at: addDays(-3) },
    { id: "prt_3", sku: "OF-NIS-014", oem_no: "15208-65F00", barcode: "8901234500035", description: "Oil Filter — Nissan Patrol", category: "فلاتر", compatible: ["Nissan Patrol"], warehouse_id: "wh_ruh_main", on_hand: 12, reserved: 0, reorder_level: 50, safety_stock: 25, avg_cost: 42, last_movement_at: addDays(-2) },
    { id: "prt_4", sku: "TR-TOY-099", oem_no: "35010-60530", barcode: "8901234500042", description: "Transmission Kit — Toyota Hilux", category: "ناقل الحركة", compatible: ["Toyota Hilux"], warehouse_id: "wh_dmm_branch", on_hand: 3, reserved: 3, reorder_level: 5, safety_stock: 2, avg_cost: 12_500, last_movement_at: addDays(-1) },
    { id: "prt_5", sku: "AF-KIA-021", oem_no: "28113-3X000", barcode: "8901234500059", description: "Air Filter — Kia Sorento", category: "فلاتر", compatible: ["Kia Sorento"], warehouse_id: "wh_ruh_main", on_hand: 145, reserved: 8, reorder_level: 60, safety_stock: 30, avg_cost: 65, last_movement_at: addDays(-5) },
    { id: "prt_6", sku: "SP-TOY-300", oem_no: "90919-01253", barcode: "8901234500066", description: "Spark Plug — Toyota Universal", category: "الإشعال", compatible: ["Toyota Camry", "Toyota Corolla", "Toyota Hilux"], warehouse_id: "wh_jed_main", on_hand: 0, reserved: 0, reorder_level: 80, safety_stock: 40, avg_cost: 35, last_movement_at: addDays(-14) },
  ];

  const movs: Movement[] = [
    { id: "mv_1", code: "MV-2026-0140", at: addDays(-15), kind: "v_receive", reference: "GRN-2026-0066", warehouse_id: "wh_yard_ruh", unit_id: "veh_1", unit_kind: "vehicle", qty: 1, user: "م. ماجد" },
    { id: "mv_2", code: "MV-2026-0141", at: addDays(-12), kind: "v_inspect", reference: "INS-2026-0099", warehouse_id: "wh_yard_ruh", unit_id: "veh_1", unit_kind: "vehicle", qty: 1, user: "م. ناصر", notes: "اعتماد الفحص" },
    { id: "mv_3", code: "MV-2026-0142", at: addDays(-7), kind: "v_reserve", reference: "RES-2026-0021", warehouse_id: "wh_yard_ruh", unit_id: "veh_2", unit_kind: "vehicle", qty: 1, user: "أ. خالد" },
    { id: "mv_4", code: "MV-2026-0143", at: addDays(-2), kind: "v_receive", reference: "GRN-2026-0067", warehouse_id: "wh_insp_jed", unit_id: "veh_4", unit_kind: "vehicle", qty: 1, user: "أ. مشعل" },
    { id: "mv_5", code: "MV-2026-0144", at: addDays(-1), kind: "p_issue", reference: "WO-2026-0010", warehouse_id: "wh_ruh_main", unit_id: "prt_1", unit_kind: "part", qty: 4, user: "م. فهد" },
    { id: "mv_6", code: "MV-2026-0145", at: addDays(-3), kind: "p_receive", reference: "GRN-2026-0065", warehouse_id: "wh_dmm_branch", unit_id: "prt_4", unit_kind: "part", qty: 3, user: "أ. صالح" },
    { id: "mv_7", code: "MV-2026-0146", at: addDays(-5), kind: "p_consume", reference: "WO-2026-0008", warehouse_id: "wh_ruh_main", unit_id: "prt_5", unit_kind: "part", qty: 2, user: "م. فهد" },
  ];

  const res: Reservation[] = [
    { id: "res_1", code: "RES-2026-0021", kind: "vehicle", unit_id: "veh_2", qty: 1, customer: "نواف الشمري", order_ref: "QT-2026-0044", branch: "الرياض الرئيسي", created_at: addDays(-7), expires_at: addDays(3), status: "active" },
    { id: "res_2", code: "RES-2026-0020", kind: "part", unit_id: "prt_4", qty: 3, customer: "ورشة الدمام", order_ref: "WO-2026-0010", branch: "الدمام", created_at: addDays(-1), expires_at: addDays(2), status: "active" },
    { id: "res_3", code: "RES-2026-0019", kind: "vehicle", unit_id: "veh_6", qty: 1, customer: "خالد العتيبي", order_ref: "QT-2026-0040", branch: "الرياض الرئيسي", created_at: addDays(-12), expires_at: addDays(-2), status: "expired" },
  ];

  const trf: Transfer[] = [
    { id: "trf_1", code: "TRF-2026-0007", from_warehouse_id: "wh_ruh_main", to_warehouse_id: "wh_jed_main", kind: "part", unit_id: "prt_5", qty: 20, status: "in_transit", created_at: addDays(-2), shipped_at: addDays(-1), carrier: "ناقل داخلي", user: "م. فهد" },
    { id: "trf_2", code: "TRF-2026-0006", from_warehouse_id: "wh_yard_ruh", to_warehouse_id: "wh_jed_main", kind: "vehicle", unit_id: "veh_6", qty: 1, status: "received", created_at: addDays(-9), shipped_at: addDays(-8), received_at: addDays(-7), carrier: "نقل داخلي", user: "م. ماجد" },
    { id: "trf_3", code: "TRF-2026-0008", from_warehouse_id: "wh_ruh_main", to_warehouse_id: "wh_dmm_branch", kind: "part", unit_id: "prt_1", qty: 12, status: "draft", created_at: addDays(0), user: "م. فهد" },
  ];

  return { warehouses: [w1, w2, w3, w4, w5, w6], bins, vehicles: v, parts: p, movements: movs, reservations: res, transfers: trf };
}

function load(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as DB;
  } catch { return seed(); }
}

function save(db: DB) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/* ============================ Labels & Tones ============================ */

export const WH_KIND_LABEL: Record<WarehouseKind, string> = {
  main: "رئيسي", branch: "فرعي", yard: "ساحة", transit: "عبور",
  inspection: "فحص", delivery: "تسليم",
};

export const V_STATUS_LABEL: Record<VehicleInvStatus, string> = {
  in_transit: "في الطريق", received: "مستلم", inspection: "قيد الفحص",
  approved: "معتمد", available: "متاح للبيع", reserved: "محجوز",
  sold: "مباع", delivered: "تم التسليم", returned: "مرتجع", blocked: "موقوف",
};
export const V_STATUS_TONE: Record<VehicleInvStatus, string> = {
  in_transit: "bg-primary/10 text-primary border border-primary/30",
  received: "bg-muted text-muted-foreground border border-border",
  inspection: "bg-warning/10 text-warning border border-warning/40",
  approved: "bg-success/10 text-success border border-success/40",
  available: "bg-success/10 text-success border border-success/40",
  reserved: "bg-warning/10 text-warning border border-warning/40",
  sold: "bg-primary/10 text-primary border border-primary/30",
  delivered: "bg-muted text-muted-foreground border border-border",
  returned: "bg-destructive/10 text-destructive border border-destructive/40",
  blocked: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const MOV_LABEL: Record<MovementKind, string> = {
  v_receive: "استلام مركبة", v_inspect: "فحص مركبة", v_transfer: "نقل مركبة",
  v_reserve: "حجز مركبة", v_release: "تحرير حجز", v_sell: "بيع مركبة",
  v_deliver: "تسليم مركبة", v_return: "إرجاع مركبة", v_block: "إيقاف مركبة",
  p_receive: "استلام قطعة", p_issue: "صرف قطعة", p_transfer: "نقل قطعة",
  p_adjust: "تسوية قطعة", p_reserve: "حجز قطعة", p_release: "تحرير حجز قطعة",
  p_consume: "استهلاك قطعة", p_return: "إرجاع قطعة",
};

export const RES_LABEL: Record<ReservationStatus, string> = {
  active: "نشط", expired: "منتهي", released: "محرر", fulfilled: "منفذ",
};
export const RES_TONE: Record<ReservationStatus, string> = {
  active: "bg-success/10 text-success border border-success/40",
  expired: "bg-destructive/10 text-destructive border border-destructive/40",
  released: "bg-muted text-muted-foreground border border-border",
  fulfilled: "bg-primary/10 text-primary border border-primary/30",
};

export const TRF_LABEL: Record<TransferStatus, string> = {
  draft: "مسودة", in_transit: "قيد النقل", received: "تم الاستلام", cancelled: "ملغى",
};
export const TRF_TONE: Record<TransferStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  in_transit: "bg-warning/10 text-warning border border-warning/40",
  received: "bg-success/10 text-success border border-success/40",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const fmtSAR = (n: number) => `${Math.round(n).toLocaleString("ar-SA")} ر.س`;
export const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

/* ============================ Service ============================ */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{11,17}$/i;

export const inventoryService = {
  /* ----- Warehouses ----- */
  listWarehouses(): Warehouse[] { return load().warehouses; },
  getWarehouse(id: string) { return load().warehouses.find(w => w.id === id); },

  /* ----- Bins ----- */
  listBins(warehouseId?: string): Bin[] {
    const all = load().bins;
    return warehouseId ? all.filter(b => b.warehouse_id === warehouseId) : all;
  },

  /* ----- Vehicles ----- */
  listVehicles(): VehicleUnit[] {
    return load().vehicles.map(v => ({ ...v, aging_days: daysBetween(v.received_at) }));
  },
  getVehicle(id: string) { return this.listVehicles().find(v => v.id === id); },
  vinExists(vin: string): boolean {
    const v = vin.trim().toUpperCase();
    return load().vehicles.some(x => x.vin.toUpperCase() === v);
  },
  validateVIN(vin: string): { ok: boolean; reason?: string } {
    const v = vin.trim().toUpperCase();
    if (!v) return { ok: false, reason: "VIN مطلوب" };
    if (!VIN_RE.test(v)) return { ok: false, reason: "VIN غير صالح" };
    if (this.vinExists(v)) return { ok: false, reason: "VIN موجود مسبقاً" };
    return { ok: true };
  },
  /** Sellability gate: vehicle is sellable iff status === 'available' */
  vehicleSellable(v: VehicleUnit): { ok: boolean; reason?: string } {
    if (v.status === "available") return { ok: true };
    if (v.status === "reserved") return { ok: false, reason: "محجوزة لعميل آخر" };
    if (v.status === "sold" || v.status === "delivered") return { ok: false, reason: "مباعة بالفعل" };
    if (v.status === "blocked") return { ok: false, reason: "موقوفة" };
    if (v.status === "inspection" || v.status === "received") return { ok: false, reason: "بانتظار اعتماد الفحص" };
    if (v.status === "in_transit") return { ok: false, reason: "لم تصل بعد" };
    return { ok: false, reason: V_STATUS_LABEL[v.status] };
  },
  setVehicleStatus(id: string, status: VehicleInvStatus, notes?: string) {
    const db = load();
    const v = db.vehicles.find(x => x.id === id);
    if (!v) return;
    v.status = status;
    if (notes) v.notes = notes;
    if (status === "approved") v.approved_at = isoNow();
    save(db);
  },

  /* ----- Parts ----- */
  listParts(): PartUnit[] {
    return load().parts.map(p => ({ ...p }));
  },
  getPart(id: string) { return load().parts.find(p => p.id === id); },
  partAvailable(p: PartUnit): number { return Math.max(0, p.on_hand - p.reserved); },
  partSellable(p: PartUnit, qty = 1): { ok: boolean; reason?: string } {
    if (this.partAvailable(p) < qty) {
      return { ok: false, reason: `الكمية المتاحة ${this.partAvailable(p)}` };
    }
    return { ok: true };
  },

  /* ----- Movements ----- */
  listMovements(filter?: { kind?: "vehicle" | "part"; warehouseId?: string }): Movement[] {
    const all = load().movements.slice().sort((a, b) => b.at.localeCompare(a.at));
    return all.filter(m => {
      if (filter?.kind && m.unit_kind !== filter.kind) return false;
      if (filter?.warehouseId && m.warehouse_id !== filter.warehouseId && m.to_warehouse_id !== filter.warehouseId) return false;
      return true;
    });
  },
  logMovement(input: Omit<Movement, "id" | "code" | "at">): Movement {
    const db = load();
    const year = new Date().getFullYear();
    const seq = db.movements.filter(m => m.code.startsWith(`MV-${year}`)).length + 1;
    const m: Movement = {
      id: uid("mv"), code: `MV-${year}-${String(seq).padStart(4, "0")}`,
      at: isoNow(), ...input,
    };
    db.movements.unshift(m); save(db); return m;
  },

  /* ----- Reservations ----- */
  listReservations(): Reservation[] {
    const db = load();
    // auto-expire
    let dirty = false;
    db.reservations.forEach(r => {
      if (r.status === "active" && new Date(r.expires_at) < new Date()) {
        r.status = "expired"; dirty = true;
      }
    });
    if (dirty) save(db);
    return db.reservations.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  releaseReservation(id: string) {
    const db = load();
    const r = db.reservations.find(x => x.id === id);
    if (!r || r.status !== "active") return;
    r.status = "released";
    if (r.kind === "vehicle") {
      const v = db.vehicles.find(x => x.id === r.unit_id);
      if (v && v.status === "reserved") { v.status = "available"; v.reserved_for = undefined; v.reserved_until = undefined; }
    } else {
      const p = db.parts.find(x => x.id === r.unit_id);
      if (p) p.reserved = Math.max(0, p.reserved - r.qty);
    }
    save(db);
  },
  createReservation(input: {
    kind: "vehicle" | "part"; unit_id: string; qty: number;
    customer: string; order_ref?: string; branch: string; days: number;
  }): Reservation | { error: string } {
    const db = load();
    if (input.kind === "vehicle") {
      const v = db.vehicles.find(x => x.id === input.unit_id);
      if (!v) return { error: "المركبة غير موجودة" };
      if (v.status !== "available") return { error: `لا يمكن حجز مركبة بحالة "${V_STATUS_LABEL[v.status]}"` };
      v.status = "reserved"; v.reserved_for = input.customer; v.reserved_until = addDays(input.days);
    } else {
      const p = db.parts.find(x => x.id === input.unit_id);
      if (!p) return { error: "القطعة غير موجودة" };
      if (this.partAvailable(p) < input.qty) return { error: `الكمية المتاحة ${this.partAvailable(p)}` };
      p.reserved += input.qty;
    }
    const year = new Date().getFullYear();
    const seq = db.reservations.filter(r => r.code.startsWith(`RES-${year}`)).length + 22;
    const r: Reservation = {
      id: uid("res"), code: `RES-${year}-${String(seq).padStart(4, "0")}`,
      kind: input.kind, unit_id: input.unit_id, qty: input.qty,
      customer: input.customer, order_ref: input.order_ref, branch: input.branch,
      created_at: isoNow(), expires_at: addDays(input.days), status: "active",
    };
    db.reservations.unshift(r); save(db); return r;
  },

  /* ----- Transfers ----- */
  listTransfers(): Transfer[] {
    return load().transfers.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  setTransferStatus(id: string, status: TransferStatus) {
    const db = load();
    const t = db.transfers.find(x => x.id === id); if (!t) return;
    t.status = status;
    if (status === "in_transit") t.shipped_at = isoNow();
    if (status === "received") {
      t.received_at = isoNow();
      // apply effect
      if (t.kind === "part") {
        const p = db.parts.find(x => x.id === t.unit_id);
        if (p) {
          p.warehouse_id = t.to_warehouse_id;
          p.last_movement_at = isoNow();
        }
      } else {
        const v = db.vehicles.find(x => x.id === t.unit_id);
        if (v) v.warehouse_id = t.to_warehouse_id;
      }
    }
    save(db);
  },

  /* ----- Search ----- */
  searchVehicles(q: string): VehicleUnit[] {
    const qv = q.trim().toLowerCase(); if (!qv) return [];
    return this.listVehicles().filter(v =>
      `${v.vin} ${v.engine_no} ${v.make} ${v.model} ${v.color} ${v.year}`.toLowerCase().includes(qv),
    );
  },
  searchParts(q: string): PartUnit[] {
    const qv = q.trim().toLowerCase(); if (!qv) return [];
    return this.listParts().filter(p =>
      `${p.sku} ${p.oem_no} ${p.barcode} ${p.description} ${p.category}`.toLowerCase().includes(qv),
    );
  },

  /* ----- KPIs / Intelligence ----- */
  kpis() {
    const db = load();
    const vehicles = db.vehicles;
    const parts = db.parts;
    const available = vehicles.filter(v => v.status === "available").length;
    const reserved = vehicles.filter(v => v.status === "reserved").length;
    const blocked = vehicles.filter(v => v.status === "blocked").length;
    const inTransit = vehicles.filter(v => v.status === "in_transit").length;
    const inspection = vehicles.filter(v => v.status === "inspection" || v.status === "received").length;
    const aged90 = vehicles.filter(v => daysBetween(v.received_at) >= 90 && (v.status === "available" || v.status === "blocked")).length;
    const vehicleValue = vehicles
      .filter(v => !["sold", "delivered", "returned"].includes(v.status))
      .reduce((s, v) => s + v.landed_cost, 0);

    const partsValue = parts.reduce((s, p) => s + p.on_hand * p.avg_cost, 0);
    const lowStock = parts.filter(p => p.on_hand <= p.reorder_level).length;
    const outOfStock = parts.filter(p => p.on_hand === 0).length;
    const partsReserved = parts.reduce((s, p) => s + p.reserved, 0);

    // Warehouse occupancy
    const occupancy = db.warehouses.map(w => {
      const vCount = vehicles.filter(v => v.warehouse_id === w.id && !["sold", "delivered"].includes(v.status)).length;
      const pCount = parts.filter(p => p.warehouse_id === w.id).reduce((s, p) => s + (p.on_hand > 0 ? 1 : 0), 0);
      const vPct = w.capacity_vehicles ? Math.min(100, Math.round((vCount / w.capacity_vehicles) * 100)) : 0;
      const pPct = w.capacity_parts ? Math.min(100, Math.round((pCount / w.capacity_parts) * 100)) : 0;
      return { id: w.id, name: w.name, vPct, pPct, vCount, pCount };
    });

    // Fast / slow movers (last 30 days vs aging vehicles)
    const since = Date.now() - 30 * 86_400_000;
    const partMoves = db.movements.filter(m => m.unit_kind === "part" && new Date(m.at).getTime() >= since);
    const partFreq = new Map<string, number>();
    partMoves.forEach(m => partFreq.set(m.unit_id, (partFreq.get(m.unit_id) ?? 0) + m.qty));
    const fastParts = [...partFreq.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, q]) => ({ part: parts.find(p => p.id === id), qty: q }))
      .filter(x => !!x.part);

    const slowVehicles = vehicles
      .filter(v => v.status === "available")
      .map(v => ({ ...v, aging_days: daysBetween(v.received_at) }))
      .sort((a, b) => b.aging_days - a.aging_days).slice(0, 5);

    return {
      vehicles: { available, reserved, blocked, inTransit, inspection, aged90, value: vehicleValue, total: vehicles.length },
      parts: { value: partsValue, low: lowStock, out: outOfStock, reserved: partsReserved, total: parts.length },
      occupancy, fastParts, slowVehicles,
    };
  },

  /* ----- Utilities ----- */
  resetSeed() { if (typeof window !== "undefined") localStorage.removeItem(LS_KEY); },
};
