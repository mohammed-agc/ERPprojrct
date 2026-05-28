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
