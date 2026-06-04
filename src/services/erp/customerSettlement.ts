/**
 * Customer Settlement Service — Customer Credit Governance v1.0
 * ----------------------------------------------------------------
 * Full parity with Supplier Credit Governance (see purchasing.ts).
 *
 * Sources of truth:
 *   - `customers`           → credit_limit, settlement_policy, grace_days,
 *                             payment_terms_days, is_active
 *   - `invoices`            → exposure (total − paid − credited), due dates
 *   - `payments`            → cash leg of ledger
 *   - `credit_notes`        → reversal leg of ledger (linked to journal_entry_id)
 *
 * Customer balance is authoritative when the AR account (1200) ledger total
 * matches the derived exposure — verified by `ARReconciliation`.
 */
import { supabase } from "@/integrations/supabase/client";
import { auditLogService } from "@/services/erp/auditLog";

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
  if (policy === "eom") {
    const eom = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return eom.toISOString().slice(0, 10);
  }
  const days = settlementDaysFor(policy, customDays);
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out.toISOString().slice(0, 10);
}

/* ============================ Aging ============================ */

export type AgingStatus = "not_due" | "due_soon" | "overdue";

export const AGING_LABEL: Record<AgingStatus, string> = {
  not_due: "غير مستحقة",
  due_soon: "قريبة الاستحقاق",
  overdue: "متأخرة",
};
export const AGING_TONE: Record<AgingStatus, string> = {
  not_due: "bg-muted text-muted-foreground border border-border",
  due_soon: "bg-warning/10 text-warning border border-warning/40",
  overdue: "bg-destructive/10 text-destructive border border-destructive/40",
};

export function computeAging(
  due_date: string,
  opts: { grace_days?: number; dueSoonWindow?: number } = {},
): { status: AgingStatus; days_overdue: number; days_to_due: number } {
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const due0 = new Date(due_date); due0.setHours(0, 0, 0, 0);
  const grace = Math.max(0, opts.grace_days ?? 0);
  const effectiveDue = new Date(due0);
  effectiveDue.setDate(effectiveDue.getDate() + grace);
  const diffDays = Math.round((effectiveDue.getTime() - today0.getTime()) / 86_400_000);
  if (diffDays < 0) return { status: "overdue", days_overdue: -diffDays, days_to_due: diffDays };
  const window = opts.dueSoonWindow ?? 7;
  if (diffDays <= window) return { status: "due_soon", days_overdue: 0, days_to_due: diffDays };
  return { status: "not_due", days_overdue: 0, days_to_due: diffDays };
}

/* ============================ Customer types ============================ */

export interface CustomerCreditRow {
  id: string;
  code: string;
  name: string;
  vat_number?: string | null;
  is_active: boolean;
  credit_limit: number;
  payment_terms_days: number;
  settlement_policy: SettlementPolicy;
  grace_days: number;
  custom_settlement_days?: number;
  /* derived */
  utilized: number;          // outstanding exposure (total − paid − credited)
  remaining: number;         // credit_limit − utilized
  usage_pct: number;
  over_limit: boolean;
  due_balance: number;
  overdue_balance: number;
  next_due_date?: string;
  max_days_overdue: number;
}

export interface CustomerStatementRow {
  id: string;
  at: string;                // ISO date
  kind: "invoice" | "payment" | "credit_note" | "adjustment";
  reference: string;
  description: string;
  debit: number;             // increases customer liability (invoices)
  credit: number;            // decreases customer liability (payments, CNs)
  running_balance: number;
  due_date?: string;
  outstanding?: number;
  journal_entry_id?: string | null;
}

export interface CustomerStatementSnapshot {
  customer: CustomerCreditRow | null;
  rows: CustomerStatementRow[];
  totals: {
    opening_balance: number;
    debit: number;
    credit: number;
    closing_balance: number;
    credit_limit: number;
    credit_used: number;
    credit_remaining: number;
    due_balance: number;
    overdue_balance: number;
  };
}

export type CreditGateSeverity = "info" | "warning" | "critical";

