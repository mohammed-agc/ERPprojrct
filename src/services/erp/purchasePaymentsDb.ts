// خدمة دفعات فواتير الشراء — Supabase
// كل دفعة تُنشئ قيد يومية تلقائياً (تريجر trg_supplier_payment_je): مدين ذمم / دائن خزينة.
import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = "cash" | "bank_transfer" | "incentive";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "نقد",
  bank_transfer: "تحويل بنكي",
  incentive: "خصم من الحوافز (إشعار دائن)",
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

  // الدفع بخصم الحوافز: تحقّق من توفّر رصيد كافٍ للمورد
  if (input.payment_method === "incentive") {
    const supId = inv.supplier_id;
    if (!supId) throw new Error("لا يمكن خصم الحوافز — المورد غير محدّد");
    const bal = await incentiveBalance(supId);
    if (amount > bal + 0.01) {
      throw new Error(`المبلغ يتجاوز رصيد الحوافز المتاح (${bal.toFixed(2)} ر.س)`);
    }
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

  // الدفع بالحوافز: تسجيل حركة "استخدام" في دفتر الحوافز (تُنقص الرصيد)
  if (input.payment_method === "incentive" && inv.supplier_id) {
    const { error: eLedger } = await supabase.from("incentive_ledger").insert({
      supplier_id: inv.supplier_id,
      movement: "utilized",
      reference: payment.code,
      description: `خصم حافز لسداد فاتورة ${inv.code ?? ""}`,
      debit: 0,
      credit: amount,           // دائن: يُنقص الرصيد المستحق
      created_by: uid,
    });
    if (eLedger) throw eLedger;
  }

  // إنشاء سجلّ التخصيص (Open Item Allocation) — نوع PAYMENT
  // المصدر الموحّد للمتبقّي بدل paid_amount (معمارية SAP Open Item)
  const { error: eAlloc } = await supabase.rpc("create_allocation" as any, {
    p_allocation_type: "PAYMENT",
    p_partner_id: inv.contact_id ?? inv.supplier_id,
    p_source_document_type: "purchase_payment",
    p_source_document_id: payment.id,
    p_target_document_type: "purchase_invoice",
    p_target_document_id: input.invoice_id,
    p_amount: amount,
    p_allocation_date: input.payment_date ?? new Date().toISOString().slice(0, 10),
    p_remarks: `دفعة ${payment.code ?? ""}`,
    p_created_by: uid,
  });
  if (eAlloc) throw eAlloc;

  return payment as PurchasePaymentRow;
}

// رصيد الحوافز المتاح للمورد (المستحق − المستخدم/المستلم)
export async function incentiveBalance(supplierId: string): Promise<number> {
  const { data, error } = await supabase
    .from("incentive_ledger").select("debit, credit").eq("supplier_id", supplierId);
  if (error) return 0;
  const debit = (data ?? []).reduce((s, r: any) => s + Number(r.debit), 0);
  const credit = (data ?? []).reduce((s, r: any) => s + Number(r.credit), 0);
  return Math.max(0, debit - credit);
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";