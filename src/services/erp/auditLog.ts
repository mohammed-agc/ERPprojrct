import { supabase } from "@/integrations/supabase/client";

/**
 * Audit logging — backed by the real `audit_logs` table.
 *
 * الجدول الفعلي أعمدته عامة (table_name, record_id, action, new_data, user_id, user_name).
 * نحفظ الحقول المنطقية (module, document_type, document_code, payload) داخل new_data (jsonb)
 * ونُعيد تجميعها عند القراءة — للحفاظ على نفس واجهة AuditEntry عبر النظام.
 */
export interface AuditEntry {
  id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  module: string;
  document_type: string | null;
  document_id: string | null;
  document_code: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditFilter {
  user_id?: string;
  module?: string;
  action?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

// صف audit_logs الخام → AuditEntry منطقي
function fromRow(r: any): AuditEntry {
  const nd = (r.new_data ?? {}) as Record<string, any>;
  return {
    id: r.id,
    user_id: r.user_id ?? null,
    user_name: r.user_name ?? null,
    action: r.action,
    module: nd.module ?? "",
    document_type: nd.document_type ?? null,
    document_id: r.record_id ?? nd.document_id ?? null,
    document_code: nd.document_code ?? null,
    payload: nd.payload ?? null,
    created_at: r.created_at,
  };
}

export const auditLogService = {
  async list(f: AuditFilter = {}): Promise<AuditEntry[]> {
    let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
    if (f.user_id) q = q.eq("user_id", f.user_id);
    if (f.action) q = q.eq("action", f.action);
    if (f.from) q = q.gte("created_at", f.from);
    if (f.to) q = q.lte("created_at", f.to);
    if (f.search) q = q.or(`user_name.ilike.%${f.search}%,action.ilike.%${f.search}%`);
    q = q.limit(f.limit ?? 500);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data ?? []).map(fromRow);
    // فلترة الوحدة بعد التجميع (لأنها داخل new_data)
    if (f.module) rows = rows.filter(r => r.module === f.module);
    return rows;
  },

  async record(entry: Omit<AuditEntry, "id" | "created_at" | "user_id" | "user_name">): Promise<void> {
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? null;
    let userName: string | null = null;
    if (userId) {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      userName = (p?.full_name as string) ?? u.user?.email ?? null;
    }
    const { error } = await supabase.from("audit_logs").insert({
      table_name: entry.document_type ?? entry.module ?? "system",
      record_id: entry.document_id ?? null,
      action: entry.action,
      new_data: {
        module: entry.module,
        document_type: entry.document_type,
        document_id: entry.document_id,
        document_code: entry.document_code,
        payload: entry.payload,
      },
      user_id: userId,
      user_name: userName,
    } as any);
    if (error) console.error("audit_logs insert failed:", error.message);
  },
};
