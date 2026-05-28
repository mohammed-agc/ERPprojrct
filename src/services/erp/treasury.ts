/**
 * Treasury adapter — frontend operational contract.
 *
 * Persists to localStorage today. When a backend treasury engine ships,
 * swap these functions without touching UI. Same pattern as accounting.ts.
 *
 * Cash/bank balances visible in the GL are merged in via `effectiveBalance`.
 */
import { accounting } from "./accounting";

export type TreasuryAccountType = "cash_main" | "cash_branch" | "cash_petty" | "bank" | "suspended" | "clearing";
export type Currency = "SAR" | "USD" | "EUR" | "AED";
export type PaymentMethod = "cash" | "bank_transfer" | "cheque" | "card" | "online" | "other";
export type VoucherType = "receipt" | "payment";
export type ReceiptKind = "customer" | "misc" | "advance" | "partial";
export type PaymentKind = "vendor" | "expense" | "refund" | "internal";
export type VoucherStatus = "draft" | "posted" | "reversed";
export type TransferStatus = "pending" | "completed" | "reversed";
export type TransferKind = "cash_to_bank" | "bank_to_bank" | "branch" | "treasury";
export type ReconStatus = "unmatched" | "matched" | "ignored";

export interface TreasuryAccount {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  type: TreasuryAccountType;
  currency: Currency;
  branch?: string;
  iban?: string;
  bank_name?: string;
  responsible?: string;
  opening_balance: number;
  active: boolean;
  /** Optional link to a GL account so we can merge real balances. */
  gl_account_id?: string;
  created_at: string;
}

export interface Voucher {
  id: string;
  type: VoucherType;
  kind: ReceiptKind | PaymentKind;
  number: string;
  date: string;
  account_id: string;          // treasury account
  counterparty: string;        // payer/payee name
  counterparty_id?: string;    // customer/vendor id
  amount: number;
  method: PaymentMethod;
  reference?: string;
  linked_invoice?: string;
  notes?: string;
  status: VoucherStatus;
  attachments?: { name: string; size: number }[];
  created_at: string;
}

export interface Transfer {
  id: string;
  number: string;
  date: string;
  kind: TransferKind;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  fees?: number;
  reference?: string;
  notes?: string;
  status: TransferStatus;
  created_at: string;
}

export interface BankStatementLine {
  id: string;
  account_id: string;
  date: string;
  description: string;
  reference?: string;
  debit: number;   // money out of bank (per statement)
  credit: number;  // money into bank
  status: ReconStatus;
  matched_voucher_id?: string;
}

export interface TreasuryMovement {
  id: string;
  account_id: string;
  date: string;
  type: "receipt" | "payment" | "transfer_in" | "transfer_out" | "opening";
  reference: string;
  description: string;
  amount: number; // signed: + inflow, - outflow
  source_id: string;
  status: VoucherStatus | TransferStatus | "opening";
}

// ──────────────────────────────────────────────────────────────────────────
// localStorage envelope
// ──────────────────────────────────────────────────────────────────────────
const KEY = "sarat.treasury.v1";

interface Envelope {
  accounts: TreasuryAccount[];
  vouchers: Voucher[];
  transfers: Transfer[];
  statementLines: BankStatementLine[];
}

const defaultAccounts = (): TreasuryAccount[] => {
  const now = new Date().toISOString();
  return [
    { id: crypto.randomUUID(), code: "CB-001", name_ar: "الصندوق الرئيسي", type: "cash_main", currency: "SAR", branch: "الرياض", opening_balance: 0, active: true, created_at: now },
    { id: crypto.randomUUID(), code: "CB-002", name_ar: "صندوق المبيعات", type: "cash_branch", currency: "SAR", branch: "الرياض", opening_balance: 0, active: true, created_at: now },
    { id: crypto.randomUUID(), code: "CB-003", name_ar: "العهدة النثرية", type: "cash_petty", currency: "SAR", opening_balance: 0, active: true, created_at: now },
    { id: crypto.randomUUID(), code: "BK-001", name_ar: "الراجحي - الحساب الجاري", type: "bank", currency: "SAR", bank_name: "مصرف الراجحي", iban: "SA00 0000 0000 0000 0000 0000", opening_balance: 0, active: true, created_at: now },
    { id: crypto.randomUUID(), code: "BK-002", name_ar: "الأهلي - حساب الرواتب", type: "bank", currency: "SAR", bank_name: "البنك الأهلي السعودي", opening_balance: 0, active: true, created_at: now },
    { id: crypto.randomUUID(), code: "SUS-001", name_ar: "أموال معلقة", type: "suspended", currency: "SAR", opening_balance: 0, active: true, created_at: now },
  ];
};

