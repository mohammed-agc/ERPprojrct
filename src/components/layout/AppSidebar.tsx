import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Car, Wrench, Package, Calculator, Boxes, ShoppingCart,
  Users, BarChart3, LayoutDashboard, Receipt, BookOpen, UserCog, Building2, ShieldCheck,
  BookText, Scale, HandCoins, Wallet, ClipboardCheck, Contact2,
  TrendingUp, ArrowLeftRight, PieChart, Landmark, ArrowDownCircle, ArrowUpCircle, CheckSquare,
  Vault, Banknote, Target, Layers, GitBranch, Share2, Gauge,
  Shield, CalendarRange, CalendarCheck, CalendarX, FileSearch, Lock, Hourglass, AlertTriangle,
  ClipboardList, FileText, Ship, PackageCheck, Trophy, ShoppingBag, Warehouse, Database, Palette, Settings, Send, Briefcase, Heart, DollarSign, Calendar
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
    title: "البيانات الرئيسية",
    items: [
      { label: "كتالوج المنتجات", to: "/master/products", icon: Database },
    { label: "كتالوج المركبات", to: "/vehicle-catalog", icon: BookOpen },
      { label: "ألوان المركبات", to: "/master/colors", icon: Palette },
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
      { label: "الخط الزمني للعميل", to: "/sales/customer-timeline", icon: CalendarRange, deptCode: "vehicles" },
      { label: "ائتمان العملاء", to: "/sales/customer-credit", icon: ShieldCheck, deptCode: "vehicles" },
      { label: "دفعات العملاء", to: "/sales/customer-payments", icon: Banknote, deptCode: "vehicles" },
      { label: "الفواتير", to: "/invoices", icon: Receipt },
    ],
  },

  {
    title: "المشتريات",
    items: [
      { label: "لوحة المشتريات", to: "/purchasing", icon: ShoppingBag, deptCode: "vehicles" },
      { label: "طلبات الشراء", to: "/purchasing/requests", icon: ClipboardList, deptCode: "vehicles" },
      { label: "أوامر الشراء", to: "/purchasing/orders", icon: FileText, deptCode: "vehicles" },
      { label: "تخصيصات المركبات", to: "/purchasing/allocations", icon: Car, deptCode: "vehicles" },
      { label: "فواتير الشراء", to: "/purchasing/invoices", icon: Receipt, deptCode: "vehicles" },
      { label: "ائتمان الموردين", to: "/purchasing/credit", icon: ShieldCheck, deptCode: "vehicles" },
      { label: "إدارة حوافز الموردين", to: "/incentives", icon: Trophy, deptCode: "vehicles" },
      { label: "الشحنات", to: "/purchasing/shipments", icon: Ship, deptCode: "vehicles" },
      { label: "ورشة الاستلام والفحص", to: "/purchasing/receiving/workbench", icon: PackageCheck, deptCode: "vehicles" },
      { label: "الفحص والاعتماد", to: "/purchasing/inspection", icon: FileSearch, deptCode: "vehicles" },

    ],
  },
  {
    title: "المخزون والمستودعات",
    items: [
      { label: "لوحة المخزون", to: "/inventory", icon: LayoutDashboard, deptCode: "inventory" },
      { label: "المستودعات", to: "/inventory/warehouses", icon: Warehouse, deptCode: "inventory" },
      { label: "مخزون المركبات", to: "/inventory/vehicles", icon: Car, deptCode: "inventory" },
      { label: "مخزون قطع الغيار", to: "/inventory/parts", icon: Package, deptCode: "inventory" },
      { label: "حركات المخزون", to: "/inventory/movements", icon: ArrowLeftRight, deptCode: "inventory" },
      { label: "الحجوزات", to: "/inventory/reservations", icon: CalendarCheck, deptCode: "inventory" },
      { label: "التحويلات", to: "/inventory/transfers", icon: ArrowLeftRight, deptCode: "inventory" },
    ],
  },
  {
    title: "العمليات",
    items: [
      { label: "قطع الغيار", to: "/spare-parts", icon: Package, deptCode: "spare_parts" },
      { label: "الورشة", to: "/workshop", icon: Wrench, deptCode: "workshop" },
    ],
  },
  {
    title: "المحاسبة",
    items: [
      { label: "مركز التقارير", to: "/finance", icon: PieChart, deptCode: "accounting" },
      { label: "فواتير الشراء", to: "/accounting/purchase-invoices", icon: Receipt, deptCode: "accounting" },
      { label: "فواتير المبيعات", to: "/accounting/sales-invoices", icon: Receipt, deptCode: "accounting" },
      { label: "دليل الحسابات", to: "/accounts", icon: BookOpen, deptCode: "accounting" },
      { label: "تحديد الحسابات", to: "/admin/settings/account-determination", icon: Settings, deptCode: "accounting" },
      { label: "مجموعات الحسابات", to: "/admin/settings/account-groups", icon: Layers, deptCode: "accounting" },
      { label: "التواصل الإلكتروني", to: "/admin/settings/communications", icon: Send, deptCode: "accounting" },
    ],
  },
  {
    title: "الموارد البشرية",
    items: [
      { label: "لوحة HR", to: "/hr", icon: Users, deptCode: "hr" },
      { label: "الموظفين", to: "/hr/employees", icon: Users, deptCode: "hr" },
      { label: "المسميات الوظيفية", to: "/hr/positions", icon: Briefcase, deptCode: "hr" },
      { label: "أنواع الإجازات", to: "/hr/leave-types", icon: Heart, deptCode: "hr" },
      { label: "مكونات الراتب", to: "/hr/salary-components", icon: DollarSign, deptCode: "hr" },
      { label: "طلبات الإجازات", to: "/hr/leaves", icon: Calendar, deptCode: "hr" },
      { label: "كشوف الرواتب", to: "/hr/payroll", icon: DollarSign, deptCode: "hr" },
      { label: "السلف والقروض", to: "/hr/loans", icon: DollarSign, deptCode: "hr" },
      { label: "قيود اليومية", to: "/journals", icon: Calculator, deptCode: "accounting" },
      { label: "دفتر الأستاذ", to: "/general-ledger", icon: BookText, deptCode: "accounting" },
      { label: "دفتر الأستاذ المساعد", to: "/accounting/partner-ledger", icon: BookText, deptCode: "accounting" },
      { label: "أعمار الديون", to: "/accounting/aging", icon: BookText, deptCode: "accounting" },
      { label: "أرصدة الأطراف والمقاصّة", to: "/accounting/partner-balances", icon: BookText, deptCode: "accounting" },
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
      { label: "البنوك", to: "/treasury/accounts?type=bank", icon: Landmark, deptCode: "accounting" },
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
      { label: "ربحية المركبات (Per-VIN)", to: "/costing/vehicles", icon: Car, deptCode: "accounting" },
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
      { label: "القرارات الائتمانية", to: "/governance/credit-decisions", icon: AlertTriangle, deptCode: "accounting" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { label: "التقارير", to: "/reports", icon: BarChart3 },
      { label: "الهيكل التنظيمي", to: "/organization", icon: Building2 },
      { label: "مصفوفة الصلاحيات", to: "/permissions", icon: ShieldCheck },
      { label: "المستخدمون والصلاحيات", to: "/users", icon: UserCog },
      { label: "مركز إدارة النظام", to: "/admin", icon: Shield },
    ],
  },
];

