/**
 * Vehicle Allocation & Allocation Confirmation
 * --------------------------------------------
 * Governance v1.3 — Vehicle records BEGIN here, between PO approval and
 * Purchase Invoice. GRN does NOT create vehicles; it validates allocation.
 *
 * Frontend operational contract only. Seeded + persisted in localStorage.
 */

import {
  makeAudit, makeApproval, type AuditEntry, type ApprovalEntry, type ErpGovRole,
} from "./erpRoles";
import { purchasingService } from "./purchasing";
import { validateVIN, normalizeVIN } from "@/lib/vinValidation";

const LS_KEY = "sarat.allocations.v1";

/* ============================ Types ============================ */

export type AllocVehicleStatus =
  | "allocated" | "invoiced" | "in_transit" | "received"
  | "inspection" | "available" | "reserved" | "sold"
  | "delivered" | "returned" | "rejected";

export interface AllocationLine {
  id: string;
  vin: string;
  engine_no: string;
  brand: string;            // legacy / manufacturer display
  manufacturer?: string;    // preferred display
  model: string;
  year: number;
  color: string;
  trim?: string;
  status: AllocVehicleStatus;
  cost?: number;             // unit cost (excl VAT) from PO
  vat_pct?: number;          // VAT% snapshot from PO
  po_line_id?: string;       // link back to PO line
  inventory_vehicle_id?: string;
}


export type AllocationStatus =
  | "draft" | "confirmed" | "invoiced" | "in_transit"
  | "received" | "inspection" | "completed" | "cancelled";

export interface Allocation {
  id: string;
  code: string;              // ALC-2026-0001
  po_id: string;
  supplier_id: string;
  status: AllocationStatus;
  lines: AllocationLine[];
  created_at: string;
  confirmed_at?: string;
  notes?: string;
  audit: AuditEntry[];
  approvals: ApprovalEntry[];
  confirmation_id?: string;
  invoice_id?: string;
}

export interface AllocationConfirmation {
  id: string;
  code: string;              // ALCC-2026-0001
  allocation_id: string;
  supplier_id: string;
  po_id: string;
  allocation_date: string;
  vehicle_count: number;
  vin_list: string[];
  invoice_id?: string;
  notes?: string;
  created_at: string;
  audit: AuditEntry[];
}

interface DB {
  allocations: Allocation[];
  confirmations: AllocationConfirmation[];
}

/* ============================ Storage ============================ */

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const isoNow = () => new Date().toISOString();

function seed(): DB {
  // Seed one allocated batch tied to PO-2026-0231 (po_1, Toyota — Hilux + LC)
  const al1: Allocation = {
    id: "alc_1",
    code: "ALC-2026-0011",
    po_id: "po_1",
    supplier_id: "sup_toyota",
    status: "confirmed",
    lines: [
      { id: uid("aln"), vin: "JTEBU5JR3L5099801", engine_no: "EN-1A130-01", brand: "Toyota", model: "Hilux", year: 2026, color: "أبيض", trim: "DLX", status: "allocated", cost: 138_000 },
      { id: uid("aln"), vin: "JTEBU5JR3L5099802", engine_no: "EN-1A130-02", brand: "Toyota", model: "Hilux", year: 2026, color: "فضي", trim: "DLX", status: "allocated", cost: 138_000 },
      { id: uid("aln"), vin: "JTDKB20U7N3022119", engine_no: "EN-1A210-23", brand: "Toyota", model: "Land Cruiser", year: 2026, color: "أسود", status: "allocated", cost: 295_000 },
    ],
    created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    confirmed_at: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    audit: [
      makeAudit({ role: "purchasing_officer", action: "إنشاء التخصيص", to_status: "draft" }),
      makeAudit({ role: "purchasing_officer", action: "تأكيد التخصيص", from_status: "draft", to_status: "confirmed" }),
    ],
    approvals: [],
  };
  const cc1: AllocationConfirmation = {
    id: "alcc_1",
    code: "ALCC-2026-0008",
    allocation_id: al1.id,
    supplier_id: al1.supplier_id,
    po_id: al1.po_id,
    allocation_date: al1.confirmed_at!.slice(0, 10),
    vehicle_count: al1.lines.length,
    vin_list: al1.lines.map(l => l.vin),
    notes: "وثيقة تأكيد التخصيص من المورد قبل الشحن.",
    created_at: al1.confirmed_at!,
    audit: [
      makeAudit({ role: "purchasing_officer", action: "إصدار وثيقة تأكيد التخصيص" }),
    ],
  };
  al1.confirmation_id = cc1.id;
  return { allocations: [al1], confirmations: [cc1] };
}

