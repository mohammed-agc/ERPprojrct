// خدمة دفعات فواتير الشراء — Supabase
// كل دفعة تُنشئ قيد يومية تلقائياً (تريجر trg_supplier_payment_je): مدين ذمم / دائن خزينة.
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = "cash" | "bank_transfer";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقد",
  bank_transfer: "تحويل بنكي",
};

export interface PurchasePaymentRow {
  id: string;
  code: string;
  invoice_id: string;
  supplier_id: string | null;
  contact_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod | string;
  reference: string | null;
  notes: string | null;
  created_at: string;
}

export async function listPaymentsByInvoice(invoiceId: string): Promise<PurchasePaymentRow[]> {
  const { data, error } = await supabase
    .from("purchase_payments").select("*")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PurchasePaymentRow[];
}

// تسجيل دفعة + تحديث paid_amount وحالة الفاتورة
export async function createPayment(input: {
  invoice_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  reference?: string;
  notes?: string;
}): Promise<PurchasePaymentRow> {
  const amount = Number(input.amount) || 0;
  if (amount <= 0) throw new Error("أدخل مبلغاً صحيحاً أكبر من صفر");

  // جلب الفاتورة (للتحقق من المتبقّي + معلومات المورد)
  const { data: inv, error: eInv } = await supabase
    .from("purchase_invoices").select("*").eq("id", input.invoice_id).maybeSingle();
  if (eInv) throw eInv;
  if (!inv) throw new Error("الفاتورة غير موجودة");
  if (inv.status === "draft") throw new Error("يجب تأكيد الفاتورة قبل تسجيل الدفع");
  if (inv.status === "cancelled") throw new Error("الفاتورة ملغاة");
  if (inv.status === "paid") throw new Error("الفاتورة مدفوعة بالكامل");

  const already = Number(inv.paid_amount) || 0;
  const total = Number(inv.total) || 0;
  const remaining = total - already;
  if (amount > remaining + 0.01) {
    throw new Error(`المبلغ يتجاوز المتبقّي (${remaining.toFixed(2)} ر.س)`);
  }

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? null;

  // إنشاء الدفعة (التريجر يُنشئ القيد المحاسبي تلقائياً)
  const { data: payment, error: ePay } = await supabase
    .from("purchase_payments")
    .insert({
      code: "",
      invoice_id: input.invoice_id,
      supplier_id: inv.supplier_id,
      contact_id: inv.contact_id ?? inv.supplier_id,
      amount,
      payment_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
      payment_method: input.payment_method,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select("*").single();
  if (ePay) throw ePay;

  // تحديث الفاتورة: paid_amount + الحالة
  const newPaid = already + amount;
  const newStatus = newPaid >= total - 0.01 ? "paid" : "partially_paid";
  const { error: eUpd } = await supabase
    .from("purchase_invoices")
    .update({ paid_amount: newPaid, status: newStatus })
    .eq("id", input.invoice_id);
  if (eUpd) throw eUpd;

  return payment as PurchasePaymentRow;
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";
