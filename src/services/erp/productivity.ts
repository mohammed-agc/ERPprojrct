/**
 * Productivity layer — frontend-only contract for:
 * - Global ERP search index
 * - Recent searches & recent actions
 * - Notifications center (synthesized from governance + AR/AP signals)
 * - Activity feed
 * - Favorites / pinned views
 *
 * All state persists in localStorage. No backend dependencies.
 * Designed so a future REST adapter can drop in by replacing this module.
 */

import { governanceService } from "./governance";

// ───────────────────────────────────────────── Types
export type SearchCategory =
  | "page" | "contact" | "vehicle" | "invoice" | "journal"
  | "voucher" | "treasury" | "account" | "cost_center" | "approval";

export interface SearchItem {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchCategory;
  to: string;
  keywords?: string[];
}

export type NotifSeverity = "info" | "warning" | "critical";
export interface Notification {
  id: string;
  title: string;
  body?: string;
  severity: NotifSeverity;
  to?: string;
  createdAt: string;
  read: boolean;
  group: "approvals" | "treasury" | "ar" | "ap" | "governance" | "workflow";
}

export interface ActivityEntry {
  id: string;
  title: string;
  detail?: string;
  user?: string;
  group: "accounting" | "treasury" | "sales" | "approvals" | "inventory" | "system";
  at: string;
  to?: string;
}

export interface Favorite {
  id: string;
  label: string;
  to: string;
  pinnedAt: string;
}

// ───────────────────────────────────────────── Storage
const LS_KEY = "sarat.erp.productivity.v1";
interface Store {
  recents: string[];          // recent search queries
  recentActions: string[];    // recent command palette command ids
  favorites: Favorite[];
  readIds: string[];          // notif ids marked read
  dismissedIds: string[];
  activity: ActivityEntry[];  // local activity log
}
function load(): Store {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { recents: [], recentActions: [], favorites: [], readIds: [], dismissedIds: [], activity: [] };
}
function save(s: Store) { localStorage.setItem(LS_KEY, JSON.stringify(s)); }

// ───────────────────────────────────────────── Static search index (pages)
const PAGE_INDEX: SearchItem[] = [
  { id: "p_home", title: "الرئيسية", category: "page", to: "/", keywords: ["dashboard", "لوحة"] },
  { id: "p_contacts", title: "جهات الاتصال", category: "page", to: "/contacts" },
  { id: "p_vehicles", title: "المركبات", category: "page", to: "/vehicles" },
  { id: "p_proc", title: "المشتريات", category: "page", to: "/procurement" },
  { id: "p_sales", title: "أوامر البيع", category: "page", to: "/sales-orders" },
  { id: "p_invoices", title: "الفواتير", category: "page", to: "/invoices" },
  { id: "p_accounts", title: "دليل الحسابات", category: "page", to: "/accounts" },
  { id: "p_journals", title: "قيود اليومية", category: "page", to: "/journals" },
  { id: "p_gl", title: "دفتر الأستاذ", category: "page", to: "/general-ledger" },
  { id: "p_tb", title: "ميزان المراجعة", category: "page", to: "/trial-balance" },
  { id: "p_is", title: "قائمة الدخل", category: "page", to: "/income-statement" },
  { id: "p_bs", title: "الميزانية العمومية", category: "page", to: "/balance-sheet" },
  { id: "p_cf", title: "التدفقات النقدية", category: "page", to: "/cash-flow" },
  { id: "p_ar", title: "الذمم المدينة", category: "page", to: "/ar" },
  { id: "p_ap", title: "الذمم الدائنة", category: "page", to: "/ap" },
  { id: "p_treasury", title: "الخزينة", category: "treasury", to: "/treasury" },
  { id: "p_tacc", title: "الصناديق والبنوك", category: "treasury", to: "/treasury/accounts" },
  { id: "p_recv", title: "سندات القبض", category: "treasury", to: "/treasury/receipts" },
  { id: "p_paym", title: "سندات الصرف", category: "treasury", to: "/treasury/payments" },
  { id: "p_xfer", title: "التحويلات", category: "treasury", to: "/treasury/transfers" },
  { id: "p_recon", title: "التسوية البنكية", category: "treasury", to: "/treasury/reconciliation" },
  { id: "p_cost", title: "التحليل المالي", category: "cost_center", to: "/costing" },
  { id: "p_cc", title: "مراكز التكلفة", category: "cost_center", to: "/costing/centers" },
  { id: "p_dims", title: "الأبعاد المالية", category: "cost_center", to: "/costing/dimensions" },
  { id: "p_gov", title: "لوحة الحوكمة", category: "page", to: "/governance" },
  { id: "p_per", title: "الفترات المالية", category: "page", to: "/governance/periods" },
  { id: "p_appr", title: "الاعتمادات", category: "approval", to: "/governance/approvals" },
  { id: "p_audit", title: "مركز التدقيق", category: "page", to: "/governance/audit" },
  { id: "p_users", title: "المستخدمون", category: "page", to: "/users" },
  { id: "p_org", title: "الهيكل التنظيمي", category: "page", to: "/organization" },
  { id: "p_perm", title: "مصفوفة الصلاحيات", category: "page", to: "/permissions" },
];

