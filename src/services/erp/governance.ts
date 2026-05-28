/**
 * Financial Governance service — frontend-only operational contract.
 *
 * Manages accounting periods, closing checklists, approval workflows for
 * journals and treasury vouchers, and a unified audit trail. All state is
 * persisted to localStorage with seeded synthetic data so the UX behaves
 * like a real ERP until the backend lands.
 */

const LS_KEY = "sarat.governance.v1";

export type PeriodStatus = "open" | "pending_close" | "closed" | "locked";
export type ApprovalStatus = "draft" | "pending_approval" | "approved" | "rejected" | "posted";
export type AuditKind =
  | "journal_modified" | "journal_reversed" | "journal_late_post"
  | "voucher_reversed" | "voucher_adjusted" | "manual_adjustment"
  | "approval_override" | "period_reopened" | "period_closed";

export interface FiscalYear {
  id: string;
  year: number;
  start: string;            // YYYY-MM-DD
  end: string;
  status: PeriodStatus;
  closed_at?: string;
  closed_by?: string;
}

export interface AccountingPeriod {
  id: string;
  year: number;
  month: number;            // 1-12
  start: string;
  end: string;
  status: PeriodStatus;
  closed_at?: string;
  closed_by?: string;
  notes?: string;
}

export type ChecklistKey =
  | "all_posted" | "bank_recon" | "treasury_balanced"
  | "ar_reviewed" | "ap_reviewed" | "vat_reviewed" | "approvals_cleared";

export interface ClosingChecklistItem {
  key: ChecklistKey;
  label: string;
  done: boolean;
  blocker: boolean;
  detail?: string;
}

export interface YearEndChecklistItem {
  key: string;
  label: string;
  done: boolean;
  detail?: string;
}

export type ApprovalEntityType = "journal" | "voucher" | "transfer" | "adjustment" | "reversal";

export interface ApprovalRequest {
  id: string;
  entity_type: ApprovalEntityType;
  entity_ref: string;       // e.g. JV-2026-0034 or PV-2026-0012
  entity_label: string;     // human label
  amount: number;
  date: string;
  requester: string;
  reviewer?: string;
  status: ApprovalStatus;
  notes?: string;
  rejection_reason?: string;
  history: { at: string; actor: string; action: string; note?: string }[];
}

export interface AuditEntry {
  id: string;
  at: string;               // ISO timestamp
  kind: AuditKind;
  entity_ref: string;
  user: string;
  period?: string;          // YYYY-MM
  amount?: number;
  description: string;
  severity: "info" | "warning" | "critical";
}

interface State {
  fiscal_years: FiscalYear[];
  periods: AccountingPeriod[];
  checklists: Record<string, ClosingChecklistItem[]>;   // period_id -> items
  year_end: Record<string, YearEndChecklistItem[]>;     // year_id -> items
  approvals: ApprovalRequest[];
  audit: AuditEntry[];
}

/* ---------------- seed ---------------- */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate();

