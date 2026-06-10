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