// ───────────────────────────────────────────── Quick actions (commands)
export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: "إنشاء" | "تنقل" | "إجراءات";
  to?: string;
  action?: () => void;
  shortcut?: string;
}
export const COMMANDS: Command[] = [
  { id: "new_invoice", label: "فاتورة جديدة", group: "إنشاء", to: "/invoices?new=1", shortcut: "I" },
  { id: "new_receipt", label: "سند قبض جديد", group: "إنشاء", to: "/treasury/receipts?new=1", shortcut: "R" },
  { id: "new_payment", label: "سند صرف جديد", group: "إنشاء", to: "/treasury/payments?new=1", shortcut: "P" },
  { id: "new_journal", label: "قيد يومية جديد", group: "إنشاء", to: "/journals?new=1", shortcut: "J" },
  { id: "new_contact", label: "جهة اتصال جديدة", group: "إنشاء", to: "/contacts?new=1", shortcut: "C" },
  { id: "new_vehicle", label: "مركبة جديدة", group: "إنشاء", to: "/vehicles?new=1", shortcut: "V" },
  { id: "new_transfer", label: "تحويل خزينة", group: "إنشاء", to: "/treasury/transfers?new=1", shortcut: "T" },
  { id: "go_dashboard", label: "الذهاب إلى الرئيسية", group: "تنقل", to: "/" },
  { id: "go_treasury", label: "الذهاب إلى الخزينة", group: "تنقل", to: "/treasury" },
  { id: "go_approvals", label: "قائمة الاعتمادات", group: "تنقل", to: "/governance/approvals" },
  { id: "go_audit", label: "مركز التدقيق", group: "تنقل", to: "/governance/audit" },
  { id: "go_activity", label: "مركز النشاطات", group: "تنقل", to: "/activity" },
];

