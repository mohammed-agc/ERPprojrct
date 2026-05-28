/**
 * Enterprise Purchasing & Supplier Credit Management
 * ---------------------------------------------------
 * Frontend operational contract only. All data is seeded and persisted in
 * localStorage so the UX behaves like a real ERP until the backend lands.
 *
 * Modules covered:
 *   - Purchase Requests (PR)
 *   - Purchase Orders (PO)
 *   - Supplier Credit Management
 *   - Supplier Incentives
 *   - Shipment Tracking
 *   - Goods Receiving
 *   - Inspection & Approval
 *   - Inventory Availability (computed)
 */

import { inventoryIntegration } from "./integration";
import { makeAudit, makeApproval, type AuditEntry, type ApprovalEntry, type ErpGovRole } from "./erpRoles";

const LS_KEY = "sarat.purchasing.v1";

/* ============================ Domain Types ============================ */

export type Urgency = "low" | "normal" | "high" | "critical";

export type PRStatus =
  | "draft" | "confirmed" | "pending" | "approved" | "rejected" | "converted_to_po";

export type POStatus =
  | "draft" | "approved"
  | "awaiting_supplier_confirmation" | "allocation_pending" | "ready_for_allocation"
  | "allocated" | "invoiced"
  | "ordered" | "partially_received"
  | "in_transit" | "received" | "inspection_pending" | "inventory_completed"
  | "completed" | "closed" | "cancelled";

export type ShipmentStatus =
  | "preparing" | "shipped" | "in_transit" | "at_customs" | "cleared" | "arrived";

export type ReceivingStatus =
  | "draft" | "receiving" | "pending" | "partial" | "partially_received"
  | "received" | "with_discrepancy" | "awaiting_inspection" | "completed" | "cancelled";

export type DiscrepancyKind = "missing" | "damaged" | "wrong_item" | "extra" | "supplier_issue";

export interface GRNDiscrepancy {
  id: string;
  line_id?: string;
  kind: DiscrepancyKind;
  qty?: number;
  notes?: string;
  reported_at: string;
}

export interface GRNReceiptItem {
  line_id: string;
  qty: number;
  condition: "ok" | "damaged" | "missing" | "wrong_item" | "extra";
  bin?: string;
  vin_pending?: boolean;       // vehicle without confirmed VIN
  chassis_verified?: boolean;
  sku_verified?: boolean;
  barcode_verified?: boolean;
  notes?: string;
}

export type InspectionStatus =
  | "pending" | "in_progress" | "approved" | "rejected";

export type ItemKind = "vehicle" | "part";

export interface LineItem {
  id: string;
  kind: ItemKind;
  description: string;     // "Toyota Camry 2025 / GLE" or "Brake Pad Set"
  qty: number;
  unit_cost: number;       // SAR
  received_qty?: number;
  inspected_qty?: number;
  approved_qty?: number;
}

export interface PurchaseRequest {
  id: string;
  code: string;            // PR-2026-0001
  requester: string;
  department: string;
  branch: string;
  urgency: Urgency;
  justification: string;
  items: LineItem[];
  status: PRStatus;
  created_at: string;
  approved_at?: string;
  approver?: string;
  po_id?: string;
  audit?: AuditEntry[];
  approvals?: ApprovalEntry[];
}

export type PaymentTerm = "cash" | "net_30" | "net_60" | "net_90" | "credit_line";

export interface PurchaseOrder {
  id: string;
  code: string;            // PO-2026-0001
  supplier_id: string;
  pr_id?: string;
  branch_destination: string;
  expected_delivery: string;
  payment_term: PaymentTerm;
  agreement_type: "spot" | "framework" | "consignment";
  items: LineItem[];
  status: POStatus;
  total: number;           // SAR
  created_at: string;
  approved_at?: string;
  ordered_at?: string;
  completed_at?: string;
  shipment_id?: string;
  awaiting_supplier_at?: string;
  supplier_confirmed_at?: string;
  supplier_confirm_outcome?: "confirm_all" | "confirm_partial" | "model_change" | "qty_change" | "rejected";
  supplier_confirm_note?: string;
  audit?: AuditEntry[];
  approvals?: ApprovalEntry[];
}


export interface Supplier {
  id: string;
  code: string;            // SUP-001
  name: string;
  country: string;
  contact?: string;
  agreement_type: "spot" | "framework" | "consignment";
  /* credit */
  credit_limit: number;        // SAR
  utilized: number;            // SAR (open POs + unpaid invoices)
  renewal_period_months: number;
  agreement_start: string;
  agreement_expiry: string;
  /* incentives */
  monthly_target: number;      // vehicles
  achieved: number;            // vehicles this period
  incentive_per_vehicle: number; // SAR
  campaign?: string;
}

export interface Shipment {
  id: string;
  code: string;            // SHP-2026-0001
  po_id: string;
  carrier: string;
  reference: string;       // BL number
  status: ShipmentStatus;
  customs_status: "not_started" | "in_progress" | "cleared";
  eta: string;
  origin: string;
  destination: string;
  created_at: string;
}

export interface ReceivingNote {
  id: string;
  code: string;            // GRN-2026-0001
  po_id: string;
  invoice_id?: string;
  shipment_ref?: string;
  branch?: string;
  warehouse: string;       // warehouse code/name (display)
  warehouse_id?: string;
  yard?: string;
  status: ReceivingStatus;
  inspection_status: InspectionStatus;
  received_at: string;
  created_at?: string;
  completed_at?: string;
  handoff_at?: string;
  receiver: string;
  notes?: string;
  discrepancy_notes?: string;
  items: GRNReceiptItem[];
  discrepancies?: GRNDiscrepancy[];
}

export interface InspectionRecord {
  id: string;
  grn_id: string;
  po_id: string;
  inspector: string;
  status: InspectionStatus;
  started_at: string;
  completed_at?: string;
  notes?: string;
  items: { line_id: string; passed: number; failed: number; remarks?: string }[];
  /** vehicle ids created in the `vehicles` table after approval (VIN governance) */
  vehicle_ids?: string[];
}


export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "credit_utilization";

export interface PurchaseInvoice {
  id: string;
  code: string;            // PINV-2026-0001
  po_id: string;
  supplier_id: string;
  issued_at: string;
  due_date: string;
  payment_term: PaymentTerm;
  subtotal: number;
  vat_amount: number;
  total: number;
  paid: number;
  status: InvoiceStatus;
  notes?: string;
}

export interface PurchasePayment {
  id: string;
  code: string;            // PPAY-2026-0001
  invoice_id: string;
  supplier_id: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paid_at: string;
  notes?: string;
}

interface DB {
  suppliers: Supplier[];
  prs: PurchaseRequest[];
  pos: PurchaseOrder[];
  shipments: Shipment[];
  grns: ReceivingNote[];
  inspections: InspectionRecord[];
  invoices: PurchaseInvoice[];
  payments: PurchasePayment[];
}


/* ============================ Storage ============================ */

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const today = () => new Date().toISOString().slice(0, 10);
const isoNow = () => new Date().toISOString();
const addDays = (days: number) => {
  const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
};