function load(): Envelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  const env: Envelope = { accounts: defaultAccounts(), vouchers: [], transfers: [], statementLines: [] };
  localStorage.setItem(KEY, JSON.stringify(env));
  return env;
}
function save(env: Envelope) { localStorage.setItem(KEY, JSON.stringify(env)); }
function gen(prefix: string, list: { number: string }[]): string {
  const n = list.length + 1;
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────────────────
export const treasuryService = {
  // Accounts
  async listAccounts(): Promise<TreasuryAccount[]> {
    return load().accounts.sort((a, b) => a.code.localeCompare(b.code));
  },
  async getAccount(id: string): Promise<TreasuryAccount | null> {
    return load().accounts.find(a => a.id === id) ?? null;
  },
  async saveAccount(a: Omit<TreasuryAccount, "id" | "created_at"> & { id?: string }): Promise<TreasuryAccount> {
    const env = load();
    if (a.id) {
      const idx = env.accounts.findIndex(x => x.id === a.id);
      if (idx >= 0) env.accounts[idx] = { ...env.accounts[idx], ...a } as TreasuryAccount;
    } else {
      const rec: TreasuryAccount = { ...a, id: crypto.randomUUID(), created_at: new Date().toISOString() } as TreasuryAccount;
      env.accounts.push(rec);
      save(env);
      return rec;
    }
    save(env);
    return env.accounts.find(x => x.id === a.id)!;
  },
  async toggleAccount(id: string): Promise<void> {
    const env = load();
    const acc = env.accounts.find(a => a.id === id);
    if (acc) { acc.active = !acc.active; save(env); }
  },

  // Vouchers
  async listVouchers(type?: VoucherType): Promise<Voucher[]> {
    const env = load();
    return env.vouchers
      .filter(v => !type || v.type === type)
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  },
  async createVoucher(v: Omit<Voucher, "id" | "number" | "created_at" | "status"> & { status?: VoucherStatus }): Promise<Voucher> {
    const env = load();
    const prefix = v.type === "receipt" ? "RCV" : "PMT";
    const rec: Voucher = {
      ...v,
      id: crypto.randomUUID(),
      number: gen(prefix, env.vouchers.filter(x => x.type === v.type)),
      status: v.status ?? "posted",
      created_at: new Date().toISOString(),
    };
    env.vouchers.push(rec); save(env); return rec;
  },
  async reverseVoucher(id: string): Promise<void> {
    const env = load();
    const v = env.vouchers.find(x => x.id === id);
    if (v) { v.status = "reversed"; save(env); }
  },

  // Transfers
  async listTransfers(): Promise<Transfer[]> {
    return load().transfers.sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  },
  async createTransfer(t: Omit<Transfer, "id" | "number" | "created_at" | "status"> & { status?: TransferStatus }): Promise<Transfer> {
    const env = load();
    const rec: Transfer = {
      ...t,
      id: crypto.randomUUID(),
      number: gen("TRF", env.transfers),
      status: t.status ?? "completed",
      created_at: new Date().toISOString(),
    };
    env.transfers.push(rec); save(env); return rec;
  },
  async reverseTransfer(id: string): Promise<void> {
    const env = load();
    const t = env.transfers.find(x => x.id === id);
    if (t) { t.status = "reversed"; save(env); }
  },

  // Movement timeline (combines vouchers + transfers + opening)
  async movements(accountId?: string): Promise<TreasuryMovement[]> {
    const env = load();
    const ev: TreasuryMovement[] = [];
    for (const a of env.accounts) {
      if (accountId && a.id !== accountId) continue;
      if (a.opening_balance) {
        ev.push({
          id: `op-${a.id}`, account_id: a.id, date: a.created_at.slice(0, 10),
          type: "opening", reference: a.code, description: "رصيد افتتاحي",
          amount: a.opening_balance, source_id: a.id, status: "opening",
        });
      }
    }
    for (const v of env.vouchers) {
      if (v.status === "reversed") continue;
      if (accountId && v.account_id !== accountId) continue;
      ev.push({
        id: v.id, account_id: v.account_id, date: v.date,
        type: v.type === "receipt" ? "receipt" : "payment",
        reference: v.number,
        description: v.counterparty + (v.notes ? ` — ${v.notes}` : ""),
        amount: v.type === "receipt" ? v.amount : -v.amount,
        source_id: v.id, status: v.status,
      });
    }
    for (const t of env.transfers) {
      if (t.status === "reversed") continue;
      if (!accountId || t.from_account_id === accountId) {
        ev.push({
          id: `${t.id}-out`, account_id: t.from_account_id, date: t.date,
          type: "transfer_out", reference: t.number,
          description: `تحويل صادر${t.notes ? ` — ${t.notes}` : ""}`,
          amount: -(t.amount + (t.fees ?? 0)), source_id: t.id, status: t.status,
        });
      }
      if (!accountId || t.to_account_id === accountId) {
        ev.push({
          id: `${t.id}-in`, account_id: t.to_account_id, date: t.date,
          type: "transfer_in", reference: t.number,
          description: `تحويل وارد${t.notes ? ` — ${t.notes}` : ""}`,
          amount: t.amount, source_id: t.id, status: t.status,
        });
      }
    }
    return ev.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
  },

  /** Account balance = opening + sum(movements). */
  async accountBalance(accountId: string): Promise<number> {
    const movs = await this.movements(accountId);
    return movs.reduce((s, m) => s + m.amount, 0);
  },

  async allBalances(): Promise<Map<string, number>> {
    const env = load();
    const m = new Map<string, number>();
    for (const a of env.accounts) m.set(a.id, a.opening_balance || 0);
    for (const v of env.vouchers) {
      if (v.status === "reversed") continue;
      m.set(v.account_id, (m.get(v.account_id) ?? 0) + (v.type === "receipt" ? v.amount : -v.amount));
    }
    for (const t of env.transfers) {
      if (t.status === "reversed") continue;
      m.set(t.from_account_id, (m.get(t.from_account_id) ?? 0) - (t.amount + (t.fees ?? 0)));
      m.set(t.to_account_id, (m.get(t.to_account_id) ?? 0) + t.amount);
    }
    return m;
  },

  async kpis(): Promise<{
    total_cash: number; total_bank: number; total_suspended: number;
    daily_inflow: number; daily_outflow: number;
    pending_reconciliation: number; vouchers_today: number;
  }> {
    const [accounts, balances, vouchers] = await Promise.all([
      this.listAccounts(), this.allBalances(), this.listVouchers(),
    ]);
    let cash = 0, bank = 0, susp = 0;
    for (const a of accounts) {
      const b = balances.get(a.id) ?? 0;
      if (a.type === "bank") bank += b;
      else if (a.type === "suspended" || a.type === "clearing") susp += b;
      else cash += b;
    }
    const today = new Date().toISOString().slice(0, 10);
    let inflow = 0, outflow = 0, todayCount = 0;
    for (const v of vouchers) {
      if (v.status !== "posted" || v.date !== today) continue;
      todayCount++;
      if (v.type === "receipt") inflow += v.amount; else outflow += v.amount;
    }
    const env = load();
    const pending = env.statementLines.filter(l => l.status === "unmatched").length;
    return {
      total_cash: cash, total_bank: bank, total_suspended: susp,
      daily_inflow: inflow, daily_outflow: outflow,
      pending_reconciliation: pending, vouchers_today: todayCount,
    };
  },

  // Bank reconciliation
  async listStatementLines(accountId: string): Promise<BankStatementLine[]> {
    return load().statementLines.filter(l => l.account_id === accountId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },
  async addStatementLine(line: Omit<BankStatementLine, "id" | "status">): Promise<BankStatementLine> {
    const env = load();
    const rec: BankStatementLine = { ...line, id: crypto.randomUUID(), status: "unmatched" };
    env.statementLines.push(rec); save(env); return rec;
  },
  async matchStatementLine(lineId: string, voucherId: string | null): Promise<void> {
    const env = load();
    const l = env.statementLines.find(x => x.id === lineId);
    if (!l) return;
    if (voucherId) { l.matched_voucher_id = voucherId; l.status = "matched"; }
    else { l.matched_voucher_id = undefined; l.status = "unmatched"; }
    save(env);
  },
  async ignoreStatementLine(lineId: string): Promise<void> {
    const env = load();
    const l = env.statementLines.find(x => x.id === lineId);
    if (l) { l.status = "ignored"; save(env); }
  },
  async clearStatement(accountId: string): Promise<void> {
    const env = load();
    env.statementLines = env.statementLines.filter(l => l.account_id !== accountId);
    save(env);
  },
};

// Labels
export const accountTypeLabel: Record<TreasuryAccountType, string> = {
  cash_main: "صندوق رئيسي", cash_branch: "صندوق فرع", cash_petty: "نثرية",
  bank: "حساب بنكي", suspended: "أموال معلقة", clearing: "حساب مقاصة",
};
export const accountTypeColor: Record<TreasuryAccountType, string> = {
  cash_main: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  cash_branch: "bg-teal-500/10 text-teal-700 border-teal-300",
  cash_petty: "bg-lime-500/10 text-lime-700 border-lime-300",
  bank: "bg-blue-500/10 text-blue-700 border-blue-300",
  suspended: "bg-amber-500/10 text-amber-700 border-amber-300",
  clearing: "bg-purple-500/10 text-purple-700 border-purple-300",
};
export const methodLabel: Record<PaymentMethod, string> = {
  cash: "نقدي", bank_transfer: "تحويل بنكي", cheque: "شيك", card: "بطاقة", online: "إلكتروني", other: "أخرى",
};
export const receiptKindLabel: Record<ReceiptKind, string> = {
  customer: "تحصيل عميل", misc: "متفرقات", advance: "دفعة مقدمة", partial: "سداد جزئي",
};
export const paymentKindLabel: Record<PaymentKind, string> = {
  vendor: "سداد مورد", expense: "مصروف", refund: "استرجاع", internal: "تسوية داخلية",
};
export const transferKindLabel: Record<TransferKind, string> = {
  cash_to_bank: "إيداع بنكي", bank_to_bank: "بنك إلى بنك", branch: "تحويل فرع", treasury: "تحويل خزينة",
};
export const statusLabel: Record<string, string> = {
  draft: "مسودة", posted: "مُرحَّل", reversed: "ملغي",
  pending: "قيد التنفيذ", completed: "مكتمل",
  unmatched: "غير مطابق", matched: "مُطابق", ignored: "متجاهل", opening: "افتتاحي",
};
