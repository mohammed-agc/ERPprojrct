/**
 * Sales-side vehicle status transitions, persisted in Supabase.
 *
 *   available → reserved (on Sales Order confirm)
 *              ↓
 *              sold      (on full invoice payment)
 *              ↓
 *              delivered (on Sales Order delivery)
 *
 * On cancel: vehicles tied to the SO that are not yet delivered revert to
 * 'available'. Delivered vehicles are never reverted.
 */
import { supabase } from "@/integrations/supabase/client";

type VehicleStatus = "available" | "reserved" | "sold" | "delivered";

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

async function setVehicles(ids: string[], status: VehicleStatus) {
  if (ids.length === 0) return { error: null };
  return supabase.from("vehicles").update({ status: status as any }).in("id", ids);
}

export const salesVehicleStatus = {
  /** Verify every linked vehicle is still available; returns conflicting VINs (empty = OK). */
  async assertAvailable(orderId: string): Promise<string[]> {
    const ids = await vehicleIdsForOrder(orderId);
    if (!ids.length) return [];
    const { data } = await supabase
      .from("vehicles")
      .select("id, vin, status")
      .in("id", ids);
    return (data ?? [])
      .filter((v: any) => v.status !== "available" && v.status !== "reserved")
      .map((v: any) => v.vin || v.id);
  },

  async reserveForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return setVehicles(ids, "reserved");
  },

  async markSoldForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return setVehicles(ids, "sold");
  },

  async markSoldForInvoice(invoiceId: string) {
    const ids = await vehicleIdsForInvoice(invoiceId);
    return setVehicles(ids, "sold");
  },

  async markDeliveredForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    return setVehicles(ids, "delivered");
  },

  /** Revert non-delivered vehicles back to 'available' (e.g. SO cancellation). */
  async releaseForOrder(orderId: string) {
    const ids = await vehicleIdsForOrder(orderId);
    if (!ids.length) return { error: null };
    return supabase
      .from("vehicles")
      .update({ status: "available" as any })
      .in("id", ids)
      .neq("status", "delivered");
  },
};