function seed(): DB {
  const sup1: Supplier = {
    id: "sup_toyota", code: "SUP-001", name: "Toyota Motor Corporation",
    country: "اليابان", agreement_type: "framework",
    credit_limit: 4_000_000, utilized: 2_800_000,
    renewal_period_months: 12, agreement_start: "2026-01-01", agreement_expiry: "2026-12-31",
    monthly_target: 40, achieved: 28, incentive_per_vehicle: 4_500,
    campaign: "Q2 2026 Hilux Push",
  };
  const sup2: Supplier = {
    id: "sup_hyundai", code: "SUP-002", name: "Hyundai Motor Company",
    country: "كوريا الجنوبية", agreement_type: "framework",
    credit_limit: 3_000_000, utilized: 1_450_000,
    renewal_period_months: 12, agreement_start: "2026-01-01", agreement_expiry: "2026-10-31",
    monthly_target: 30, achieved: 19, incentive_per_vehicle: 3_200,
    campaign: "Tucson Spring Drive",
  };
  const sup3: Supplier = {
    id: "sup_nissan", code: "SUP-003", name: "Nissan Motor Co.",
    country: "اليابان", agreement_type: "spot",
    credit_limit: 2_000_000, utilized: 2_080_000,
    renewal_period_months: 6, agreement_start: "2026-01-01", agreement_expiry: "2026-06-30",
    monthly_target: 20, achieved: 22, incentive_per_vehicle: 2_800,
  };
  const sup4: Supplier = {
    id: "sup_parts_kr", code: "SUP-004", name: "Korea OEM Parts Ltd.",
    country: "كوريا الجنوبية", agreement_type: "consignment",
    credit_limit: 800_000, utilized: 320_000,
    renewal_period_months: 12, agreement_start: "2026-01-15", agreement_expiry: "2027-01-14",
    monthly_target: 0, achieved: 0, incentive_per_vehicle: 0,
  };

  const pr1: PurchaseRequest = {
    id: "pr_1", code: "PR-2026-0142", requester: "خالد العتيبي",
    department: "المبيعات", branch: "الرياض الرئيسي",
    urgency: "high", justification: "نقص حاد في موديل Camry GLE — طلبات معلقة",
    items: [
      { id: uid("li"), kind: "vehicle", description: "Toyota Camry 2026 GLE", qty: 8, unit_cost: 105_000 },
      { id: uid("li"), kind: "vehicle", description: "Toyota Camry 2026 LE", qty: 4, unit_cost: 92_000 },
    ],
    status: "pending", created_at: addDays(-2),
  };
  const pr2: PurchaseRequest = {
    id: "pr_2", code: "PR-2026-0141", requester: "سعد الحربي",
    department: "قطع الغيار", branch: "جدة",
    urgency: "normal", justification: "تجديد مخزون قطع الفرامل للربع الثاني",
    items: [
      { id: uid("li"), kind: "part", description: "Brake Pad Set — Toyota", qty: 120, unit_cost: 180 },
      { id: uid("li"), kind: "part", description: "Brake Disc — Hyundai", qty: 60, unit_cost: 240 },
    ],
    status: "approved", created_at: addDays(-5), approved_at: addDays(-3), approver: "م. عبدالله",
  };
  const pr3: PurchaseRequest = {
    id: "pr_3", code: "PR-2026-0140", requester: "فهد الزهراني",
    department: "الورشة", branch: "الدمام",
    urgency: "critical", justification: "صيانة طارئة — قطع متخصصة",
    items: [{ id: uid("li"), kind: "part", description: "Transmission Kit", qty: 3, unit_cost: 12_500 }],
    status: "converted_to_po", created_at: addDays(-10), approved_at: addDays(-8), approver: "م. عبدالله", po_id: "po_3",
  };
  const pr4: PurchaseRequest = {
    id: "pr_4", code: "PR-2026-0143", requester: "نواف الشمري",
    department: "المبيعات", branch: "الرياض الرئيسي",
    urgency: "low", justification: "تنويع مخزون فئة الدفع الرباعي",
    items: [{ id: uid("li"), kind: "vehicle", description: "Hyundai Tucson 2026", qty: 6, unit_cost: 88_000 }],
    status: "draft", created_at: addDays(-1),
  };

  const po1: PurchaseOrder = {
    id: "po_1", code: "PO-2026-0231", supplier_id: "sup_toyota", branch_destination: "الرياض الرئيسي",
    expected_delivery: addDays(18), payment_term: "net_60", agreement_type: "framework",
    items: [
      { id: uid("li"), kind: "vehicle", description: "Toyota Hilux 2026 DLX", qty: 10, unit_cost: 138_000 },
      { id: uid("li"), kind: "vehicle", description: "Toyota Land Cruiser 2026", qty: 3, unit_cost: 295_000 },
    ],
    status: "ordered", total: 10 * 138_000 + 3 * 295_000,
    created_at: addDays(-15), approved_at: addDays(-14), ordered_at: addDays(-13), shipment_id: "shp_1",
  };
  const po2: PurchaseOrder = {
    id: "po_2", code: "PO-2026-0230", supplier_id: "sup_hyundai", branch_destination: "جدة",
    expected_delivery: addDays(4), payment_term: "net_30", agreement_type: "framework",
    items: [{ id: uid("li"), kind: "vehicle", description: "Hyundai Tucson 2026", qty: 8, unit_cost: 88_000, received_qty: 5 }],
    status: "partially_received", total: 8 * 88_000,
    created_at: addDays(-25), approved_at: addDays(-23), ordered_at: addDays(-22), shipment_id: "shp_2",
  };
  const po3: PurchaseOrder = {
    id: "po_3", code: "PO-2026-0228", supplier_id: "sup_parts_kr", branch_destination: "الدمام",
    expected_delivery: addDays(-2), payment_term: "net_30", agreement_type: "consignment",
    pr_id: "pr_3",
    items: [{ id: uid("li"), kind: "part", description: "Transmission Kit", qty: 3, unit_cost: 12_500, received_qty: 3, inspected_qty: 3, approved_qty: 3 }],
    status: "completed", total: 3 * 12_500,
    created_at: addDays(-9), approved_at: addDays(-8), ordered_at: addDays(-7), completed_at: addDays(-1),
  };
  const po4: PurchaseOrder = {
    id: "po_4", code: "PO-2026-0232", supplier_id: "sup_nissan", branch_destination: "الرياض الرئيسي",
    expected_delivery: addDays(30), payment_term: "credit_line", agreement_type: "spot",
    items: [{ id: uid("li"), kind: "vehicle", description: "Nissan Patrol 2026", qty: 4, unit_cost: 245_000 }],
    status: "draft", total: 4 * 245_000, created_at: addDays(-1),
  };

  const shp1: Shipment = {
    id: "shp_1", code: "SHP-2026-0098", po_id: "po_1", carrier: "K-Line Ro-Ro",
    reference: "BL-KL-44821", status: "in_transit", customs_status: "not_started",
    eta: addDays(18), origin: "Nagoya, JP", destination: "ميناء جدة الإسلامي",
    created_at: addDays(-12),
  };
  const shp2: Shipment = {
    id: "shp_2", code: "SHP-2026-0097", po_id: "po_2", carrier: "Glovis",
    reference: "BL-GL-22014", status: "cleared", customs_status: "cleared",
    eta: addDays(2), origin: "Ulsan, KR", destination: "ميناء جدة الإسلامي",
    created_at: addDays(-20),
  };

  const grn1: ReceivingNote = {
    id: "grn_1", code: "GRN-2026-0066", po_id: "po_2", warehouse: "مستودع جدة المركزي",
    status: "partial", inspection_status: "in_progress",
    received_at: addDays(-1), receiver: "م. ماجد",
    items: [{ line_id: po2.items[0].id, qty: 5, condition: "ok" }],
  };
  const grn2: ReceivingNote = {
    id: "grn_2", code: "GRN-2026-0065", po_id: "po_3", warehouse: "مستودع الدمام",
    status: "received", inspection_status: "approved",
    received_at: addDays(-3), receiver: "أ. مشعل",
    items: [{ line_id: po3.items[0].id, qty: 3, condition: "ok" }],
  };

  const insp1: InspectionRecord = {
    id: "insp_1", grn_id: "grn_1", po_id: "po_2", inspector: "م. ناصر",
    status: "in_progress", started_at: addDays(-1),
    items: [{ line_id: po2.items[0].id, passed: 4, failed: 0, remarks: "بانتظار فحص الوحدة الخامسة" }],
  };
  const insp2: InspectionRecord = {
    id: "insp_2", grn_id: "grn_2", po_id: "po_3", inspector: "م. ناصر",
    status: "approved", started_at: addDays(-3), completed_at: addDays(-2),
    items: [{ line_id: po3.items[0].id, passed: 3, failed: 0 }],
  };

  // Seed a sample purchase invoice for the completed PO3
  const pinv1: PurchaseInvoice = {
    id: "pinv_1", code: "PINV-2026-0042", po_id: "po_3", supplier_id: "sup_parts_kr",
    issued_at: addDays(-6), due_date: addDays(24), payment_term: "net_30",
    subtotal: 37_500, vat_amount: Math.round(37_500 * 0.15), total: Math.round(37_500 * 1.15),
    paid: Math.round(37_500 * 1.15), status: "paid",
  };
  const ppay1: PurchasePayment = {
    id: "ppay_1", code: "PPAY-2026-0031", invoice_id: "pinv_1", supplier_id: "sup_parts_kr",
    amount: Math.round(37_500 * 1.15), method: "bank_transfer", reference: "TRX-44218",
    paid_at: addDays(-4),
  };
  const pinv2: PurchaseInvoice = {
    id: "pinv_2", code: "PINV-2026-0043", po_id: "po_2", supplier_id: "sup_hyundai",
    issued_at: addDays(-18), due_date: addDays(12), payment_term: "net_30",
    subtotal: 8 * 88_000, vat_amount: Math.round(8 * 88_000 * 0.15), total: Math.round(8 * 88_000 * 1.15),
    paid: Math.round(8 * 88_000 * 1.15 * 0.4), status: "partially_paid",
  };
  const ppay2: PurchasePayment = {
    id: "ppay_2", code: "PPAY-2026-0032", invoice_id: "pinv_2", supplier_id: "sup_hyundai",
    amount: Math.round(8 * 88_000 * 1.15 * 0.4), method: "bank_transfer", reference: "TRX-44301",
    paid_at: addDays(-10),
  };

  return {
    suppliers: [sup1, sup2, sup3, sup4],
    prs: [pr1, pr2, pr3, pr4],
    pos: [po1, po2, po3, po4],
    shipments: [shp1, shp2],
    grns: [grn1, grn2],
    inspections: [insp1, insp2],
    invoices: [pinv1, pinv2],
    payments: [ppay1, ppay2],
  };
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
    const parsed = JSON.parse(raw) as Partial<DB>;
    // Backfill new collections for existing local DBs
    if (!parsed.invoices) parsed.invoices = [];
    if (!parsed.payments) parsed.payments = [];
    return parsed as DB;
  } catch {
    return seed();
  }
}

