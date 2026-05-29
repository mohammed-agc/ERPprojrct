import { ReactNode } from "react";
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  ShieldCheck, LayoutDashboard, Users, KeyRound, ClipboardList, Building2,
  Warehouse, Receipt, ListOrdered, Printer, Database, FlaskConical, History,
  MonitorSmartphone, FileSearch, Percent,
} from "lucide-react";

interface NavItem { to: string; label: string; icon: any; }

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "نظرة عامة",
    items: [
      { to: "/admin", label: "لوحة المسؤول", icon: LayoutDashboard },
    ],
  },
  {
    title: "إدارة المستخدمين",
    items: [
      { to: "/admin/users", label: "المستخدمون", icon: Users },
      { to: "/admin/roles", label: "الأدوار", icon: ShieldCheck },
      { to: "/admin/permissions", label: "مصفوفة الصلاحيات", icon: KeyRound },
      { to: "/admin/sessions", label: "الجلسات النشطة", icon: MonitorSmartphone },
      { to: "/admin/login-history", label: "سجل تسجيل الدخول", icon: History },
    ],
  },
  {
    title: "التدقيق",
    items: [
      { to: "/admin/audit", label: "مركز التدقيق", icon: FileSearch },
    ],
  },
  {
    title: "إعدادات النظام",
    items: [
      { to: "/admin/settings/company", label: "بيانات الشركة", icon: Building2 },
      { to: "/admin/settings/branches", label: "الفروع", icon: Building2 },
      { to: "/admin/settings/warehouses", label: "المستودعات", icon: Warehouse },
      { to: "/admin/settings/tax", label: "إعدادات الضريبة", icon: Percent },
      { to: "/admin/settings/sequences", label: "تسلسل المستندات", icon: ListOrdered },
      { to: "/admin/settings/templates", label: "قوالب الطباعة", icon: Printer },
    ],
  },
  {
    title: "البيانات الرئيسية",
    items: [
      { to: "/admin/master-data", label: "مركز البيانات الرئيسية", icon: Database },
    ],
  },
  {
    title: "أدوات الاختبار",
    items: [
      { to: "/admin/uat", label: "أدوات UAT", icon: FlaskConical },
    ],
  },
];

function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function AdminLayout() {
  const { pathname } = useLocation();

  return (
    <RequireAdmin>
      <div className="flex gap-4 min-h-[calc(100vh-7rem)]">
        <aside className="w-56 shrink-0 bg-card border border-border rounded-lg p-2 h-fit sticky top-16">
          <div className="px-2 py-2 mb-1 border-b border-border">
            <div className="flex items-center gap-2 text-xs font-bold text-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" />
              مركز إدارة النظام
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">للمسؤولين فقط</div>
          </div>
          {SECTIONS.map((sec) => (
            <div key={sec.title} className="mb-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {sec.title}
              </div>
              {sec.items.map((it) => {
                const active = pathname === it.to;
                const Icon = it.icon;
                return (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.to === "/admin"}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                      "hover:bg-muted/60",
                      active && "bg-primary/10 text-primary font-medium"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{it.label}</span>
                  </NavLink>
                );
              })}
            </div>
          ))}
        </aside>
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </RequireAdmin>
  );
}
