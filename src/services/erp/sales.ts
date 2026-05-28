/**
 * Enterprise Sales Operations
 * ---------------------------
 * Frontend operational contract only. Seeded + persisted in localStorage so
 * the UX behaves like a real ERP until the backend lands.
 *
 * Modules covered:
 *  - Quotations
 *  - Sales Orders (operational view; legacy /sales-orders still drives detail)
 *  - Reservations
 *  - Delivery Coordination
 *  - Financing / Installments (visibility)
 *  - Salesperson performance + analytics
 *  - Customer sales timeline
 */

const LS_KEY = "sarat.sales.v1";

/* ============================ Types ============================ */

export type QuoteStatus =
  | "draft" | "sent" | "negotiated" | "approved" | "expired" | "converted" | "rejected";

export type ReservationStatus =
  | "active" | "expiring" | "expired" | "released" | "converted";

export type DeliveryStatus =
  | "scheduled" | "ready" | "in_progress" | "completed" | "blocked";

export type FinancingStatus =
  | "not_required" | "draft" | "submitted" | "under_review" | "approved" | "rejected" | "disbursed";

export interface Salesperson {
  id: string;
  name: string;
  branch: string;
  target_monthly: number;     // vehicles
  achieved_monthly: number;   // vehicles
  revenue_mtd: number;        // SAR
  profit_mtd: number;         // SAR
}

export interface Quotation {
  id: string;
  code: string;            // QT-2026-0001
  customer: string;
  customer_id: string;
  salesperson_id: string;
  branch: string;
  vehicle: string;
  vehicle_id: string;
  list_price: number;
  discount: number;
  net_price: number;
  est_cost: number;
  valid_until: string;     // ISO date
  status: QuoteStatus;
  negotiation_notes?: string;
  discount_pct: number;
  discount_requires_approval: boolean;
  created_at: string;
  converted_so_id?: string;
}

export interface ReservationRecord {
  id: string;
  code: string;            // RSV-2026-0001
  customer: string;
  customer_id: string;
  salesperson_id: string;
  branch: string;
  vehicle: string;
  vehicle_id: string;
  reserved_at: string;
  expires_at: string;
  status: ReservationStatus;
  deposit: number;
  expected_price: number;
  expected_cost: number;
  notes?: string;
  released_reason?: string;
}

export interface DeliveryRecord {
  id: string;
  code: string;            // DLV-2026-0001
  so_code: string;
  so_id: string;
  customer: string;
  vehicle: string;
  branch: string;
  scheduled_at: string;
  delivery_officer: string;
  status: DeliveryStatus;
  checklist: { label: string; done: boolean }[];
  customer_confirmed: boolean;
  notes?: string;
}

export interface FinancingApplication {
  id: string;
  code: string;            // FIN-2026-0001
  customer: string;
  so_code: string;
  so_id: string;
  provider: string;        // bank name
  amount: number;
  tenure_months: number;
  installment: number;
  status: FinancingStatus;
  submitted_at?: string;
  decided_at?: string;
  required_docs: { label: string; received: boolean }[];
  notes?: string;
}


export type SalesApprovalStatus = "pending" | "approved" | "rejected";
export type SalesInvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "cancelled";
export type SalesPaymentMethod = "cash" | "bank_transfer" | "cheque" | "financing_disbursement" | "card";

export interface SalesApproval {
  id: string;
  so_id: string;
  so_code: string;
  customer: string;
  vehicle: string;
  amount: number;
  discount_pct: number;
  requested_by: string;
  requested_at: string;
  status: SalesApprovalStatus;
  approver?: string;
  decided_at?: string;
  note?: string;
}

export interface SalesInvoice {
  id: string;
  code: string;            // SINV-2026-0001
  so_id: string;
  so_code: string;
  customer: string;
  vehicle: string;
  vin?: string;
  branch: string;
  issued_at: string;
  due_date: string;
  subtotal: number;
  vat_amount: number;
  total: number;
  paid: number;
  status: SalesInvoiceStatus;
  notes?: string;
}

export interface SalesPayment {
  id: string;
  code: string;            // SPAY-2026-0001
  invoice_id: string;
  amount: number;
  method: SalesPaymentMethod;
  reference?: string;
  paid_at: string;
  notes?: string;
}

