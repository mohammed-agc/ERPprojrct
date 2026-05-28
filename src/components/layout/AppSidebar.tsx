import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Car, Wrench, Package, Calculator, Boxes, ShoppingCart,
  Users, BarChart3, LayoutDashboard, Receipt, BookOpen, UserCog, Building2, ShieldCheck,
  BookText, Scale, HandCoins, Wallet, ClipboardCheck, Contact2,
  TrendingUp, ArrowLeftRight, PieChart, Landmark, ArrowDownCircle, ArrowUpCircle, CheckSquare,
  Vault, Banknote, Target, Layers, GitBranch, Share2, Gauge,
  Shield, CalendarRange, CalendarCheck, CalendarX, FileSearch, Lock, Hourglass, AlertTriangle,
  ClipboardList, FileText, Ship, PackageCheck, Trophy, ShoppingBag
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { governanceService } from "@/services/erp/governance";
import { purchasingService } from "@/services/erp/purchasing";
import { salesService } from "@/services/erp/sales";


interface NavItem {
  label: string;
  to: string;
  icon: any;
  deptCode?: string;
  badge?: { count: number; tone: "amber" | "rose" | "emerald" | "slate" };
}

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "عام",
    items: [
      { label: "الرئيسية", to: "/", icon: LayoutDashboard },
      { label: "جهات الاتصال", to: "/contacts", icon: Contact2 },
    ],
  },
  {
    title: "المبيعات",
    items: [
      { label: "لوحة المبيعات", to: "/sales", icon: LayoutDashboard, deptCode: "vehicles" },
      { label: "المركبات", to: "/vehicles", icon: Car, deptCode: "vehicles" },
      { label: "عروض الأسعار", to: "/sales/quotations", icon: FileText, deptCode: "vehicles" },
      { label: "أوامر البيع", to: "/sales-orders", icon: ShoppingCart, deptCode: "vehicles" },
      { label: "الحجوزات", to: "/sales/reservations", icon: CalendarCheck, deptCode: "vehicles" },
      { label: "تنسيق التسليم", to: "/sales/deliveries", icon: PackageCheck, deptCode: "vehicles" },
      { label: "التمويل والتقسيط", to: "/sales/financing", icon: Banknote, deptCode: "vehicles" },
      { label: "تحليلات المبيعات", to: "/sales/analytics", icon: TrendingUp, deptCode: "vehicles" },
      { label: "الخط الزمني للعميل", to: "/sales/customer-timeline", icon: Contact2, deptCode: "vehicles" },
      { label: "الفواتير", to: "/invoices", icon: Receipt },
    ],
  },

  {
    title: "المشتريات",
    items: [
      { label: "لوحة المشتريات", to: "/purchasing", icon: ShoppingBag, deptCode: "vehicles" },
      { label: "طلبات الشراء", to: "/purchasing/requests", icon: ClipboardList, deptCode: "vehicles" },
      { label: "أوامر الشراء", to: "/purchasing/orders", icon: FileText, deptCode: "vehicles" },
      { label: "ائتمان الموردين", to: "/purchasing/credit", icon: ShieldCheck, deptCode: "vehicles" },
      { label: "حوافز الموردين", to: "/purchasing/incentives", icon: Trophy, deptCode: "vehicles" },
      { label: "الشحنات", to: "/purchasing/shipments", icon: Ship, deptCode: "vehicles" },
      { label: "الاستلام", to: "/purchasing/receiving", icon: PackageCheck, deptCode: "vehicles" },
      { label: "الفحص والاعتماد", to: "/purchasing/inspection", icon: FileSearch, deptCode: "vehicles" },
      { label: "المشتريات (قديم)", to: "/procurement", icon: ClipboardCheck, deptCode: "vehicles" },
    ],
  },
  {
    title: "العمليات",
    items: [
      { label: "قطع الغيار", to: "/spare-parts", icon: Package, deptCode: "spare_parts" },
      { label: "الورشة", to: "/workshop", icon: Wrench, deptCode: "workshop" },
      { label: "المخزون", to: "/inventory", icon: Boxes, deptCode: "inventory" },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      { label: "مركز التقارير", to: "/finance", icon: PieChart, deptCode: "accounting" },
      { label: "دليل الحسابات", to: "/accounts", icon: BookOpen, deptCode: "accounting" },
      { label: "قيود اليومية", to: "/journals", icon: Calculator, deptCode: "accounting" },
      { label: "دفتر الأستاذ", to: "/general-ledger", icon: BookText, deptCode: "accounting" },
      { label: "ميزان المراجعة", to: "/trial-balance", icon: Scale, deptCode: "accounting" },
      { label: "قائمة الدخل", to: "/income-statement", icon: TrendingUp, deptCode: "accounting" },
      { label: "الميزانية العمومية", to: "/balance-sheet", icon: Scale, deptCode: "accounting" },
      { label: "التدفقات النقدية", to: "/cash-flow", icon: ArrowLeftRight, deptCode: "accounting" },
      { label: "الذمم المدينة", to: "/ar", icon: HandCoins, deptCode: "accounting" },
      { label: "الذمم الدائنة", to: "/ap", icon: Wallet, deptCode: "accounting" },
    ],
  },
  {
    title: "الخزينة",
    items: [
      { label: "الخزينة", to: "/treasury", icon: Vault, deptCode: "accounting" },
      { label: "الصناديق", to: "/treasury/accounts", icon: Banknote, deptCode: "accounting" },
      { label: "البنوك", to: "/treasury/accounts", icon: Landmark, deptCode: "accounting" },
      { label: "القبض", to: "/treasury/receipts", icon: ArrowDownCircle, deptCode: "accounting" },
      { label: "الصرف", to: "/treasury/payments", icon: ArrowUpCircle, deptCode: "accounting" },
      { label: "التحويلات", to: "/treasury/transfers", icon: ArrowLeftRight, deptCode: "accounting" },
      { label: "التسوية البنكية", to: "/treasury/reconciliation", icon: CheckSquare, deptCode: "accounting" },
    ],
  },
  {
    title: "التحليل الإداري",
    items: [
      { label: "لوحة التحليل المالي", to: "/costing", icon: Gauge, deptCode: "accounting" },
      { label: "مراكز التكلفة", to: "/costing/centers", icon: Target, deptCode: "accounting" },
      { label: "الأبعاد المالية", to: "/costing/dimensions", icon: Layers, deptCode: "accounting" },
      { label: "ربحية الأقسام", to: "/costing/departments", icon: PieChart, deptCode: "accounting" },
      { label: "ربحية الفروع", to: "/costing/branches", icon: GitBranch, deptCode: "accounting" },
      { label: "توزيع التكاليف", to: "/costing/allocation", icon: Share2, deptCode: "accounting" },
    ],
  },
  {
    title: "الحوكمة المالية",
    items: [
      { label: "لوحة الحوكمة", to: "/governance", icon: Shield, deptCode: "accounting" },
      { label: "الفترات المالية", to: "/governance/periods", icon: CalendarRange, deptCode: "accounting" },
      { label: "الإقفال الشهري", to: "/governance/monthly-close", icon: CalendarCheck, deptCode: "accounting" },
      { label: "إقفال السنة", to: "/governance/year-end-close", icon: CalendarX, deptCode: "accounting" },
      { label: "الاعتمادات", to: "/governance/approvals", icon: ClipboardCheck, deptCode: "accounting" },
      { label: "مركز التدقيق", to: "/governance/audit", icon: FileSearch, deptCode: "accounting" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { label: "التقارير", to: "/reports", icon: BarChart3 },
      { label: "الهيكل التنظيمي", to: "/organization", icon: Building2 },
      { label: "مصفوفة الصلاحيات", to: "/permissions", icon: ShieldCheck },
      { label: "المستخدمون والصلاحيات", to: "/users", icon: UserCog },
    ],
  },
];