// ───────────────────────────────────────────── Service
export const productivityService = {
  // Search
  search(query: string): SearchItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return PAGE_INDEX.filter(it => {
      const hay = `${it.title} ${it.subtitle ?? ""} ${(it.keywords ?? []).join(" ")} ${it.to}`.toLowerCase();
      return hay.includes(q);
    }).slice(0, 30);
  },
  recentSearches(): string[] { return load().recents; },
  pushRecentSearch(q: string) {
    if (!q.trim()) return;
    const s = load();
    s.recents = [q, ...s.recents.filter(x => x !== q)].slice(0, 8);
    save(s);
  },
  pushRecentAction(id: string) {
    const s = load();
    s.recentActions = [id, ...s.recentActions.filter(x => x !== id)].slice(0, 6);
    save(s);
  },
  recentActions(): Command[] {
    const ids = load().recentActions;
    return ids.map(id => COMMANDS.find(c => c.id === id)).filter(Boolean) as Command[];
  },

  // Favorites
  favorites(): Favorite[] { return load().favorites; },
  isFavorite(to: string) { return load().favorites.some(f => f.to === to); },
  toggleFavorite(label: string, to: string) {
    const s = load();
    const i = s.favorites.findIndex(f => f.to === to);
    if (i >= 0) s.favorites.splice(i, 1);
    else s.favorites.unshift({ id: `f_${Date.now()}`, label, to, pinnedAt: new Date().toISOString() });
    save(s);
  },

  // Notifications — synthesized from governance + heuristic mocks
  async notifications(): Promise<Notification[]> {
    const s = load();
    const gov = await governanceService.dashboard();
    const out: Notification[] = [];
    const now = new Date().toISOString();
    if (gov.pending_approvals > 0) {
      out.push({
        id: "n_appr", group: "approvals", severity: "warning",
        title: "اعتمادات معلقة",
        body: `لديك ${gov.pending_approvals} عملية بانتظار الاعتماد`,
        to: "/governance/approvals", createdAt: now, read: false,
      });
    }
    if (gov.audit_alerts > 0) {
      out.push({
        id: "n_audit", group: "governance", severity: "critical",
        title: "تنبيهات تدقيق حرجة",
        body: `${gov.audit_alerts} تنبيه يستوجب المراجعة`,
        to: "/governance/audit", createdAt: now, read: false,
      });
    }
    if (gov.pending_close > 0) {
      out.push({
        id: "n_close", group: "governance", severity: "warning",
        title: "فترات بانتظار الإقفال",
        body: `${gov.pending_close} فترة محاسبية لم تُقفل بعد`,
        to: "/governance/monthly-close", createdAt: now, read: false,
      });
    }
    // Operational heuristics (frontend-only)
    out.push({
      id: "n_ar_overdue", group: "ar", severity: "warning",
      title: "ذمم مدينة متأخرة",
      body: "هناك عملاء تجاوزوا المهلة الائتمانية",
      to: "/ar", createdAt: now, read: false,
    });
    out.push({
      id: "n_recon", group: "treasury", severity: "info",
      title: "تسوية بنكية معلقة",
      body: "حركات بنكية لم تُطابق بعد",
      to: "/treasury/reconciliation", createdAt: now, read: false,
    });
    return out
      .filter(n => !s.dismissedIds.includes(n.id))
      .map(n => ({ ...n, read: s.readIds.includes(n.id) }));
  },
  markRead(id: string) {
    const s = load();
    if (!s.readIds.includes(id)) s.readIds.push(id);
    save(s);
  },
  markAllRead(ids: string[]) {
    const s = load();
    ids.forEach(id => { if (!s.readIds.includes(id)) s.readIds.push(id); });
    save(s);
  },
  dismiss(id: string) {
    const s = load();
    if (!s.dismissedIds.includes(id)) s.dismissedIds.push(id);
    save(s);
  },

  // Activity feed — seeded + locally appended
  activity(filter?: { group?: ActivityEntry["group"] }): ActivityEntry[] {
    const s = load();
    const seed: ActivityEntry[] = [
      { id: "a1", title: "اعتماد قيد يومية #JV-2031", group: "approvals", user: "أحمد م.", at: hoursAgo(1), to: "/journals" },
      { id: "a2", title: "سند قبض #RV-1142 — 12,400 ر.س", group: "treasury", user: "نورة س.", at: hoursAgo(2), to: "/treasury/receipts" },
      { id: "a3", title: "تعديل فاتورة #INV-3387", group: "sales", user: "محمد ك.", at: hoursAgo(4), to: "/invoices" },
      { id: "a4", title: "إقفال فترة سبتمبر", group: "accounting", user: "النظام", at: hoursAgo(20) },
      { id: "a5", title: "عكس قيد #JV-2018", group: "accounting", user: "ليلى ع.", at: hoursAgo(26), to: "/journals" },
      { id: "a6", title: "تحويل بين خزينة الرياض وجدة", group: "treasury", user: "خالد ر.", at: hoursAgo(30), to: "/treasury/transfers" },
    ];
    const all = [...s.activity, ...seed];
    return filter?.group ? all.filter(a => a.group === filter.group) : all;
  },
  logActivity(entry: Omit<ActivityEntry, "id" | "at">) {
    const s = load();
    s.activity.unshift({ ...entry, id: `a_${Date.now()}`, at: new Date().toISOString() });
    s.activity = s.activity.slice(0, 100);
    save(s);
  },
};

function hoursAgo(h: number) {
  return new Date(Date.now() - h * 3600_000).toISOString();
}