function seed(): State {
  const now = new Date();
  const Y = now.getFullYear();
  const curM = now.getMonth() + 1;

  const fiscal_years: FiscalYear[] = [
    { id: `fy-${Y - 1}`, year: Y - 1, start: `${Y - 1}-01-01`, end: `${Y - 1}-12-31`, status: "closed", closed_at: `${Y}-01-15T10:00:00Z`, closed_by: "أحمد المالكي" },
    { id: `fy-${Y}`, year: Y, start: `${Y}-01-01`, end: `${Y}-12-31`, status: "open" },
  ];

  const periods: AccountingPeriod[] = [];
  for (let m = 1; m <= 12; m++) {
    const id = `p-${Y}-${pad(m)}`;
    const start = ymd(Y, m, 1);
    const end = ymd(Y, m, lastDay(Y, m));
    let status: PeriodStatus = "open";
    if (m < curM - 1) status = "closed";
    else if (m === curM - 1) status = "pending_close";
    else if (m > curM) status = "open";
    periods.push({
      id, year: Y, month: m, start, end, status,
      closed_at: status === "closed" ? `${Y}-${pad(m + 1)}-05T09:00:00Z` : undefined,
      closed_by: status === "closed" ? "أحمد المالكي" : undefined,
    });
  }
  // lock the oldest 3 months of prior year visualisation
  for (let m = 1; m <= 12; m++) {
    periods.unshift({
      id: `p-${Y - 1}-${pad(m)}`, year: Y - 1, month: m,
      start: ymd(Y - 1, m, 1), end: ymd(Y - 1, m, lastDay(Y - 1, m)),
      status: "locked", closed_at: `${Y}-01-15T10:00:00Z`, closed_by: "أحمد المالكي",
    });
  }

  const checklists: Record<string, ClosingChecklistItem[]> = {};
  const buildChecklist = (allDone: boolean): ClosingChecklistItem[] => [
    { key: "all_posted", label: "ترحيل جميع قيود اليومية", done: allDone, blocker: true, detail: allDone ? "تم ترحيل 248 قيد" : "12 قيد بانتظار الترحيل" },
    { key: "bank_recon", label: "إتمام التسوية البنكية", done: allDone, blocker: true, detail: allDone ? "تمت تسوية 4 حسابات" : "حسابان غير مسوّيَين" },
    { key: "treasury_balanced", label: "موازنة الخزينة والصناديق", done: allDone, blocker: true, detail: allDone ? "الأرصدة متطابقة" : "فرق 3,420 ر.س" },
    { key: "ar_reviewed", label: "مراجعة الذمم المدينة", done: allDone, blocker: false, detail: allDone ? "تمت المراجعة" : "5 عملاء يحتاجون مراجعة" },
    { key: "ap_reviewed", label: "مراجعة الذمم الدائنة", done: allDone, blocker: false, detail: allDone ? "تمت المراجعة" : "3 موردين بانتظار التسوية" },
    { key: "vat_reviewed", label: "مراجعة ضريبة القيمة المضافة", done: allDone, blocker: true, detail: allDone ? "VAT جاهز للإقرار" : "بانتظار التحقق" },
    { key: "approvals_cleared", label: "تصفية الموافقات المعلقة", done: allDone, blocker: false, detail: allDone ? "لا موافقات معلقة" : "7 طلبات تنتظر" },
  ];
  periods.forEach(p => {
    checklists[p.id] = buildChecklist(p.status === "closed" || p.status === "locked");
  });

  const year_end: Record<string, YearEndChecklistItem[]> = {
    [`fy-${Y - 1}`]: [
      { key: "trial_balance", label: "اعتماد ميزان المراجعة النهائي", done: true, detail: "تم الاعتماد بتاريخ 14/01" },
      { key: "retained_earnings", label: "ترحيل الأرباح المحتجزة", done: true, detail: "نقل 1,248,500 ر.س" },
      { key: "audit_review", label: "مراجعة الحسابات الخارجية", done: true, detail: "تقرير المراجع رقم AUD-2024-09" },
      { key: "depreciation", label: "احتساب الإهلاك السنوي", done: true },
      { key: "inventory_count", label: "جرد المخزون السنوي", done: true },
      { key: "tax_filing", label: "إقرار الزكاة والضريبة", done: true },
      { key: "closing_confirm", label: "تأكيد إقفال السنة من الإدارة", done: true },
    ],
    [`fy-${Y}`]: [
      { key: "trial_balance", label: "اعتماد ميزان المراجعة النهائي", done: false },
      { key: "retained_earnings", label: "ترحيل الأرباح المحتجزة", done: false },
      { key: "audit_review", label: "مراجعة الحسابات الخارجية", done: false },
      { key: "depreciation", label: "احتساب الإهلاك السنوي", done: false },
      { key: "inventory_count", label: "جرد المخزون السنوي", done: false },
      { key: "tax_filing", label: "إقرار الزكاة والضريبة", done: false },
      { key: "closing_confirm", label: "تأكيد إقفال السنة من الإدارة", done: false },
    ],
  };

  const approvals: ApprovalRequest[] = [
    { id: "ap-001", entity_type: "journal", entity_ref: "JV-2026-0148", entity_label: "تسوية مخزون الفرع الرئيسي", amount: 84200, date: ymd(Y, curM, Math.max(1, now.getDate() - 2)), requester: "خالد الشمري", status: "pending_approval", notes: "تسوية الجرد الدوري", history: [{ at: new Date().toISOString(), actor: "خالد الشمري", action: "تقديم للاعتماد" }] },
    { id: "ap-002", entity_type: "voucher", entity_ref: "PV-2026-0067", entity_label: "صرف لمورد العربية للسيارات", amount: 156000, date: ymd(Y, curM, Math.max(1, now.getDate() - 1)), requester: "نورة القحطاني", status: "pending_approval", notes: "دفعة مقدمة عن طلبية #PO-882", history: [{ at: new Date().toISOString(), actor: "نورة القحطاني", action: "تقديم للاعتماد" }] },
    { id: "ap-003", entity_type: "transfer", entity_ref: "TR-2026-0021", entity_label: "تحويل من البنك الأهلي إلى الراجحي", amount: 500000, date: ymd(Y, curM, Math.max(1, now.getDate() - 1)), requester: "سلمى العتيبي", status: "pending_approval", history: [{ at: new Date().toISOString(), actor: "سلمى العتيبي", action: "تقديم للاعتماد" }] },
    { id: "ap-004", entity_type: "reversal", entity_ref: "RV-2026-0009", entity_label: "إلغاء سند صرف PV-2026-0044", amount: 22500, date: ymd(Y, curM, Math.max(1, now.getDate() - 3)), requester: "عبدالله الحربي", status: "pending_approval", notes: "ازدواجية صرف", history: [{ at: new Date().toISOString(), actor: "عبدالله الحربي", action: "تقديم للاعتماد" }] },
    { id: "ap-005", entity_type: "adjustment", entity_ref: "AJ-2026-0014", entity_label: "تسوية فروقات صرف العملات", amount: 3120, date: ymd(Y, curM, Math.max(1, now.getDate() - 4)), requester: "محمد الزهراني", status: "approved", reviewer: "أحمد المالكي", history: [{ at: new Date().toISOString(), actor: "محمد الزهراني", action: "تقديم" }, { at: new Date().toISOString(), actor: "أحمد المالكي", action: "اعتماد" }] },
    { id: "ap-006", entity_type: "journal", entity_ref: "JV-2026-0132", entity_label: "احتساب الإهلاك الشهري", amount: 18750, date: ymd(Y, curM, 1), requester: "خالد الشمري", reviewer: "أحمد المالكي", status: "rejected", rejection_reason: "نسبة الإهلاك تحتاج مراجعة", history: [{ at: new Date().toISOString(), actor: "خالد الشمري", action: "تقديم" }, { at: new Date().toISOString(), actor: "أحمد المالكي", action: "رفض", note: "نسبة الإهلاك تحتاج مراجعة" }] },
    { id: "ap-007", entity_type: "voucher", entity_ref: "RV-2026-0102", entity_label: "قبض من شركة الجزيرة", amount: 245000, date: ymd(Y, curM, Math.max(1, now.getDate() - 5)), requester: "نورة القحطاني", reviewer: "أحمد المالكي", status: "posted", history: [{ at: new Date().toISOString(), actor: "نورة القحطاني", action: "تقديم" }, { at: new Date().toISOString(), actor: "أحمد المالكي", action: "اعتماد" }, { at: new Date().toISOString(), actor: "النظام", action: "ترحيل" }] },
  ];

  const audit: AuditEntry[] = [
    { id: "au-1", at: new Date(Date.now() - 3600_000).toISOString(), kind: "journal_modified", entity_ref: "JV-2026-0140", user: "خالد الشمري", period: `${Y}-${pad(curM)}`, amount: 12400, description: "تعديل وصف القيد قبل الترحيل", severity: "info" },
    { id: "au-2", at: new Date(Date.now() - 2 * 3600_000).toISOString(), kind: "journal_reversed", entity_ref: "JV-2026-0091", user: "أحمد المالكي", period: `${Y}-${pad(curM)}`, amount: 56000, description: "عكس قيد بسبب خطأ تصنيف الحساب", severity: "warning" },
    { id: "au-3", at: new Date(Date.now() - 24 * 3600_000).toISOString(), kind: "voucher_reversed", entity_ref: "PV-2026-0044", user: "عبدالله الحربي", period: `${Y}-${pad(curM)}`, amount: 22500, description: "إلغاء سند صرف لازدواجية الدفع", severity: "warning" },
    { id: "au-4", at: new Date(Date.now() - 30 * 3600_000).toISOString(), kind: "manual_adjustment", entity_ref: "AJ-2026-0014", user: "محمد الزهراني", period: `${Y}-${pad(curM)}`, amount: 3120, description: "تسوية يدوية لفروقات صرف العملات", severity: "info" },
    { id: "au-5", at: new Date(Date.now() - 36 * 3600_000).toISOString(), kind: "journal_late_post", entity_ref: "JV-2026-0078", user: "خالد الشمري", period: `${Y}-${pad(Math.max(1, curM - 1))}`, amount: 9800, description: "ترحيل متأخر لقيد بعد إغلاق الفترة المؤقت", severity: "critical" },
    { id: "au-6", at: new Date(Date.now() - 48 * 3600_000).toISOString(), kind: "approval_override", entity_ref: "PV-2026-0061", user: "أحمد المالكي", period: `${Y}-${pad(curM)}`, amount: 320000, description: "تجاوز حد اعتماد المدير المالي", severity: "critical" },
    { id: "au-7", at: new Date(Date.now() - 96 * 3600_000).toISOString(), kind: "period_closed", entity_ref: `${Y}-${pad(Math.max(1, curM - 2))}`, user: "أحمد المالكي", period: `${Y}-${pad(Math.max(1, curM - 2))}`, description: "إقفال الفترة الشهرية", severity: "info" },
  ];

  return { fiscal_years, periods, checklists, year_end, approvals, audit };
}