function BadgeDot({ count, tone }: { count: number; tone: "amber" | "rose" | "emerald" | "slate" }) {
  if (!count || isNaN(count) || count <= 0) return null;
  const toneMap = {
    amber: "bg-amber-500 text-white",
    rose: "bg-rose-500 text-white",
    emerald: "bg-emerald-500 text-white",
    slate: "bg-slate-500 text-white",
  };
  return (
    <span className={cn("inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[12px] font-bold", toneMap[tone])}>
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
  const [salesCounts, setSalesCounts] = useState<{
    expiring_quotes: number;
    discount_pending: number;
    reserved: number;
    pending_deliveries: number;
    fin_review: number;
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
    const s = salesService.dashboard();
    setSalesCounts({
      expiring_quotes: s.expiring_quotes,
      discount_pending: s.discount_pending,
      reserved: s.reserved,
      pending_deliveries: s.pending_deliveries,
      fin_review: s.fin_review,
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
      if (salesCounts) {
        if (it.to === "/sales/quotations") return { ...it, badge: { count: salesCounts.expiring_quotes + salesCounts.discount_pending, tone: "amber" as const } };
        if (it.to === "/sales/reservations") return { ...it, badge: { count: salesCounts.reserved, tone: "amber" as const } };
        if (it.to === "/sales/deliveries") return { ...it, badge: { count: salesCounts.pending_deliveries, tone: "slate" as const } };
        if (it.to === "/sales/financing") return { ...it, badge: { count: salesCounts.fin_review, tone: "amber" as const } };
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
            <div className="text-[11.5px] text-sidebar-muted">إصدار 1.0</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {groups.map((g) => {
          const visibleItems = g.items.filter(it => !it.deptCode || isManager || canAccessDept(it.deptCode));
          if (!visibleItems.length) return null;
          const groupItems = (g.title === "الحوكمة المالية" || g.title === "المشتريات" || g.title === "المبيعات") ? itemsWithBadge(visibleItems) : visibleItems;

          const hasAlerts = groupItems.some(it => it.badge && it.badge.count > 0);
          return (
            <div key={g.title} className={cn("mb-3", hasAlerts && "border-r-2 border-amber-400/40")}>
              <div className="px-4 py-1 text-[11.5px] font-semibold uppercase tracking-wider text-sidebar-muted flex items-center gap-1.5">
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