function BadgeDot({ count, tone }: { count: number; tone: "amber" | "rose" | "emerald" | "slate" }) {
  if (count <= 0) return null;
  const toneMap = {
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-500 text-white",
    emerald: "bg-emerald-500 text-white",
    slate: "bg-slate-500 text-white",
  };
  return (
    <span className={cn("inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold", toneMap[tone])}>
      {count > 9 ? "9+" : count}
    </span>
  );
}

export function AppSidebar() {
  const { canAccessDept, isManager } = useAuth();
  const { pathname } = useLocation();
  const [govCounts, setGovCounts] = useState<{
    pending_approvals: number;
    audit_alerts: number;
    audit_warnings: number;
    pending_close: number;
    locked_periods: number;
  } | null>(null);
  const [purCounts, setPurCounts] = useState<{
    pending_prs: number;
    awaiting_inspection: number;
    in_transit: number;
    over_limit: number;
  } | null>(null);

  useEffect(() => {
    governanceService.dashboard().then(d => setGovCounts(d));
    const d = purchasingService.dashboard();
    setPurCounts({
      pending_prs: d.pending_prs,
      awaiting_inspection: d.awaiting_inspection,
      in_transit: d.in_transit,
      over_limit: d.over_limit,
    });
  }, []);

  const itemsWithBadge = (items: NavItem[]): NavItem[] => {
    return items.map(it => {
      if (govCounts) {
        if (it.to === "/governance/approvals") return { ...it, badge: { count: govCounts.pending_approvals, tone: "amber" as const } };
        if (it.to === "/governance/audit") return { ...it, badge: { count: govCounts.audit_alerts + govCounts.audit_warnings, tone: "rose" as const } };
        if (it.to === "/governance/monthly-close") return { ...it, badge: { count: govCounts.pending_close, tone: "amber" as const } };
        if (it.to === "/governance/periods") return { ...it, badge: { count: govCounts.locked_periods, tone: "slate" as const } };
      }
      if (purCounts) {
        if (it.to === "/purchasing/requests") return { ...it, badge: { count: purCounts.pending_prs, tone: "amber" as const } };
        if (it.to === "/purchasing/inspection") return { ...it, badge: { count: purCounts.awaiting_inspection, tone: "amber" as const } };
        if (it.to === "/purchasing/shipments") return { ...it, badge: { count: purCounts.in_transit, tone: "slate" as const } };
        if (it.to === "/purchasing/credit") return { ...it, badge: { count: purCounts.over_limit, tone: "rose" as const } };
      }
      return it;
    });
  };

  return (
    <aside className="w-60 bg-sidebar text-sidebar-foreground border-l border-sidebar-border flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded bg-sidebar-primary text-sidebar-primary-foreground flex items-center justify-center font-bold text-sm">
            ERP
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">نظام ERP</div>
            <div className="text-[10px] text-sidebar-muted">إصدار 1.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map((g) => {
          const visibleItems = g.items.filter(it => !it.deptCode || isManager || canAccessDept(it.deptCode));
          if (!visibleItems.length) return null;
          const groupItems = (g.title === "الحوكمة المالية" || g.title === "المشتريات") ? itemsWithBadge(visibleItems) : visibleItems;
          const hasAlerts = groupItems.some(it => it.badge && it.badge.count > 0);
          return (
            <div key={g.title} className={cn("mb-3", hasAlerts && "border-r-2 border-amber-400/40")}>
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted flex items-center gap-1.5">
                {g.title}
                {hasAlerts && <AlertTriangle className="h-3 w-3 text-amber-500" />}
              </div>
              {groupItems.map((it) => {
                const active = pathname === it.to;
                const Icon = it.icon;
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    className={cn(
                      "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      active && "bg-sidebar-accent text-sidebar-accent-foreground border-r-2 border-sidebar-primary font-medium"
                    )}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1">{it.label}</span>
                    {it.badge && <BadgeDot count={it.badge.count} tone={it.badge.tone} />}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
