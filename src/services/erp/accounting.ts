/**
 * Accounting adapter — frontend-only consumer layer.
 *
 * Reads directly from the backend (Supabase tables) today. When a dedicated
 * accounting HTTP API ships, swap these functions out without touching UI.
 * UI / hooks consume this module, never the supabase client directly.
 */
import { supabase } from "@/integrations/supabase/client";

export interface JournalEntryRow {
  id: string;
  entry_no: string;
  entry_date: string;
  reference: string | null;
  description: string | null;
  is_posted: boolean;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  created_by: string | null;
  total_debit: number;
  total_credit: number;
}

export interface JournalLineRow {
  id: string;
  entry_id: string;
  account_id: string;
  account_code?: string;
  account_name?: string;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntryDetail extends JournalEntryRow {
  lines: JournalLineRow[];
}

export interface AccountRow {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  is_active: boolean;
}

export interface LedgerMovement {
  entry_id: string;
  entry_no: string;
  entry_date: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface TrialBalanceRow {
  account_id: string;
  code: string;
  name_ar: string;
  type: AccountRow["type"];
  debit: number;
  credit: number;
  balance: number;
}

export interface JournalListFilters {
  from?: string;
  to?: string;
  posted?: "all" | "posted" | "draft";
  query?: string;
}

const sumLines = (lines: { debit: any; credit: any }[] = []) => {
  let d = 0, c = 0;
  for (const l of lines) { d += Number(l.debit || 0); c += Number(l.credit || 0); }
  return { d, c };
};

export const accountingService = {
  async listEntries(filters: JournalListFilters = {}): Promise<JournalEntryRow[]> {
    let q = supabase
      .from("journal_entries")
      .select("*, journal_entry_lines(debit, credit)")
      .order("entry_date", { ascending: false })
      .order("entry_no", { ascending: false });
    if (filters.from) q = q.gte("entry_date", filters.from);
    if (filters.to) q = q.lte("entry_date", filters.to);
    if (filters.posted === "posted") q = q.eq("is_posted", true);
    if (filters.posted === "draft") q = q.eq("is_posted", false);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? []).map((r: any) => {
      const { d, c } = sumLines(r.journal_entry_lines);
      return { ...r, total_debit: d, total_credit: c } as JournalEntryRow;
    });
    if (filters.query?.trim()) {
      const t = filters.query.trim().toLowerCase();
      rows = rows.filter(r =>
        r.entry_no.toLowerCase().includes(t) ||
        (r.reference ?? "").toLowerCase().includes(t) ||
        (r.description ?? "").toLowerCase().includes(t)
      );
    }
    return rows;
  },

  async getEntry(id: string): Promise<JournalEntryDetail | null> {
    const { data: e, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!e) return null;
    const { data: lines } = await supabase
      .from("journal_entry_lines")
      .select("*, accounts(code, name_ar)")
      .eq("entry_id", id);
    const mapped: JournalLineRow[] = (lines ?? []).map((l: any) => ({
      id: l.id,
      entry_id: l.entry_id,
      account_id: l.account_id,
      account_code: l.accounts?.code,
      account_name: l.accounts?.name_ar,
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: l.description,
    }));
    const { d, c } = sumLines(mapped);
    return { ...(e as any), lines: mapped, total_debit: d, total_credit: c };
  },

  async listAccounts(): Promise<AccountRow[]> {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, code, name_ar, name_en, type, is_active")
      .order("code");
    if (error) throw error;
    return (data ?? []) as AccountRow[];
  },