function load(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { const s = seed(); localStorage.setItem(LS_KEY, JSON.stringify(s)); return s; }
    const parsed = JSON.parse(raw) as Partial<DB>;
    if (!parsed.allocations) parsed.allocations = [];
    if (!parsed.confirmations) parsed.confirmations = [];
    return parsed as DB;
  } catch { return seed(); }
}
function save(db: DB) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/* ============================ Labels ============================ */

export const ALC_STATUS_LABEL: Record<AllocationStatus, string> = {
  draft: "مسودة", confirmed: "مؤكد", invoiced: "مفوتر",
  in_transit: "في الطريق", received: "تم الاستلام",
  inspection: "قيد الفحص", completed: "مكتمل", cancelled: "ملغى",
};
export const ALC_STATUS_TONE: Record<AllocationStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  confirmed: "bg-primary/10 text-primary border border-primary/30",
  invoiced: "bg-primary/10 text-primary border border-primary/30",
  in_transit: "bg-warning/10 text-warning border border-warning/40",
  received: "bg-success/10 text-success border border-success/40",
  inspection: "bg-warning/10 text-warning border border-warning/40",
  completed: "bg-success/10 text-success border border-success/40",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const ALC_VSTATUS_LABEL: Record<AllocVehicleStatus, string> = {
  allocated: "مُخصصة", invoiced: "مفوترة", in_transit: "في الطريق",
  received: "مستلمة", inspection: "قيد الفحص", available: "متاحة للبيع",
  reserved: "محجوزة", sold: "مباعة", delivered: "تم التسليم",
  returned: "مرتجعة", rejected: "مرفوضة",
};
export const ALC_VSTATUS_TONE: Record<AllocVehicleStatus, string> = {
  allocated: "bg-primary/10 text-primary border border-primary/30",
  invoiced: "bg-primary/10 text-primary border border-primary/30",
  in_transit: "bg-warning/10 text-warning border border-warning/40",
  received: "bg-success/10 text-success border border-success/40",
  inspection: "bg-warning/10 text-warning border border-warning/40",
  available: "bg-success/10 text-success border border-success/40",
  reserved: "bg-warning/10 text-warning border border-warning/40",
  sold: "bg-primary/10 text-primary border border-primary/30",
  delivered: "bg-muted text-muted-foreground border border-border",
  returned: "bg-destructive/10 text-destructive border border-destructive/40",
  rejected: "bg-destructive/10 text-destructive border border-destructive/40",
};

/* ============================ Service ============================ */

