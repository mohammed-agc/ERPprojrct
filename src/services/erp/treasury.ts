/**
 * Treasury Service — Supabase Edition
 * نفس الواجهة البرمجية + دوال التوافق مع Treasury.tsx
 */
import { supabase } from "@/integrations/supabase/client";

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
  name: string;
  name_ar: string;       // alias لـ name
  branch?: string;
  type: TreasuryAccountType;
  currency: Currency;
  bank_name?: string;
  bank_branch?: string;
  iban?: string;
  account_number?: string;
  opening_balance: number;
  current_balance: number;
  active: boolean;
  notes?: string;
  created_at: string;
}

export interface TreasuryMovement {
  id: string;
  account_id: string;
  type: "receipt" | "payment" | "transfer_in" | "transfer_out" | "opening";
  amount: number;        // موجب = دخل، سالب = خروج
  balance_after: number;
  description: string;
  date: string;
  reference: string;
  created_at: string;
}

export interface Voucher {
  id: string;
  code: string;
  voucher_type: VoucherType;
  account_id: string;
  amount: number;
  currency: Currency;
  payment_method: PaymentMethod;
  party_name?: string;
  party_type?: "customer" | "supplier" | "employee" | "other";
  description: string;
  status: VoucherStatus;
  cheque_number?: string;
  cheque_date?: string;
  transaction_date: string;
  notes?: string;
  created_at: string;
}

export interface Transfer {
  id: string;
  code: string;
  from_account_id: string;
  to_account_id: string;
  amount: number;
  fees: number;
  net_amount: number;
  transfer_date: string;
  description?: string;
  status: TransferStatus;
  notes?: string;
  created_at: string;
  from_account?: TreasuryAccount;
  to_account?: TreasuryAccount;
}

export interface BankStatementLine {
  id: string;
  account_id: string;
  transaction_date: string;
  description: string;
  amount: number;
  direction: "debit" | "credit";
  recon_status: ReconStatus;
}

// ─── Labels ───────────────────────────────────────────────────

export const accountTypeLabel: Record<TreasuryAccountType, string> = {
  cash_main:   "صندوق رئيسي",
  cash_branch: "صندوق فرع",
  cash_petty:  "عهدة نثرية",
  bank:        "حساب بنكي",
  suspended:   "موقوف",
  clearing:    "حساب تسوية",
};

export const accountTypeColor: Record<TreasuryAccountType, string> = {
  cash_main:   "bg-green-100 text-green-800 border-green-200",
  cash_branch: "bg-teal-100 text-teal-800 border-teal-200",
  cash_petty:  "bg-yellow-100 text-yellow-800 border-yellow-200",
  bank:        "bg-blue-100 text-blue-800 border-blue-200",
  suspended:   "bg-red-100 text-red-800 border-red-200",
  clearing:    "bg-purple-100 text-purple-800 border-purple-200",
};

export const methodLabel: Record<PaymentMethod, string> = {
  cash: "نقدي", bank_transfer: "تحويل بنكي",
  cheque: "شيك", card: "بطاقة", online: "إلكتروني", other: "أخرى",
};

export const receiptKindLabel: Record<ReceiptKind, string> = {
  customer: "من عميل", misc: "متنوع", advance: "مقدمة", partial: "جزئية",
};

export const paymentKindLabel: Record<PaymentKind, string> = {
  vendor: "لمورد", expense: "مصروف", refund: "استرداد", internal: "داخلي",
};

export const transferKindLabel: Record<TransferKind, string> = {
  cash_to_bank: "صندوق←بنك", bank_to_bank: "بنك←بنك", branch: "فروع", treasury: "خزينة",
};

export const statusLabel: Record<string, string> = {
  draft: "مسودة", posted: "مرحّل", reversed: "معكوس",
  pending: "معلق", completed: "مكتمل", voided: "ملغى", cleared: "مسوّى",
};

// ─── Helper ───────────────────────────────────────────────────

const DB_TYPE: Record<string, TreasuryAccountType> = {
  cash_box: "cash_main", petty_cash: "cash_petty", bank_account: "bank",
};