interface DB {
  salespeople: Salesperson[];
  quotations: Quotation[];
  reservations: ReservationRecord[];
  deliveries: DeliveryRecord[];
  financings: FinancingApplication[];
  approvals: SalesApproval[];
  invoices: SalesInvoice[];
  payments: SalesPayment[];
}


/* ============================ Storage ============================ */

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;
const isoNow = () => new Date().toISOString();
const addDays = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const addHours = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();

function seed(): DB {
  const sp1: Salesperson = { id: "sp_1", name: "محمد القحطاني", branch: "الرياض الرئيسي", target_monthly: 12, achieved_monthly: 9, revenue_mtd: 1_185_000, profit_mtd: 168_000 };
  const sp2: Salesperson = { id: "sp_2", name: "فهد الزهراني", branch: "جدة", target_monthly: 10, achieved_monthly: 11, revenue_mtd: 1_420_000, profit_mtd: 195_000 };
  const sp3: Salesperson = { id: "sp_3", name: "خالد العتيبي", branch: "الرياض الرئيسي", target_monthly: 10, achieved_monthly: 6, revenue_mtd: 720_000, profit_mtd: 92_000 };
  const sp4: Salesperson = { id: "sp_4", name: "ناصر الشهري", branch: "الدمام", target_monthly: 8, achieved_monthly: 7, revenue_mtd: 845_000, profit_mtd: 121_000 };

  const q1: Quotation = {
    id: "q_1", code: "QT-2026-0218", customer: "شركة الأمل للنقل", customer_id: "c_1",
    salesperson_id: sp1.id, branch: sp1.branch,
    vehicle: "Toyota Hilux 2026 DLX", vehicle_id: "v_1",
    list_price: 152_000, discount: 7_000, net_price: 145_000, est_cost: 132_000,
    valid_until: addDays(5), status: "sent", discount_pct: 4.6,
    discount_requires_approval: false,
    created_at: addHours(-30),
    negotiation_notes: "العميل يطلب تسليم خلال 7 أيام",
  };
  const q2: Quotation = {
    id: "q_2", code: "QT-2026-0217", customer: "أحمد السبيعي", customer_id: "c_2",
    salesperson_id: sp2.id, branch: sp2.branch,
    vehicle: "Hyundai Tucson 2026", vehicle_id: "v_2",
    list_price: 102_000, discount: 9_500, net_price: 92_500, est_cost: 86_000,
    valid_until: addDays(2), status: "negotiated", discount_pct: 9.3,
    discount_requires_approval: true,
    created_at: addHours(-72),
    negotiation_notes: "طلب خصم إضافي 1,500 مقابل التعاقد اليوم",
  };
  const q3: Quotation = {
    id: "q_3", code: "QT-2026-0216", customer: "مؤسسة الجود", customer_id: "c_3",
    salesperson_id: sp1.id, branch: sp1.branch,
    vehicle: "Toyota Camry 2026 GLE", vehicle_id: "v_3",
    list_price: 118_000, discount: 3_000, net_price: 115_000, est_cost: 105_000,
    valid_until: addDays(-1), status: "expired", discount_pct: 2.5,
    discount_requires_approval: false,
    created_at: addHours(-200),
  };
  const q4: Quotation = {
    id: "q_4", code: "QT-2026-0215", customer: "سعد الحربي", customer_id: "c_4",
    salesperson_id: sp4.id, branch: sp4.branch,
    vehicle: "Nissan Patrol 2026", vehicle_id: "v_4",
    list_price: 268_000, discount: 8_000, net_price: 260_000, est_cost: 245_000,
    valid_until: addDays(10), status: "approved", discount_pct: 3.0,
    discount_requires_approval: false,
    created_at: addHours(-120),
  };
  const q5: Quotation = {
    id: "q_5", code: "QT-2026-0214", customer: "نواف الشمري", customer_id: "c_5",
    salesperson_id: sp3.id, branch: sp3.branch,
    vehicle: "Toyota Land Cruiser 2026", vehicle_id: "v_5",
    list_price: 325_000, discount: 5_000, net_price: 320_000, est_cost: 295_000,
    valid_until: addDays(8), status: "converted", discount_pct: 1.5,
    discount_requires_approval: false,
    created_at: addHours(-260),
    converted_so_id: "so_legacy_1",
  };
  const q6: Quotation = {
    id: "q_6", code: "QT-2026-0213", customer: "شركة الفجر", customer_id: "c_6",
    salesperson_id: sp2.id, branch: sp2.branch,
    vehicle: "Hyundai Sonata 2026", vehicle_id: "v_6",
    list_price: 96_000, discount: 4_000, net_price: 92_000, est_cost: 84_000,
    valid_until: addDays(6), status: "draft", discount_pct: 4.2,
    discount_requires_approval: false,
    created_at: addHours(-12),
  };

  const r1: ReservationRecord = {
    id: "r_1", code: "RSV-2026-0089", customer: "أحمد السبيعي", customer_id: "c_2",
    salesperson_id: sp2.id, branch: sp2.branch,
    vehicle: "Hyundai Tucson 2026", vehicle_id: "v_2",
    reserved_at: addHours(-30), expires_at: addHours(18), status: "expiring",
    deposit: 5_000, expected_price: 92_500, expected_cost: 86_000,
    notes: "بانتظار اعتماد التمويل",
  };
  const r2: ReservationRecord = {
    id: "r_2", code: "RSV-2026-0088", customer: "سعد الحربي", customer_id: "c_4",
    salesperson_id: sp4.id, branch: sp4.branch,
    vehicle: "Nissan Patrol 2026", vehicle_id: "v_4",
    reserved_at: addHours(-12), expires_at: addHours(60), status: "active",
    deposit: 10_000, expected_price: 260_000, expected_cost: 245_000,
  };
  const r3: ReservationRecord = {
    id: "r_3", code: "RSV-2026-0087", customer: "خالد آل سعود", customer_id: "c_7",
    salesperson_id: sp1.id, branch: sp1.branch,
    vehicle: "Toyota Hilux 2026 DLX", vehicle_id: "v_1",
    reserved_at: addHours(-72), expires_at: addHours(-3), status: "expired",
    deposit: 3_000, expected_price: 148_000, expected_cost: 132_000,
  };
  const r4: ReservationRecord = {
    id: "r_4", code: "RSV-2026-0086", customer: "نواف الشمري", customer_id: "c_5",
    salesperson_id: sp3.id, branch: sp3.branch,
    vehicle: "Toyota Land Cruiser 2026", vehicle_id: "v_5",
    reserved_at: addHours(-260), expires_at: addHours(-120), status: "converted",
    deposit: 15_000, expected_price: 320_000, expected_cost: 295_000,
  };

  const d1: DeliveryRecord = {
    id: "d_1", code: "DLV-2026-0144", so_code: "SO-2026-1021", so_id: "so_legacy_1",
    customer: "نواف الشمري", vehicle: "Toyota Land Cruiser 2026", branch: "الرياض الرئيسي",
    scheduled_at: addHours(36), delivery_officer: "م. عبدالعزيز", status: "ready",
    customer_confirmed: true,
    checklist: [
      { label: "السداد الكامل", done: true },
      { label: "اللوحة والترخيص", done: true },
      { label: "بوليصة التأمين", done: true },
      { label: "نموذج التسليم الموقّع", done: false },
    ],
  };
  const d2: DeliveryRecord = {
    id: "d_2", code: "DLV-2026-0143", so_code: "SO-2026-1020", so_id: "so_legacy_2",
    customer: "شركة الأمل للنقل", vehicle: "Toyota Hilux 2026 DLX", branch: "الرياض الرئيسي",
    scheduled_at: addHours(72), delivery_officer: "م. ماجد", status: "scheduled",
    customer_confirmed: false,
    checklist: [
      { label: "السداد الكامل", done: true },
      { label: "اللوحة والترخيص", done: false },
      { label: "بوليصة التأمين", done: false },
      { label: "نموذج التسليم الموقّع", done: false },
    ],
  };
  const d3: DeliveryRecord = {
    id: "d_3", code: "DLV-2026-0142", so_code: "SO-2026-1019", so_id: "so_legacy_3",
    customer: "أحمد السبيعي", vehicle: "Hyundai Tucson 2026", branch: "جدة",
    scheduled_at: addHours(-2), delivery_officer: "م. سامي", status: "in_progress",
    customer_confirmed: true,
    checklist: [
      { label: "السداد الكامل", done: true },
      { label: "اللوحة والترخيص", done: true },
      { label: "بوليصة التأمين", done: true },
      { label: "نموذج التسليم الموقّع", done: false },
    ],
  };
  const d4: DeliveryRecord = {
    id: "d_4", code: "DLV-2026-0141", so_code: "SO-2026-1018", so_id: "so_legacy_4",
    customer: "سعد الحربي", vehicle: "Nissan Patrol 2026", branch: "الدمام",
    scheduled_at: addHours(-48), delivery_officer: "م. عبدالعزيز", status: "completed",
    customer_confirmed: true,
    checklist: [
      { label: "السداد الكامل", done: true },
      { label: "اللوحة والترخيص", done: true },
      { label: "بوليصة التأمين", done: true },
      { label: "نموذج التسليم الموقّع", done: true },
    ],
  };
  const d5: DeliveryRecord = {
    id: "d_5", code: "DLV-2026-0140", so_code: "SO-2026-1017", so_id: "so_legacy_5",
    customer: "مؤسسة الجود", vehicle: "Toyota Camry 2026 GLE", branch: "الرياض الرئيسي",
    scheduled_at: addHours(96), delivery_officer: "م. ماجد", status: "blocked",
    customer_confirmed: false,
    notes: "بانتظار سداد الدفعة الثانية",
    checklist: [
      { label: "السداد الكامل", done: false },
      { label: "اللوحة والترخيص", done: true },
      { label: "بوليصة التأمين", done: false },
      { label: "نموذج التسليم الموقّع", done: false },
    ],
  };

  const f1: FinancingApplication = {
    id: "f_1", code: "FIN-2026-0067", customer: "أحمد السبيعي",
    so_code: "SO-2026-1019", so_id: "so_legacy_3",
    provider: "البنك الأهلي السعودي", amount: 85_000, tenure_months: 48,
    installment: 2_240, status: "under_review",
    submitted_at: addHours(-30),
    required_docs: [
      { label: "صورة الهوية", received: true },
      { label: "تعريف بالراتب", received: true },
      { label: "كشف الحساب", received: false },
    ],
  };
  const f2: FinancingApplication = {
    id: "f_2", code: "FIN-2026-0066", customer: "سعد الحربي",
    so_code: "SO-2026-1018", so_id: "so_legacy_4",
    provider: "مصرف الراجحي", amount: 240_000, tenure_months: 60,
    installment: 4_950, status: "approved",
    submitted_at: addHours(-120), decided_at: addHours(-48),
    required_docs: [
      { label: "صورة الهوية", received: true },
      { label: "تعريف بالراتب", received: true },
      { label: "كشف الحساب", received: true },
    ],
  };
  const f3: FinancingApplication = {
    id: "f_3", code: "FIN-2026-0065", customer: "شركة الأمل للنقل",
    so_code: "SO-2026-1020", so_id: "so_legacy_2",
    provider: "بنك الرياض", amount: 130_000, tenure_months: 36,
    installment: 4_120, status: "submitted",
    submitted_at: addHours(-6),
    required_docs: [
      { label: "السجل التجاري", received: true },
      { label: "القوائم المالية", received: false },
      { label: "كشف الحساب البنكي", received: true },
    ],
  };
  const f4: FinancingApplication = {
    id: "f_4", code: "FIN-2026-0064", customer: "نواف الشمري",
    so_code: "SO-2026-1021", so_id: "so_legacy_1",
    provider: "البنك السعودي الفرنسي", amount: 295_000, tenure_months: 60,
    installment: 6_080, status: "disbursed",
    submitted_at: addHours(-300), decided_at: addHours(-200),
    required_docs: [
      { label: "صورة الهوية", received: true },
      { label: "تعريف بالراتب", received: true },
      { label: "كشف الحساب", received: true },
    ],
  };
  const f5: FinancingApplication = {
    id: "f_5", code: "FIN-2026-0063", customer: "محمد العنزي",
    so_code: "SO-2026-1016", so_id: "so_legacy_6",
    provider: "البنك الأهلي السعودي", amount: 78_000, tenure_months: 48,
    installment: 2_050, status: "rejected",
    submitted_at: addHours(-260), decided_at: addHours(-180),
    notes: "تجاوز الحد الائتماني للعميل",
    required_docs: [
      { label: "صورة الهوية", received: true },
      { label: "تعريف بالراتب", received: true },
      { label: "كشف الحساب", received: true },
    ],
  };

  // Seed sample sales approvals + invoices for governance demo
  const ap1: SalesApproval = {
    id: "sap_1", so_id: "so_legacy_2", so_code: "SO-2026-1020",
    customer: "شركة الأمل للنقل", vehicle: "Toyota Hilux 2026 DLX",
    amount: 145_000, discount_pct: 4.6, requested_by: sp1.name,
    requested_at: addHours(-12), status: "pending",
  };
  const ap2: SalesApproval = {
    id: "sap_2", so_id: "so_legacy_4", so_code: "SO-2026-1018",
    customer: "سعد الحربي", vehicle: "Nissan Patrol 2026",
    amount: 260_000, discount_pct: 3.0, requested_by: sp4.name,
    requested_at: addHours(-60), status: "approved",
    approver: "م. عبدالله", decided_at: addHours(-48),
  };

  const sinv1: SalesInvoice = {
    id: "sinv_1", code: "SINV-2026-0218", so_id: "so_legacy_4", so_code: "SO-2026-1018",
    customer: "سعد الحربي", vehicle: "Nissan Patrol 2026", vin: "JN1TDNT32U0123456",
    branch: "الدمام", issued_at: addHours(-44), due_date: addDays(0),
    subtotal: 260_000, vat_amount: 39_000, total: 299_000,
    paid: 299_000, status: "paid",
  };
  const spay1: SalesPayment = {
    id: "spay_1", code: "SPAY-2026-0181", invoice_id: "sinv_1",
    amount: 299_000, method: "financing_disbursement", reference: "RJH-DSB-882",
    paid_at: addHours(-30),
  };
  const sinv2: SalesInvoice = {
    id: "sinv_2", code: "SINV-2026-0219", so_id: "so_legacy_5", so_code: "SO-2026-1017",
    customer: "مؤسسة الجود", vehicle: "Toyota Camry 2026 GLE", vin: "4T1B11HK1KU742918",
    branch: "الرياض الرئيسي", issued_at: addHours(-72), due_date: addDays(7),
    subtotal: 115_000, vat_amount: 17_250, total: 132_250,
    paid: 50_000, status: "partially_paid",
  };
  const spay2: SalesPayment = {
    id: "spay_2", code: "SPAY-2026-0182", invoice_id: "sinv_2",
    amount: 50_000, method: "bank_transfer", reference: "TRX-22118",
    paid_at: addHours(-60),
  };

  return {
    salespeople: [sp1, sp2, sp3, sp4],
    quotations: [q1, q2, q3, q4, q5, q6],
    reservations: [r1, r2, r3, r4],
    deliveries: [d1, d2, d3, d4, d5],
    financings: [f1, f2, f3, f4, f5],
    approvals: [ap1, ap2],
    invoices: [sinv1, sinv2],
    payments: [spay1, spay2],
  };
}

