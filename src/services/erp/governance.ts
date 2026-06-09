/**
 * Governance Service — Supabase Edition
 * نفس الواجهة البرمجية مع Supabase بدل localStorage
 */
import { supabase } from "@/integrations/supabase/client";

// ─── Types ───────────────────────────────────────────────────

export type PeriodStatus = "open" | "pending_close" | "closed" | "locked";
export type ApprovalStatus = "draft" | "pending_approval" | "approved" | "rejected" | "posted";
export type AuditKind =
  | "login" | "logout" | "create" | "update" | "delete"
  | "approve" | "reject" | "post" | "reverse" | "export" | "print";

export interface FiscalYear {
  id: string;
  year: number;
  label: string;
  status: "active" | "closed" | "locked";
  periods_count: number;
  open_periods: number;
}

export interface AccountingPeriod {
  id: string;
  fiscal_year: number;
  period_number: number;
  name: string;
  start_date: string;
  end_date: string;
  status: PeriodStatus;
  closed_by?: string;
  closed_at?: string;
}

export type ChecklistKey =
  | "inv_count" | "inv_revalue" | "ar_aging" | "ap_aging"
  | "bank_recon" | "cash_count" | "prepaid_accrual" | "depreciation"
  | "payroll_post" | "vat_review" | "trial_balance" | "pl_review"
  | "cfo_sign" | "period_lock";

export interface ClosingChecklistItem {
  key: ChecklistKey;
  label: string;
  module: string;
  done: boolean;
  done_by?: string;
  done_at?: string;
  notes?: string;
}

export interface YearEndChecklistItem {
  key: string;
  label: string;
  done: boolean;
  done_at?: string;
}

export type ApprovalEntityType = "journal" | "voucher" | "transfer" | "adjustment" | "reversal";

export interface ApprovalRequest {
  id: string;
  code: string;
  entity_type: ApprovalEntityType;
  entity_id: string;
  entity_ref?: string;
  title: string;
  amount?: number;
  status: ApprovalStatus;
  submitted_by?: string;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  note?: string;
  current_step: number;
}

export interface AuditEntry {
  id: string;
  kind: AuditKind;
  severity: "info" | "warning" | "critical";
  table_name: string;
  record_id?: string;
  description: string;
  user_name?: string;
  user_id?: string;
  ip_address?: string;
  created_at: string;
}

// ─── Labels ───────────────────────────────────────────────────

export const periodStatusLabel: Record<PeriodStatus, string> = {
  open:          "مفتوحة",
  pending_close: "بانتظار الإقفال",
  closed:        "مقفلة",
  locked:        "مؤمّنة",
};

export const periodStatusTone: Record<PeriodStatus, string> = {
  open:          "bg-green-100 text-green-800 border-green-200",
  pending_close: "bg-yellow-100 text-yellow-800 border-yellow-200",
  closed:        "bg-gray-100 text-gray-700 border-gray-200",
  locked:        "bg-red-100 text-red-800 border-red-200",
};

export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  draft:            "مسودة",
  pending_approval: "بانتظار الاعتماد",
  approved:         "معتمد",
  rejected:         "مرفوض",
  posted:           "مرحّل",
};

export const approvalStatusTone: Record<ApprovalStatus, string> = {
  draft:            "bg-gray-100 text-gray-700",
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved:         "bg-green-100 text-green-800",
  rejected:         "bg-red-100 text-red-800",
  posted:           "bg-blue-100 text-blue-800",
};

export const entityTypeLabel: Record<ApprovalEntityType, string> = {
  journal:    "قيد يومية",
  voucher:    "سند خزينة",
  transfer:   "تحويل",
  adjustment: "تسوية",
  reversal:   "عكس قيد",
};

export const auditKindLabel: Record<AuditKind, string> = {
  login:   "دخول", logout:  "خروج", create:  "إنشاء",
  update:  "تعديل", delete:  "حذف", approve: "اعتماد",
  reject:  "رفض",  post:    "ترحيل", reverse: "عكس",
  export:  "تصدير", print:   "طباعة",
};

export const auditSeverityTone: Record<"info" | "warning" | "critical", string> = {
  info:     "text-blue-600",
  warning:  "text-yellow-600",
  critical: "text-red-600",
};

// ─── Helper maps ──────────────────────────────────────────────

