/**
 * Inventory ⇄ Purchasing/Sales Integration Layer — Supabase Edition
 * ------------------------------------------------------------------
 * يترجم أحداث دورة حياة المستندات إلى حركات حقيقية في قاعدة البيانات
 *
 * نقاط الربط:
 *   PO → GRN → Inspection → Intake   (استلام مخزون)
 *   SO → Reservation → Delivery       (صرف مخزون)
 */

import { supabase } from "@/integrations/supabase/client";
import { inventoryService } from "./inventory";

// Helper: ترحيل حركة مخزون مباشرة عبر Supabase
async function postMovement(input: {
  item_id: string;
  movement_type: string;
  qty: number;
  unit_cost?: number;
  ref_type?: string;
  ref_id?: string;
  ref_code?: string;
  reason?: string;
  notes?: string;
}): Promise<void> {
  const { data: item } = await supabase
    .from("inventory_items")
    .select("qty_on_hand, avg_cost")
    .eq("id", input.item_id)
    .single();
  if (!item) return;

  const isInbound = ["receipt","transfer_in","return","opening"].includes(input.movement_type);
  const qty_before = item.qty_on_hand;
  const qty_after = isInbound ? qty_before + input.qty : qty_before - input.qty;
  if (!isInbound && qty_after < 0) return; // تجاهل إذا لا يكفي الرصيد

  const unit_cost = input.unit_cost ?? item.avg_cost;
  let new_avg = item.avg_cost;
  if (isInbound && unit_cost > 0 && qty_after > 0) {
    new_avg = (qty_before * item.avg_cost + input.qty * unit_cost) / qty_after;
  }

  await supabase.from("inventory_items")
    .update({ qty_on_hand: qty_after, avg_cost: new_avg, updated_at: new Date().toISOString() })
    .eq("id", input.item_id);

  await supabase.from("inventory_movements").insert({
    item_id: input.item_id, movement_type: input.movement_type,
    qty: Math.abs(input.qty), qty_before, qty_after,
    unit_cost, total_cost: unit_cost * Math.abs(input.qty),
    ref_type: input.ref_type, ref_id: input.ref_id, ref_code: input.ref_code,
    reason: input.reason, notes: input.notes, posted: true,
  });
}
import type { InspectionRecord, PurchaseOrder, LineItem } from "./purchasing";

// ─── Warehouse Resolution ─────────────────────────────────────

const DEFAULT_WAREHOUSE_CODE = "WH-RUH-01";

async function resolveWarehouseId(branch?: string): Promise<string | undefined> {
  let q = supabase.from("warehouses").select("id, name, city").eq("active", true);

  if (branch?.includes("جدة"))   q = q.ilike("city", "%جدة%");
  else if (branch?.includes("الدمام")) q = q.ilike("city", "%الدمام%");
  else if (branch?.includes("الرياض")) q = q.ilike("city", "%الرياض%");
  else q = q.eq("code", DEFAULT_WAREHOUSE_CODE);

  const { data } = await q.limit(1);
  return data?.[0]?.id;
}

async function findInventoryItemBySku(sku: string): Promise<string | undefined> {
  const { data } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("sku", sku)
    .maybeSingle();
  return data?.id;
}