function save(db: DB) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(db));
}

/* ============================ Helpers ============================ */

export const URGENCY_LABEL: Record<Urgency, string> = {
  low: "منخفضة", normal: "عادية", high: "عالية", critical: "حرجة",
};
export const URGENCY_TONE: Record<Urgency, string> = {
  low: "bg-muted text-muted-foreground border border-border",
  normal: "bg-primary/10 text-primary border border-primary/30",
  high: "bg-warning/10 text-warning border border-warning/40",
  critical: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const PR_LABEL: Record<PRStatus, string> = {
  draft: "مسودة", confirmed: "مؤكد", pending: "بانتظار الاعتماد", approved: "معتمد",
  rejected: "مرفوض", converted_to_po: "تم تحويلها لأمر شراء",
};
export const PR_TONE: Record<PRStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  confirmed: "bg-primary/10 text-primary border border-primary/30",
  pending: "bg-warning/10 text-warning border border-warning/40",
  approved: "bg-success/10 text-success border border-success/40",
  rejected: "bg-destructive/10 text-destructive border border-destructive/40",
  converted_to_po: "bg-primary/10 text-primary border border-primary/30",
};

export const PO_LABEL: Record<POStatus, string> = {
  draft: "مسودة",
  approved: "معتمد",
  awaiting_supplier_confirmation: "بانتظار تأكيد المورد",
  allocation_pending: "بانتظار التخصيص",
  ready_for_allocation: "جاهز للتخصيص",
  allocated: "تم التخصيص",
  invoiced: "مفوتر",
  ordered: "تم الطلب",
  partially_received: "مستلم جزئياً",
  in_transit: "في الطريق",
  received: "تم الاستلام",
  inspection_pending: "بانتظار الفحص",
  inventory_completed: "تم الإدخال للمخزون",
  completed: "مكتمل",
  closed: "مُقفل",
  cancelled: "ملغى",
};
export const PO_TONE: Record<POStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  approved: "bg-primary/10 text-primary border border-primary/30",
  awaiting_supplier_confirmation: "bg-warning/10 text-warning border border-warning/40",
  allocation_pending: "bg-warning/10 text-warning border border-warning/40",
  ready_for_allocation: "bg-primary/10 text-primary border border-primary/30",
  allocated: "bg-primary/10 text-primary border border-primary/30",
  invoiced: "bg-primary/10 text-primary border border-primary/30",
  ordered: "bg-primary/10 text-primary border border-primary/30",
  partially_received: "bg-warning/10 text-warning border border-warning/40",
  in_transit: "bg-warning/10 text-warning border border-warning/40",
  received: "bg-success/10 text-success border border-success/40",
  inspection_pending: "bg-warning/10 text-warning border border-warning/40",
  inventory_completed: "bg-success/10 text-success border border-success/40",
  completed: "bg-success/10 text-success border border-success/40",
  closed: "bg-muted text-muted-foreground border border-border",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const SHIPMENT_LABEL: Record<ShipmentStatus, string> = {
  preparing: "قيد التحضير", shipped: "تم الشحن", in_transit: "في الطريق",
  at_customs: "في الجمارك", cleared: "تم التخليص", arrived: "وصلت",
};
export const SHIPMENT_TONE: Record<ShipmentStatus, string> = {
  preparing: "bg-muted text-muted-foreground border border-border",
  shipped: "bg-primary/10 text-primary border border-primary/30",
  in_transit: "bg-primary/10 text-primary border border-primary/30",
  at_customs: "bg-warning/10 text-warning border border-warning/40",
  cleared: "bg-success/10 text-success border border-success/40",
  arrived: "bg-success/10 text-success border border-success/40",
};