function load(): DB {
  if (typeof window === "undefined") return seed();
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { const s = seed(); localStorage.setItem(LS_KEY, JSON.stringify(s)); return s; }
    const parsed = JSON.parse(raw) as Partial<DB>;
    if (!parsed.approvals) parsed.approvals = [];
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

/* ============================ Labels / tones ============================ */

export const QUOTE_LABEL: Record<QuoteStatus, string> = {
  draft: "مسودة", sent: "مُرسلة", negotiated: "تفاوض",
  approved: "معتمدة", expired: "منتهية", converted: "محوّلة", rejected: "مرفوضة",
};
export const QUOTE_TONE: Record<QuoteStatus, string> = {
  draft: "bg-muted text-muted-foreground border border-border",
  sent: "bg-primary/10 text-primary border border-primary/30",
  negotiated: "bg-warning/10 text-warning border border-warning/40",
  approved: "bg-success/10 text-success border border-success/40",
  expired: "bg-destructive/10 text-destructive border border-destructive/40",
  converted: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30",
  rejected: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const RES_LABEL: Record<ReservationStatus, string> = {
  active: "نشط", expiring: "قارب الانتهاء", expired: "منتهي",
  released: "مُفرج عنه", converted: "تم البيع",
};
export const RES_TONE: Record<ReservationStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  expiring: "bg-warning/10 text-warning border border-warning/40",
  expired: "bg-destructive/10 text-destructive border border-destructive/40",
  released: "bg-muted text-muted-foreground border border-border",
  converted: "bg-success/10 text-success border border-success/40",
};

export const DLV_LABEL: Record<DeliveryStatus, string> = {
  scheduled: "مجدول", ready: "جاهز للتسليم", in_progress: "قيد التسليم",
  completed: "تم التسليم", blocked: "متوقف",
};
export const DLV_TONE: Record<DeliveryStatus, string> = {
  scheduled: "bg-primary/10 text-primary border border-primary/30",
  ready: "bg-success/10 text-success border border-success/40",
  in_progress: "bg-warning/10 text-warning border border-warning/40",
  completed: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30",
  blocked: "bg-destructive/10 text-destructive border border-destructive/40",
};

export const FIN_LABEL: Record<FinancingStatus, string> = {
  not_required: "بدون تمويل", draft: "مسودة", submitted: "مُقدّم",
  under_review: "قيد الدراسة", approved: "معتمد", rejected: "مرفوض", disbursed: "تم الصرف",
};
export const FIN_TONE: Record<FinancingStatus, string> = {
  not_required: "bg-muted text-muted-foreground border border-border",
  draft: "bg-muted text-muted-foreground border border-border",
  submitted: "bg-primary/10 text-primary border border-primary/30",
  under_review: "bg-warning/10 text-warning border border-warning/40",
  approved: "bg-success/10 text-success border border-success/40",
  rejected: "bg-destructive/10 text-destructive border border-destructive/40",
  disbursed: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/30",
};

export const fmtSAR = (n: number) => `${Math.round(n).toLocaleString("ar-SA")} ر.س`;
export const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";
export const fmtDateTime = (s?: string) =>
  s ? new Date(s).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" }) : "—";

export function hoursUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 3600_000);
}
export function fmtRelative(iso: string): string {
  const h = hoursUntil(iso);
  if (h < -24) return `قبل ${Math.abs(Math.round(h / 24))} يوم`;
  if (h < 0) return `قبل ${Math.abs(h)} ساعة`;
  if (h < 24) return `خلال ${h} ساعة`;
  return `خلال ${Math.round(h / 24)} يوم`;
}

