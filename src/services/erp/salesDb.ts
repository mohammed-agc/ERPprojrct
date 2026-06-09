// salesDb.ts — خدمة المبيعات من Supabase
import { supabase } from "@/integrations/supabase/client";

export async function getSalesDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [
    { data: orders },
    { data: deliveries },
    { data: reservations },
    { data: financing },
    { data: reps },
  ] = await Promise.all([
    supabase.from("sales_orders").select("id,total,status,created_at"),
    supabase.from("deliveries").select("id,status"),
    supabase.from("reservations").select("id,status"),
    supabase.from("financing_applications").select("id,status"),
    supabase.from("sales_reps").select("id,name,branch,monthly_target,achieved"),
  ]);

  const allOrders = orders ?? [];
  const monthly_revenue = allOrders
    .filter(o => o.created_at >= startOfMonth && o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);

  const daily_revenue = allOrders
    .filter(o => o.created_at?.slice(0, 10) === today && o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.total), 0);

  const sold_vehicles = allOrders.filter(o => 
    o.status === "delivered" && o.created_at >= startOfMonth
  ).length;

  return {
    today,
    daily_revenue,
    monthly_revenue,
    monthly_profit: monthly_revenue * 0.15,
    sold_vehicles,
    reserved: (reservations ?? []).filter(r => r.status === "active" || r.status === "confirmed").length,
    pending_deliveries: (deliveries ?? []).filter(d => d.status !== "completed" && d.status !== "cancelled").length,
    fin_review: (financing ?? []).filter(f => f.status === "under_review" || f.status === "submitted").length,
    expiring_quotes: 0,
    discount_pending: 0,
    avg_profit_per_vehicle: sold_vehicles ? (monthly_revenue * 0.15) / sold_vehicles : 0,
    salespeople: (reps ?? []).map(r => ({
      id: r.id,
      name: r.name,
      branch: r.branch,
      monthly_target: r.monthly_target,
      achieved_monthly: r.achieved,
      revenue_mtd: 0,
      profit_mtd: 0,
    })),
  };
}

export async function listSalesOrders() {
  const { data, error } = await supabase
    .from("sales_orders")
    .select("*, lines:sales_order_lines(*)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listDeliveries() {
  const { data, error } = await supabase
    .from("deliveries")
    .select("*")
    .order("scheduled_date", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listReservations() {
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listFinancing() {
  const { data, error } = await supabase
    .from("financing_applications")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSalesReps() {
  const { data, error } = await supabase
    .from("sales_reps")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}