/* ---------------- store ---------------- */

function load(): State {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  const s = seed();
  localStorage.setItem(LS_KEY, JSON.stringify(s));
  return s;
}
function save(s: State) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

const wait = <T>(v: T) => new Promise<T>(r => setTimeout(() => r(v), 80));
const nowIso = () => new Date().toISOString();
const ACTOR = "أحمد المالكي";

/* ---------------- labels ---------------- */

export const periodStatusLabel: Record<PeriodStatus, string> = {
  open: "مفتوحة", pending_close: "قيد الإقفال", closed: "مُقفلة", locked: "مغلقة نهائياً",
};
export const periodStatusTone: Record<PeriodStatus, string> = {
  open: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  pending_close: "bg-amber-500/10 text-amber-700 border-amber-300",
  closed: "bg-slate-500/10 text-slate-700 border-slate-300",
  locked: "bg-rose-500/10 text-rose-700 border-rose-300",
};
export const approvalStatusLabel: Record<ApprovalStatus, string> = {
  draft: "مسودة", pending_approval: "بانتظار الاعتماد", approved: "معتمد", rejected: "مرفوض", posted: "مُرحَّل",
};
export const approvalStatusTone: Record<ApprovalStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending_approval: "bg-amber-500/10 text-amber-700 border-amber-300",
  approved: "bg-blue-500/10 text-blue-700 border-blue-300",
  rejected: "bg-rose-500/10 text-rose-700 border-rose-300",
  posted: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
};
export const entityTypeLabel: Record<ApprovalEntityType, string> = {
  journal: "قيد يومية", voucher: "سند", transfer: "تحويل", adjustment: "تسوية", reversal: "عكس / إلغاء",
};
export const auditKindLabel: Record<AuditKind, string> = {
  journal_modified: "تعديل قيد", journal_reversed: "عكس قيد", journal_late_post: "ترحيل متأخر",
  voucher_reversed: "عكس سند", voucher_adjusted: "تعديل سند", manual_adjustment: "تسوية يدوية",
  approval_override: "تجاوز اعتماد", period_reopened: "إعادة فتح فترة", period_closed: "إقفال فترة",
};
export const auditSeverityTone: Record<"info" | "warning" | "critical", string> = {
  info: "bg-blue-500/10 text-blue-700 border-blue-300",
  warning: "bg-amber-500/10 text-amber-700 border-amber-300",
  critical: "bg-rose-500/10 text-rose-700 border-rose-300",
};

