import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trophy, Target, TrendingUp, Info, Search, Sparkles, ExternalLink, ShieldAlert, Loader2 } from "lucide-react";
import { purchasingService, fmtSAR, fmtDate, type IncentiveProgramStatus } from "@/services/erp/purchasing";
import { useIncentivePermissions } from "@/lib/incentivePermissions";
import { checkIncentiveAccess } from "@/lib/incentiveAuthzApi";

const STATUS_LABEL: Record<IncentiveProgramStatus, string> = {
  active: "نشط", closed: "مغلق", achieved: "محقق",
};
const STATUS_TONE: Record<IncentiveProgramStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  closed: "bg-muted text-muted-foreground border border-border",
  achieved: "bg-success/10 text-success border border-success/40",
};

export default function SupplierIncentives() {
  const perms = useIncentivePermissions();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | IncentiveProgramStatus>("all");

  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const programs = useMemo(() => purchasingService.listIncentivePrograms(), []);

  const rows = useMemo(() => {
    return programs.map(p => {
      const sup = suppliers.find(s => s.id === p.supplier_id);
      const perf = purchasingService.programPerformance(p);
      return { program: p, supplier: sup, perf };
    });
  }, [programs, suppliers]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter(r => {
      if (statusFilter !== "all" && r.program.status !== statusFilter) return false;
      if (!qv) return true;
      return `${r.program.name} ${r.supplier?.name ?? ""} ${r.program.brand ?? ""} ${r.program.model ?? ""}`
        .toLowerCase().includes(qv);
    });
  }, [rows, q, statusFilter]);

  const totals = useMemo(() => ({
    programs: filtered.length,
    target: filtered.reduce((s, r) => s + r.perf.target, 0),
    purchased: filtered.reduce((s, r) => s + r.perf.purchased, 0),
    earned: filtered.reduce((s, r) => s + r.perf.earned, 0),
    claimed: filtered.reduce((s, r) => s + r.perf.claimed, 0),
    remaining: filtered.reduce((s, r) => s + r.perf.remaining_incentive, 0),
  }), [filtered]);

  if (!perms.canView) {
    return (
      <div>
        <PageHeader title="حوافز الموردين" subtitle="وصول مقيّد" />
        <div className="bg-destructive/5 border border-destructive/30 rounded-lg p-6 text-center">
          <ShieldAlert className="h-8 w-8 text-destructive mx-auto mb-2" />
          <div className="text-sm font-semibold mb-1">لا تملك صلاحية الوصول</div>
          <div className="text-xs text-muted-foreground">
            هذه الشاشة مخصصة لمستخدمي إدارة المشتريات أو المحاسبة فقط.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="حوافز الموردين"
        subtitle="تقرير الأداء والحوافز المكتسبة لكل برنامج — يُحتسب من فواتير الشراء المعتمدة فقط"
      />


      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <b>الحوافز</b> تُتابع منفصلة عن <b>الحد الائتماني</b>.
          عند تحقيق الهدف يصبح البرنامج <b>مؤهلًا للمطالبة</b> ويمكن إنشاء مطالبة حافز
          (تسوية بالذمم) أو خصمها من الحد الائتماني للمورد.
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <Kpi icon={Target} label="عدد البرامج" value={`${totals.programs}`} tone="primary" />
        <Kpi icon={Target} label="إجمالي الأهداف" value={`${totals.target}`} tone="primary" />
        <Kpi icon={TrendingUp} label="المُشترى" value={`${totals.purchased}`} tone="success" />
        <Kpi icon={Trophy} label="حافز مكتسب" value={fmtSAR(totals.earned)} tone="success" />
        <Kpi icon={Sparkles} label="مُطالب به" value={fmtSAR(totals.claimed)} tone="warning" />
        <Kpi icon={Trophy} label="متبقي للمطالبة" value={fmtSAR(totals.remaining)} tone="success" />
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: برنامج، مورد، علامة..."
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">نشط</SelectItem>
            <SelectItem value="achieved">محقق</SelectItem>
            <SelectItem value="closed">مغلق</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} برنامج</div>
      </div>

      {/* Report */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table text-xs">
          <thead>
            <tr>
              <th>المورد</th>
              <th>البرنامج</th>
              <th>الفترة</th>
              <th className="text-center">الهدف</th>
              <th className="text-center">المُشترى</th>
              <th className="text-center">التحقق</th>
              <th className="text-left">حافز/مركبة</th>
              <th className="text-left">مكتسب</th>
              <th className="text-left">مُطالب به</th>
              <th className="text-left">متبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="text-center text-muted-foreground py-8">
                لا توجد برامج حوافز. أنشئ برنامجًا من صفحة المورد (جهات الاتصال ← مورد ← ذكاء المورد ← برامج الحوافز).
              </td></tr>
            )}
            {filtered.map(({ program, supplier, perf }) => (
              <tr key={program.id}>
                <td>
                  <div className="font-medium">{supplier?.name ?? "—"}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{supplier?.code}</div>
                </td>
                <td>
                  <div className="font-medium">{program.name}</div>
                  {(program.brand || program.model) && (
                    <div className="text-[10px] text-muted-foreground">
                      {[program.brand, program.model].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <div>{fmtDate(program.start_date)}</div>
                  <div className="text-muted-foreground">→ {fmtDate(program.end_date)}</div>
                </td>
                <td className="text-center font-semibold num tabular-nums">{perf.target}</td>
                <td className={`text-center font-semibold num tabular-nums ${perf.eligible ? "text-success" : ""}`}>{perf.purchased}</td>
                <td className="text-center">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`num tabular-nums font-semibold ${perf.eligible ? "text-success" : perf.achievement > 70 ? "text-warning" : "text-muted-foreground"}`}>
                      {perf.achievement.toFixed(0)}%
                    </span>
                    <div className="h-1 w-16 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${perf.eligible ? "bg-success" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, perf.achievement)}%` }} />
                    </div>
                  </div>
                </td>
                <td className="num text-left tabular-nums">{fmtSAR(program.incentive_per_vehicle)}</td>
                <td className="num text-left tabular-nums font-semibold text-success">{fmtSAR(perf.earned)}</td>
                <td className="num text-left tabular-nums text-warning">{fmtSAR(perf.claimed)}</td>
                <td className="num text-left tabular-nums font-semibold">{fmtSAR(perf.remaining_incentive)}</td>
                <td>
                  <div className="flex flex-col gap-0.5 items-start">
                    <Badge className={STATUS_TONE[program.status]}>{STATUS_LABEL[program.status]}</Badge>
                    {perf.eligible && program.status !== "closed" && (
                      <Badge className="bg-amber-500/10 text-amber-700 border border-amber-400/40 gap-1 text-[10px]">
                        <Sparkles className="h-2.5 w-2.5" /> مؤهل
                      </Badge>
                    )}
                  </div>
                </td>
                <td>
                  {supplier && (
                    <Link to={`/contacts`} className="text-primary hover:underline text-[11px] inline-flex items-center gap-1">
                      <ExternalLink className="h-3 w-3" /> فتح
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: string | number;
  tone?: "default" | "success" | "warning" | "primary";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} /><span>{label}</span>
      </div>
      <div className={`text-base font-bold num tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