/* ============================ Service ============================ */

export const salesService = {
  /* salespeople */
  listSalespeople(): Salesperson[] { return load().salespeople; },
  getSalesperson(id: string) { return load().salespeople.find(s => s.id === id); },

  /* quotations */
  listQuotations(): Quotation[] {
    // refresh statuses for expiry
    const db = load();
    let touched = false;
    db.quotations.forEach(q => {
      if (q.status === "sent" || q.status === "negotiated") {
        if (new Date(q.valid_until).getTime() < Date.now()) {
          q.status = "expired"; touched = true;
        }
      }
    });
    if (touched) save(db);
    return db.quotations.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  getQuotation(id: string) { return load().quotations.find(q => q.id === id); },
  approveQuotation(id: string) {
    const db = load(); const q = db.quotations.find(x => x.id === id); if (!q) return;
    q.status = "approved"; save(db);
  },
  rejectQuotation(id: string) {
    const db = load(); const q = db.quotations.find(x => x.id === id); if (!q) return;
    q.status = "rejected"; save(db);
  },
  convertQuotationToSO(id: string) {
    const db = load(); const q = db.quotations.find(x => x.id === id); if (!q) return;
    q.status = "converted"; q.converted_so_id = `so_${Date.now()}`;
    save(db);
  },
  createQuotation(input: Omit<Quotation, "id" | "code" | "created_at" | "status" | "net_price" | "discount_pct" | "discount_requires_approval"> & { status?: QuoteStatus }): Quotation {
    const db = load();
    const year = new Date().getFullYear();
    const seq = db.quotations.filter(q => q.code.startsWith(`QT-${year}`)).length + 219;
    const net = input.list_price - input.discount;
    const pct = input.list_price > 0 ? (input.discount / input.list_price) * 100 : 0;
    const q: Quotation = {
      ...input,
      id: uid("q"),
      code: `QT-${year}-${String(seq).padStart(4, "0")}`,
      status: input.status ?? "draft",
      created_at: isoNow(),
      net_price: net,
      discount_pct: pct,
      discount_requires_approval: pct > 5,
    };
    db.quotations.unshift(q); save(db); return q;
  },

  /* reservations */
  listReservations(): ReservationRecord[] {
    const db = load();
    let touched = false;
    db.reservations.forEach(r => {
      if (r.status === "active" || r.status === "expiring") {
        const h = (new Date(r.expires_at).getTime() - Date.now()) / 3600_000;
        if (h < 0) { r.status = "expired"; touched = true; }
        else if (h < 24 && r.status !== "expiring") { r.status = "expiring"; touched = true; }
      }
    });
    if (touched) save(db);
    return db.reservations.slice().sort((a, b) => b.reserved_at.localeCompare(a.reserved_at));
  },
  releaseReservation(id: string, reason?: string) {
    const db = load(); const r = db.reservations.find(x => x.id === id); if (!r) return;
    r.status = "released"; r.released_reason = reason;
    save(db);
  },
  extendReservation(id: string, hours: number) {
    const db = load(); const r = db.reservations.find(x => x.id === id); if (!r) return;
    const base = new Date(r.expires_at).getTime() + hours * 3600_000;
    r.expires_at = new Date(base).toISOString();
    if (r.status === "expired" || r.status === "expiring") {
      const h = (base - Date.now()) / 3600_000;
      r.status = h > 24 ? "active" : "expiring";
    }
    save(db);
  },
  vehicleHasActiveReservation(vehicleId: string, excludeId?: string): boolean {
    return load().reservations.some(r =>
      r.vehicle_id === vehicleId && r.id !== excludeId &&
      (r.status === "active" || r.status === "expiring"));
  },

  /* deliveries */
  listDeliveries(): DeliveryRecord[] {
    return load().deliveries.slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  },
  toggleChecklist(deliveryId: string, idx: number) {
    const db = load(); const d = db.deliveries.find(x => x.id === deliveryId); if (!d) return;
    d.checklist[idx].done = !d.checklist[idx].done;
    const allDone = d.checklist.every(c => c.done);
    if (allDone && d.status === "scheduled") d.status = "ready";
    save(db);
  },
  setDeliveryStatus(id: string, status: DeliveryStatus) {
    const db = load(); const d = db.deliveries.find(x => x.id === id); if (!d) return;
    d.status = status; save(db);
  },
  confirmCustomer(id: string) {
    const db = load(); const d = db.deliveries.find(x => x.id === id); if (!d) return;
    d.customer_confirmed = true; save(db);
  },

  /* financing */
  listFinancings(): FinancingApplication[] {
    return load().financings.slice().sort((a, b) => (b.submitted_at ?? "").localeCompare(a.submitted_at ?? ""));
  },

  /* analytics */
  analytics() {
    const db = load();
    const byPerson = db.salespeople.map(sp => {
      const qs = db.quotations.filter(q => q.salesperson_id === sp.id);
      const converted = qs.filter(q => q.status === "converted").length;
      const conv = qs.length ? (converted / qs.length) * 100 : 0;
      return {
        ...sp,
        quotes: qs.length, converted, conversion: conv,
        attainment: sp.target_monthly ? (sp.achieved_monthly / sp.target_monthly) * 100 : 0,
        margin: sp.revenue_mtd ? (sp.profit_mtd / sp.revenue_mtd) * 100 : 0,
      };
    }).sort((a, b) => b.revenue_mtd - a.revenue_mtd);

    const branches = Array.from(new Set(db.salespeople.map(s => s.branch))).map(b => {
      const team = db.salespeople.filter(s => s.branch === b);
      const revenue = team.reduce((s, t) => s + t.revenue_mtd, 0);
      const profit = team.reduce((s, t) => s + t.profit_mtd, 0);
      const target = team.reduce((s, t) => s + t.target_monthly, 0);
      const achieved = team.reduce((s, t) => s + t.achieved_monthly, 0);
      return { branch: b, revenue, profit, target, achieved, attainment: target ? (achieved / target) * 100 : 0 };
    }).sort((a, b) => b.revenue - a.revenue);

    const qTotal = db.quotations.length;
    const qConverted = db.quotations.filter(q => q.status === "converted").length;
    const qExpired = db.quotations.filter(q => q.status === "expired").length;
    const rTotal = db.reservations.length;
    const rConverted = db.reservations.filter(r => r.status === "converted").length;

    return {
      byPerson, branches,
      quote_total: qTotal,
      quote_conversion: qTotal ? (qConverted / qTotal) * 100 : 0,
      quote_expiry_rate: qTotal ? (qExpired / qTotal) * 100 : 0,
      reservation_conversion: rTotal ? (rConverted / rTotal) * 100 : 0,
    };
  },

  /* dashboard kpis */
  dashboard() {
    const db = load();
    const today = new Date().toISOString().slice(0, 10);
    const daily_revenue = db.salespeople.reduce((s, p) => s + Math.round(p.revenue_mtd / 22), 0);
    const monthly_revenue = db.salespeople.reduce((s, p) => s + p.revenue_mtd, 0);
    const monthly_profit = db.salespeople.reduce((s, p) => s + p.profit_mtd, 0);
    const sold_vehicles = db.salespeople.reduce((s, p) => s + p.achieved_monthly, 0);
    const reserved = db.reservations.filter(r => r.status === "active" || r.status === "expiring").length;
    const pending_deliveries = db.deliveries.filter(d => d.status !== "completed").length;
    const fin_review = db.financings.filter(f => f.status === "under_review" || f.status === "submitted").length;
    const expiring_quotes = db.quotations.filter(q => {
      const h = (new Date(q.valid_until).getTime() - Date.now()) / 3600_000;
      return (q.status === "sent" || q.status === "negotiated") && h < 48 && h >= 0;
    }).length;
    const discount_pending = db.quotations.filter(q => q.status === "negotiated" && q.discount_requires_approval).length;
    const avg_profit_per_vehicle = sold_vehicles ? monthly_profit / sold_vehicles : 0;

    return {
      today, daily_revenue, monthly_revenue, monthly_profit, sold_vehicles,
      reserved, pending_deliveries, fin_review, expiring_quotes,
      discount_pending, avg_profit_per_vehicle,
    };
  },

  /* customer timeline */
  customerTimeline(customerId: string) {
    const db = load();
    type Event = { ts: string; kind: string; label: string; tone: string; ref?: string; meta?: string };
    const events: Event[] = [];

    db.quotations.filter(q => q.customer_id === customerId).forEach(q => {
      events.push({
        ts: q.created_at, kind: "quotation", label: `عرض سعر ${q.code}`,
        tone: QUOTE_TONE[q.status], ref: q.code, meta: `${q.vehicle} · ${Math.round(q.net_price).toLocaleString("ar-SA")} ر.س`,
      });
    });
    db.reservations.filter(r => r.customer_id === customerId).forEach(r => {
      events.push({
        ts: r.reserved_at, kind: "reservation", label: `حجز ${r.code}`,
        tone: RES_TONE[r.status], ref: r.code, meta: `${r.vehicle} · عربون ${Math.round(r.deposit).toLocaleString("ar-SA")} ر.س`,
      });
    });
    db.deliveries.filter(d => d.customer === db.quotations.find(q => q.customer_id === customerId)?.customer).forEach(d => {
      events.push({
        ts: d.scheduled_at, kind: "delivery", label: `تسليم ${d.code}`,
        tone: DLV_TONE[d.status], ref: d.code, meta: `${d.vehicle} · ${d.delivery_officer}`,
      });
    });
    return events.sort((a, b) => b.ts.localeCompare(a.ts));
  },

  /* list distinct customers (from quotations/reservations) */
  listCustomers() {
    const db = load();
    const map = new Map<string, { id: string; name: string; last: string }>();
    db.quotations.forEach(q => {
      const cur = map.get(q.customer_id);
      if (!cur || q.created_at > cur.last) map.set(q.customer_id, { id: q.customer_id, name: q.customer, last: q.created_at });
    });
    db.reservations.forEach(r => {
      const cur = map.get(r.customer_id);
      if (!cur || r.reserved_at > cur.last) map.set(r.customer_id, { id: r.customer_id, name: r.customer, last: r.reserved_at });
    });
    return Array.from(map.values()).sort((a, b) => b.last.localeCompare(a.last));
  },

  resetSeed() { if (typeof window !== "undefined") localStorage.removeItem(LS_KEY); },
};