  async ledger(accountId: string, from?: string, to?: string): Promise<LedgerMovement[]> {
    let q = supabase
      .from("journal_entry_lines")
      .select("debit, credit, description, journal_entries!inner(id, entry_no, entry_date, reference, description, is_posted)")
      .eq("account_id", accountId);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? [])
      .map((l: any) => ({
        entry_id: l.journal_entries.id,
        entry_no: l.journal_entries.entry_no,
        entry_date: l.journal_entries.entry_date,
        reference: l.journal_entries.reference,
        description: l.description ?? l.journal_entries.description,
        debit: Number(l.debit || 0),
        credit: Number(l.credit || 0),
        is_posted: l.journal_entries.is_posted,
      }))
      .filter(r => r.is_posted)
      .filter(r => (!from || r.entry_date >= from) && (!to || r.entry_date <= to))
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.entry_no.localeCompare(b.entry_no));
    let bal = 0;
    return rows.map(r => {
      bal += r.debit - r.credit;
      return { ...r, running_balance: bal };
    });
  },

  async trialBalance(from?: string, to?: string): Promise<TrialBalanceRow[]> {
    const accounts = await this.listAccounts();
    let q = supabase
      .from("journal_entry_lines")
      .select("account_id, debit, credit, journal_entries!inner(entry_date, is_posted)");
    const { data, error } = await q;
    if (error) throw error;
    const agg = new Map<string, { d: number; c: number }>();
    for (const l of (data ?? []) as any[]) {
      const je = l.journal_entries;
      if (!je?.is_posted) continue;
      if (from && je.entry_date < from) continue;
      if (to && je.entry_date > to) continue;
      const cur = agg.get(l.account_id) ?? { d: 0, c: 0 };
      cur.d += Number(l.debit || 0);
      cur.c += Number(l.credit || 0);
      agg.set(l.account_id, cur);
    }
    return accounts
      .map(a => {
        const v = agg.get(a.id) ?? { d: 0, c: 0 };
        return {
          account_id: a.id,
          code: a.code,
          name_ar: a.name_ar,
          type: a.type,
          debit: v.d,
          credit: v.c,
          balance: v.d - v.c,
        } as TrialBalanceRow;
      })
      .filter(r => r.debit !== 0 || r.credit !== 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  },
};

// ============================================================================
// Accounts Receivable (AR)
// ============================================================================

export interface AgingBuckets {
  current: number;   // not overdue
  d_0_30: number;
  d_31_60: number;
  d_61_90: number;
  d_90_plus: number;
}

export interface ARCustomerBalance {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  invoice_count: number;
  total_receivable: number;
  paid_amount: number;
  remaining_balance: number;
  overdue_amount: number;
  aging: AgingBuckets;
}

export interface CustomerStatementLine {
  date: string;
  type: "invoice" | "payment";
  reference: string;
  description: string;
  debit: number;   // increases customer balance (invoices)
  credit: number;  // decreases customer balance (payments)
  running_balance: number;
  source_id: string;
}

/** Default net payment term in days when invoice has no due_date column. */
const DEFAULT_NET_DAYS = 30;

const daysBetween = (a: Date, b: Date) =>
  Math.floor((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));

const emptyAging = (): AgingBuckets => ({ current: 0, d_0_30: 0, d_31_60: 0, d_61_90: 0, d_90_plus: 0 });

function bucketize(aging: AgingBuckets, amount: number, daysOverdue: number) {
  if (daysOverdue <= 0) aging.current += amount;
  else if (daysOverdue <= 30) aging.d_0_30 += amount;
  else if (daysOverdue <= 60) aging.d_31_60 += amount;
  else if (daysOverdue <= 90) aging.d_61_90 += amount;
  else aging.d_90_plus += amount;
}

