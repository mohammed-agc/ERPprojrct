/**
 * خدمة الفروع — CRUD لجدول branches في Supabase.
 *
 * مبدأ SaaS: كل شركة لها "فرع رئيسي" إجباري (is_main=true).
 * الشركات بلا فروع تعمل على الفرع الرئيسي بشفافية.
 * مفتاح company.multi_branch_enabled يتحكّم بظهور إدارة الفروع الكاملة.
 */

import { supabase } from "@/integrations/supabase/client";

export interface Branch {
  id: string;
  code: string;
  name_ar: string;
  name_en: string | null;
  is_main: boolean;
  building_no: string | null;
  street: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  manager_name: string | null;
  invoice_prefix: string | null;
  is_active: boolean;
  opened_at: string | null;
  created_at: string;
  updated_at: string;
}

export type BranchInput = Partial<Omit<Branch, "id" | "created_at" | "updated_at">>;

export const branchesService = {
  /** قائمة كل الفروع (الرئيسي أولاً، ثم بالكود) */
  async list(): Promise<Branch[]> {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .order("is_main", { ascending: false })
      .order("code", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Branch[];
  },

  /** الفرع الرئيسي */
  async getMain(): Promise<Branch | null> {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("is_main", true)
      .maybeSingle();
    if (error) throw error;
    return (data as Branch) ?? null;
  },

  /** إنشاء فرع جديد (لا يمكن أن يكون رئيسياً — الرئيسي يُنشأ بالـ migration) */
  async create(input: BranchInput): Promise<Branch> {
    const payload = { ...input, is_main: false };
    delete (payload as any).id;
    const { data, error } = await supabase
      .from("branches")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data as Branch;
  },

  /** تعديل فرع */
  async update(id: string, input: BranchInput): Promise<Branch> {
    const payload = { ...input, updated_at: new Date().toISOString() };
    delete (payload as any).id;
    delete (payload as any).is_main; // لا يُغيّر علم الرئيسي عبر التعديل العادي
    const { data, error } = await supabase
      .from("branches")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as Branch;
  },

  /** حذف فرع (يمنع حذف الرئيسي) */
  async remove(id: string): Promise<void> {
    // تحقّق أنه ليس الرئيسي
    const { data: branch } = await supabase
      .from("branches")
      .select("is_main")
      .eq("id", id)
      .maybeSingle();
    if (branch?.is_main) {
      throw new Error("لا يمكن حذف الفرع الرئيسي");
    }
    const { error } = await supabase.from("branches").delete().eq("id", id);
    if (error) throw error;
  },
};
