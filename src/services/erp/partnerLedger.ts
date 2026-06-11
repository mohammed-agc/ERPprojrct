// خدمة دفتر الأستاذ المساعد للطرف (Business Partner Subledger)
import { supabase } from "@/integrations/supabase/client";

export interface SubledgerRow {
  entry_date: string;
  entry_no: string;
  document_type: string | null;
  reference_number: string | null;
  description: string | null;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface PartnerOption {
  id: string;
  code: string | null;
  name: string;
  is_customer: boolean;
  is_supplier: boolean;
}

/** جلب الأطراف (عملاء/موردين) للاختيار */
export async function listPartners(kind?: "customer" | "supplier"): Promise<PartnerOption[]> {
  let q = supabase
    .from("contacts")
    .select("id, code, name, is_customer, is_supplier")
    .order("name");
  if (kind === "customer") q = q.eq("is_customer", true);
  if (kind === "supplier") q = q.eq("is_supplier", true);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return (data ?? []) as PartnerOption[];
}

/** دفتر الأستاذ المساعد لطرف */
export async function getPartnerSubledger(
  partnerId: string, from?: string, to?: string
): Promise<SubledgerRow[]> {
  const { data, error } = await supabase.rpc("partner_subledger" as any, {
    p_partner_id: partnerId,
    p_from: from || null,
    p_to: to || null,
  });
  if (error) { console.error(error); return []; }
  return (data ?? []) as SubledgerRow[];
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";

export const DOC_TYPE_LABEL: Record<string, string> = {
  purchase_invoice: "فاتورة شراء",
  purchase_payment: "سداد مورد",
  sales_invoice: "فاتورة مبيعات",
  sales_payment: "سداد عميل",
  credit_note: "إشعار دائن",
  journal: "قيد يدوي",
};

// ───────── ملخّص أرصدة الأطراف + المقاصّة (Partner Balance + Settlement) ─────────
export interface PartnerBalance {
  partner_id: string;
  partner_code: string | null;
  partner_name: string;
  is_customer: boolean;
  is_supplier: boolean;
  customer_balance: number;
  vendor_balance: number;
  net_position: number;
}

export async function getPartnerBalances(): Promise<PartnerBalance[]> {
  const { data, error } = await supabase.rpc("partner_balance_summary" as any);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    partner_id: r.partner_id,
    partner_code: r.partner_code,
    partner_name: r.partner_name,
    is_customer: r.is_customer,
    is_supplier: r.is_supplier,
    customer_balance: Number(r.customer_balance) || 0,
    vendor_balance: Number(r.vendor_balance) || 0,
    net_position: Number(r.net_position) || 0,
  }));
}

export interface SettlementResult {
  journal_entry_id: string;
  entry_no: string;
  settled_amount: number;
  allocations_created: number;
}

export async function createPartnerSettlement(
  partnerId: string, amount?: number | null, reason?: string
): Promise<SettlementResult> {
  const { data, error } = await supabase.rpc("create_partner_settlement" as any, {
    p_partner_id: partnerId,
    p_amount: amount ?? null,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as SettlementResult;
}