Object.assign(accountingService, {
  async listReceivables(asOf?: string): Promise<ARCustomerBalance[]> {
    const today = asOf ? new Date(asOf) : new Date();
    const { data: customers, error: ce } = await supabase
      .from("customers")
      .select("id, code, name");
    if (ce) throw ce;
    const { data: invoices, error: ie } = await supabase
      .from("invoices")
      .select("id, customer_id, invoice_date, total, status")
      .neq("status", "cancelled");
    if (ie) throw ie;

    const byCust = new Map<string, ARCustomerBalance>();
    for (const c of customers ?? []) {
      byCust.set(c.id, {
        customer_id: c.id,
        customer_code: c.code,
        customer_name: c.name,
        invoice_count: 0,
        total_receivable: 0,
        paid_amount: 0,
        remaining_balance: 0,
        overdue_amount: 0,
        aging: emptyAging(),
      });
    }

    for (const inv of (invoices ?? []) as any[]) {
      const row = byCust.get(inv.customer_id);
      if (!row) continue;
      const total = Number(inv.total || 0);
      const paid = inv.status === "paid" ? total : 0;
      const remaining = total - paid;
      row.invoice_count += 1;
      row.total_receivable += total;
      row.paid_amount += paid;
      row.remaining_balance += remaining;
      if (remaining > 0) {
        const due = new Date(inv.invoice_date);
        due.setDate(due.getDate() + DEFAULT_NET_DAYS);
        const overdueDays = daysBetween(today, due);
        bucketize(row.aging, remaining, overdueDays);
        if (overdueDays > 0) row.overdue_amount += remaining;
      }
    }

    return Array.from(byCust.values())
      .filter(r => r.invoice_count > 0)
      .sort((a, b) => b.remaining_balance - a.remaining_balance);
  },

  async customerStatement(customerId: string, from?: string, to?: string): Promise<{
    customer: { id: string; code: string; name: string } | null;
    lines: CustomerStatementLine[];
    totals: { debit: number; credit: number; balance: number };
  }> {
    const { data: cust } = await supabase
      .from("customers")
      .select("id, code, name")
      .eq("id", customerId)
      .maybeSingle();

    const { data: invoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, invoice_date, total, status, notes")
      .eq("customer_id", customerId)
      .neq("status", "cancelled");

    const events: Omit<CustomerStatementLine, "running_balance">[] = [];
    for (const inv of (invoices ?? []) as any[]) {
      events.push({
        date: inv.invoice_date,
        type: "invoice",
        reference: inv.invoice_no,
        description: inv.notes || "فاتورة مبيعات",
        debit: Number(inv.total || 0),
        credit: 0,
        source_id: inv.id,
      });
      if (inv.status === "paid") {
        events.push({
          date: inv.invoice_date,
          type: "payment",
          reference: inv.invoice_no,
          description: "دفعة مقابل فاتورة",
          debit: 0,
          credit: Number(inv.total || 0),
          source_id: inv.id,
        });
      }
    }

    const filtered = events
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.type === "invoice" ? -1 : 1));

    let bal = 0;
    const lines: CustomerStatementLine[] = filtered.map(e => {
      bal += e.debit - e.credit;
      return { ...e, running_balance: bal };
    });
    const totals = lines.reduce(
      (a, l) => ({ debit: a.debit + l.debit, credit: a.credit + l.credit, balance: bal }),
      { debit: 0, credit: 0, balance: 0 }
    );

    return { customer: cust ?? null, lines, totals };
  },

  /**
   * Reconcile derived customer balances vs the authoritative GL ledger after
   * credit-note posting. Returns one row per customer with:
   *   - derived_remaining: sum(invoices.total - paid_amount - credited_amount)
   *   - cn_posted_total:   sum of posted credit notes (status='posted')
   *   - cn_with_je:        portion already mirrored in GL (journal_entry_id set)
   *   - ar_ledger_credit:  authoritative credits posted to AR account 1200
   *                        from credit-note journal entries for this customer
   *   - mismatch:          cn_posted_total - ar_ledger_credit (≠ 0 → broken link)
   *   - notes[]:           per-CN trace { credit_note_no, total, journal_entry_id, ar_credit, ok }
   */
  async reconcileCustomerLedger(): Promise<ReconciliationRow[]> {
    const [{ data: customers }, { data: invoices }, { data: cns }, { data: arAcc }] =
      await Promise.all([
        supabase.from("customers").select("id, code, name"),
        supabase.from("invoices").select("id, customer_id, total, paid_amount, credited_amount, status"),
        supabase
          .from("credit_notes")
          .select("id, credit_note_no, customer_id, total, status, journal_entry_id"),
        supabase.from("accounts").select("id").eq("code", "1200").maybeSingle(),
      ]);

    const cnJeIds = ((cns ?? []) as any[]).map(c => c.journal_entry_id).filter(Boolean) as string[];
    const arById = new Map<string, number>();
    if ((arAcc as any)?.id && cnJeIds.length) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("entry_id, credit")
        .eq("account_id", (arAcc as any).id)
        .in("entry_id", cnJeIds);
      for (const l of (lines ?? []) as any[]) {
        arById.set(l.entry_id, (arById.get(l.entry_id) ?? 0) + Number(l.credit || 0));
      }
    }

    const rows = new Map<string, ReconciliationRow>();
    for (const c of (customers ?? []) as any[]) {
      rows.set(c.id, {
        customer_id: c.id,
        customer_code: c.code,
        customer_name: c.name,
        derived_remaining: 0,
        cn_posted_total: 0,
        cn_with_je: 0,
        ar_ledger_credit: 0,
        mismatch: 0,
        notes: [],
      });
    }

    for (const inv of (invoices ?? []) as any[]) {
      if (inv.status === "cancelled") continue;
      const r = rows.get(inv.customer_id);
      if (!r) continue;
      r.derived_remaining +=
        Number(inv.total || 0) - Number(inv.paid_amount || 0) - Number(inv.credited_amount || 0);
    }

    for (const cn of (cns ?? []) as any[]) {
      if (cn.status !== "posted") continue;
      const r = rows.get(cn.customer_id);
      if (!r) continue;
      const total = Number(cn.total || 0);
      r.cn_posted_total += total;
      if (cn.journal_entry_id) {
        r.cn_with_je += total;
        const arCredit = arById.get(cn.journal_entry_id) ?? 0;
        r.ar_ledger_credit += arCredit;
        r.notes.push({
          credit_note_id: cn.id,
          credit_note_no: cn.credit_note_no,
          total,
          journal_entry_id: cn.journal_entry_id,
          ar_credit: arCredit,
          ok: Math.abs(arCredit - total) < 0.01,
        });
      } else {
        r.notes.push({
          credit_note_id: cn.id,
          credit_note_no: cn.credit_note_no,
          total,
          journal_entry_id: null,
          ar_credit: 0,
          ok: false,
        });
      }
    }

    for (const r of rows.values()) {
      r.mismatch = Number((r.cn_posted_total - r.ar_ledger_credit).toFixed(2));
      r.derived_remaining = Number(r.derived_remaining.toFixed(2));
      r.cn_posted_total = Number(r.cn_posted_total.toFixed(2));
      r.cn_with_je = Number(r.cn_with_je.toFixed(2));
      r.ar_ledger_credit = Number(r.ar_ledger_credit.toFixed(2));
    }

    return Array.from(rows.values())
      .filter(r => r.cn_posted_total > 0 || Math.abs(r.derived_remaining) > 0.01)
      .sort((a, b) => Math.abs(b.mismatch) - Math.abs(a.mismatch));
  },
});

