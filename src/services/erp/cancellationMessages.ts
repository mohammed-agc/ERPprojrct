/**
 * رسائل إلغاء الفاتورة — خريطة مركزية لرموز can_cancel_sales_invoice / cancel_sales_invoice RPC.
 * المصدر: F5 Financial Reversal Engine (migration 20260617120000).
 */

export const CANCELLATION_MESSAGES: Record<string, string> = {
  INVOICE_NOT_FOUND: "الفاتورة غير موجودة.",
  INVOICE_NOT_ISSUED: "لا يمكن إلغاء فاتورة غير مُصدرة (مسودّة أو ملغاة).",
  ALREADY_CREDITED: "الفاتورة ملغاة/معكوسة مسبقاً.",
  INVOICE_PAID_REQUIRE_RECEIPT_REVERSAL: "يجب عكس التحصيلات أولاً قبل إلغاء الفاتورة.",
  REVENUE_JE_MISSING: "قيد الإيراد غير موجود — تعذّر الإلغاء.",
  COGS_JE_MISSING: "قيد التكلفة غير موجود — تعذّر الإلغاء.",
  VEHICLE_DELIVERED_REQUIRE_GOODS_RETURN: "لا يمكن الإلغاء: المركبة سُلّمت — يتطلّب مرتجع بضاعة (Goods Return).",
  VEHICLE_COUNT_MISMATCH: "عدم تطابق عدد المركبات بين الفاتورة وقيد التكلفة — راجع المحاسبة.",
  UNKNOWN: "تعذّر إلغاء الفاتورة لسبب غير معروف.",
};

/** ترجمة رمز السبب لرسالة عربية. */
export function cancellationMessage(reason?: string | null): string {
  if (!reason) return CANCELLATION_MESSAGES.UNKNOWN;
  return CANCELLATION_MESSAGES[reason] ?? CANCELLATION_MESSAGES.UNKNOWN;
}

/** خطأ إلغاء يحمل رمز السبب (للترجمة في الواجهة). */
export class CancellationBlockedError extends Error {
  reason: string;
  details: any;
  constructor(reason: string, details?: any) {
    super(cancellationMessage(reason));
    this.name = "CancellationBlockedError";
    this.reason = reason;
    this.details = details;
  }
}