const DB_STATUS_MAP: Record<string, PeriodStatus> = {
  open:        "open",
  soft_closed: "pending_close",
  hard_closed: "closed",
  year_closed: "locked",
};

const STATUS_TO_DB: Record<PeriodStatus, string> = {
  open:          "open",
  pending_close: "soft_closed",
  closed:        "hard_closed",
  locked:        "year_closed",
};

function mapPeriod(row: any): AccountingPeriod {
  return {
    id:            row.id,
    fiscal_year:   row.fiscal_year,
    period_number: row.period_number,
    name:          row.name,
    start_date:    row.start_date,
    end_date:      row.end_date,
    status:        DB_STATUS_MAP[row.status] ?? "open",
    closed_by:     row.closed_by,
    closed_at:     row.closed_at,
  };
}

function mapApproval(row: any): ApprovalRequest {
  const statusMap: Record<string, ApprovalStatus> = {
    pending:     "pending_approval",
    in_progress: "pending_approval",
    approved:    "approved",
    rejected:    "rejected",
    cancelled:   "rejected",
  };
  return {
    id:           row.id,
    code:         row.code,
    entity_type:  (row.document_type ?? "voucher") as ApprovalEntityType,
    entity_id:    row.document_id,
    entity_ref:   row.document_code,
    title:        row.title,
    amount:       row.document_amount,
    status:       statusMap[row.status] ?? "pending_approval",
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at ?? row.created_at,
    note:         row.notes,
    current_step: row.current_step ?? 1,
  };
}

function mapAudit(row: any): AuditEntry {
  const kindMap: Record<string, AuditKind> = {
    INSERT: "create", UPDATE: "update", DELETE: "delete",
    LOGIN: "login", LOGOUT: "logout", EXPORT: "export", PRINT: "print",
  };
  return {
    id:          row.id,
    kind:        kindMap[row.action] ?? "update",
    severity:    row.action === "DELETE" ? "critical" : row.action === "UPDATE" ? "warning" : "info",
    table_name:  row.table_name,
    record_id:   row.record_id,
    description: `${row.action} على ${row.table_name}`,
    user_name:   row.user_name,
    user_id:     row.user_id,
    ip_address:  row.ip_address,
    created_at:  row.created_at,
  };
}

const CHECKLIST_LABELS: Record<ChecklistKey, { label: string; module: string }> = {
  inv_count:       { label: "جرد المخزون والتسوية",              module: "inventory" },
  inv_revalue:     { label: "إعادة تقييم المخزون",               module: "inventory" },
  ar_aging:        { label: "مراجعة أعمار الذمم المدينة",        module: "accounting" },
  ap_aging:        { label: "مراجعة أعمار الذمم الدائنة",        module: "accounting" },
  bank_recon:      { label: "إتمام التسوية البنكية",             module: "treasury" },
  cash_count:      { label: "عد الصندوق وتسوية الفروقات",        module: "treasury" },
  prepaid_accrual: { label: "قيود المصاريف المدفوعة مقدماً",     module: "accounting" },
  depreciation:    { label: "قيد الاستهلاك الشهري",             module: "accounting" },
  payroll_post:    { label: "ترحيل قيود الرواتب",               module: "hr" },
  vat_review:      { label: "مراجعة تقرير ضريبة القيمة المضافة", module: "tax" },
  trial_balance:   { label: "مراجعة ميزان المراجعة",            module: "accounting" },
  pl_review:       { label: "مراجعة قائمة الدخل",               module: "accounting" },
  cfo_sign:        { label: "اعتماد المدير المالي",             module: "governance" },
  period_lock:     { label: "إقفال الفترة المالية",             module: "governance" },
};

// ─── Governance Service ───────────────────────────────────────