export interface ReconciliationNote {
  credit_note_id: string;
  credit_note_no: string;
  total: number;
  journal_entry_id: string | null;
  ar_credit: number;
  ok: boolean;
}

export interface ReconciliationRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  derived_remaining: number;
  cn_posted_total: number;
  cn_with_je: number;
  ar_ledger_credit: number;
  mismatch: number;
  notes: ReconciliationNote[];
}

// ============================================================================
// Accounts Payable (AP) — vendor module pending backend.
// Adapter contract is defined now so screens are wired and ready to consume
// real data the moment a `vendors` / `bills` table ships.
// ============================================================================

export interface APVendorBalance {
  vendor_id: string;
  vendor_code: string;
  vendor_name: string;
  bill_count: number;
  total_payable: number;
  paid_amount: number;
  remaining_balance: number;
  overdue_amount: number;
  aging: AgingBuckets;
}

export interface VendorStatementLine {
  date: string;
  type: "bill" | "payment";
  reference: string;
  description: string;
  debit: number;   // payments to vendor
  credit: number;  // bills received
  running_balance: number;
  source_id: string;
}

Object.assign(accountingService, {
  async listPayables(_asOf?: string): Promise<APVendorBalance[]> {
    // Backend vendor module not yet available — return empty list.
    return [];
  },
  async vendorStatement(_vendorId: string, _from?: string, _to?: string): Promise<{
    vendor: { id: string; code: string; name: string } | null;
    lines: VendorStatementLine[];
    totals: { debit: number; credit: number; balance: number };
  }> {
    return { vendor: null, lines: [], totals: { debit: 0, credit: 0, balance: 0 } };
  },
});

// ============================================================================
// Chart of Accounts hierarchy + Financial Reports + Executive KPIs
// ============================================================================

export interface AccountNode extends AccountRow {
  parent_code: string | null;
  depth: number;
  is_posting: boolean;
  debit: number;
  credit: number;
  balance: number;
  rollup: number;
  children: AccountNode[];
}

export interface FinancialKpis {
  cash: number; bank: number; liquidity: number;
  receivables: number; payables: number; vat_payable: number;
  revenue_ytd: number; expense_ytd: number; net_income_ytd: number;
  revenue_mtd: number; expense_mtd: number; net_income_mtd: number;
}

