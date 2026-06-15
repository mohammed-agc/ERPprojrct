/**
 * خدمة الإعدادات — تقرأ وتكتب من جدول system_settings في Supabase.
 * تحلّ محلّ التخزين المحلّي (localStorage) في adminSettings.
 *
 * البنية: key-value مع category لتجميع الإعدادات.
 * أنواع القيم: text | number | boolean | json | date
 */

import { supabase } from "@/integrations/supabase/client";

export interface SettingRow {
  key: string;
  value: string | null;
  value_json: any | null;
  category: string;
  label: string | null;
  data_type: "text" | "number" | "boolean" | "json" | "date";
  is_sensitive: boolean;
}

// تحويل قيمة نصّية إلى نوعها الفعلي حسب data_type
function parseValue(row: Pick<SettingRow, "value" | "value_json" | "data_type">): any {
  if (row.data_type === "json") return row.value_json;
  if (row.value === null) return null;
  switch (row.data_type) {
    case "number":  return Number(row.value);
    case "boolean": return row.value === "true";
    default:        return row.value; // text, date
  }
}

// تحويل قيمة إلى صيغة التخزين (value نصّي أو value_json)
function serializeValue(val: any, dataType: SettingRow["data_type"]): { value: string | null; value_json: any | null } {
  if (dataType === "json") return { value: null, value_json: val ?? null };
  if (val === null || val === undefined) return { value: null, value_json: null };
  if (dataType === "boolean") return { value: val ? "true" : "false", value_json: null };
  return { value: String(val), value_json: null };
}

export const settingsService = {
  /** اقرأ كل الإعدادات ضمن فئة معيّنة، مُرجِعاً خريطة key→value مُحوّلة لنوعها */
  async getCategory(category: string): Promise<Record<string, any>> {
    const { data, error } = await supabase
      .from("system_settings")
      .select("key, value, value_json, data_type")
      .eq("category", category);
    if (error) throw error;
    const out: Record<string, any> = {};
    for (const row of data ?? []) {
      // المفتاح بصيغة "company.name_ar" → نُعيد "name_ar" كاسم مختصر
      const shortKey = row.key.includes(".") ? row.key.split(".").slice(1).join(".") : row.key;
      out[shortKey] = parseValue(row as any);
    }
    return out;
  },

  /** اقرأ مفتاحاً مفرداً (بالاسم الكامل، مثل "company.vat_number") */
  async getKey(fullKey: string): Promise<any> {
    const { data, error } = await supabase
      .from("system_settings")
      .select("value, value_json, data_type")
      .eq("key", fullKey)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return parseValue(data as any);
  },

  /**
   * احفظ مجموعة إعدادات ضمن فئة. يأخذ بادئة الفئة + خريطة الحقول المختصرة.
   * مثال: saveCategory("company", { name_ar: "...", vat_number: "..." })
   * يحوّل المفاتيح إلى "company.name_ar" ويعمل upsert.
   * يحافظ على data_type و label الموجودة (لا يطمسها) عبر قراءتها أولاً.
   */
  async saveCategory(prefix: string, values: Record<string, any>): Promise<void> {
    // اقرأ البيانات الوصفية الحالية (data_type, label) للحفاظ عليها
    const fullKeys = Object.keys(values).map(k => `${prefix}.${k}`);
    const { data: existing } = await supabase
      .from("system_settings")
      .select("key, data_type, label, is_sensitive, category")
      .in("key", fullKeys);

    const metaByKey = new Map<string, { data_type: SettingRow["data_type"]; label: string | null; is_sensitive: boolean; category: string }>();
    for (const r of existing ?? []) {
      metaByKey.set(r.key, { data_type: r.data_type as any, label: r.label, is_sensitive: r.is_sensitive, category: r.category });
    }

    const rows = Object.entries(values).map(([shortKey, val]) => {
      const fullKey = `${prefix}.${shortKey}`;
      const meta = metaByKey.get(fullKey);
      const dataType = meta?.data_type ?? "text";
      const { value, value_json } = serializeValue(val, dataType);
      return {
        key: fullKey,
        value,
        value_json,
        category: meta?.category ?? prefix,
        label: meta?.label ?? null,
        data_type: dataType,
        is_sensitive: meta?.is_sensitive ?? false,
        updated_at: new Date().toISOString(),
      };
    });

    const { error } = await supabase
      .from("system_settings")
      .upsert(rows, { onConflict: "key" });
    if (error) throw error;
  },

  /** احفظ مفتاحاً مفرداً */
  async setKey(fullKey: string, val: any, dataType: SettingRow["data_type"] = "text"): Promise<void> {
    const { value, value_json } = serializeValue(val, dataType);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        { key: fullKey, value, value_json, data_type: dataType, updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
  },
};
