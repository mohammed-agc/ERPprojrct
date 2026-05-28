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
});

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

// Re-export with full typing so consumers get autocomplete
export interface AccountingService {
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
}

