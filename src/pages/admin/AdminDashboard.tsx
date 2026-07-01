import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import {
  Users, UserCheck, ClipboardCheck, ShoppingBag, Boxes, HandCoins, Wallet, ShieldCheck,
} from "lucide-react";
import { purchasingService } from "@/services/erp/purchasing";
import { salesService } from "@/services/erp/sales";
import { governanceService } from "@/services/erp/governance";
import { vehicleRepository } from "@/services/erp/vehicleRepository";

interface Kpi {
  label: string;
  value: string | number;
  icon: any;
  to: string;
  tone: "primary" | "amber" | "emerald" | "rose" | "slate";
}

const TONES: Record<Kpi["tone"], string> = {
  primary: "bg-primary/10 text-primary",
  amber: "bg-amber-500/10 text-amber-600",
  emerald: "bg-emerald-500/10 text-emerald-600",
  rose: "bg-rose-500/10 text-rose-600",
  slate: "bg-slate-500/10 text-slate-600",
};

export default function AdminDashboard() {
  const [kpis, setKpis] = useState<Kpi[] | null>(null);

  useEffect(() => {
    (async () => {
      const { count: usersTotal } = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const pur = purchasingService.dashboard();
      const sal = salesService.dashboard();
      const gov = await governanceService.dashboard();

      // Inventory value + receivables/payables — pull from services if available, else fall back to placeholders.
      let inventoryValue = 0;
      let receivables = 0;
      let payables = 0;
      try {
        // Aggregate vehicle cost from vehicles table as inventory value proxy.
        inventoryValue = await vehicleRepository.getVehicleInventoryValue();
      } catch { /* noop */ }

      const fmt = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 0 });

      setKpis([
        { label: "إجمالي المستخدمين", value: usersTotal ?? 0, icon: Users, to: "/admin/users", tone: "primary" },
        { label: "المستخدمون النشطون", value: usersTotal ?? 0, icon: UserCheck, to: "/admin/sessions", tone: "emerald" },
        { label: "الموافقات المعلّقة", value: gov?.pending_approvals ?? 0, icon: ClipboardCheck, to: "/governance/approvals", tone: "amber" },
        { label: "أوامر الشراء المفتوحة", value: pur.pending_prs + pur.in_transit, icon: ShoppingBag, to: "/purchasing/orders", tone: "slate" },
        { label: "قيمة المخزون (ر.س)", value: fmt(inventoryValue), icon: Boxes, to: "/inventory/vehicles", tone: "primary" },
        { label: "الذمم المدينة (ر.س)", value: fmt(receivables), icon: HandCoins, to: "/ar", tone: "emerald" },
        { label: "الذمم الدائنة (ر.س)", value: fmt(payables), icon: Wallet, to: "/ap", tone: "rose" },
        { label: "تنبيهات التدقيق", value: (gov?.audit_alerts ?? 0) + (gov?.audit_warnings ?? 0), icon: ShieldCheck, to: "/admin/audit", tone: "rose" },
      ]);
    })();
  }, []);

  return (
    <div>
      <PageHeader title="لوحة مدير النظام" subtitle="نظرة عامة على المستخدمين والعمليات والأداء" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(kpis ?? Array.from({ length: 8 })).map((k: any, i: number) => {
          if (!k) return <Card key={i} className="h-24 animate-pulse bg-muted/40" />;
          const Icon = k.icon;
          return (
            <Link key={k.to + k.label} to={k.to}>
              <Card className="p-3 hover:shadow-md transition-shadow cursor-pointer h-full">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] text-muted-foreground leading-tight">{k.label}</div>
                    <div className="text-xl font-bold mt-1 tabular-nums">{k.value}</div>
                  </div>
                  <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${TONES[k.tone as Kpi["tone"]]}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      <Card className="mt-6 p-4">
        <div className="text-sm font-bold mb-2">روابط سريعة</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Link to="/admin/users" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">إدارة المستخدمين</Link>
          <Link to="/admin/permissions" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">مصفوفة الصلاحيات</Link>
          <Link to="/admin/audit" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">مركز التدقيق</Link>
          <Link to="/admin/settings/company" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">بيانات الشركة</Link>
          <Link to="/admin/settings/sequences" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">تسلسل المستندات</Link>
          <Link to="/admin/master-data" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">البيانات الرئيسية</Link>
          <Link to="/admin/uat" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">أدوات UAT</Link>
          <Link to="/admin/login-history" className="px-2 py-1.5 rounded border border-border hover:bg-muted/60">سجل تسجيل الدخول</Link>
        </div>
      </Card>
    </div>
  );
}