export const RECV_LABEL: Record<ReceivingStatus, string> = {
  draft: "مسودة",
  receiving: "قيد الاستلام",
  pending: "بانتظار الاستلام",
  partial: "استلام جزئي",
  partially_received: "مستلم جزئياً",
  received: "تم الاستلام",
  with_discrepancy: "بفروقات",
  awaiting_inspection: "بانتظار الفحص",
  completed: "مكتمل",
  cancelled: "ملغى",
};
export const RECV_TONE: Record<ReceivingStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  receiving: "bg-primary/10 text-primary border border-primary/30",
  pending: "bg-muted text-muted-foreground border border-border",
  partial: "bg-warning/10 text-warning border border-warning/40",
  partially_received: "bg-warning/10 text-warning border border-warning/40",
  received: "bg-success/10 text-success border border-success/40",
  with_discrepancy: "bg-destructive/10 text-destructive border border-destructive/40",
  awaiting_inspection: "bg-primary/10 text-primary border border-primary/30",
  completed: "bg-success/10 text-success border border-success/40",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const DISCREPANCY_LABEL: Record<DiscrepancyKind, string> = {
  missing: "كمية ناقصة",
  damaged: "تالف",
  wrong_item: "صنف خاطئ",
  extra: "كمية زائدة",
  supplier_issue: "خطأ من المورد",
};
export const DISCREPANCY_TONE: Record<DiscrepancyKind, string> = {
  missing: "bg-warning/10 text-warning border border-warning/40",
  damaged: "bg-destructive/10 text-destructive border border-destructive/40",
  wrong_item: "bg-destructive/10 text-destructive border border-destructive/40",
  extra: "bg-primary/10 text-primary border border-primary/30",
  supplier_issue: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const INSP_LABEL: Record<InspectionStatus, string> = {
  pending: "بانتظار الفحص", in_progress: "قيد الفحص",
  approved: "معتمد", rejected: "مرفوض",
};
export const INSP_TONE: Record<InspectionStatus, string> = {
  pending: "bg-muted text-muted-foreground border border-border",
  in_progress: "bg-warning/10 text-warning border border-warning/40",
  approved: "bg-success/10 text-success border border-success/40",
  rejected: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const PINV_LABEL: Record<InvoiceStatus, string> = {
  draft: "مسودة", issued: "صادرة", partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة", cancelled: "ملغاة",
};
export const PINV_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  issued: "bg-primary/10 text-primary border border-primary/30",
  partially_paid: "bg-warning/10 text-warning border border-warning/40",
  paid: "bg-success/10 text-success border border-success/40",
  cancelled: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقدي", bank_transfer: "حوالة بنكية",
  cheque: "شيك", credit_utilization: "استخدام حد ائتماني",
};

/** ERP purchasing workflow stages (governance steps). */
export const PURCHASING_WORKFLOW = [
  { key: "pr", label: "طلب شراء" },
  { key: "pr_approved", label: "اعتماد الطلب" },
  { key: "po", label: "أمر شراء" },
  { key: "po_approved", label: "اعتماد الأمر" },
  { key: "invoice", label: "فاتورة شراء" },
  { key: "payment", label: "السداد" },
  { key: "receiving", label: "الاستلام" },
  { key: "inspection", label: "الفحص" },
  { key: "intake", label: "إدخال المخزون" },
];

export const fmtSAR = (n: number) =>
  `${Math.round(n).toLocaleString("ar-SA")} ر.س`;
export const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

/* ============================ Service ============================ */

export const purchasingService = {
  /* suppliers */
  listSuppliers(): Supplier[] { return load().suppliers; },
  getSupplier(id: string): Supplier | undefined { return load().suppliers.find(s => s.id === id); },

  /**
   * Provision a Supplier record from a Contact (vendor role) if one doesn't
   * already exist for that contact. Returns the supplier id to use in POs.
   * Uses contact meta defaults (credit_limit, payment_terms_days) when available.
   */
  upsertSupplierFromContact(input: {
    contact_id: string;
    code: string;
    name: string;
    country?: string;
    credit_limit?: number;
    payment_terms_days?: number;
  }): string {
    const db = load();
    const existingById = db.suppliers.find(s => s.id === `contact_${input.contact_id}`);
    if (existingById) return existingById.id;
    const supplier: Supplier = {
      id: `contact_${input.contact_id}`,
      code: input.code || `SUP-C-${input.contact_id.slice(0, 6)}`,
      name: input.name,
      country: input.country || "SA",
      agreement_type: "spot",
      credit_limit: input.credit_limit ?? 0,
      utilized: 0,
      renewal_period_months: 12,
      agreement_start: today(),
      agreement_expiry: addDays(365),
      monthly_target: 0,
      achieved: 0,
      incentive_per_vehicle: 0,
    };
    db.suppliers.unshift(supplier); save(db);
    return supplier.id;
  },


  creditSummary(s: Supplier) {
    const remaining = s.credit_limit - s.utilized;
    const usage = s.credit_limit > 0 ? Math.min(100, (s.utilized / s.credit_limit) * 100) : 0;
    const over = s.utilized > s.credit_limit;
    const daysToExpiry = Math.ceil(
      (new Date(s.agreement_expiry).getTime() - Date.now()) / 86_400_000,
    );
    return { remaining, usage, over, daysToExpiry };
  },
  expectedIncentive(s: Supplier) {
    return { vehicles: s.achieved, total: s.achieved * s.incentive_per_vehicle, target: s.monthly_target };
  },

  /* purchase requests */
  listPRs(): PurchaseRequest[] {
    return load().prs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  approvePR(id: string, approver = "م. عبدالله") {
    const db = load();
    const pr = db.prs.find(p => p.id === id); if (!pr) return;
    pr.status = "approved"; pr.approved_at = isoNow(); pr.approver = approver;
    save(db);
  },
  rejectPR(id: string) {
    const db = load();
    const pr = db.prs.find(p => p.id === id); if (!pr) return;
    pr.status = "rejected";
    save(db);
  },

  createPR(input: {
    requester: string; department: string; branch: string;
    urgency: Urgency; justification: string;
    items: { kind: ItemKind; description: string; qty: number; unit_cost: number }[];
    submit?: boolean;
  }): PurchaseRequest {
    const db = load();
    const year = new Date().getFullYear();
    const seq = db.prs.filter(p => p.code.startsWith(`PR-${year}`)).length + 143;
    const pr: PurchaseRequest = {
      id: uid("pr"),
      code: `PR-${year}-${String(seq).padStart(4, "0")}`,
      requester: input.requester, department: input.department, branch: input.branch,
      urgency: input.urgency, justification: input.justification,
      items: input.items.map(i => ({ id: uid("li"), ...i })),
      status: input.submit ? "pending" : "draft",
      created_at: isoNow(),
    };
    db.prs.unshift(pr); save(db); return pr;
  },

  /* purchase orders */
  listPOs(): PurchaseOrder[] {
    return load().pos.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getPO(id: string) { return load().pos.find(p => p.id === id); },
  createPO(input: {
    supplier_id: string; branch_destination: string; expected_delivery: string;
    payment_term: PaymentTerm; agreement_type: "spot" | "framework" | "consignment";
    items: { kind: ItemKind; description: string; qty: number; unit_cost: number }[];
    pr_id?: string; submit?: boolean;
  }): PurchaseOrder {
    const db = load();
    const year = new Date().getFullYear();
    const seq = db.pos.filter(p => p.code.startsWith(`PO-${year}`)).length + 233;
    const items = input.items.map(i => ({ id: uid("li"), ...i }));
    const po: PurchaseOrder = {
      id: uid("po"),
      code: `PO-${year}-${String(seq).padStart(4, "0")}`,
      supplier_id: input.supplier_id,
      pr_id: input.pr_id,
      branch_destination: input.branch_destination,
      expected_delivery: input.expected_delivery,
      payment_term: input.payment_term,
      agreement_type: input.agreement_type,
      items,
      status: input.submit ? "approved" : "draft",
      total: items.reduce((s, i) => s + i.qty * i.unit_cost, 0),
      created_at: isoNow(),
      approved_at: input.submit ? isoNow() : undefined,
    };
    db.pos.unshift(po); save(db); return po;
  },

  /** Submit a draft PO into the approval queue */
  submitPOForApproval(id: string) {
    const db = load();
    const po = db.pos.find(p => p.id === id); if (!po) return;
    if (po.status !== "draft") return;
    // keep status as draft but mark as pending via approved_at undefined; UI uses status==="draft" + flag
    save(db);
  },
  approvePO(id: string, approver = "م. عبدالله") {
    const db = load();
    const po = db.pos.find(p => p.id === id); if (!po) return;
    if (po.status === "draft") {
      po.status = "approved"; po.approved_at = isoNow();
      save(db);
    }
  },
  rejectPO(id: string) {
    const db = load();
    const po = db.pos.find(p => p.id === id); if (!po) return;
    po.status = "cancelled"; save(db);
  },

  /** Convert an approved PR into a fresh PO (draft state, prefilled). */
  convertPRToPO(prId: string, input: {
    supplier_id: string; branch_destination?: string; expected_delivery?: string;
    payment_term?: PaymentTerm; agreement_type?: "spot" | "framework" | "consignment";
    submit?: boolean;
  }): PurchaseOrder | undefined {
    const db = load();
    const pr = db.prs.find(p => p.id === prId);
    if (!pr || pr.status !== "approved") return undefined;
    const po = this.createPO({
      supplier_id: input.supplier_id,
      branch_destination: input.branch_destination ?? pr.branch,
      expected_delivery: input.expected_delivery ?? addDays(14),
      payment_term: input.payment_term ?? "net_30",
      agreement_type: input.agreement_type ?? "spot",
      items: pr.items.map(i => ({ kind: i.kind, description: i.description, qty: i.qty, unit_cost: i.unit_cost })),
      pr_id: pr.id, submit: input.submit,
    });
    // mark PR as converted
    const fresh = load();
    const prx = fresh.prs.find(x => x.id === prId);
    if (prx) { prx.status = "converted_to_po"; prx.po_id = po.id; save(fresh); }
    return po;
  },

  /* ============ Purchase Invoices ============ */
  listPurchaseInvoices(): PurchaseInvoice[] {
    return load().invoices.slice().sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  },
  getPurchaseInvoice(id: string) { return load().invoices.find(i => i.id === id); },
  invoicesForPO(poId: string) { return load().invoices.filter(i => i.po_id === poId); },

  /** Create a purchase invoice from an approved PO. */
  createPurchaseInvoice(input: {
    po_id: string; vat_pct?: number; due_date?: string; notes?: string;
  }): PurchaseInvoice | undefined {
    const db = load();
    const po = db.pos.find(p => p.id === input.po_id);
    if (!po) return undefined;
    if (!["approved", "ordered", "partially_received", "completed"].includes(po.status)) return undefined;
    const year = new Date().getFullYear();
    const seq = db.invoices.filter(i => i.code.startsWith(`PINV-${year}`)).length + 44;
    const vatPct = input.vat_pct ?? 15;
    const subtotal = po.total;
    const vat = Math.round(subtotal * (vatPct / 100));
    const inv: PurchaseInvoice = {
      id: uid("pinv"),
      code: `PINV-${year}-${String(seq).padStart(4, "0")}`,
      po_id: po.id, supplier_id: po.supplier_id,
      issued_at: isoNow(),
      due_date: input.due_date ?? addDays(po.payment_term === "cash" ? 0 : po.payment_term === "net_60" ? 60 : po.payment_term === "net_90" ? 90 : 30),
      payment_term: po.payment_term,
      subtotal, vat_amount: vat, total: subtotal + vat,
      paid: 0, status: "issued", notes: input.notes,
    };
    db.invoices.unshift(inv);
    // Advance PO into ordered state once invoice issued
    if (po.status === "approved") po.status = "ordered", po.ordered_at = isoNow();
    save(db);
    return inv;
  },

  /* ============ Purchase Payments ============ */
  listPurchasePayments(): PurchasePayment[] {
    return load().payments.slice().sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  },
  paymentsForInvoice(invoiceId: string) {
    return load().payments.filter(p => p.invoice_id === invoiceId);
  },
  recordPurchasePayment(input: {
    invoice_id: string; amount: number; method: PaymentMethod;
    reference?: string; notes?: string;
  }): PurchasePayment | undefined {
    const db = load();
    const inv = db.invoices.find(i => i.id === input.invoice_id);
    if (!inv) return undefined;
    if (inv.status === "paid" || inv.status === "cancelled") return undefined;
    const remaining = inv.total - inv.paid;
    const amount = Math.min(input.amount, remaining);
    const year = new Date().getFullYear();
    const seq = db.payments.filter(p => p.code.startsWith(`PPAY-${year}`)).length + 33;
    const pay: PurchasePayment = {
      id: uid("ppay"),
      code: `PPAY-${year}-${String(seq).padStart(4, "0")}`,
      invoice_id: inv.id, supplier_id: inv.supplier_id,
      amount, method: input.method, reference: input.reference,
      paid_at: isoNow(), notes: input.notes,
    };
    db.payments.unshift(pay);
    inv.paid += amount;
    inv.status = inv.paid >= inv.total ? "paid" : "partially_paid";
    // Credit utilization affects supplier balance
    if (input.method === "credit_utilization") {
      const sup = db.suppliers.find(s => s.id === inv.supplier_id);
      if (sup) sup.utilized = Math.max(0, sup.utilized - amount);
    }
    save(db);
    return pay;
  },

  /** Aggregate paid total for a PO across all its invoices. */
  poPaymentSummary(poId: string) {
    const invs = this.invoicesForPO(poId);
    const billed = invs.reduce((s, i) => s + i.total, 0);
    const paid = invs.reduce((s, i) => s + i.paid, 0);
    const fullyPaid = invs.length > 0 && invs.every(i => i.status === "paid");
    const anyIssued = invs.some(i => i.status !== "draft" && i.status !== "cancelled");
    return { billed, paid, fullyPaid, anyIssued, remaining: billed - paid };
  },

  /* ============ Workflow Gates ============ */
  /** Receiving is allowed only after the PO is approved and an invoice is issued. */
  canCreateGRN(poId: string): { allowed: boolean; reason?: string } {
    const po = this.getPO(poId);
    if (!po) return { allowed: false, reason: "أمر شراء غير موجود" };
    if (po.status === "draft") return { allowed: false, reason: "الأمر بمسودة — لم يتم اعتماده بعد" };
    if (po.status === "cancelled") return { allowed: false, reason: "الأمر ملغى" };
    const inv = this.invoicesForPO(poId);
    if (inv.length === 0) return { allowed: false, reason: "لم تُصدر فاتورة شراء لهذا الأمر بعد" };
    return { allowed: true };
  },
  /** Inventory intake is allowed only after inspection is approved AND payment terms satisfied. */
  canIntake(inspectionId: string): { allowed: boolean; reason?: string } {
    const db = load();
    const i = db.inspections.find(x => x.id === inspectionId);
    if (!i) return { allowed: false, reason: "سجل الفحص غير موجود" };
    if (i.status !== "approved") return { allowed: false, reason: "الفحص غير معتمد" };
    const ps = this.poPaymentSummary(i.po_id);
    const po = this.getPO(i.po_id);
    // For cash/credit_line terms require full payment; for net terms allow on issued invoice.
    if (po?.payment_term === "cash" && !ps.fullyPaid) {
      return { allowed: false, reason: "شروط الدفع نقدي — يجب السداد الكامل قبل الإدخال" };
    }
    if (!ps.anyIssued) return { allowed: false, reason: "لم تُصدر فاتورة شراء بعد" };
    return { allowed: true };
  },

  /** Determine the current workflow stage key for a PO. */
  currentStage(poId: string): string {
    const po = this.getPO(poId); if (!po) return "pr";
    if (po.status === "cancelled") return "cancelled";
    const insp = load().inspections.find(i => i.po_id === poId);
    if (insp?.vehicle_ids && insp.vehicle_ids.length > 0) return "intake";
    if (insp?.status === "approved") return "inspection";
    if (insp) return "inspection";
    const grn = load().grns.find(g => g.po_id === poId);
    if (grn) return "receiving";
    const ps = this.poPaymentSummary(poId);
    if (ps.paid > 0) return "payment";
    if (ps.anyIssued) return "invoice";
    if (po.status === "approved" || po.status === "ordered") return "po_approved";
    if (po.status === "draft") return "po";
    return "po";
  },



  /* shipments */
  listShipments(): Shipment[] {
    return load().shipments.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  /* ============ Receiving / GRN governance ============ */
  listGRNs(): ReceivingNote[] {
    return load().grns.slice().sort((a, b) => (b.received_at || "").localeCompare(a.received_at || ""));
  },
  getGRN(id: string) { return load().grns.find(g => g.id === id); },
  grnsForPO(poId: string) { return load().grns.filter(g => g.po_id === poId); },

  /** Aggregate ordered/received/remaining per line and overall for a PO from all GRNs. */
  poReceivingProgress(poId: string) {
    const po = this.getPO(poId);
    if (!po) return { lines: [], orderedQty: 0, receivedQty: 0, remainingQty: 0, pct: 0 };
    const grns = this.grnsForPO(poId);
    const lines = po.items.map(li => {
      const received = grns.reduce((s, g) => s + g.items
        .filter(it => it.line_id === li.id && it.condition !== "missing" && it.condition !== "wrong_item")
        .reduce((x, it) => x + (it.qty || 0), 0), 0);
      const remaining = Math.max(0, li.qty - received);
      return { line_id: li.id, description: li.description, kind: li.kind, ordered: li.qty, received, remaining };
    });
    const orderedQty = lines.reduce((s, l) => s + l.ordered, 0);
    const receivedQty = lines.reduce((s, l) => s + l.received, 0);
    const remainingQty = Math.max(0, orderedQty - receivedQty);
    return { lines, orderedQty, receivedQty, remainingQty, pct: orderedQty ? (receivedQty / orderedQty) * 100 : 0 };
  },

  /** Create a Draft GRN for an approved PO (gate enforced by canCreateGRN). */
  createGRN(input: {
    po_id: string;
    invoice_id?: string;
    warehouse: string;
    warehouse_id?: string;
    branch?: string;
    yard?: string;
    receiver: string;
    shipment_ref?: string;
    notes?: string;
  }): ReceivingNote | undefined {
    const gate = this.canCreateGRN(input.po_id);
    if (!gate.allowed) return undefined;
    const db = load();
    const po = db.pos.find(p => p.id === input.po_id);
    if (!po) return undefined;
    const year = new Date().getFullYear();
    const seq = db.grns.filter(g => g.code.startsWith(`GRN-${year}`)).length + 67;
    const grn: ReceivingNote = {
      id: uid("grn"),
      code: `GRN-${year}-${String(seq).padStart(4, "0")}`,
      po_id: po.id,
      invoice_id: input.invoice_id,
      warehouse: input.warehouse,
      warehouse_id: input.warehouse_id,
      branch: input.branch || po.branch_destination,
      yard: input.yard,
      shipment_ref: input.shipment_ref,
      status: "draft",
      inspection_status: "pending",
      received_at: today(),
      created_at: isoNow(),
      receiver: input.receiver,
      notes: input.notes,
      items: [],
      discrepancies: [],
    };
    db.grns.unshift(grn); save(db);
    return grn;
  },

  /** Record a partial receipt against a GRN. Appends items and recomputes status. */
  recordReceipt(grnId: string, items: GRNReceiptItem[]) {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    if (grn.status === "completed" || grn.status === "cancelled") return;
    grn.items = [...grn.items, ...items.filter(i => (i.qty || 0) > 0)];
    grn.received_at = today();
    this._syncGRNStatus(db, grn);
    save(db);
  },

  assignWarehouse(grnId: string, input: { warehouse: string; warehouse_id?: string; yard?: string }) {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    grn.warehouse = input.warehouse;
    grn.warehouse_id = input.warehouse_id;
    grn.yard = input.yard;
    save(db);
  },

  addDiscrepancy(grnId: string, d: Omit<GRNDiscrepancy, "id" | "reported_at">) {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    grn.discrepancies = [...(grn.discrepancies ?? []), {
      id: uid("disc"), reported_at: isoNow(), ...d,
    }];
    this._syncGRNStatus(db, grn);
    save(db);
  },

  cancelGRN(grnId: string) {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    if (grn.status === "completed") return;
    grn.status = "cancelled";
    save(db);
  },

  /** Mark the GRN as fully received and ready for inspection handoff. */
  completeGRN(grnId: string) {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    if (grn.items.length === 0) return;
    const hasDisc = (grn.discrepancies?.length ?? 0) > 0
      || grn.items.some(i => i.condition !== "ok");
    grn.status = hasDisc ? "with_discrepancy" : "received";
    grn.completed_at = isoNow();
    // mirror onto PO line received_qty (compute inline from in-memory db)
    const po = db.pos.find(p => p.id === grn.po_id);
    if (po) {
      const allGrns = db.grns.filter(g => g.po_id === po.id);
      let orderedQty = 0, receivedQty = 0;
      po.items.forEach(li => {
        const recv = allGrns.reduce((s, g) => s + g.items
          .filter(it => it.line_id === li.id && it.condition !== "missing" && it.condition !== "wrong_item")
          .reduce((x, it) => x + (it.qty || 0), 0), 0);
        li.received_qty = recv;
        orderedQty += li.qty;
        receivedQty += recv;
      });
      if (receivedQty >= orderedQty) {
        po.status = "completed";
        po.completed_at = isoNow();
      } else if (receivedQty > 0) {
        po.status = "partially_received";
      }
    }
    save(db);
  },

  /** Hand-off GRN to Inspection — auto-creates an inspection record if missing. */
  handoffToInspection(grnId: string, inspector = "م. ناصر") {
    const db = load();
    const grn = db.grns.find(g => g.id === grnId); if (!grn) return;
    if (grn.status !== "received" && grn.status !== "with_discrepancy") return;
    grn.status = "awaiting_inspection";
    grn.handoff_at = isoNow();
    grn.inspection_status = "pending";
    const existing = db.inspections.find(i => i.grn_id === grn.id);
    if (!existing) {
      const insp: InspectionRecord = {
        id: uid("insp"),
        grn_id: grn.id,
        po_id: grn.po_id,
        inspector,
        status: "pending",
        started_at: isoNow(),
        items: grn.items
          .filter(it => it.condition === "ok" || it.condition === "damaged")
          .map(it => ({ line_id: it.line_id, passed: 0, failed: 0 })),
      };
      db.inspections.unshift(insp);
    }
    save(db);
  },

  /** Internal: recompute GRN.status based on items + discrepancies + PO totals. */
  _syncGRNStatus(db: DB, grn: ReceivingNote) {
    if (grn.status === "completed" || grn.status === "cancelled"
      || grn.status === "awaiting_inspection") return;
    const po = db.pos.find(p => p.id === grn.po_id);
    if (!po) return;
    const totals = grn.items.reduce((acc, it) => {
      if (it.condition === "ok" || it.condition === "damaged" || it.condition === "extra") acc.recv += it.qty;
      return acc;
    }, { recv: 0 });
    const ordered = po.items.reduce((s, l) => s + l.qty, 0);
    const hasDisc = (grn.discrepancies?.length ?? 0) > 0
      || grn.items.some(i => i.condition !== "ok");
    if (totals.recv === 0) grn.status = "draft";
    else if (hasDisc && totals.recv >= ordered) grn.status = "with_discrepancy";
    else if (totals.recv >= ordered) grn.status = "received";
    else grn.status = "partial";
  },

  /** GRN-specific dashboard KPIs. */
  grnDashboard() {
    const db = load();
    const grns = db.grns;
    const todayISO = today();
    const draftOrReceiving = grns.filter(g => ["draft", "receiving", "pending", "partial"].includes(g.status)).length;
    const partial = grns.filter(g => g.status === "partial" || g.status === "partially_received").length;
    const awaitingInspection = grns.filter(g => g.status === "awaiting_inspection"
      || (g.inspection_status === "pending" && (g.status === "received" || g.status === "with_discrepancy"))).length;
    const discrepancy = grns.filter(g => g.status === "with_discrepancy"
      || (g.discrepancies?.length ?? 0) > 0).length;
    const receivedToday = grns.filter(g => (g.received_at || "").slice(0, 10) === todayISO).length;
    const completed = grns.filter(g => g.status === "completed").length;
    // supplier perf
    const bySupplier = new Map<string, { name: string; total: number; clean: number }>();
    grns.forEach(g => {
      const po = db.pos.find(p => p.id === g.po_id); if (!po) return;
      const sup = db.suppliers.find(s => s.id === po.supplier_id); if (!sup) return;
      const e = bySupplier.get(sup.id) || { name: sup.name, total: 0, clean: 0 };
      e.total += 1;
      if (g.status === "received" || g.status === "completed") e.clean += 1;
      bySupplier.set(sup.id, e);
    });
    const supplierPerf = Array.from(bySupplier.entries()).map(([id, v]) => ({
      supplier_id: id, name: v.name, total: v.total,
      clean_rate: v.total ? (v.clean / v.total) * 100 : 0,
    })).sort((a, b) => b.total - a.total).slice(0, 6);
    return {
      total: grns.length,
      draftOrReceiving, partial, awaitingInspection,
      discrepancy, receivedToday, completed, supplierPerf,
    };
  },



  /* inspection */
  listInspections(): InspectionRecord[] {
    return load().inspections.slice().sort((a, b) => b.started_at.localeCompare(a.started_at));
  },
  setInspectionStatus(id: string, status: InspectionStatus) {
    const db = load();
    const i = db.inspections.find(x => x.id === id); if (!i) return;
    const wasApproved = i.status === "approved";
    i.status = status;
    if (status === "approved" || status === "rejected") i.completed_at = isoNow();
    // sync GRN inspection status
    const grn = db.grns.find(g => g.id === i.grn_id);
    if (grn) grn.inspection_status = status;
    save(db);
    // Inventory integration: on first approval, push parts into inventory + log movements
    if (status === "approved" && !wasApproved) {
      const po = db.pos.find(p => p.id === i.po_id);
      try { inventoryIntegration.onInspectionApproved(i, po); } catch (e) { console.warn("inv-integration:", e); }
    }
  },

  /** Record vehicle inventory ids created from an approved inspection (VIN governance). */
  recordVehicleIntake(inspectionId: string, vehicleIds: string[]) {
    const db = load();
    const i = db.inspections.find(x => x.id === inspectionId); if (!i) return;
    i.vehicle_ids = [...(i.vehicle_ids ?? []), ...vehicleIds];
    save(db);
  },


  /* dashboards */
  dashboard() {
    const db = load();
    const pending_prs = db.prs.filter(p => p.status === "pending").length;
    const open_pos = db.pos.filter(p => ["approved", "ordered", "partially_received"].includes(p.status)).length;
    const in_transit = db.shipments.filter(s => ["shipped", "in_transit", "at_customs"].includes(s.status)).length;
    const awaiting_inspection = db.inspections.filter(i => i.status !== "approved" && i.status !== "rejected").length;
    const over_limit = db.suppliers.filter(s => s.utilized > s.credit_limit).length;
    const expiring_agreements = db.suppliers.filter(s => {
      const d = (new Date(s.agreement_expiry).getTime() - Date.now()) / 86_400_000;
      return d <= 60 && d >= 0;
    }).length;
    const open_po_value = db.pos
      .filter(p => p.status !== "completed" && p.status !== "cancelled")
      .reduce((s, p) => s + p.total, 0);
    return {
      pending_prs, open_pos, in_transit, awaiting_inspection,
      over_limit, expiring_agreements, open_po_value,
    };
  },

  /* inventory availability gate */
  availability(po: PurchaseOrder) {
    const totalQty = po.items.reduce((s, i) => s + i.qty, 0);
    const approvedQty = po.items.reduce((s, i) => s + (i.approved_qty ?? 0), 0);
    const receivedQty = po.items.reduce((s, i) => s + (i.received_qty ?? 0), 0);
    return {
      totalQty, approvedQty, receivedQty,
      availableForSale: approvedQty,
      pctReceived: totalQty ? (receivedQty / totalQty) * 100 : 0,
      pctSellable: totalQty ? (approvedQty / totalQty) * 100 : 0,
      gated: approvedQty < receivedQty,
    };
  },

  /* ============ Supplier 360 (for Contacts → Vendor profile) ============ */

  supplierExposure(supplierId: string) {
    const db = load();
    const pos = db.pos.filter(p => p.supplier_id === supplierId);
    const openPos = pos.filter(p => ["approved", "ordered", "partially_received"].includes(p.status));
    const payable = openPos.reduce((s, p) => s + p.total, 0);
    // synthetic overdue heuristic: net_30/net_60 past expected_delivery
    const overdue = openPos
      .filter(p => new Date(p.expected_delivery) < new Date())
      .reduce((s, p) => s + p.total, 0);
    const pendingShipments = db.shipments.filter(
      sh => ["preparing", "shipped", "in_transit", "at_customs"].includes(sh.status) &&
        pos.some(p => p.id === sh.po_id),
    ).length;
    const pendingInspections = db.inspections.filter(
      i => (i.status === "pending" || i.status === "in_progress") &&
        pos.some(p => p.id === i.po_id),
    ).length;
    return {
      payable, overdue_payable: overdue,
      pending_pos: openPos.length,
      pending_shipments: pendingShipments,
      pending_inspections: pendingInspections,
    };
  },

  supplierPerformance(supplierId: string) {
    const db = load();
    const pos = db.pos.filter(p => p.supplier_id === supplierId);
    const completed = pos.filter(p => p.status === "completed" && p.completed_at);
    const avgDeliveryDays = completed.length
      ? Math.round(
        completed.reduce((s, p) =>
          s + Math.max(0, (new Date(p.completed_at!).getTime() - new Date(p.created_at).getTime()) / 86_400_000), 0,
        ) / completed.length,
      )
      : 0;
    const delayed = pos.filter(p =>
      p.status !== "completed" && p.status !== "cancelled" &&
      new Date(p.expected_delivery) < new Date(),
    ).length;
    const insps = db.inspections.filter(i => pos.some(p => p.id === i.po_id));
    const items = insps.flatMap(i => i.items);
    const passed = items.reduce((s, it) => s + (it.passed ?? 0), 0);
    const failed = items.reduce((s, it) => s + (it.failed ?? 0), 0);
    const rejectionRate = passed + failed > 0 ? (failed / (passed + failed)) * 100 : 0;
    // return rate placeholder (no returns module yet) — derived from discrepancies
    const grns = db.grns.filter(g => pos.some(p => p.id === g.po_id));
    const withDiscrepancy = grns.filter(g => g.status === "with_discrepancy").length;
    const returnRate = grns.length ? (withDiscrepancy / grns.length) * 100 : 0;
    // reliability composite 0-100
    const reliability = Math.max(0, Math.min(100, Math.round(
      100 - rejectionRate * 1.5 - returnRate - delayed * 5,
    )));
    return { avgDeliveryDays, delayed, rejectionRate, returnRate, reliability };
  },

  supplierTimeline(supplierId: string) {
    const db = load();
    const pos = db.pos.filter(p => p.supplier_id === supplierId);
    const events: { date: string; kind: string; title: string; tone?: string }[] = [];
    pos.forEach(p => {
      events.push({ date: p.created_at, kind: "أمر شراء", title: `${p.code} — ${PO_LABEL[p.status]}` });
      if (p.approved_at) events.push({ date: p.approved_at, kind: "اعتماد", title: `اعتماد ${p.code}`, tone: "success" });
      if (p.completed_at) events.push({ date: p.completed_at, kind: "اكتمال", title: `اكتمال ${p.code}`, tone: "success" });
    });
    db.shipments.filter(sh => pos.some(p => p.id === sh.po_id)).forEach(sh => {
      events.push({ date: sh.created_at, kind: "شحنة", title: `${sh.code} — ${SHIPMENT_LABEL[sh.status]}` });
    });
    db.grns.filter(g => pos.some(p => p.id === g.po_id)).forEach(g => {
      events.push({ date: g.received_at, kind: "استلام", title: `${g.code} — ${RECV_LABEL[g.status]}` });
    });
    db.inspections.filter(i => pos.some(p => p.id === i.po_id)).forEach(i => {
      events.push({
        date: i.started_at, kind: "فحص",
        title: `فحص — ${INSP_LABEL[i.status]}`,
        tone: i.status === "approved" ? "success" : i.status === "rejected" ? "destructive" : undefined,
      });
    });
    return events.sort((a, b) => b.date.localeCompare(a.date));
  },

  /* ============ Governance v1.3 lifecycle hooks ============ */

  /** Officer confirms a draft PR → moves it into Pending Approval queue. */
  confirmPR(id: string) {
    const db = load();
    const pr = db.prs.find(p => p.id === id); if (!pr) return;
    if (pr.status !== "draft" && pr.status !== "confirmed") return;
    pr.status = "pending";
    save(db);
  },

  /** Manager records supplier confirmation outcome on a PO. */
  supplierConfirm(
    poId: string,
    outcome: "confirm_all" | "confirm_partial" | "model_change" | "qty_change" | "rejected",
  ) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    if (outcome === "rejected") {
      po.status = "cancelled";
    } else {
      // partial / model / qty changes still unlock allocation — UI will flag
      po.status = "ready_for_allocation";
    }
    save(db);
  },

  /** Move an approved PO into awaiting-supplier-confirmation. */
  moveToAwaitingSupplier(poId: string) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    if (po.status !== "approved") return;
    po.status = "awaiting_supplier_confirmation";
    save(db);
  },

  /** Hook invoked by allocationService.confirmAllocation. */
  onAllocationConfirmed(poId: string) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    if (po.status === "ready_for_allocation" || po.status === "approved" ||
        po.status === "allocation_pending" || po.status === "awaiting_supplier_confirmation") {
      po.status = "allocated";
      save(db);
    }
  },

  /** Hook invoked when an invoice tied to a PO becomes paid/paid-by-credit. */
  onInvoicePaid(poId: string) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    if (po.status === "allocated" || po.status === "approved") {
      po.status = "invoiced";
      save(db);
    }
  },

  /** Hook invoked when shipment dispatched. */
  onShipmentDispatched(poId: string) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    if (["invoiced","allocated","approved","ordered"].includes(po.status)) {
      po.status = "in_transit";
      save(db);
    }
  },

  /** Close a PO — only after inventory entry completed. */
  closePO(poId: string): { ok: boolean; reason?: string } {
    const db = load();
    const po = db.pos.find(p => p.id === poId);
    if (!po) return { ok: false, reason: "أمر الشراء غير موجود" };
    if (po.status !== "inventory_completed" && po.status !== "completed") {
      return { ok: false, reason: "لا يمكن الإقفال قبل اكتمال الفحص وإدخال المخزون" };
    }
    po.status = "closed";
    po.completed_at = po.completed_at ?? isoNow();
    save(db);
    return { ok: true };
  },

  /** Mark PO inspection-pending (called after GRN handoff). */
  setPOStatus(poId: string, status: POStatus) {
    const db = load();
    const po = db.pos.find(p => p.id === poId); if (!po) return;
    po.status = status;
    if (status === "completed" || status === "closed") po.completed_at = isoNow();
    save(db);
  },

  /* utilities */
  resetSeed() {
    if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
  },
};

