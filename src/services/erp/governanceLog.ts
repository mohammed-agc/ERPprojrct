import { supabase } from "@/integrations/supabase/client";

/**
 * سجل الحوكمة — القرارات الإدارية الحسّاسة (تجاوزات ائتمانية، موافقات، فك إيقاف).
 * منفصل عن audit_logs التقني (تتبّع تغييرات الصفوف).
 */
export interface GovernanceEntry {
  id: string;
  event_type: string;
  module: string;
  document_type: string | null;
  document_id: string | null;
  document_code: string | null;
  subject_id: string | null;
  subject_name: string | null;
  decision: string | null;
  reason: string | null;
  details: Record<string, unknown> | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  created_at: string;
}

export interface GovernanceFilter {
  event_type?: string;
  module?: string;
  decision?: string;
  subject_id?: string;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

export const governanceLogService = {
  async record(entry: {
    event_type: string;
    module?: string;
    document_type?: string | null;
    document_id?: string | null;
    document_code?: string | null;
    subject_id?: string | null;
    subject_name?: string | null;
    decision?: string | null;
    reason?: string | null;
    details?: Record<string, unknown> | null;
    user_role?: string | null;
  }): Promise<void> {
    const { data: u } = await supabase.auth.getUser();
    const userId = u.user?.id ?? null;
    let userName: string | null = null;
    if (userId) {
      const { data: p } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
      userName = (p?.full_name as string) ?? u.user?.email ?? null;
    }
    const { error } = await supabase.from("governance_log").insert({
      event_type: entry.event_type,
      module: entry.module ?? "sales",
      document_type: entry.document_type ?? null,
      document_id: entry.document_id ?? null,
      document_code: entry.document_code ?? null,
      subject_id: entry.subject_id ?? null,
      subject_name: entry.subject_name ?? null,
      decision: entry.decision ?? null,
      reason: entry.reason ?? null,
      details: entry.details ?? null,
      user_id: userId,
      user_name: userName,
      user_role: entry.user_role ?? null,
    } as any);
    if (error) console.error("governance_log insert failed:", error.message);
  },

  async list(f: GovernanceFilter = {}): Promise<GovernanceEntry[]> {
    let q = supabase.from("governance_log").select("*").order("created_at", { ascending: false });
    if (f.event_type) q = q.eq("event_type", f.event_type);
    if (f.module) q = q.eq("module", f.module);
    if (f.decision) q = q.eq("decision", f.decision);
    if (f.subject_id) q = q.eq("subject_id", f.subject_id);
    if (f.from) q = q.gte("created_at", f.from);
    if (f.to) q = q.lte("created_at", f.to);
    if (f.search) q = q.or(`user_name.ilike.%${f.search}%,subject_name.ilike.%${f.search}%,document_code.ilike.%${f.search}%,reason.ilike.%${f.search}%`);
    q = q.limit(f.limit ?? 500);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as GovernanceEntry[];
  },
};
