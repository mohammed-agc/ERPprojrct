/**
 * خدمة المستودعات — CRUD لجدول warehouses في Supabase.
 *
 * يربط المستودع بالفرع عبر branch_id (FK لجدول branches).
 * النوع (type): vehicles | parts | mixed.
 * العمود النصّي القديم `branch` مهجور (يُحذف عند التنظيف النهائي).
 */

import { supabase } from "@/integrations/supabase/client";

export type WarehouseType = "vehicles" | "parts" | "mixed";

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  city: string | null;
  branch: string | null;        // قديم (نصّي، مهجور)
  branch_id: string | null;     // FK لجدول الفروع
  type: WarehouseType;
  address: string | null;
  manager_id: string | null;
  capacity: number | null;
  used_capacity: number | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type WarehouseInput = Partial<Omit<Warehouse, "id" | "created_at" | "updated_at">>;

export const warehousesService = {
  async list(): Promise<Warehouse[]> {
    const { data, error } = await supabase
      .from("warehouses")
      .select("*")
      .order("code", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Warehouse[];
  },

  async create(input: WarehouseInput): Promise<Warehouse> {
    const payload = { ...input };
    delete (payload as any).id;
    const { data, error } = await supabase
      .from("warehouses")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as Warehouse;
  },

  async update(id: string, input: WarehouseInput): Promise<Warehouse> {
    const payload = { ...input, updated_at: new Date().toISOString() };
    delete (payload as any).id;
    const { data, error } = await supabase
      .from("warehouses")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Warehouse;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("warehouses").delete().eq("id", id);
    if (error) throw error;
  },
};
