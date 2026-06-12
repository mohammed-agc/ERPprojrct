/**
 * Supplier Settlement Service — Supplier Credit Governance v1.0
 *
 * النظير الدقيق لـ customerSettlement.ts لكن لجانب الموردين (AP).
 * مصدر الحقيقة الموحّد (SAP Open Items):
 *   - contacts (is_supplier)  → credit_limit, settlement_policy, grace_days, payment_term
 *   - purchase_invoices       → exposure (total − paid − settlement), due dates
 *   - open_item_allocations   → الدفعات + المقاصّات النشطة (المصدر الصحيح للمتبقّي)
 *
 * رصيد المورد = ما ندين به له = Σ(total − allocations) على فواتير الشراء غير الملغاة.
 */
import { supabase } from "@/integrations/supabase/client";

/* ============================ Settlement policy ============================ */

export type SettlementPolicy =
  | "cash" | "eom" | "net_30" | "net_45" | "net_60" | "net_90" | "custom";

export const SETTLEMENT_LABEL: Record<SettlementPolicy, string> = {
  cash: "نقدي",
  eom: "نهاية الشهر",
  net_30: "30 يوم",
  net_45: "45 يوم",
  net_60: "60 يوم",
  net_90: "90 يوم",
  custom: "مخصّص",
};

export function settlementDaysFor(policy: SettlementPolicy, customDays = 0): number {
  switch (policy) {
    case "cash": return 0;
    case "net_30": return 30;
    case "net_45": return 45;
    case "net_60": return 60;
    case "net_90": return 90;
    case "custom": return Math.max(0, customDays);
    case "eom":
    default: return 30;
  }
}

export function computeDueDate(invoiceDateISO: string, policy: SettlementPolicy, customDays = 0): string {
  const d = new Date(invoiceDateISO);
  d.setDate(d.getDate() + settlementDaysFor(policy, customDays));
  return d.toISOString().slice(0, 10);
}

/* ============================ Aging ============================ */

export type AgingStatus = "not_due" | "due_soon" | "overdue";

export const AGING_LABEL: Record<AgingStatus, string> = {
  not_due: "غير مستحق",
  due_soon: "قريب الاستحقاق",
  overdue: "متأخر",
};

export const AGING_TONE: Record<AgingStatus, string> = {
  not_due: "muted",
  due_soon: "warning",
  overdue: "destructive",
};

export function computeAging(
  dueDateISO: string, opts: { grace_days?: number } = {},
): { status: AgingStatus; days_overdue: number } {
  const grace = opts.grace_days ?? 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateISO); due.setHours(0, 0, 0, 0);
  const graceDue = new Date(due); graceDue.setDate(graceDue.getDate() + grace);
  const msDay = 86400000;
  if (today.getTime() > graceDue.getTime()) {
    return { status: "overdue", days_overdue: Math.floor((today.getTime() - graceDue.getTime()) / msDay) };
  }
  const soonThreshold = new Date(due); soonThreshold.setDate(soonThreshold.getDate() - 7);
  if (today.getTime() >= soonThreshold.getTime()) return { status: "due_soon", days_overdue: 0 };
  return { status: "not_due", days_overdue: 0 };
}

/* ============================ Types ============================ */

export interface SupplierCreditRow {
  id: string;
  code: string | null;
  name: string;
  vat_number: string | null;
  is_active: boolean;
  credit_limit: number;
  payment_terms_days: number;
  settlement_policy: SettlementPolicy;
  grace_days: number;
  utilized: number;          // ما ندين به للمورد (total − allocations)
  remaining: number;         // credit_limit − utilized
  usage_pct: number;
  over_limit: boolean;
  due_balance: number;
  overdue_balance: number;
  next_due_date?: string;
  max_days_overdue: number;
}

export interface SupplierStatementRow {
  id: string;
  at: string;
  kind: "bill" | "payment" | "settlement" | "credit_note" | "adjustment";
  reference: string;
  description: string;
  debit: number;             // يخفّض التزامنا للمورد (دفعات/مقاصّات)
  credit: number;            // يزيد التزامنا (فواتير شراء)
  running_balance: number;
  due_date?: string;
  outstanding?: number;
}

export interface SupplierStatementSnapshot {
  supplier: SupplierCreditRow | null;
  rows: SupplierStatementRow[];
  totals: { debit: number; credit: number; balance: number };
}