async function findOrCreateInventoryItem(line: LineItem, warehouse_id?: string): Promise<string | undefined> {
  // بحث بالـ SKU أو الوصف
  const { data: existing } = await supabase
    .from("inventory_items")
    .select("id")
    .or(`name.ilike.%${line.description.slice(0, 20)}%`)
    .maybeSingle();

  if (existing) return existing.id;

  // إنشاء صنف جديد تلقائياً
  const sku = `AUTO-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data: created } = await supabase
    .from("inventory_items")
    .insert({
      sku,
      name:         line.description,
      item_type:    line.kind === "vehicle" ? "vehicle" : "part",
      unit:         line.kind === "vehicle" ? "مركبة" : "قطعة",
      warehouse_id,
      qty_on_hand:  0,
      qty_reserved: 0,
      qty_on_order: 0,
      reorder_point: 0,
      cost_price:   line.unit_price ?? 0,
      avg_cost:     line.unit_price ?? 0,
      last_cost:    line.unit_price ?? 0,
      status:       "active",
    })
    .select("id")
    .single();

  return created?.id;
}

// ─── Integration Events ───────────────────────────────────────

export const inventoryIntegration = {

  /**
   * عند اعتماد الفحص → إضافة الكميات المعتمدة للمخزون
   */
  async onInspectionApproved(
    ins: InspectionRecord,
    po: PurchaseOrder | undefined
  ): Promise<void> {
    if (!po) return;

    const warehouse_id = await resolveWarehouseId(po.branch_destination);

    for (const it of ins.items) {
      const line = po.items.find(l => l.id === it.line_id);
      if (!line) continue;

      const approvedQty = it.passed ?? 0;
      if (approvedQty <= 0) continue;

      const item_id = await findOrCreateInventoryItem(line, warehouse_id);
      if (!item_id) continue;

      try {
        await postMovement({
          item_id,
          movement_type: "receipt",
          qty:           approvedQty,
          unit_cost:     line.unit_price ?? 0,
          ref_type:      "PO",
          ref_id:        po.id,
          ref_code:      po.code,
          reason:        `استلام معتمد من الفحص — ${po.code}`,
          notes:         `فاحص: ${ins.inspector}`,
        });
      } catch (err) {
        console.warn(`[integration] فشل ترحيل حركة للصنف ${item_id}:`, err);
      }
    }
  },

  /**
   * عند استلام GRN مكتمل → ترحيل حركة استلام للمخزون
   */
  async onGRNCompleted(input: {
    grn_id: string;
    grn_code: string;
    po_id: string;
    po_code: string;
    po_items: LineItem[];
    received_items: Array<{ line_id: string; qty: number; unit_cost?: number }>;
    warehouse?: string;
    received_by?: string;
  }): Promise<{ success: boolean; movements: number; errors: string[] }> {
    const warehouse_id = await resolveWarehouseId(input.warehouse);
    let movements = 0;
    const errors: string[] = [];

    for (const recv of input.received_items) {
      if (recv.qty <= 0) continue;

      const line = input.po_items.find(l => l.id === recv.line_id);
      if (!line) continue;

      const item_id = await findOrCreateInventoryItem(line, warehouse_id);
      if (!item_id) {
        errors.push(`لم يتم إيجاد أو إنشاء صنف للبند: ${line.description}`);
        continue;
      }

      try {
        await postMovement({
          item_id,
          movement_type: "receipt",
          qty:           recv.qty,
          unit_cost:     recv.unit_cost ?? line.unit_price ?? 0,
          ref_type:      "GRN",
          ref_id:        input.grn_id,
          ref_code:      input.grn_code,
          reason:        `استلام GRN — ${input.po_code}`,
          notes:         input.received_by ? `مستلم بواسطة: ${input.received_by}` : undefined,
        });
        movements++;
      } catch (err: any) {
        errors.push(`خطأ في ترحيل ${line.description}: ${err.message}`);
      }
    }

    return { success: errors.length === 0, movements, errors };
  },

  /**
   * عند إدخال مركبة (VIN intake) → تحديث حالة المركبة في المخزون
   */
  async onVehicleIntake(input: {
    po: PurchaseOrder;
    inspector: string;
    vehicles: Array<{
      id: string;
      vin: string;
      brand: string;
      model: string;
      year: number;
      trim?: string;
      color?: string;
      cost: number;
    }>;
  }): Promise<void> {
    const warehouse_id = await resolveWarehouseId(input.po.branch_destination);

    for (const v of input.vehicles) {
      // ابحث عن الصنف بالـ VIN أو أنشئه
      let item_id = await findInventoryItemBySku(v.vin);

      if (!item_id) {
        const { data: created } = await supabase
          .from("inventory_items")
          .insert({
            sku:          v.vin,
            name:         `${v.brand} ${v.model} ${v.year}${v.trim ? ' ' + v.trim : ''}`,
            item_type:    "vehicle",
            unit:         "مركبة",
            warehouse_id,
            qty_on_hand:  0,
            qty_reserved: 0,
            qty_on_order: 0,
            reorder_point: 0,
            cost_price:   v.cost,
            avg_cost:     v.cost,
            last_cost:    v.cost,
            status:       "active",
            notes:        v.color ? `اللون: ${v.color}` : undefined,
          })
          .select("id")
          .single();
        item_id = created?.id;
      }

      if (!item_id) continue;

      try {
        await postMovement({
          item_id,
          movement_type: "receipt",
          qty:           1,
          unit_cost:     v.cost,
          ref_type:      "PO",
          ref_id:        input.po.id,
          ref_code:      input.po.code,
          reason:        `إدخال مركبة VIN: ${v.vin}`,
          notes:         `فاحص: ${input.inspector}`,
        });
      } catch (err) {
        console.warn(`[integration] فشل إدخال مركبة ${v.vin}:`, err);
      }
    }
  },

  /**
   * عند إلغاء أمر شراء → إلغاء الحجوزات المرتبطة
   */
  async onPOCancelled(po_id: string, po_code: string): Promise<void> {
    const { error } = await supabase
      .from("inventory_reservations")
      .update({ status: "cancelled" })
      .eq("ref_type", "PO")
      .eq("ref_id", po_id)
      .eq("status", "active");

    if (error) console.warn(`[integration] فشل إلغاء حجوزات PO ${po_code}:`, error);
  },

  // ─── Sales Side ───────────────────────────────────────────

  /**
   * عند تحرير حجز مبيعات → تحرير الكمية المحجوزة في المخزون
   */
  async onSalesReservationReleased(reservationCode: string): Promise<void> {
    const { data: reservations } = await supabase
      .from("inventory_reservations")
      .select("id, item_id, reserved_qty, released_qty")
      .eq("ref_code", reservationCode)
      .eq("status", "active");

    for (const res of reservations ?? []) {
      await supabase
        .from("inventory_reservations")
        .update({ status: "released" })
        .eq("id", res.id);

      // تحديث qty_reserved في المخزون
      const { data: item } = await supabase
        .from("inventory_items")
        .select("qty_reserved")
        .eq("id", res.item_id)
        .single();

      if (item) {
        const newReserved = Math.max(0, item.qty_reserved - res.reserved_qty);
        await supabase
          .from("inventory_items")
          .update({ qty_reserved: newReserved, updated_at: new Date().toISOString() })
          .eq("id", res.item_id);
      }
    }
  },

  /**
   * عند اكتمال التسليم → ترحيل حركة صرف من المخزون
   */
  async onDeliveryCompleted(input: {
    delivery_code: string;
    so_code: string;
    vehicle_vin?: string;
    vehicle_label: string;
    delivery_officer: string;
    branch?: string;
    unit_cost?: number;
  }): Promise<void> {
    const warehouse_id = await resolveWarehouseId(input.branch);

    // البحث عن المركبة بالـ VIN
    let item_id: string | undefined;
    if (input.vehicle_vin) {
      item_id = await findInventoryItemBySku(input.vehicle_vin);
    }

    // البحث بالاسم إذا لم يوجد بالـ VIN
    if (!item_id) {
      const label = input.vehicle_label.slice(0, 30);
      const { data } = await supabase
        .from("inventory_items")
        .select("id")
        .ilike("name", `%${label}%`)
        .eq("item_type", "vehicle")
        .limit(1);
      item_id = data?.[0]?.id;
    }

    if (!item_id) {
      console.warn(`[integration] لم يتم إيجاد مركبة للتسليم: ${input.vehicle_label}`);
      return;
    }

    try {
      await postMovement({
        item_id,
        movement_type: "issue",
        qty:           1,
        unit_cost:     input.unit_cost ?? 0,
        ref_type:      "SO",
        ref_code:      input.so_code,
        reason:        `تسليم — ${input.so_code}`,
        notes:         `مسؤول التسليم: ${input.delivery_officer}`,
      });
    } catch (err) {
      console.warn(`[integration] فشل ترحيل حركة تسليم ${input.delivery_code}:`, err);
    }
  },

  /**
   * عند تحويل بين مستودعات → ترحيل حركتي صادر ووارد
   */
  async onWarehouseTransfer(input: {
    item_id: string;
    qty: number;
    from_warehouse_id: string;
    to_warehouse_id: string;
    ref_code?: string;
    transferred_by?: string;
  }): Promise<void> {
    // صادر من المستودع الأول
    await postMovement({
      item_id:       input.item_id,
      movement_type: "transfer_out",
      qty:           input.qty,
      ref_type:      "transfer",
      ref_code:      input.ref_code,
      reason:        "تحويل بين مستودعات",
    });

    // وارد للمستودع الثاني
    await postMovement({
      item_id:       input.item_id,
      movement_type: "transfer_in",
      qty:           input.qty,
      ref_type:      "transfer",
      ref_code:      input.ref_code,
      reason:        "تحويل بين مستودعات",
    });

    // تحديث المستودع في سجل الصنف
    await supabase
      .from("inventory_items")
      .update({ warehouse_id: input.to_warehouse_id, updated_at: new Date().toISOString() })
      .eq("id", input.item_id);
  },

  // ─── Helpers ──────────────────────────────────────────────

  resolveWarehouseId,
  findInventoryItemBySku,
  findOrCreateInventoryItem,
};
