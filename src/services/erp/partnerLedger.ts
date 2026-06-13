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
  partnerId: string, from?: string, to?: string, kind?: "customer" | "supplier"
): Promise<SubledgerRow[]> {
  const { data, error } = await supabase.rpc("partner_subledger" as any, {
    p_partner_id: partnerId,
    p_from: from || null,
    p_to: to || null,
    p_kind: kind ?? null,
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
  settlement: "مقاصة",
  debit_note: "إشعار مدين",
  rebate: "حافز وكيل",
  write_off: "إعدام رصيد",
  insurance_settlement: "تسوية تأمين",
  consignment_settlement: "تسوية عمولة بيع",
  intercompany_settlement: "تسوية بين شركات",
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
// ───────── استعلام تخصيصات فاتورة (Allocation Inquiry) ─────────
export interface AllocationRow {
  allocation_number: string;
  allocation_type: string;
  allocated_amount: number;
  allocation_date: string;
  status: string;
  remarks: string | null;
  created_by: string | null;
  created_by_name?: string | null;
  created_at: string | null;
}

export interface DocAllocationSummary {
  total: number;
  payment_allocated: number;
  settlement_allocated: number;
  credit_note_allocated: number;
  other_allocated: number;
  remaining: number;
  allocations: AllocationRow[];
}

export async function getDocumentAllocations(
  docType: "purchase_invoice" | "sales_invoice", docId: string, total: number
): Promise<DocAllocationSummary> {
  const { data, error } = await supabase
    .from("open_item_allocations")
    .select("allocation_number, allocation_type, allocated_amount, allocation_date, status, remarks, created_by, created_at")
    .eq("target_document_type", docType)
    .eq("target_document_id", docId)
    .eq("status", "active")
    .order("allocation_date", { ascending: true });
  if (error) throw error;

  const rows = (data ?? []) as AllocationRow[];

  // أسماء المستخدمين (created_by) من profiles — لعرض الاسم بدل UUID
  const userIds = Array.from(new Set(rows.map(r => (r as any).created_by).filter(Boolean)));
  const nameById: Record<string, string> = {};
  if (userIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
    for (const p of (profs ?? []) as any[]) nameById[p.id] = p.full_name;
  }
  const sum = (t: string) =>
    rows.filter(r => r.allocation_type === t).reduce((s, r) => s + Number(r.allocated_amount), 0);

  const payment = sum("PAYMENT");
  const settlement = sum("SETTLEMENT");
  const creditNote = sum("CREDIT_NOTE");
  const other = rows
    .filter(r => !["PAYMENT", "SETTLEMENT", "CREDIT_NOTE"].includes(r.allocation_type))
    .reduce((s, r) => s + Number(r.allocated_amount), 0);

  const totalAllocated = payment + settlement + creditNote + other;

  return {
    total,
    payment_allocated: payment,
    settlement_allocated: settlement,
    credit_note_allocated: creditNote,
    other_allocated: other,
    remaining: total - totalAllocated,
    allocations: rows.map(r => ({ ...r, allocated_amount: Number(r.allocated_amount), created_by_name: nameById[(r as any).created_by] ?? null })),
  };
}

export const ALLOC_TYPE_LABEL: Record<string, string> = {
  PAYMENT: "دفعة",
  SETTLEMENT: "مقاصة",
  CREDIT_NOTE: "إشعار دائن",
  DEBIT_NOTE: "إشعار مدين",
  REBATE: "حافز وكيل",
  WRITE_OFF: "إعدام رصيد",
  INSURANCE_SETTLEMENT: "تسوية تأمين",
  CONSIGNMENT_SETTLEMENT: "تسوية عمولة بيع",
  INTERCOMPANY_SETTLEMENT: "تسوية بين شركات",
  ADJUSTMENT: "تسوية",
};