const MAP_TYPE: Record<TreasuryAccountType, string> = {
  cash_main: "cash_box", cash_branch: "cash_box", cash_petty: "petty_cash",
  bank: "bank_account", suspended: "cash_box", clearing: "cash_box",
};

function mapAccount(row: any): TreasuryAccount {
  return {
    id:              row.id,
    code:            row.code,
    name:            row.name,
    name_ar:         row.name,        // التوافق مع Treasury.tsx
    branch:          row.bank_branch,
    type:            DB_TYPE[row.account_type] ?? "cash_main",
    currency:        (row.currency ?? "SAR") as Currency,
    bank_name:       row.bank_name,
    bank_branch:     row.bank_branch,
    iban:            row.iban,
    account_number:  row.account_number,
    opening_balance: row.opening_balance ?? 0,
    current_balance: row.current_balance ?? 0,
    active:          row.active,
    notes:           row.notes,
    created_at:      row.created_at,
  };
}

function mapMovement(row: any): TreasuryMovement {
  return {
    id:           row.id,
    account_id:   row.account_id,
    type:         row.transaction_type as TreasuryMovement["type"],
    amount:       row.direction === "debit" ? row.amount : -row.amount,
    balance_after: row.balance_after ?? 0,
    description:  row.description,
    date:         row.transaction_date,
    reference:    row.code ?? "",
    created_at:   row.created_at,
  };
}

// ─── Treasury Service ──────────────────────────────────────────