/* ============================ Helpers ============================ */

function normalizePolicy(raw: any): SettlementPolicy {
  const v = String(raw ?? "net_30") as SettlementPolicy;
  return (["cash", "eom", "net_30", "net_45", "net_60", "net_90", "custom"] as const).includes(v as any) ? v : "net_30";
}

function dueDateForInvoice(inv: { invoice_date: string; due_date?: string | null }, policy: SettlementPolicy, customDays: number): string {
  if (inv.due_date) return inv.due_date;
  return computeDueDate(inv.invoice_date, policy, customDays);
}

async function loadSuppliers(ids?: string[]): Promise<any[]> {
  let q = supabase.from("contacts").select(
    "id, supplier_code, name, vat_number, active, credit_limit, payment_term, settlement_policy, grace_days",
  );
  q = q.eq("is_supplier", true);
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function loadOpenExposure(supplierIds: string[]) {
  if (!supplierIds.length) return [] as any[];
  const { data, error } = await supabase
    .from("purchase_invoices")
    .select("id, supplier_id, invoice_no, code, invoice_date, due_date, total, paid_amount, status")
    .in("supplier_id", supplierIds)
    .neq("status", "cancelled");
  if (error) throw error;
  return data ?? [];
}

// خريطة كل التخصيصات النشطة (PAYMENT + SETTLEMENT + ...) لكل فاتورة شراء — من Open Items
async function loadAllocationMap(invIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!invIds.length) return map;
  const { data } = await supabase
    .from("open_item_allocations")
    .select("target_document_id, allocated_amount")
    .eq("target_document_type", "purchase_invoice")
    .eq("status", "active")
    .in("target_document_id", invIds);
  for (const a of data ?? []) {
    const k = (a as any).target_document_id;
    map.set(k, (map.get(k) ?? 0) + Number((a as any).allocated_amount || 0));
  }
  return map;
}

function buildCreditRow(c: any, invs: any[], allocByInv: Map<string, number>): SupplierCreditRow {
  const policy = normalizePolicy(c.settlement_policy);
  const grace = Number(c.grace_days ?? 0);
  let utilized = 0, due_balance = 0, overdue_balance = 0, max_days_overdue = 0;
  let next_due_date: string | undefined;
  for (const inv of invs) {
    if (inv.status === "cancelled") continue;
    const outstanding = Math.max(0, Number(inv.total) - (allocByInv.get(inv.id) ?? 0));
    if (outstanding < 0.001) continue;
    utilized += outstanding;
    const dd = dueDateForInvoice(inv, policy, 0);
    const a = computeAging(dd, { grace_days: grace });
    if (a.status === "overdue") {
      overdue_balance += outstanding;
      if (a.days_overdue > max_days_overdue) max_days_overdue = a.days_overdue;
    } else {
      due_balance += outstanding;
    }
    if (!next_due_date || dd < next_due_date) next_due_date = dd;
  }
  const credit_limit = Number(c.credit_limit ?? 0);
  const remaining = credit_limit - utilized;
  const usage_pct = credit_limit > 0 ? Math.min(100, (utilized / credit_limit) * 100) : 0;
  return {
    id: c.id,
    code: c.supplier_code,
    name: c.name,
    vat_number: c.vat_number,
    is_active: c.active ?? true,
    credit_limit,
    payment_terms_days: Number(c.payment_term ?? 30),
    settlement_policy: policy,
    grace_days: grace,
    utilized,
    remaining,
    usage_pct,
    over_limit: utilized > credit_limit,
    due_balance,
    overdue_balance,
    next_due_date,
    max_days_overdue,
  };
}

/* ============================ Service ============================ */

