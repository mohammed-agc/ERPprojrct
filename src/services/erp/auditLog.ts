import { supabase } from "@/integrations/supabase/client";

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

export const auditLogService = {
  async list(f: AuditFilter = {}): Promise<AuditEntry[]> {
    let q = supabase.from("audit_log").select("*").order("created_at", { ascending: false });
    if (f.user_id) q = q.eq("user_id", f.user_id);
    if (f.module) q = q.eq("module", f.module);
    if (f.action) q = q.eq("action", f.action);
    if (f.from) q = q.gte("created_at", f.from);
    if (f.to) q = q.lte("created_at", f.to);
    if (f.search) q = q.or(`document_code.ilike.%${f.search}%,user_name.ilike.%${f.search}%`);
    q = q.limit(f.limit ?? 500);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as AuditEntry[];
  },

  async record(entry: Omit<AuditEntry, "id" | "created_at" | "user_id" | "user_name">): Promise<void> {
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? null;
    let userName: string | null = null;
    if (userId) {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      userName = (p?.full_name as string) ?? u.user?.email ?? null;
    }
    await supabase.from("audit_log").insert({
      user_id: userId,
      user_name: userName,
      ...entry,
    } as any);
  },
};