export const treasuryService = {

  // ── Accounts ─────────────────────────────────────────────

  async accounts(): Promise<TreasuryAccount[]> {
    const { data, error } = await supabase.from("treasury_accounts").select("*").order("code");
    if (error) throw error;
    return (data ?? []).map(mapAccount);
  },

  // التوافق مع Treasury.tsx
  async listAccounts(): Promise<TreasuryAccount[]> {
    return treasuryService.accounts();
  },

  // التوافق مع Treasury.tsx — Map<id, balance>
  async allBalances(): Promise<Map<string, number>> {
    const accts = await treasuryService.accounts();
    const map = new Map<string, number>();
    accts.forEach(a => map.set(a.id, a.current_balance));
    return map;
  },

  async getAccount(id: string): Promise<TreasuryAccount | null> {
    const { data, error } = await supabase.from("treasury_accounts").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? mapAccount(data) : null;
  },

  async createAccount(input: {
    code: string; name: string; type: TreasuryAccountType; currency?: Currency;
    bank_name?: string; bank_branch?: string; iban?: string; account_number?: string;
    opening_balance?: number; notes?: string;
  }): Promise<TreasuryAccount> {
    const ob = input.opening_balance ?? 0;
    const { data, error } = await supabase.from("treasury_accounts").insert({
      code: input.code, name: input.name, account_type: MAP_TYPE[input.type],
      currency: input.currency ?? "SAR", bank_name: input.bank_name,
      bank_branch: input.bank_branch, iban: input.iban,
      account_number: input.account_number, opening_balance: ob, current_balance: ob,
      notes: input.notes, active: true,
    }).select().single();
    if (error) throw error;
    return mapAccount(data);
  },

  async updateAccount(id: string, updates: Partial<TreasuryAccount>): Promise<TreasuryAccount> {
    const { data, error } = await supabase.from("treasury_accounts")
      .update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return mapAccount(data);
  },

  async toggleAccount(id: string, active: boolean): Promise<void> {
    const { error } = await supabase.from("treasury_accounts")
      .update({ active, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
  },

  // ── Vouchers ─────────────────────────────────────────────

  async vouchers(filters?: {
    account_id?: string; voucher_type?: VoucherType;
    date_from?: string; date_to?: string; limit?: number;
  }): Promise<Voucher[]> {
    let q = supabase.from("treasury_transactions")
      .select("*").in("transaction_type", ["receipt", "payment"])
      .order("transaction_date", { ascending: false }).limit(filters?.limit ?? 200);
    if (filters?.account_id)   q = q.eq("account_id", filters.account_id);
    if (filters?.voucher_type) q = q.eq("transaction_type", filters.voucher_type);
    if (filters?.date_from)    q = q.gte("transaction_date", filters.date_from);
    if (filters?.date_to)      q = q.lte("transaction_date", filters.date_to);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, code: r.code, voucher_type: r.transaction_type,
      account_id: r.account_id, amount: r.amount,
      currency: r.currency ?? "SAR", payment_method: r.payment_method ?? "cash",
      party_name: r.party_name, party_type: r.party_type,
      description: r.description, status: r.status === "voided" ? "reversed" : r.status,
      cheque_number: r.cheque_number, cheque_date: r.cheque_date,
      transaction_date: r.transaction_date, notes: r.notes, created_at: r.created_at,
    }));
  },

  async postReceipt(input: {
    account_id: string; amount: number; description: string; payment_method: PaymentMethod;
    party_name?: string; party_type?: Voucher["party_type"];
    cheque_number?: string; cheque_date?: string; transaction_date?: string;
    notes?: string; created_by?: string;
  }): Promise<Voucher> {
    return treasuryService._post({ ...input, voucher_type: "receipt" });
  },

  async postPayment(input: {
    account_id: string; amount: number; description: string; payment_method: PaymentMethod;
    party_name?: string; party_type?: Voucher["party_type"];
    cheque_number?: string; cheque_date?: string; transaction_date?: string;
    notes?: string; created_by?: string;
  }): Promise<Voucher> {
    return treasuryService._post({ ...input, voucher_type: "payment" });
  },

  async _post(input: any): Promise<Voucher> {
    if (input.amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
    const { data: acct } = await supabase.from("treasury_accounts")
      .select("current_balance, active").eq("id", input.account_id).single();
    if (!acct) throw new Error("الحساب غير موجود");
    if (!acct.active) throw new Error("الحساب غير نشط");
    const isReceipt = input.voucher_type === "receipt";
    const balance_before = acct.current_balance;
    const balance_after  = isReceipt ? balance_before + input.amount : balance_before - input.amount;
    if (!isReceipt && balance_after < 0)
      throw new Error(`الرصيد غير كافٍ. المتاح: ${balance_before.toLocaleString()} ر.س`);
    const date = input.transaction_date ?? new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("treasury_transactions").insert({
      account_id: input.account_id, transaction_type: input.voucher_type,
      direction: isReceipt ? "debit" : "credit", amount: input.amount,
      balance_before, balance_after, currency: "SAR",
      description: input.description, payment_method: input.payment_method,
      party_name: input.party_name, party_type: input.party_type,
      cheque_number: input.cheque_number, cheque_date: input.cheque_date,
      transaction_date: date, value_date: date, status: "posted",
      notes: input.notes, created_by: input.created_by,
    }).select().single();
    if (error) throw error;
    await supabase.from("treasury_accounts")
      .update({ current_balance: balance_after, updated_at: new Date().toISOString() })
      .eq("id", input.account_id);
    return {
      id: data.id, code: data.code, voucher_type: input.voucher_type,
      account_id: data.account_id, amount: data.amount, currency: "SAR",
      payment_method: input.payment_method, party_name: input.party_name,
      party_type: input.party_type, description: data.description,
      status: "posted", cheque_number: input.cheque_number,
      cheque_date: input.cheque_date, transaction_date: date,
      notes: input.notes, created_at: data.created_at,
    };
  },

  async reverseVoucher(id: string, reason: string): Promise<void> {
    const { data: trx } = await supabase.from("treasury_transactions").select("*").eq("id", id).single();
    if (!trx) throw new Error("السند غير موجود");
    if (trx.status === "voided") throw new Error("السند ملغى مسبقاً");
    await supabase.from("treasury_accounts")
      .update({ current_balance: trx.balance_before, updated_at: new Date().toISOString() })
      .eq("id", trx.account_id);
    await supabase.from("treasury_transactions")
      .update({ status: "voided", voided_reason: reason, voided_at: new Date().toISOString() })
      .eq("id", id);
  },

  // ── Movements ─────────────────────────────────────────────

  async movements(account_id?: string, limit = 50): Promise<TreasuryMovement[]> {
    let q = supabase.from("treasury_transactions")
      .select("*").eq("status", "posted")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false }).limit(limit);
    if (account_id) q = q.eq("account_id", account_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapMovement);
  },

  // ── Transfers ─────────────────────────────────────────────

  async transfers(): Promise<Transfer[]> {
    const { data, error } = await supabase.from("treasury_transfers")
      .select(`*, from_account:treasury_accounts!from_account_id(*), to_account:treasury_accounts!to_account_id(*)`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      id: r.id, code: r.code, from_account_id: r.from_account_id, to_account_id: r.to_account_id,
      amount: r.amount, fees: r.fees ?? 0, net_amount: r.net_amount ?? r.amount,
      transfer_date: r.transfer_date, description: r.description,
      status: r.status as TransferStatus, notes: r.notes, created_at: r.created_at,
      from_account: r.from_account ? mapAccount(r.from_account) : undefined,
      to_account:   r.to_account   ? mapAccount(r.to_account)   : undefined,
    }));
  },

  async executeTransfer(input: {
    from_account_id: string; to_account_id: string; amount: number;
    fees?: number; description?: string; transfer_date?: string; notes?: string;
  }): Promise<Transfer> {
    if (input.from_account_id === input.to_account_id) throw new Error("لا يمكن التحويل لنفس الحساب");
    const fees = input.fees ?? 0;
    const desc = input.description ?? "تحويل بين حسابات";
    const date = input.transfer_date ?? new Date().toISOString().slice(0, 10);
    const fromV = await treasuryService._post({
      account_id: input.from_account_id, voucher_type: "payment",
      amount: input.amount, description: `${desc} (صادر)`,
      payment_method: "bank_transfer", transaction_date: date,
    });
    const toV = await treasuryService._post({
      account_id: input.to_account_id, voucher_type: "receipt",
      amount: input.amount - fees, description: `${desc} (وارد)`,
      payment_method: "bank_transfer", transaction_date: date,
    });
    const { data, error } = await supabase.from("treasury_transfers").insert({
      from_account_id: input.from_account_id, to_account_id: input.to_account_id,
      amount: input.amount, fees, transfer_date: date,
      description: desc, status: "completed",
      from_trx_id: fromV.id, to_trx_id: toV.id, notes: input.notes,
    }).select().single();
    if (error) throw error;
    return {
      id: data.id, code: data.code,
      from_account_id: data.from_account_id, to_account_id: data.to_account_id,
      amount: data.amount, fees: data.fees ?? 0, net_amount: data.net_amount ?? data.amount,
      transfer_date: data.transfer_date, description: data.description,
      status: "completed", created_at: data.created_at,
    };
  },

  // ── KPIs ──────────────────────────────────────────────────

  async kpis(): Promise<any> {
    const { data: accounts } = await supabase.from("treasury_accounts")
      .select("account_type, current_balance").eq("active", true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: todayTrx } = await supabase.from("treasury_transactions")
      .select("transaction_type, amount").eq("transaction_date", today).eq("status", "posted");
    const accts = accounts ?? [];
    const trxs  = todayTrx ?? [];
    const total_cash = accts.filter((a: any) => a.account_type !== "bank_account")
      .reduce((s: number, a: any) => s + a.current_balance, 0);
    const total_bank = accts.filter((a: any) => a.account_type === "bank_account")
      .reduce((s: number, a: any) => s + a.current_balance, 0);
    const receipts = trxs.filter((t: any) => t.transaction_type === "receipt").reduce((s: number, t: any) => s + t.amount, 0);
    const payments = trxs.filter((t: any) => t.transaction_type === "payment").reduce((s: number, t: any) => s + t.amount, 0);
    return {
      total_cash, total_bank,
      total_balance:           total_cash + total_bank,
      total_suspended:         0,
      daily_inflow:            receipts,
      daily_outflow:           payments,
      receipts_today:          receipts,
      payments_today:          payments,
      net_today:               receipts - payments,
      vouchers_today:          trxs.length,
      pending_reconciliation:  0,
      pending_cheques:         0,
    };
  },
};
