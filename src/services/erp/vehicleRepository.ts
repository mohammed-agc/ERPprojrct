/**
 * vehicleRepository — طبقة الوصول الموحّدة لسجلّات المركبات.
 *
 * تعريف المركبة: inventory_items WHERE item_type = 'vehicle'.
 * هذا المصدر الوحيد للوصول لبيانات المركبات (لا جدول vehicles منفصل).
 *
 * مسؤوليات الطبقة: قراءة/إنشاء/تعديل/حذف فقط. لا منطق أعمال، لا UI، لا محاسبة.
 */

import { supabase } from "@/integrations/supabase/client";

const VEHICLE_TYPE = "vehicle";

export interface VehicleRecord {
  id: string;
  sku: string | null;
  name: string;
  brand: string | null;
  model: string | null;
  trim: string | null;
  year: number | null;
  color: string | null;
  vin: string | null;
  engine_no: string | null;
  sale_price: number | null;
  cost_price: number | null;
  status: string | null;
  warehouse_id: string | null;
  qty_on_hand: number | null;
  notes: string | null;
  item_type: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any; // للحقول الإضافية التي قد تقرأها الشاشات
}

export interface VehicleInput {
  sku?: string | null;
  name?: string;
  brand?: string | null;
  model?: string | null;
  trim?: string | null;
  year?: number | null;
  color?: string | null;
  vin?: string | null;
  engine_no?: string | null;
  sale_price?: number | null;
  cost_price?: number | null;
  status?: string | null;
  warehouse_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
}

export const vehicleRepository = {
  /** كل المركبات (الأحدث أولاً) */
  async getVehicles(): Promise<VehicleRecord[]> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("item_type", VEHICLE_TYPE)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as VehicleRecord[];
  },

  /** مركبة واحدة بالمعرّف */
  async getVehicleById(id: string): Promise<VehicleRecord | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", id)
      .eq("item_type", VEHICLE_TYPE)
      .maybeSingle();
    if (error) throw error;
    return (data as VehicleRecord) ?? null;
  },

  /** فحص تكرار الـ VIN (يُرجع المركبة المطابقة إن وُجدت) */
  async findByVin(vin: string): Promise<{ id: string; sku: string | null } | null> {
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku")
      .eq("vin", vin)
      .eq("item_type", VEHICLE_TYPE)
      .maybeSingle();
    if (error) throw error;
    return (data as { id: string; sku: string | null }) ?? null;
  },

  /** إنشاء مركبة (يفرض item_type='vehicle' و qty_on_hand=1) */
  async createVehicle(input: VehicleInput): Promise<VehicleRecord> {
    const payload = {
      ...input,
      item_type: VEHICLE_TYPE,
      qty_on_hand: 1,
    };
    const { data, error } = await supabase
      .from("inventory_items")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as VehicleRecord;
  },

  /** تعديل مركبة */
  async updateVehicle(id: string, input: VehicleInput): Promise<VehicleRecord> {
    const payload = { ...input, updated_at: new Date().toISOString() };
    delete (payload as any).item_type;   // لا يُغيّر النوع
    delete (payload as any).qty_on_hand; // الكمية تُدار عبر حركات المخزون
    const { data, error } = await supabase
      .from("inventory_items")
      .update(payload)
      .eq("id", id)
      .eq("item_type", VEHICLE_TYPE)
      .select()
      .single();
    if (error) throw error;
    return data as VehicleRecord;
  },

  /** حذف مركبة — آمن: محمي بـ FK (لا يُحذف ما يرتبط بفاتورة) */
  async deleteVehicle(id: string): Promise<void> {
    const { error } = await supabase
      .from("inventory_items")
      .delete()
      .eq("id", id)
      .eq("item_type", VEHICLE_TYPE);
    if (error) throw error;
  },
};
