import { NavLink, useLocation } from "react-router-dom";
import {
  Car, Wrench, Package, Calculator, Boxes, ShoppingCart,
  Users, BarChart3, LayoutDashboard, Receipt, BookOpen, UserCog, Building2, ShieldCheck,
  BookText, Scale, HandCoins, Wallet
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface NavItem { label: string; to: string; icon: any; deptCode?: string; }

const groups: { title: string; items: NavItem[] }[] = [
  {
    title: "عام",
    items: [
      { label: "الرئيسية", to: "/", icon: LayoutDashboard },
      { label: "العملاء", to: "/customers", icon: Users },
    ],
  },
  {
    title: "المبيعات",
    items: [
      { label: "المركبات", to: "/vehicles", icon: Car, deptCode: "vehicles" },
      { label: "أوامر البيع", to: "/sales-orders", icon: ShoppingCart, deptCode: "vehicles" },
      { label: "الفواتير", to: "/invoices", icon: Receipt },
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
      { label: "دليل الحسابات", to: "/accounts", icon: BookOpen, deptCode: "accounting" },
      { label: "قيود اليومية", to: "/journals", icon: Calculator, deptCode: "accounting" },
      { label: "دفتر الأستاذ", to: "/general-ledger", icon: BookText, deptCode: "accounting" },
      { label: "ميزان المراجعة", to: "/trial-balance", icon: Scale, deptCode: "accounting" },
      { label: "الذمم المدينة", to: "/ar", icon: HandCoins, deptCode: "accounting" },
      { label: "الذمم الدائنة", to: "/ap", icon: Wallet, deptCode: "accounting" },
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

export function AppSidebar() {
  const { canAccessDept, isManager } = useAuth();
  const { pathname } = useLocation();

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
          return (
            <div key={g.title} className="mb-3">
              <div className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {g.title}
              </div>
              {visibleItems.map((it) => {
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
                    <span>{it.label}</span>
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
