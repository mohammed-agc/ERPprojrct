import { useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Trophy, Target, TrendingUp, Info } from "lucide-react";
import { purchasingService, fmtSAR } from "@/services/erp/purchasing";

export default function SupplierIncentives() {
  const suppliers = useMemo(
    () => purchasingService.listSuppliers().filter(s => s.monthly_target > 0),
    [],
  );

  const totals = useMemo(() => {
    const expected = suppliers.reduce((s, x) => s + x.achieved * x.incentive_per_vehicle, 0);
    const achievedAll = suppliers.reduce((s, x) => s + x.achieved, 0);
    const targetAll = suppliers.reduce((s, x) => s + x.monthly_target, 0);
    return { expected, achievedAll, targetAll };
  }, [suppliers]);

  return (
    <div>
      <PageHeader
        title="حوافز الموردين"
        subtitle="تتبع الأهداف الشهرية والحوافز المتوقعة لخصمها من المستحقات"
      />

      <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div>
          الحوافز <span className="font-semibold">تُخصم من ذمم المورد الدائنة</span> ولا تُسدد مباشرة.
          يتم احتساب الحافز بناءً على عدد المركبات المُحققة من الهدف الشهري.
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Kpi icon={Target} label="إجمالي الأهداف الشهرية" value={`${totals.targetAll} مركبة`} tone="primary" />
        <Kpi icon={TrendingUp} label="المُحقق" value={`${totals.achievedAll} مركبة`} tone="success" />
        <Kpi icon={Trophy} label="الحوافز المتوقعة" value={fmtSAR(totals.expected)} tone="success" />
        <Kpi icon={Info} label="موردون مع حملات" value={suppliers.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {suppliers.map(s => {
          const pct = (s.achieved / s.monthly_target) * 100;
          const overAchieved = s.achieved >= s.monthly_target;
          const incentive = s.achieved * s.incentive_per_vehicle;
          return (
            <div key={s.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm">{s.name}</div>
                  {s.campaign && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                      <Trophy className="h-3 w-3 text-warning" /> {s.campaign}
                    </div>
                  )}
                </div>
                {overAchieved && (
                  <Badge className="bg-success/10 text-success border border-success/40">حقق الهدف</Badge>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Cell label="الهدف" value={`${s.monthly_target}`} sub="مركبة/شهر" />
                <Cell label="المُحقق" value={`${s.achieved}`} sub="مركبة" tone={overAchieved ? "success" : "warning"} />
                <Cell label="حافز/مركبة" value={fmtSAR(s.incentive_per_vehicle)} sub="من المستحقات" />
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>التقدم نحو الهدف</span>
                  <span className={`num font-semibold ${overAchieved ? "text-success" : pct > 70 ? "text-warning" : "text-muted-foreground"}`}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className={`h-full ${overAchieved ? "bg-success" : "bg-primary"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-xs text-muted-foreground">حافز متوقع هذا الشهر</span>
                <span className="num font-bold text-success">{fmtSAR(incentive)}</span>
              </div>
            </div>
          );
        })}
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
      <div className={`text-lg font-bold num ${c}`}>{value}</div>
    </div>
  );
}

function Cell({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string;
  tone?: "default" | "success" | "warning";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold num ${c}`}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
