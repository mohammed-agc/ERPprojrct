/**
 * Frontend-only overlay for the Chart of Accounts.
 *
 * Persists ERP account management operations (create / edit / archive +
 * extended metadata: cost-center applicable, VAT applicable, posting flag,
 * archived) in localStorage. Merges seamlessly into accounts loaded from the
 * backend so the UI exposes the full operational contract for future backend
 * wiring without modifying the posting engine.
 */
import { supabase } from "@/integrations/supabase/client";
import type { AccountRow, AccountNode } from "@/services/erp/accounting";

const KEY = "sarat.erp.accounts.overlay.v1";

export type AccountTypeKey = AccountRow["type"];

export interface AccountMeta {
  /** Force posting flag (overrides leaf-only inference). */
  is_posting?: boolean;
  cost_center_applicable?: boolean;
  vat_applicable?: boolean;
  archived?: boolean;
  notes?: string;
}

export interface CreatedAccount {
  id: string;            // client-generated uuid (prefix "loc-")
  code: string;
  name_ar: string;
  name_en: string | null;
  type: AccountTypeKey;
  is_active: boolean;
  meta: AccountMeta;
  created_at: string;
}

interface Envelope {
  created: CreatedAccount[];
  /** account_id -> partial overrides (name, status, meta…) */
  edits: Record<string, {
    name_ar?: string;
    name_en?: string | null;
    is_active?: boolean;
    meta?: AccountMeta;
  }>;
  meta: Record<string, AccountMeta>;
}

const empty = (): Envelope => ({ created: [], edits: {}, meta: {} });

function load(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const v = JSON.parse(raw);
    return { created: v.created ?? [], edits: v.edits ?? {}, meta: v.meta ?? {} };
  } catch {
    return empty();
  }
}
function save(e: Envelope) {
  localStorage.setItem(KEY, JSON.stringify(e));
}

const uid = () => `loc-${Math.random().toString(36).slice(2, 10)}`;

export interface AccountStats {
  tx_count: number;
  last_movement: string | null;
}

export const accountOverlay = {
  /** Merge overlay over base accounts list returned by the service. */
  mergeAccounts(base: AccountRow[]): (AccountRow & { meta: AccountMeta })[] {
    const env = load();
    const editsById = env.edits;
    const metaById = env.meta;
    const merged: (AccountRow & { meta: AccountMeta })[] = base.map(a => {
      const ed = editsById[a.id] ?? {};
      return {
        ...a,
        name_ar: ed.name_ar ?? a.name_ar,
        name_en: ed.name_en ?? a.name_en,
        is_active: ed.is_active ?? a.is_active,
        meta: { ...(metaById[a.id] ?? {}), ...(ed.meta ?? {}) },
      };
    });
    for (const c of env.created) {
      merged.push({
        id: c.id, code: c.code, name_ar: c.name_ar, name_en: c.name_en,
        type: c.type, is_active: c.is_active, meta: c.meta,
      });
    }
    return merged.filter(a => !a.meta.archived);
  },

  /** Apply overlay metadata to an already-built AccountNode tree (forced posting flag). */
  applyTreeMeta(roots: AccountNode[]): void {
    const env = load();
    const all = [...env.created.map(c => [c.id, c.meta] as const),
                 ...Object.entries(env.meta),
                 ...Object.entries(env.edits).map(([k, v]) => [k, v.meta ?? {}] as const)];
    const map = new Map<string, AccountMeta>();
    for (const [id, m] of all) map.set(id, { ...(map.get(id) ?? {}), ...m });
    const walk = (n: AccountNode) => {
      const m = map.get(n.id);
      if (m?.is_posting === true && n.children.length === 0) n.is_posting = true;
      if (m?.is_posting === false) n.is_posting = false;
      n.children.forEach(walk);
    };
    roots.forEach(walk);
  },

  list(): Envelope { return load(); },

  validateCode(code: string, existing: AccountRow[]): string | null {
    const c = code.trim();
    if (!/^[0-9]{1,12}$/.test(c)) return "الكود يجب أن يحتوي على أرقام فقط (حتى 12 خانة).";
    if (existing.some(a => a.code === c)) return "هذا الكود مستخدم بالفعل.";
    return null;
  },

  /** Find the deepest existing account whose code is a prefix of `code`. */
  inferParent(code: string, accounts: AccountRow[]): AccountRow | null {
    const sorted = [...accounts].sort((a, b) => b.code.length - a.code.length);
    for (const a of sorted) {
      if (code !== a.code && code.startsWith(a.code)) return a;
    }
    return null;
  },

  create(input: Omit<CreatedAccount, "id" | "created_at" | "meta"> & { meta?: AccountMeta }): CreatedAccount {
    const env = load();
    const row: CreatedAccount = {
      ...input,
      id: uid(),
      created_at: new Date().toISOString(),
      meta: input.meta ?? {},
    };
    env.created.push(row);
    save(env);
    return row;
  },

  update(id: string, patch: { name_ar?: string; name_en?: string | null; is_active?: boolean; meta?: AccountMeta }) {
    const env = load();
    const created = env.created.find(c => c.id === id);
    if (created) {
      if (patch.name_ar !== undefined) created.name_ar = patch.name_ar;
      if (patch.name_en !== undefined) created.name_en = patch.name_en;
      if (patch.is_active !== undefined) created.is_active = patch.is_active;
      if (patch.meta) created.meta = { ...created.meta, ...patch.meta };
    } else {
      const cur = env.edits[id] ?? {};
      env.edits[id] = {
        ...cur,
        ...patch,
        meta: { ...(cur.meta ?? {}), ...(patch.meta ?? {}) },
      };
    }
    save(env);
  },

  archive(id: string) {
    this.update(id, { is_active: false, meta: { archived: true } });
  },

  restore(id: string) {
    const env = load();
    const created = env.created.find(c => c.id === id);
    if (created) { created.meta.archived = false; created.is_active = true; save(env); return; }
    const cur = env.edits[id] ?? {};
    env.edits[id] = { ...cur, is_active: true, meta: { ...(cur.meta ?? {}), archived: false } };
    save(env);
  },

  remove(id: string) {
    const env = load();
    env.created = env.created.filter(c => c.id !== id);
    delete env.edits[id];
    delete env.meta[id];
    save(env);
  },

  /** One-shot per-account stats (tx count + last movement) for posted entries. */
  async stats(): Promise<Map<string, AccountStats>> {
    const { data, error } = await supabase
      .from("journal_entry_lines")
      .select("account_id, journal_entries!inner(entry_date, is_posted)")
      .limit(5000);
    if (error) return new Map();
    const m = new Map<string, AccountStats>();
    for (const l of (data ?? []) as any[]) {
      const je = l.journal_entries;
      if (!je?.is_posted) continue;
      const cur = m.get(l.account_id) ?? { tx_count: 0, last_movement: null };
      cur.tx_count += 1;
      if (!cur.last_movement || je.entry_date > cur.last_movement) cur.last_movement = je.entry_date;
      m.set(l.account_id, cur);
    }
    return m;
  },
};

export const accountTypeIconKey: Record<AccountTypeKey, string> = {
  asset: "Wallet",
  liability: "Scale",
  equity: "Crown",
  revenue: "TrendingUp",
  expense: "TrendingDown",
};