export interface ReportSection {
  key: string; label: string; total: number;
  rows: { code: string; name_ar: string; amount: number; account_id: string }[];
}
export interface IncomeStatement {
  from: string; to: string;
  revenue: ReportSection; expense: ReportSection;
  gross_profit: number; net_income: number;
}
export interface BalanceSheet {
  as_of: string;
  assets: ReportSection; liabilities: ReportSection; equity: ReportSection;
  retained_earnings: number;
  total_assets: number; total_liab_equity: number;
  balanced: boolean;
}
export interface CashFlowReport {
  from: string; to: string;
  opening: number; closing: number; net_change: number;
  inflows: { code: string; name_ar: string; amount: number }[];
  outflows: { code: string; name_ar: string; amount: number }[];
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const startOfYear = () => `${new Date().getFullYear()}-01-01`;
const startOfMonth = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
function _prevDay(iso: string): string {
  const d = new Date(iso); d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
const naturalBalance = (type: AccountRow["type"], d: number, c: number) =>
  (type === "asset" || type === "expense") ? d - c : c - d;

Object.assign(accountingService, {
  async accountBalances(from?: string, to?: string): Promise<Map<string, { debit: number; credit: number }>> {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("account_id, debit, credit, journal_entries!inner(entry_date, is_posted)");
    if (error) throw error;
    const m = new Map<string, { debit: number; credit: number }>();
    for (const l of (data ?? []) as any[]) {
      const je = l.journal_entries;
      if (!je?.is_posted) continue;
      if (from && je.entry_date < from) continue;
      if (to && je.entry_date > to) continue;
      const cur = m.get(l.account_id) ?? { debit: 0, credit: 0 };
      cur.debit += Number(l.debit || 0);
      cur.credit += Number(l.credit || 0);
      m.set(l.account_id, cur);
    }
    return m;
  },

  async chartTree(asOf?: string): Promise<AccountNode[]> {
    const accounts = await (accountingService as any).listAccounts();
    const balances: Map<string, { debit: number; credit: number }> =
      await (accountingService as any).accountBalances(undefined, asOf);
    const sorted = [...accounts].sort((a: AccountRow, b: AccountRow) => a.code.localeCompare(b.code));
    const byCode = new Map<string, AccountNode>();
    const findParentCode = (code: string): string | null => {
      for (let len = code.length - 1; len >= 1; len--) {
        const p = code.slice(0, len);
        if (byCode.has(p)) return p;
      }
      return null;
    };
    const nodes: AccountNode[] = sorted.map((a: AccountRow) => {
      const v = balances.get(a.id) ?? { debit: 0, credit: 0 };
      const bal = naturalBalance(a.type, v.debit, v.credit);
      return {
        ...a, parent_code: null, depth: 0, is_posting: true,
        debit: v.debit, credit: v.credit, balance: bal, rollup: bal, children: [],
      };
    });
    for (const n of nodes) byCode.set(n.code, n);
    const roots: AccountNode[] = [];
    for (const n of nodes) {
      const p = findParentCode(n.code);
      if (p) {
        n.parent_code = p;
        const parent = byCode.get(p)!;
        parent.children.push(n);
        parent.is_posting = false;
      } else roots.push(n);
    }
    const setDepth = (n: AccountNode, d: number) => { n.depth = d; for (const c of n.children) setDepth(c, d + 1); };
    const rollup = (n: AccountNode): number => {
      let s = n.is_posting ? n.balance : 0;
      for (const c of n.children) s += rollup(c);
      n.rollup = s; return s;
    };
    roots.forEach(r => { setDepth(r, 0); rollup(r); });
    return roots;
  },

  async incomeStatement(from?: string, to?: string): Promise<IncomeStatement> {
    const f = from || startOfYear();
    const t = to || todayStr();
    const accounts = await (accountingService as any).listAccounts();
    const balances = await (accountingService as any).accountBalances(f, t);
    const build = (type: AccountRow["type"], label: string): ReportSection => {
      const rows = (accounts as AccountRow[])
        .filter(a => a.type === type && a.is_active)
        .map(a => {
          const v = balances.get(a.id) ?? { debit: 0, credit: 0 };
          return { code: a.code, name_ar: a.name_ar, amount: naturalBalance(type, v.debit, v.credit), account_id: a.id };
        })
        .filter(r => Math.abs(r.amount) > 0.005)
        .sort((a, b) => a.code.localeCompare(b.code));
      return { key: type, label, total: rows.reduce((s, r) => s + r.amount, 0), rows };
    };
    const revenue = build("revenue", "الإيرادات");
    const expense = build("expense", "المصروفات");
    return { from: f, to: t, revenue, expense, gross_profit: revenue.total, net_income: revenue.total - expense.total };
  },

  async balanceSheet(asOf?: string): Promise<BalanceSheet> {
    const t = asOf || todayStr();
    const accounts = await (accountingService as any).listAccounts();
    const balances = await (accountingService as any).accountBalances(undefined, t);
    const build = (type: AccountRow["type"], label: string): ReportSection => {
      const rows = (accounts as AccountRow[])
        .filter(a => a.type === type && a.is_active)
        .map(a => {
          const v = balances.get(a.id) ?? { debit: 0, credit: 0 };
          return { code: a.code, name_ar: a.name_ar, amount: naturalBalance(type, v.debit, v.credit), account_id: a.id };
        })
        .filter(r => Math.abs(r.amount) > 0.005)
        .sort((a, b) => a.code.localeCompare(b.code));
      return { key: type, label, total: rows.reduce((s, r) => s + r.amount, 0), rows };
    };
    const assets = build("asset", "الأصول");
    const liabilities = build("liability", "الالتزامات");
    const equity = build("equity", "حقوق الملكية");
    let rev = 0, exp = 0;
    for (const a of accounts as AccountRow[]) {
      const v = balances.get(a.id) ?? { debit: 0, credit: 0 };
      if (a.type === "revenue") rev += naturalBalance("revenue", v.debit, v.credit);
      if (a.type === "expense") exp += naturalBalance("expense", v.debit, v.credit);
    }
    const retained_earnings = rev - exp;
    const total_assets = assets.total;
    const total_liab_equity = liabilities.total + equity.total + retained_earnings;
    return { as_of: t, assets, liabilities, equity, retained_earnings, total_assets, total_liab_equity,
      balanced: Math.abs(total_assets - total_liab_equity) < 0.01 };
  },

  async cashFlow(from?: string, to?: string): Promise<CashFlowReport> {
    const f = from || startOfYear();
    const t = to || todayStr();
    const accounts: AccountRow[] = await (accountingService as any).listAccounts();
    const cashAccounts = accounts.filter(a => a.type === "asset" && (
      a.name_ar.includes("نقد") || a.name_ar.includes("بنك") || a.name_ar.includes("صندوق") ||
      /cash|bank/i.test(a.name_en || "") || a.code.startsWith("1101") || a.code.startsWith("1102")
    ));
    const ids = new Set(cashAccounts.map(a => a.id));
    const openingMap = await (accountingService as any).accountBalances(undefined, _prevDay(f));
    let opening = 0;
    for (const a of cashAccounts) {
      const v = openingMap.get(a.id) ?? { debit: 0, credit: 0 };
      opening += naturalBalance("asset", v.debit, v.credit);
    }
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("entry_id, account_id, debit, credit, accounts(code, name_ar), journal_entries!inner(entry_date, is_posted)");
    if (error) throw error;
    const byEntry = new Map<string, any[]>();
    for (const l of (data ?? []) as any[]) {
      const je = l.journal_entries;
      if (!je?.is_posted) continue;
      if (je.entry_date < f || je.entry_date > t) continue;
      const arr = byEntry.get(l.entry_id) ?? [];
      arr.push(l); byEntry.set(l.entry_id, arr);
    }
    const counterIn = new Map<string, { code: string; name_ar: string; amount: number }>();
    const counterOut = new Map<string, { code: string; name_ar: string; amount: number }>();
    let netChange = 0;
    for (const lines of byEntry.values()) {
      const cashLines = lines.filter(l => ids.has(l.account_id));
      const otherLines = lines.filter(l => !ids.has(l.account_id));
      if (!cashLines.length || !otherLines.length) continue;
      const cashDelta = cashLines.reduce((s, l) => s + Number(l.debit || 0) - Number(l.credit || 0), 0);
      netChange += cashDelta;
      const otherTotal = otherLines.reduce((s, l) => s + Math.abs(Number(l.debit || 0) - Number(l.credit || 0)), 0) || 1;
      for (const ol of otherLines) {
        const w = Math.abs(Number(ol.debit || 0) - Number(ol.credit || 0)) / otherTotal;
        const share = cashDelta * w;
        const key = ol.account_id;
        const meta = { code: ol.accounts?.code ?? "—", name_ar: ol.accounts?.name_ar ?? "—" };
        if (share > 0) {
          const cur = counterIn.get(key) ?? { ...meta, amount: 0 }; cur.amount += share; counterIn.set(key, cur);
        } else if (share < 0) {
          const cur = counterOut.get(key) ?? { ...meta, amount: 0 }; cur.amount += -share; counterOut.set(key, cur);
        }
      }
    }
    return {
      from: f, to: t, opening, closing: opening + netChange, net_change: netChange,
      inflows: [...counterIn.values()].sort((a, b) => b.amount - a.amount),
      outflows: [...counterOut.values()].sort((a, b) => b.amount - a.amount),
    };
  },

  async financialKpis(): Promise<FinancialKpis> {
    const accounts: AccountRow[] = await (accountingService as any).listAccounts();
    const [balAll, balYtd, balMtd, recv] = await Promise.all([
      (accountingService as any).accountBalances(),
      (accountingService as any).accountBalances(startOfYear(), todayStr()),
      (accountingService as any).accountBalances(startOfMonth(), todayStr()),
      (accountingService as any).listReceivables() as Promise<ARCustomerBalance[]>,
    ]);
    const sumByMatch = (m: Map<string, { debit: number; credit: number }>, pred: (a: AccountRow) => boolean) => {
      let s = 0;
      for (const a of accounts) if (pred(a)) {
        const v = m.get(a.id) ?? { debit: 0, credit: 0 };
        s += naturalBalance(a.type, v.debit, v.credit);
      }
      return s;
    };
    const isCash = (a: AccountRow) => a.type === "asset" && (a.name_ar.includes("نقد") || a.name_ar.includes("صندوق") || a.code.startsWith("1101"));
    const isBank = (a: AccountRow) => a.type === "asset" && (a.name_ar.includes("بنك") || a.code.startsWith("1102"));
    const isVat = (a: AccountRow) => a.type === "liability" && (a.name_ar.includes("ضريبة") || /vat/i.test(a.name_en || "") || a.code.startsWith("22"));
    const cash = sumByMatch(balAll, isCash);
    const bank = sumByMatch(balAll, isBank);
    const revYtd = sumByMatch(balYtd, a => a.type === "revenue");
    const expYtd = sumByMatch(balYtd, a => a.type === "expense");
    const revMtd = sumByMatch(balMtd, a => a.type === "revenue");
    const expMtd = sumByMatch(balMtd, a => a.type === "expense");
    return {
      cash, bank, liquidity: cash + bank,
      receivables: (recv as ARCustomerBalance[]).reduce((s, r) => s + r.remaining_balance, 0),
      payables: 0,
      vat_payable: sumByMatch(balAll, isVat),
      revenue_ytd: revYtd, expense_ytd: expYtd, net_income_ytd: revYtd - expYtd,
      revenue_mtd: revMtd, expense_mtd: expMtd, net_income_mtd: revMtd - expMtd,
    };
  },
});

// Typed accessor — Object.assign extends `accountingService` at runtime.
export interface AccountingServiceExt {
  listEntries: typeof accountingService.listEntries;
  getEntry: typeof accountingService.getEntry;
  listAccounts: typeof accountingService.listAccounts;
  ledger: typeof accountingService.ledger;
  trialBalance: typeof accountingService.trialBalance;
  listReceivables: (asOf?: string) => Promise<ARCustomerBalance[]>;
  customerStatement: (customerId: string, from?: string, to?: string) => Promise<{
    customer: { id: string; code: string; name: string } | null;
    lines: CustomerStatementLine[];
    totals: { debit: number; credit: number; balance: number };
  }>;
  listPayables: (asOf?: string) => Promise<APVendorBalance[]>;
  vendorStatement: (vendorId: string, from?: string, to?: string) => Promise<{
    vendor: { id: string; code: string; name: string } | null;
    lines: VendorStatementLine[];
    totals: { debit: number; credit: number; balance: number };
  }>;
  accountBalances: (from?: string, to?: string) => Promise<Map<string, { debit: number; credit: number }>>;
  chartTree: (asOf?: string) => Promise<AccountNode[]>;
  incomeStatement: (from?: string, to?: string) => Promise<IncomeStatement>;
  balanceSheet: (asOf?: string) => Promise<BalanceSheet>;
  cashFlow: (from?: string, to?: string) => Promise<CashFlowReport>;
  financialKpis: () => Promise<FinancialKpis>;
  reconcileCustomerLedger: () => Promise<ReconciliationRow[]>;
}

export const accounting = accountingService as unknown as AccountingServiceExt;