export const allocationService = {
  list(): Allocation[] {
    return load().allocations.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  get(id: string) { return load().allocations.find(a => a.id === id); },
  listByPO(poId: string) { return load().allocations.filter(a => a.po_id === poId); },

  listConfirmations(): AllocationConfirmation[] {
    return load().confirmations.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getConfirmation(id: string) { return load().confirmations.find(c => c.id === id); },
  confirmationFor(allocId: string) {
    return load().confirmations.find(c => c.allocation_id === allocId);
  },

  /** Validate VIN uniqueness across all allocations and inventory. */
  vinExists(vin: string, excludeLineId?: string): boolean {
    const v = normalizeVIN(vin);
    if (!v) return false;
    const db = load();
    return db.allocations.some(a => a.lines.some(l =>
      normalizeVIN(l.vin) === v && l.id !== excludeLineId
    ));
  },

  /**
   * Backend-side full VIN governance for an allocation.
   * Used by Purchase Invoice creation to refuse issuing an invoice when any
   * vehicle has a missing or duplicate VIN.
   */
  validateAllVINs(allocId: string): { ok: true } | { ok: false; reason: string } {
    const a = load().allocations.find(x => x.id === allocId);
    if (!a) return { ok: false, reason: "التخصيص غير موجود" };
    if (a.lines.length === 0) return { ok: false, reason: "التخصيص لا يحتوي على أي مركبة" };
    const seen = new Set<string>();
    for (const l of a.lines) {
      const chk = validateVIN(l.vin);
      if (!chk.ok) return { ok: false, reason: `${chk.reason} — وحدة ${l.model} ${l.year ?? ""}`.trim() };
      const v = chk.normalized!;
      if (seen.has(v)) return { ok: false, reason: `VIN مكرر داخل التخصيص: ${v}` };
      if (this.vinExists(v, l.id)) return { ok: false, reason: `VIN موجود مسبقاً في تخصيص آخر: ${v}` };
      seen.add(v);
      if (!l.engine_no || !l.engine_no.trim()) {
        return { ok: false, reason: `رقم المحرك مطلوب لـ VIN ${v}` };
      }
    }
    return { ok: true };
  },

  /** Update VIN / engine number on an existing allocation line with full validation. */
  updateLineVIN(allocId: string, lineId: string, vin: string, engineNo?: string):
    { ok: true } | { ok: false; reason: string }
  {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId);
    if (!a) return { ok: false, reason: "التخصيص غير موجود" };
    const line = a.lines.find(l => l.id === lineId);
    if (!line) return { ok: false, reason: "السطر غير موجود" };
    const chk = validateVIN(vin);
    if (!chk.ok) return { ok: false, reason: chk.reason! };
    const v = chk.normalized!;
    if (this.vinExists(v, lineId)) return { ok: false, reason: `VIN موجود مسبقاً: ${v}` };
    // duplicate within same allocation
    if (a.lines.some(l => l.id !== lineId && normalizeVIN(l.vin) === v)) {
      return { ok: false, reason: `VIN مكرر داخل التخصيص: ${v}` };
    }
    line.vin = v;
    if (engineNo !== undefined) {
      if (!engineNo.trim()) return { ok: false, reason: "رقم المحرك لا يمكن أن يكون فارغاً" };
      line.engine_no = engineNo.trim();
    }
    save(db);
    return { ok: true };
  },

  /** Create a draft allocation against an approved PO. */
  createAllocation(input: {
    po_id: string;
    lines: Omit<AllocationLine, "id" | "status">[];
    actor?: string;
    role?: ErpGovRole;
  }): Allocation | { error: string } {
    const po = purchasingService.getPO(input.po_id);
    if (!po) return { error: "أمر الشراء غير موجود" };
    // Gov v1.3: Allocation requires supplier confirmation first
    const allowed = ["ready_for_allocation", "allocation_pending"];
    if (!allowed.includes(po.status)) {
      return { error: "لا يمكن التخصيص — يجب أن يكون أمر الشراء في حالة (جاهز للتخصيص) بعد تأكيد المورد" };
    }

    // VIN governance — format + uniqueness within request + uniqueness vs DB
    const seen = new Set<string>();
    const normalizedLines = input.lines.map(l => ({ ...l }));
    for (const l of normalizedLines) {
      const chk = validateVIN(l.vin);
      if (!chk.ok) return { error: chk.reason! };
      const v = chk.normalized!;
      if (seen.has(v)) return { error: `VIN مكرر داخل الطلب: ${v}` };
      if (this.vinExists(v)) return { error: `VIN موجود مسبقاً: ${v}` };
      if (!l.engine_no || !l.engine_no.trim()) {
        return { error: `رقم المحرك مطلوب لـ VIN ${v}` };
      }
      l.vin = v;
      l.engine_no = l.engine_no.trim();
      seen.add(v);
    }
    input = { ...input, lines: normalizedLines };

    const db = load();
    const year = new Date().getFullYear();
    const seq = db.allocations.filter(a => a.code.startsWith(`ALC-${year}`)).length + 12;
    const role: ErpGovRole = input.role ?? "purchasing_officer";
    const alloc: Allocation = {
      id: uid("alc"),
      code: `ALC-${year}-${String(seq).padStart(4, "0")}`,
      po_id: input.po_id,
      supplier_id: po.supplier_id,
      status: "draft",
      lines: input.lines.map(l => ({ ...l, id: uid("aln"), status: "allocated" })),
      created_at: isoNow(),
      audit: [makeAudit({ role, actor: input.actor, action: "إنشاء التخصيص", to_status: "draft" })],
      approvals: [],
    };
    db.allocations.unshift(alloc); save(db);
    return alloc;
  },

  /** Confirm a draft allocation (officer). */
  confirmAllocation(id: string, actor?: string, role: ErpGovRole = "purchasing_officer") {
    const db = load();
    const a = db.allocations.find(x => x.id === id); if (!a) return;
    if (a.status !== "draft") return;
    a.status = "confirmed";
    a.confirmed_at = isoNow();
    a.audit.push(makeAudit({ role, actor, action: "تأكيد التخصيص", from_status: "draft", to_status: "confirmed" }));
    save(db);
    // Notify PO that allocation completed (advance lifecycle if hook present)
    try { purchasingService.onAllocationConfirmed?.(a.po_id); } catch {}
  },

  cancelAllocation(id: string, reason?: string, role: ErpGovRole = "purchasing_manager") {
    const db = load();
    const a = db.allocations.find(x => x.id === id); if (!a) return;
    a.status = "cancelled";
    a.audit.push(makeAudit({ role, action: "إلغاء التخصيص", to_status: "cancelled", note: reason }));
    save(db);
  },

  /** Create formal Allocation Confirmation document. */
  createConfirmation(allocationId: string, notes?: string, actor?: string): AllocationConfirmation | { error: string } {
    const db = load();
    const a = db.allocations.find(x => x.id === allocationId);
    if (!a) return { error: "التخصيص غير موجود" };
    if (a.status === "draft") return { error: "يجب تأكيد التخصيص أولاً" };
    if (a.confirmation_id) return { error: "وثيقة التأكيد موجودة بالفعل" };
    const year = new Date().getFullYear();
    const seq = db.confirmations.filter(c => c.code.startsWith(`ALCC-${year}`)).length + 9;
    const cc: AllocationConfirmation = {
      id: uid("alcc"),
      code: `ALCC-${year}-${String(seq).padStart(4, "0")}`,
      allocation_id: a.id,
      supplier_id: a.supplier_id,
      po_id: a.po_id,
      allocation_date: (a.confirmed_at ?? a.created_at).slice(0, 10),
      vehicle_count: a.lines.length,
      vin_list: a.lines.map(l => l.vin),
      notes,
      created_at: isoNow(),
      audit: [makeAudit({ role: "purchasing_officer", actor, action: "إصدار وثيقة تأكيد التخصيص" })],
    };
    db.confirmations.unshift(cc);
    a.confirmation_id = cc.id;
    a.audit.push(makeAudit({ role: "purchasing_officer", actor, action: "ربط وثيقة تأكيد التخصيص", note: cc.code }));
    save(db);
    return cc;
  },

  attachInvoice(allocId: string, invoiceId: string, invoiceCode?: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    a.invoice_id = invoiceId;
    a.status = "invoiced";
    a.lines.forEach(l => { if (l.status === "allocated") l.status = "invoiced"; });
    a.audit.push(makeAudit({ role: "accounting", action: "ربط فاتورة شراء", note: invoiceCode, to_status: "invoiced" }));
    const cc = db.confirmations.find(c => c.allocation_id === allocId);
    if (cc) { cc.invoice_id = invoiceId; cc.audit.push(makeAudit({ role: "accounting", action: "ربط فاتورة بوثيقة التأكيد", note: invoiceCode })); }
    save(db);
  },

  /** Mark allocation lines in transit (after shipment dispatch). */
  markInTransit(allocId: string, actor?: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    a.status = "in_transit";
    a.lines.forEach(l => { if (l.status === "invoiced" || l.status === "allocated") l.status = "in_transit"; });
    a.audit.push(makeAudit({ role: "purchasing_officer", actor, action: "بدء الشحن", to_status: "in_transit" }));
    save(db);
  },

  /** Mark allocation lines as received after GRN. */
  markReceived(allocId: string, vinList?: string[], actor?: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    const target = vinList?.map(v => v.toUpperCase());
    a.lines.forEach(l => {
      if (target && !target.includes(l.vin.toUpperCase())) return;
      if (l.status === "in_transit" || l.status === "invoiced" || l.status === "allocated") l.status = "received";
    });
    if (a.lines.every(l => ["received","inspection","available","sold","delivered","rejected"].includes(l.status))) {
      a.status = "received";
    }
    a.audit.push(makeAudit({ role: "receiving", actor, action: "تأكيد استلام المركبات", note: vinList?.join(", ") }));
    save(db);
  },

  /** Move all received lines into inspection. */
  markInspection(allocId: string, actor?: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    a.lines.forEach(l => { if (l.status === "received") l.status = "inspection"; });
    a.status = "inspection";
    a.audit.push(makeAudit({ role: "inspection", actor, action: "بدء الفحص" }));
    save(db);
  },

  /** Mark a single VIN's inspection outcome. */
  setLineInspection(allocId: string, lineId: string, outcome: "passed" | "rejected", actor?: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    const l = a.lines.find(x => x.id === lineId); if (!l) return;
    l.status = outcome === "passed" ? "available" : "rejected";
    a.audit.push(makeAudit({
      role: "inspection", actor,
      action: outcome === "passed" ? "اعتماد الفحص — متاحة للبيع" : "رفض الفحص",
      note: `VIN ${l.vin}`,
    }));
    if (a.lines.every(x => ["available","rejected","sold","delivered"].includes(x.status))) {
      a.status = "completed";
    }
    save(db);
  },

  setLineInventoryId(allocId: string, lineId: string, inventoryVehicleId: string) {
    const db = load();
    const a = db.allocations.find(x => x.id === allocId); if (!a) return;
    const l = a.lines.find(x => x.id === lineId); if (!l) return;
    l.inventory_vehicle_id = inventoryVehicleId;
    save(db);
  },

  /** Lookup helpers for VIN timeline / sales picker bridge. */
  lineByVIN(vin: string): { allocation: Allocation; line: AllocationLine } | undefined {
    const v = vin.trim().toUpperCase();
    for (const a of load().allocations) {
      const l = a.lines.find(x => x.vin.toUpperCase() === v);
      if (l) return { allocation: a, line: l };
    }
    return undefined;
  },
};

/* ----- Register VIN governance gate with purchasing (avoids circular import) ----- */
import { _registerVinGate } from "./purchasing";
_registerVinGate((poId) => {
  const allocs = allocationService.list().filter(a => a.po_id === poId && a.status !== "cancelled");
  if (allocs.length === 0) {
    return { ok: false, reason: "يجب إنشاء تخصيص مركبات وتحديد VIN لكل وحدة قبل إصدار الفاتورة" };
  }
  for (const a of allocs) {
    const r = allocationService.validateAllVINs(a.id);
    if (r.ok === false) return { ok: false, reason: `التخصيص ${a.code}: ${r.reason}` };
  }
  return { ok: true };
});

