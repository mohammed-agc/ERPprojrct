/**
 * Sales-side vehicle status transitions, persisted in Supabase.
 *
 * المخزون الموحّد في جدول `inventory_items` (وليس `vehicles`).
 * نستخدم حقل status + qty_reserved لدورة حياة البيع:
 *
 *   active → reserved   (عند تأكيد أمر البيع)
 *           ↓
 *           sold        (عند سداد الفاتورة كاملة)
 *           ↓
 *           delivered   (عند التسليم)
 *
 * عند الإلغاء: المركبات المرتبطة بالأمر غير المُسلَّمة تعود إلى 'active'.
 * المركبات المُسلَّمة لا تُعاد أبداً (تتطلب مرتجع فعلي).
 */
import { supabase } from "@/integrations/supabase/client";

const TABLE = "inventory_items";

type SalesStatus = "active" | "reserved" | "sold" | "delivered";

async function vehicleIdsForOrder(orderId: string): Promise<string[]> {
  const { data } = await supabase
    .from("sales_order_lines")
    .select("vehicle_id")
    .eq("order_id", orderId);
  return (data ?? [])
    .map((r: any) => r.vehicle_id)
    .filter((v: string | null): v is string => !!v);
}

async function vehicleIdsForInvoice(invoiceId: string): Promise<string[]> {
  const { data: inv } = await supabase
    .from("invoices")
    .select("sales_order_id")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!inv?.sales_order_id) return [];
  return vehicleIdsForOrder(inv.sales_order_id);
}

/**
 * يطبّق الحالة على inventory_items مع ضبط qty_reserved.
 * نقرأ qty_on_hand أولاً حتى نحجز الكمية الصحيحة.
 * لا نلمس qty_on_hand لتجنّب التداخل مع triggers المخزون/المحاسبة.
 */
async function applyStatus(ids: string[], status: SalesStatus): Promise<{ error: any }> {
  if (!ids.length) return { error: null };

  const { data: items } = await supabase
    .from(TABLE)
    .select("id, qty_on_hand")
    .in("id", ids);

  const patchFor = (id: string): Record<string, any> => {
    const qoh = Number((items ?? []).find((x: any) => x.id === id)?.qty_on_hand ?? 1);
    switch (status) {
      case "reserved":  return { status: "reserved",  qty_reserved: qoh };
      case "sold":      return { status: "sold",      qty_reserved: qoh };
      case "delivered": return { status: "delivered", qty_on_hand: 0, qty_reserved: 0 };
      case "active":
      default:          return { status: "active",    qty_reserved: 0 };
    }
  };

  let firstErr: any = null;
  for (const id of ids) {
    const { error } = await supabase.from(TABLE).update(patchFor(id)).eq("id", id);
    if (error && !firstErr) firstErr = error;
  }
  return { error: firstErr };
}

export const salesVehicleStatus = {
  /** تحقّق أن كل مركبة لا تزال قابلة للبيع؛ يرجع VINs المتعارضة (فارغ = سليم). */
  async assertAvailable(orderId: string): Promise<string[]> {
    const ids = await vehicleIdsForOrder(orderId);
    if (!ids.length) return [];
    const { data } = await supabase
      .from(TABLE)
      .select("id, vin, status")
      .in("id", ids);
    // المركبة متعارضة إن كانت: مباعة/مسلّمة (status)، أو مخصّصة لأمر بيع مؤكّد آخر
    const conflicts: string[] = [];
    for (const v of (data ?? []) as any[]) {
      // مباعة أو مسلّمة → متعارضة دائماً
      if (v.status === "sold" || v.status === "delivered") { conflicts.push(v.vin || v.id); continue; }
      // مخصّصة لأمر بيع مؤكّد/منفّذ آخر (بيع مزدوج)
      const { data: otherLines } = await supabase
        .from("sales_order_lines")
        .select("order_id, sales_orders!inner(id, status)")
        .eq("vehicle_id", v.id);
      const soldElsewhere = (otherLines ?? []).some((ln: any) =>
        ln.order_id !== orderId &&
        ["confirmed", "invoiced", "delivered", "completed"].includes(ln.sales_orders?.status)
      );
      if (soldElsewhere) conflicts.push(v.vin || v.id);
    }
    return conflicts;
  },

  async reserveForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return applyStatus(ids, "reserved");
  },

  async markSoldForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return applyStatus(ids, "sold");
  },

  async markSoldForInvoice(invoiceId: string) {
    const ids = await vehicleIdsForInvoice(invoiceId);
    return applyStatus(ids, "sold");
  },

  async markDeliveredForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return applyStatus(ids, "delivered");
  },

  /** إعادة المركبات غير المُسلَّمة إلى المخزون (مثلاً عند إلغاء الأمر). */
  async releaseForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    if (!ids.length) return { error: null };
    // لا نُعيد المُسلَّمة
    const { data: vs } = await supabase
      .from(TABLE)
      .select("id, status")
      .in("id", ids);
    const releasable = (vs ?? [])
      .filter((v: any) => v.status !== "delivered")
      .map((v: any) => v.id);
    return applyStatus(releasable, "active");
  },

  /**
   * إعادة المركبات المرتبطة بإشعار دائن إلى المخزون.
   *  - reserved / sold  → active (عكس صامت؛ البضاعة لم تُسلَّم)
   *  - delivered        → لا تُعاد؛ تتطلب مرتجع فعلي
   */
  async releaseForCreditNote(
    creditNoteId: string,
  ): Promise<{ released: string[]; blockedDelivered: string[] }> {
    const { data: lns } = await supabase
      .from("credit_note_lines")
      .select("vehicle_id")
      .eq("credit_note_id", creditNoteId);
    const ids = (lns ?? [])
      .map((r: any) => r.vehicle_id)
      .filter((v: string | null): v is string => !!v);
    if (!ids.length) return { released: [], blockedDelivered: [] };

    const { data: vs } = await supabase
      .from(TABLE)
      .select("id, vin, status")
      .in("id", ids);

    const releasable = (vs ?? [])
      .filter((v: any) => v.status !== "delivered")
      .map((v: any) => v.id);
    const blockedDelivered = (vs ?? [])
      .filter((v: any) => v.status === "delivered")
      .map((v: any) => v.vin || v.id);

    if (releasable.length) {
      await applyStatus(releasable, "active");
    }
    return { released: releasable, blockedDelivered };
  },
};