export interface CreditGateWarning {
  code:
    | "credit_limit_exceeded"
    | "overdue_balance"
    | "account_blocked"
    | "near_limit";
  severity: CreditGateSeverity;
  message: string;
  details?: Record<string, unknown>;
}

export interface CreditGateResult {
  customer_id: string;
  ok: boolean;                  // no warnings at all
  blocked: boolean;             // has critical warning
  requires_override: boolean;   // any non-info warning
  warnings: CreditGateWarning[];
  summary: CustomerCreditRow | null;
}

/* ============================ Helpers ============================ */

function normalizePolicy(raw: any): SettlementPolicy {
  const allowed: SettlementPolicy[] = ["cash", "eom", "net_30", "net_45", "net_60", "net_90", "custom"];
  return allowed.includes(raw) ? raw : "net_30";
}

function dueDateForInvoice(inv: { invoice_date: string; due_date?: string | null }, policy: SettlementPolicy, customDays: number): string {
  if (inv.due_date) return inv.due_date;
  return computeDueDate(inv.invoice_date, policy, customDays);
}

async function loadCustomers(ids?: string[]): Promise<any[]> {
  let q = supabase.from("customers").select(
    "id, code, name, vat_number, is_active, credit_limit, payment_terms_days, settlement_policy, grace_days",
  );
  if (ids?.length) q = q.in("id", ids);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function loadOpenExposure(customerIds: string[]) {
  if (!customerIds.length) return [] as any[];
  const { data, error } = await supabase
    .from("invoices")
    .select("id, customer_id, invoice_no, invoice_date, due_date, total, paid_amount, credited_amount, status")
    .in("customer_id", customerIds)
    .neq("status", "cancelled");
  if (error) throw error;
  return data ?? [];
}

/* ============================ Service ============================ */

export const customerSettlementService = {
  SETTLEMENT_LABEL,
  AGING_LABEL,
  AGING_TONE,
  computeAging,
  computeDueDate,

  /**
   * Build a credit summary for one customer. The "utilized" value reflects the
   * outstanding receivable exposure (total − paid − credited).
   */
  async customerCreditSummary(customerId: string): Promise<CustomerCreditRow | null> {
    const customers = await loadCustomers([customerId]);
    const c = customers[0];
    if (!c) return null;
    const invs = await loadOpenExposure([customerId]);
    return buildCreditRow(c, invs);
  },

  async listCustomerCredit(): Promise<CustomerCreditRow[]> {
    const customers = await loadCustomers();
    const ids = customers.map(c => c.id);
    const invs = await loadOpenExposure(ids);
    const byCust = new Map<string, any[]>();
    for (const i of invs) {
      const arr = byCust.get(i.customer_id) ?? [];
      arr.push(i);
      byCust.set(i.customer_id, arr);
    }
    return customers.map(c => buildCreditRow(c, byCust.get(c.id) ?? []))
      .sort((a, b) => (b.utilized - a.utilized));
  },

  /**
   * Customer ledger statement: invoices (debit), payments (credit), credit
   * notes (credit). The running balance equals the open AR balance carried
   * through time. Closing_balance ties to ARReconciliation when posted.
   */
  async customerStatement(customerId: string, from?: string, to?: string): Promise<CustomerStatementSnapshot> {
    const customer = await this.customerCreditSummary(customerId);
    const [{ data: invs }, { data: pmts }, { data: cns }] = await Promise.all([
      supabase
        .from("invoices")
        .select("id, invoice_no, invoice_date, due_date, total, paid_amount, credited_amount, status, notes")
        .eq("customer_id", customerId),
      supabase
        .from("payments")
        .select("id, payment_no, payment_date, amount, method, invoice_id, reference, notes")
        .eq("customer_id", customerId),
      supabase
        .from("credit_notes")
        .select("id, credit_note_no, cn_date, total, status, invoice_id, reason, journal_entry_id")
        .eq("customer_id", customerId),
    ]);

    const policy = customer?.settlement_policy ?? "net_30";
    const cdays = customer?.custom_settlement_days ?? 0;
    const grace = customer?.grace_days ?? 0;
    const invMap = new Map<string, any>();
    for (const inv of (invs ?? [])) invMap.set(inv.id, inv);

    const events: Omit<CustomerStatementRow, "running_balance">[] = [];

    for (const inv of (invs ?? [])) {
      if (inv.status === "cancelled") continue;
      const dd = dueDateForInvoice(inv as any, policy, cdays);
      const outstanding = Math.max(0, Number(inv.total) - Number(inv.paid_amount ?? 0) - Number(inv.credited_amount ?? 0));
      events.push({
        id: `inv-${inv.id}`,
        at: inv.invoice_date,
        kind: "invoice",
        reference: inv.invoice_no,
        description: inv.notes || "فاتورة مبيعات",
        debit: Number(inv.total) || 0,
        credit: 0,
        due_date: dd,
        outstanding,
      });
    }
    for (const p of (pmts ?? [])) {
      const ref = p.invoice_id ? invMap.get(p.invoice_id)?.invoice_no : undefined;
      events.push({
        id: `pmt-${p.id}`,
        at: p.payment_date,
        kind: "payment",
        reference: p.payment_no || ref || "—",
        description: ref ? `سداد مقابل ${ref}` : (p.notes || "دفعة عميل"),
        debit: 0,
        credit: Number(p.amount) || 0,
      });
    }
    for (const c of (cns ?? [])) {
      if (c.status !== "posted") continue;
      const ref = c.invoice_id ? invMap.get(c.invoice_id)?.invoice_no : undefined;
      events.push({
        id: `cn-${c.id}`,
        at: c.cn_date,
        kind: "credit_note",
        reference: c.credit_note_no,
        description: ref ? `إشعار دائن — ${ref}` : (c.reason || "إشعار دائن"),
        debit: 0,
        credit: Number(c.total) || 0,
        journal_entry_id: c.journal_entry_id,
      });
    }

    const inRange = events.filter(e =>
      (!from || e.at >= from) && (!to || e.at <= to),
    );
    const opening = events
      .filter(e => from && e.at < from)
      .reduce((s, e) => s + (e.debit - e.credit), 0);

    const sorted = inRange.sort((a, b) =>
      a.at.localeCompare(b.at) ||
      (a.kind === "invoice" ? -1 : 1),
    );

    let bal = opening;
    const rows: CustomerStatementRow[] = sorted.map(e => {
      bal += e.debit - e.credit;
      return { ...e, running_balance: bal };
    });

    const debit = rows.reduce((s, r) => s + r.debit, 0);
    const credit = rows.reduce((s, r) => s + r.credit, 0);
    const credit_limit = customer?.credit_limit ?? 0;
    const credit_used = customer?.utilized ?? 0;
    return {
      customer,
      rows,
      totals: {
        opening_balance: opening,
        debit, credit,
        closing_balance: bal,
        credit_limit,
        credit_used,
        credit_remaining: Math.max(0, credit_limit - credit_used),
        due_balance: customer?.due_balance ?? 0,
        overdue_balance: customer?.overdue_balance ?? 0,
      },
    };
  },

  /**
   * Update customer credit / settlement policy. Mirrors purchasingService.updateSupplier.
   */
  async updateCustomerPolicy(id: string, patch: {
    credit_limit?: number;
    settlement_policy?: SettlementPolicy;
    grace_days?: number;
    payment_terms_days?: number;
    is_active?: boolean;
  }) {
    const { error } = await supabase.from("customers").update(patch).eq("id", id);
    if (error) throw error;
    await auditLogService.record({
      module: "sales",
      action: "customer_policy_update",
      document_type: "customer",
      document_id: id,
      document_code: null,
      payload: patch as any,
    });
  },

  /**
   * Credit Control Gate — validates a customer can proceed with a sales action.
   *
   * Returns warnings (limit / overdue / blocked) and whether a manager override
   * is required. Callers MUST log the override decision via `logGateDecision`.
   */
  async checkCreditGate(args: {
    customerId: string;
    additionalExposure?: number;   // amount about to be booked (order/invoice total)
  }): Promise<CreditGateResult> {
    const summary = await this.customerCreditSummary(args.customerId);
    const warnings: CreditGateWarning[] = [];
    if (!summary) {
      return {
        customer_id: args.customerId, ok: true, blocked: false,
        requires_override: false, warnings, summary: null,
      };
    }
    const proposed = summary.utilized + (args.additionalExposure ?? 0);
    const headroom = summary.credit_limit - proposed;

    if (!summary.is_active) {
      warnings.push({
        code: "account_blocked",
        severity: "critical",
        message: `حساب العميل ${summary.name} موقوف — لا يمكن إصدار مستندات مبيعات جديدة دون فك الإيقاف.`,
      });
    }
    if (summary.credit_limit > 0 && headroom < 0) {
      warnings.push({
        code: "credit_limit_exceeded",
        severity: "critical",
        message: `الحد الائتماني سيتجاوز بمقدار ${Math.abs(headroom).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س.`,
        details: { credit_limit: summary.credit_limit, utilized: summary.utilized, requested: args.additionalExposure ?? 0 },
      });
    } else if (summary.credit_limit > 0 && proposed >= 0.9 * summary.credit_limit) {
      warnings.push({
        code: "near_limit",
        severity: "warning",
        message: `استخدام الائتمان سيقترب من الحد (${((proposed / summary.credit_limit) * 100).toFixed(1)}%).`,
      });
    }
    if (summary.overdue_balance > 0) {
      warnings.push({
        code: "overdue_balance",
        severity: "warning",
        message: `يوجد رصيد متأخر بقيمة ${summary.overdue_balance.toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س — يفضّل تحصيله قبل المتابعة.`,
        details: { overdue: summary.overdue_balance, max_days: summary.max_days_overdue },
      });
    }

    const blocked = warnings.some(w => w.severity === "critical");
    const requires_override = warnings.some(w => w.severity !== "info");
    return {
      customer_id: args.customerId,
      ok: warnings.length === 0,
      blocked,
      requires_override,
      warnings,
      summary,
    };
  },

  /**
   * Persist a credit-gate decision to audit_log so manager overrides are
   * traceable across UAT and production.
   */
  async logGateDecision(args: {
    customerId: string;
    customerCode?: string;
    documentType: "sales_order" | "invoice" | "delivery";
    documentId?: string;
    documentCode?: string;
    action: "proceed" | "override" | "blocked";
    warnings: CreditGateWarning[];
    additionalExposure?: number;
  }) {
    await auditLogService.record({
      module: "sales",
      action: `credit_gate_${args.action}`,
      document_type: args.documentType,
      document_id: args.documentId ?? null,
      document_code: args.documentCode ?? null,
      payload: {
        customer_id: args.customerId,
        customer_code: args.customerCode,
        additional_exposure: args.additionalExposure,
        warnings: args.warnings,
      } as any,
    });
  },
};

/* ============================ Internal builder ============================ */

function buildCreditRow(c: any, invs: any[]): CustomerCreditRow {
  const policy = normalizePolicy(c.settlement_policy);
  const grace = Number(c.grace_days ?? 0);
  let utilized = 0, due_balance = 0, overdue_balance = 0, max_days_overdue = 0;
  let next_due_date: string | undefined;
  for (const inv of invs) {
    if (inv.status === "cancelled") continue;
    const outstanding = Math.max(
      0,
      Number(inv.total) - Number(inv.paid_amount ?? 0) - Number(inv.credited_amount ?? 0),
    );
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
    code: c.code,
    name: c.name,
    vat_number: c.vat_number,
    is_active: c.is_active ?? true,
    credit_limit,
    payment_terms_days: Number(c.payment_terms_days ?? 30),
    settlement_policy: policy,
    grace_days: grace,
    utilized,
    remaining,
    usage_pct,
    over_limit: utilized > credit_limit && credit_limit > 0,
    due_balance,
    overdue_balance,
    next_due_date,
    max_days_overdue,
  };
}

export const fmtSAR = (n: number) =>
  Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "2-digit", day: "2-digit" }) : "—";