export const governanceService = {

  // ── Fiscal Years ──────────────────────────────────────────

  async listFiscalYears(): Promise<FiscalYear[]> {
    const { data, error } = await supabase
      .from("fiscal_periods")
      .select("fiscal_year, status")
      .order("fiscal_year", { ascending: false });
    if (error) throw error;

    const years = new Map<number, { total: number; open: number }>();
    (data ?? []).forEach(r => {
      const y = years.get(r.fiscal_year) ?? { total: 0, open: 0 };
      y.total++;
      if (r.status === "open") y.open++;
      years.set(r.fiscal_year, y);
    });

    return Array.from(years.entries()).map(([year, v]) => ({
      id:             String(year),
      year,
      label:          String(year),
      status:         v.open > 0 ? "active" : "closed",
      periods_count:  v.total,
      open_periods:   v.open,
    }));
  },

  // ── Periods ───────────────────────────────────────────────

  async listPeriods(year?: number): Promise<AccountingPeriod[]> {
    let q = supabase.from("fiscal_periods").select("*")
      .order("fiscal_year", { ascending: false })
      .order("period_number", { ascending: false });
    if (year) q = q.eq("fiscal_year", year);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapPeriod);
  },

  async getCurrentPeriod(): Promise<AccountingPeriod | null> {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("fiscal_periods").select("*")
      .lte("start_date", today).gte("end_date", today).eq("status", "open")
      .maybeSingle();
    return data ? mapPeriod(data) : null;
  },

  async setPeriodStatus(periodId: string, status: PeriodStatus): Promise<void> {
    const { error } = await supabase.from("fiscal_periods")
      .update({
        status:    STATUS_TO_DB[status],
        closed_by: status !== "open" ? "system" : undefined,
        closed_at: status !== "open" ? new Date().toISOString() : undefined,
      })
      .eq("id", periodId);
    if (error) throw error;
  },

  // ── Checklist ─────────────────────────────────────────────

  async getChecklist(periodId: string): Promise<ClosingChecklistItem[]> {
    const { data } = await supabase.from("monthly_close_checklist")
      .select("*").eq("period_id", periodId).order("id");

    if (!data || data.length === 0) {
      // إنشاء قائمة جديدة
      const tasks = Object.entries(CHECKLIST_LABELS).map(([key, meta]) => ({
        period_id: periodId, task_key: key,
        task_name: meta.label, module: meta.module, status: "pending",
      }));
      const { data: created } = await supabase
        .from("monthly_close_checklist").insert(tasks).select();
      return (created ?? []).map(r => ({
        key:     r.task_key as ChecklistKey,
        label:   CHECKLIST_LABELS[r.task_key as ChecklistKey]?.label ?? r.task_key,
        module:  r.module,
        done:    r.status === "done",
        done_by: r.done_by,
        done_at: r.done_at,
        notes:   r.notes,
      }));
    }

    return data.map(r => ({
      key:     r.task_key as ChecklistKey,
      label:   CHECKLIST_LABELS[r.task_key as ChecklistKey]?.label ?? r.task_key,
      module:  r.module,
      done:    r.status === "done" || r.status === "skipped",
      done_by: r.done_by,
      done_at: r.done_at,
      notes:   r.notes,
    }));
  },

  async toggleChecklistItem(periodId: string, key: ChecklistKey): Promise<void> {
    const { data } = await supabase.from("monthly_close_checklist")
      .select("id, status").eq("period_id", periodId).eq("task_key", key).maybeSingle();
    if (!data) return;
    const newStatus = data.status === "done" ? "pending" : "done";
    await supabase.from("monthly_close_checklist").update({
      status: newStatus,
      done_by: newStatus === "done" ? "current_user" : undefined,
      done_at: newStatus === "done" ? new Date().toISOString() : undefined,
    }).eq("id", data.id);
  },

  // ── Year End Checklist ────────────────────────────────────

  async getYearEndChecklist(yearId: string): Promise<YearEndChecklistItem[]> {
    const items = [
      { key: "close_all_periods",  label: "إقفال جميع الفترات الشهرية" },
      { key: "reconcile_accounts", label: "تسوية جميع الحسابات" },
      { key: "close_inventory",    label: "إقفال المخزون السنوي" },
      { key: "depreciation_year",  label: "قيد الاستهلاك السنوي" },
      { key: "tax_filing",         label: "تقديم الإقرار الضريبي" },
      { key: "audit_complete",     label: "إتمام مراجعة المراجع الخارجي" },
      { key: "board_approval",     label: "اعتماد مجلس الإدارة" },
      { key: "year_lock",          label: "إقفال السنة المالية نهائياً" },
    ];
    return items.map(i => ({ ...i, done: false }));
  },

  async toggleYearEndItem(yearId: string, key: string): Promise<void> {
    // سيُبنى لاحقاً مع جدول year_end_checklist
  },

  // ── Approvals ─────────────────────────────────────────────

  async listApprovals(filter?: {
    status?: ApprovalStatus | "all";
    type?: ApprovalEntityType | "all";
  }): Promise<ApprovalRequest[]> {
    let q = supabase.from("approval_requests")
      .select("*").order("created_at", { ascending: false }).limit(100);

    if (filter?.status && filter.status !== "all") {
      const dbStatus = filter.status === "pending_approval" ? ["pending","in_progress"] : [filter.status];
      q = q.in("status", dbStatus);
    }
    if (filter?.type && filter.type !== "all") {
      q = q.eq("document_type", filter.type);
    }

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(mapApproval);
  },

  async approve(id: string, note?: string): Promise<void> {
    await supabase.from("approval_requests")
      .update({ status: "approved", completed_at: new Date().toISOString(), notes: note })
      .eq("id", id);
    await supabase.from("approval_actions").insert({
      request_id: id, action: "approved",
      action_at: new Date().toISOString(), comments: note,
    });
  },

  async reject(id: string, reason: string): Promise<void> {
    await supabase.from("approval_requests")
      .update({ status: "rejected", completed_at: new Date().toISOString(), notes: reason })
      .eq("id", id);
    await supabase.from("approval_actions").insert({
      request_id: id, action: "rejected",
      action_at: new Date().toISOString(), comments: reason,
    });
  },

  async post(id: string): Promise<void> {
    await supabase.from("approval_requests")
      .update({ status: "approved" }).eq("id", id);
  },

  // ── Audit Log ─────────────────────────────────────────────

  async listAudit(filter?: {
    from?: string; to?: string;
    kind?: AuditKind | "all";
    severity?: "all" | "info" | "warning" | "critical";
  }): Promise<AuditEntry[]> {
    let q = supabase.from("audit_logs").select("*")
      .order("created_at", { ascending: false }).limit(200);
    if (filter?.from) q = q.gte("created_at", filter.from);
    if (filter?.to)   q = q.lte("created_at", filter.to + "T23:59:59");

    const { data, error } = await q;
    if (error) {
      // إذا لم توجد سجلات، أرجع مصفوفة فارغة
      return [];
    }
    let entries = (data ?? []).map(mapAudit);

    if (filter?.severity && filter.severity !== "all") {
      entries = entries.filter(e => e.severity === filter.severity);
    }
    return entries;
  },

  async logAudit(entry: {
    kind: AuditKind; table_name: string; record_id?: string;
    user_id?: string; user_name?: string; ip_address?: string;
  }): Promise<void> {
    const actionMap: Record<AuditKind, string> = {
      login: "LOGIN", logout: "LOGOUT", create: "INSERT", update: "UPDATE",
      delete: "DELETE", approve: "UPDATE", reject: "UPDATE", post: "UPDATE",
      reverse: "UPDATE", export: "EXPORT", print: "PRINT",
    };
    await supabase.from("audit_logs").insert({
      action:     actionMap[entry.kind] ?? "UPDATE",
      table_name: entry.table_name,
      record_id:  entry.record_id,
      user_id:    entry.user_id,
      user_name:  entry.user_name,
      ip_address: entry.ip_address,
    });
  },

  // ── Dashboard ─────────────────────────────────────────────

  async dashboard(): Promise<any> {
    const today = new Date().toISOString().slice(0, 10);

    const [periods, approvals, audit] = await Promise.all([
      supabase.from("fiscal_periods").select("status, fiscal_year"),
      supabase.from("approval_requests").select("status"),
      supabase.from("audit_logs").select("action, created_at")
        .gte("created_at", today).limit(100),
    ]);

    const allPeriods  = periods.data  ?? [];
    const allApprovals = approvals.data ?? [];
    const allAudit    = audit.data    ?? [];

    const openPeriods    = allPeriods.filter(p => p.status === "open").length;
    const closedPeriods  = allPeriods.filter(p => p.status === "hard_closed" || p.status === "year_closed").length;
    const pendingApprovals = allApprovals.filter(a => ["pending","in_progress"].includes(a.status)).length;
    const approvedToday  = allApprovals.filter(a => a.status === "approved").length;

    return {
      open_periods:       openPeriods,
      closed_periods:     closedPeriods,
      pending_approvals:  pendingApprovals,
      approved_today:     approvedToday,
      audit_events_today: allAudit.length,
      critical_alerts:    0,
      current_year:       new Date().getFullYear(),
      periods_this_year:  allPeriods.filter(p => p.fiscal_year === new Date().getFullYear()).length,
    };
  },
};
