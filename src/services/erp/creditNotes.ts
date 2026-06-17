import { supabase } from "@/integrations/supabase/client";
import { CancellationBlockedError } from "@/services/erp/cancellationMessages";

/**
 * Credit Notes service — Orchestrator فوق محرّك العكس المالي (F5).
 *
 * مصدر الحقيقة الوحيد: cancel_sales_invoice RPC (معاملة ذرّية تعكس
 * الإيراد + COGS + المخزون + Open Items + الحوكمة). الواجهة لا تكتب
 * مباشرة للجداول — كل شيء عبر الـ RPC.
 *
 * الفحص المسبق عبر can_cancel_sales_invoice (يمنع قبل المحاولة + يعطي السبب).
 *
 * الإشعار الدائن الجزئي (issueFromLines) مؤجّل إلى F5.2 (Partial Credit Note Engine).
 */

export type CnType = "cancellation" | "return" | "price_adjustment" | "discount";

export type CancelResult = {
  success: boolean;
  credit_note_id?: string;
  cn_no?: string;
  revenue_reversal_je?: string;
  cogs_reversal_je?: string;
  reason?: string;
};

export type CanCancelResult = {
  can_cancel: boolean;
  reason?: string;
  [k: string]: any;
};

export const creditNotesService = {
  /** فحص مسبق: هل يمكن إلغاء الفاتورة؟ (للواجهة قبل عرض/تأكيد الإلغاء) */
  async canCancel(invoiceId: string): Promise<CanCancelResult> {
    const { data, error } = await supabase.rpc("can_cancel_sales_invoice" as any, { p_invoice_id: invoiceId });
    if (error) return { can_cancel: false, reason: "UNKNOWN" };
    return (data as CanCancelResult) ?? { can_cancel: false, reason: "UNKNOWN" };
  },

  /**
   * إلغاء كامل للفاتورة عبر محرّك العكس المالي (F5).
   * يفحص أولاً (can_cancel)، ثم ينفّذ الإلغاء الذرّي.
   * يرمي CancellationBlockedError إن مُنع (الواجهة تترجم reason).
   */
  async issueFullReversal(invoiceId: string, reason = "invoice_cancellation"): Promise<CancelResult> {
    // 1. الفحص المسبق
    const check = await this.canCancel(invoiceId);
    if (!check.can_cancel) {
      throw new CancellationBlockedError(check.reason ?? "UNKNOWN", check);
    }
    // 2. التنفيذ الذرّي (مصدر الحقيقة الوحيد)
    const { data, error } = await supabase.rpc("cancel_sales_invoice" as any, { p_invoice_id: invoiceId, p_reason: reason });
    if (error) throw error;
    const res = data as CancelResult;
    if (!res?.success) {
      throw new CancellationBlockedError(res?.reason ?? "UNKNOWN", res);
    }
    return res;
  },

  /**
   * الإشعار الدائن الجزئي (بنود مخصّصة) — مؤجّل إلى F5.2.
   * المحرّك الحالي يدعم الإلغاء الكامل فقط (cancel_sales_invoice).
   */
  async issueFromLines(_args: unknown): Promise<never> {
    throw new Error("الإشعار الدائن الجزئي غير متاح بعد (F5.2). استخدم الإلغاء الكامل للفاتورة.");
  },

  async listForInvoice(invoiceId: string) {
    const { data, error } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("cn_date", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