export const supplierSettlementService = {
  SETTLEMENT_LABEL,
  AGING_LABEL,
  AGING_TONE,
  computeAging,
  computeDueDate,

  async supplierCreditSummary(supplierId: string): Promise<SupplierCreditRow | null> {
    const suppliers = await loadSuppliers([supplierId]);
    const c = suppliers[0];
    if (!c) return null;
    const invs = await loadOpenExposure([supplierId]);
    const allocMap = await loadAllocationMap(invs.map((i: any) => i.id));
    return buildCreditRow(c, invs, allocMap);
  },

  async listSupplierCredit(): Promise<SupplierCreditRow[]> {
    const suppliers = await loadSuppliers();
    const ids = suppliers.map(s => s.id);
    const invs = await loadOpenExposure(ids);
    const allocMap = await loadAllocationMap(invs.map((i: any) => i.id));
    const byVendor = new Map<string, any[]>();
    for (const i of invs) {
      const arr = byVendor.get(i.supplier_id) ?? [];
      arr.push(i);
      byVendor.set(i.supplier_id, arr);
    }
    return suppliers.map(c => buildCreditRow(c, byVendor.get(c.id) ?? [], allocMap))
      .sort((a, b) => (b.utilized - a.utilized));
  },

  async supplierStatement(supplierId: string, from?: string, to?: string): Promise<SupplierStatementSnapshot> {
    const supplier = await this.supplierCreditSummary(supplierId);
    const { data: invs } = await supabase
      .from("purchase_invoices")
      .select("id, invoice_no, code, invoice_date, due_date, total, status")
      .eq("supplier_id", supplierId)
      .neq("status", "cancelled");

    const policy = supplier?.settlement_policy ?? "net_30";
    const grace = supplier?.grace_days ?? 0;
    const invMap = new Map<string, any>();
    for (const inv of (invs ?? [])) invMap.set(inv.id, inv);
    const allocByInv = await loadAllocationMap((invs ?? []).map((i: any) => i.id));

    const events: Omit<SupplierStatementRow, "running_balance">[] = [];

    // فواتير الشراء = دائنة (تزيد التزامنا)
    for (const inv of (invs ?? [])) {
      const dd = dueDateForInvoice(inv as any, policy, 0);
      const outstanding = Math.max(0, Number(inv.total) - (allocByInv.get(inv.id) ?? 0));
      events.push({
        id: `bill-${inv.id}`,
        at: inv.invoice_date,
        kind: "bill",
        reference: inv.invoice_no || inv.code,
        description: "فاتورة شراء",
        debit: 0,
        credit: Number(inv.total) || 0,
        due_date: dd,
        outstanding,
      });
    }

    // التخصيصات (دفعات + مقاصّات) = مدينة (تخفّض التزامنا) — من Open Items
    const invIds = (invs ?? []).map((i: any) => i.id);
    if (invIds.length > 0) {
      const { data: allocs } = await supabase
        .from("open_item_allocations")
        .select("allocation_number, allocation_type, allocation_date, allocated_amount, target_document_id")
        .eq("target_document_type", "purchase_invoice")
        .eq("status", "active")
        .in("target_document_id", invIds);
      const TYPE_DESC: Record<string, string> = {
        PAYMENT: "دفعة لمورد", SETTLEMENT: "مقاصّة عميل/مورد", CREDIT_NOTE: "إشعار دائن",
        DEBIT_NOTE: "إشعار مدين", WRITE_OFF: "إعدام دين", ADJUSTMENT: "تسوية",
      };
      const KIND_MAP: Record<string, SupplierStatementRow["kind"]> = {
        PAYMENT: "payment", SETTLEMENT: "settlement", CREDIT_NOTE: "credit_note",
        DEBIT_NOTE: "adjustment", WRITE_OFF: "adjustment", ADJUSTMENT: "adjustment",
      };
      for (const a of allocs ?? []) {
        const ref = invMap.get((a as any).target_document_id);
        events.push({
          id: `alloc-${(a as any).allocation_number}`,
          at: (a as any).allocation_date,
          kind: KIND_MAP[(a as any).allocation_type] ?? "payment",
          reference: (a as any).allocation_number,
          description: TYPE_DESC[(a as any).allocation_type] ?? (a as any).allocation_type,
          debit: Number((a as any).allocated_amount) || 0,
          credit: 0,
        });
      }
    }

    const filtered = events
      .filter(e => (!from || e.at >= from) && (!to || e.at <= to))
      .sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "bill" ? -1 : 1));

    let bal = 0;
    const rows: SupplierStatementRow[] = filtered.map(e => {
      bal += e.credit - e.debit;   // المورد: فاتورة(credit) ترفع، دفعة(debit) تخفّض
      return { ...e, running_balance: bal };
    });
    const totals = rows.reduce(
      (a, l) => ({ debit: a.debit + l.debit, credit: a.credit + l.credit, balance: bal }),
      { debit: 0, credit: 0, balance: 0 },
    );
    return { supplier: supplier ?? null, rows, totals };
  },
};

export const fmtSAR = (n: number) =>
  Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d?: string) =>
  d ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d)) : "—";