/* ---------------- service ---------------- */

export const governanceService = {
  /* periods */
  async listFiscalYears() { return wait(load().fiscal_years.slice().sort((a, b) => b.year - a.year)); },
  async listPeriods(year?: number) {
    const s = load();
    return wait(s.periods.filter(p => !year || p.year === year).sort((a, b) => a.start.localeCompare(b.start)));
  },
  async getCurrentPeriod() {
    const s = load();
    const today = new Date().toISOString().slice(0, 10);
    return wait(s.periods.find(p => p.status === "open" && p.start <= today && p.end >= today)
      ?? s.periods.find(p => p.status === "open"));
  },
  async getChecklist(periodId: string) { return wait(load().checklists[periodId] ?? []); },
  async toggleChecklistItem(periodId: string, key: ChecklistKey) {
    const s = load();
    const items = s.checklists[periodId];
    if (items) {
      const it = items.find(i => i.key === key);
      if (it) it.done = !it.done;
      save(s);
    }
    return wait(true);
  },
  async setPeriodStatus(periodId: string, status: PeriodStatus) {
    const s = load();
    const p = s.periods.find(x => x.id === periodId);
    if (p) {
      const prev = p.status;
      p.status = status;
      if (status === "closed" || status === "locked") {
        p.closed_at = nowIso(); p.closed_by = ACTOR;
      }
      s.audit.unshift({
        id: `au-${Date.now()}`, at: nowIso(),
        kind: status === "open" ? "period_reopened" : "period_closed",
        entity_ref: `${p.year}-${pad(p.month)}`, user: ACTOR, period: `${p.year}-${pad(p.month)}`,
        description: `تغيير حالة الفترة من ${periodStatusLabel[prev]} إلى ${periodStatusLabel[status]}`,
        severity: status === "open" ? "warning" : "info",
      });
      save(s);
    }
    return wait(true);
  },

  /* year-end */
  async getYearEndChecklist(yearId: string) { return wait(load().year_end[yearId] ?? []); },
  async toggleYearEndItem(yearId: string, key: string) {
    const s = load();
    const items = s.year_end[yearId];
    if (items) {
      const it = items.find(i => i.key === key);
      if (it) it.done = !it.done;
      save(s);
    }
    return wait(true);
  },

  /* approvals */
  async listApprovals(filter?: { status?: ApprovalStatus | "all"; type?: ApprovalEntityType | "all" }) {
    const s = load();
    return wait(s.approvals
      .filter(a => !filter?.status || filter.status === "all" || a.status === filter.status)
      .filter(a => !filter?.type || filter.type === "all" || a.entity_type === filter.type)
      .sort((a, b) => b.date.localeCompare(a.date)));
  },
  async approve(id: string, note?: string) {
    const s = load();
    const a = s.approvals.find(x => x.id === id);
    if (a) {
      a.status = "approved"; a.reviewer = ACTOR;
      a.history.push({ at: nowIso(), actor: ACTOR, action: "اعتماد", note });
      save(s);
    }
    return wait(true);
  },
  async reject(id: string, reason: string) {
    const s = load();
    const a = s.approvals.find(x => x.id === id);
    if (a) {
      a.status = "rejected"; a.reviewer = ACTOR; a.rejection_reason = reason;
      a.history.push({ at: nowIso(), actor: ACTOR, action: "رفض", note: reason });
      save(s);
    }
    return wait(true);
  },
  async post(id: string) {
    const s = load();
    const a = s.approvals.find(x => x.id === id);
    if (a && a.status === "approved") {
      a.status = "posted";
      a.history.push({ at: nowIso(), actor: "النظام", action: "ترحيل" });
      save(s);
    }
    return wait(true);
  },

  /* audit */
  async listAudit(filter?: { from?: string; to?: string; kind?: AuditKind | "all"; severity?: "all" | "info" | "warning" | "critical" }) {
    const s = load();
    return wait(s.audit
      .filter(a => !filter?.from || a.at.slice(0, 10) >= filter.from)
      .filter(a => !filter?.to || a.at.slice(0, 10) <= filter.to)
      .filter(a => !filter?.kind || filter.kind === "all" || a.kind === filter.kind)
      .filter(a => !filter?.severity || filter.severity === "all" || a.severity === filter.severity)
      .sort((a, b) => b.at.localeCompare(a.at)));
  },

  /* dashboard rollup */
  async dashboard() {
    const s = load();
    const today = new Date().toISOString().slice(0, 10);
    return wait({
      open_periods: s.periods.filter(p => p.status === "open").length,
      pending_close: s.periods.filter(p => p.status === "pending_close").length,
      locked_periods: s.periods.filter(p => p.status === "locked").length,
      pending_approvals: s.approvals.filter(a => a.status === "pending_approval").length,
      rejected_approvals: s.approvals.filter(a => a.status === "rejected").length,
      audit_alerts: s.audit.filter(a => a.severity === "critical").length,
      audit_warnings: s.audit.filter(a => a.severity === "warning").length,
      overdue_tasks: s.periods.filter(p => p.status === "pending_close" && p.end < today).length,
    });
  },

  /** Helper for UI: is a given date inside a closed/locked period? */
  isDateLocked(dateIso: string): { locked: boolean; status?: PeriodStatus; period?: string } {
    const s = load();
    const p = s.periods.find(x => dateIso >= x.start && dateIso <= x.end);
    if (!p) return { locked: false };
    if (p.status === "closed" || p.status === "locked") {
      return { locked: true, status: p.status, period: `${p.year}-${pad(p.month)}` };
    }
    return { locked: false, status: p.status, period: `${p.year}-${pad(p.month)}` };
  },
};
