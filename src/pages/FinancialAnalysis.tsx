import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { costing, type CenterAnalytics, type PeriodMode, periodLabel, centerKindColor, centerKindLabel } from "@/services/erp/costing";
import { fmtCompact } from "@/lib/erpFormat";
import { TrendingUp, TrendingDown, Building2, Trophy, AlertTriangle, Activity } from "lucide-react";
import { Link } from "react-router-dom";

export default function FinancialAnalysis() {
  const [period, setPeriod] = useState<PeriodMode>("ytd");
  const [all, setAll] = useState<CenterAnalytics[]>([]);
  const [trend, setTrend] = useState<{ month: string; revenue: number; cost: number; net: number }[]>([]);

  useEffect(() => {
    costing.analytics(period).then(setAll);
    costing.monthlyTrend().then(setTrend);
  }, [period]);

  const totals = useMemo(() => all.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, cost: a.cost + r.cogs + r.opex, net: a.net + r.net,
  }), { revenue: 0, cost: 0, net: 0 }), [all]);

  const branches = all.filter(a => a.center.kind === "branch");
  const departments = all.filter(a => a.center.kind !== "branch");
  const topProfitable = [...departments].sort((a, b) => b.net - a.net).slice(0, 4);
  const topExpense = [...all].sort((a, b) => (b.cogs + b.opex) - (a.cogs + a.opex)).slice(0, 4);

  const max = Math.max(1, ...trend.map(t => Math.max(t.revenue, t.cost)));

  return (
    <div>
      <PageHeader
        title="لوحة التحليل المالي التنفيذي"
        subtitle="رؤية تنفيذية شاملة للأداء المالي حسب الأقسام والفروع"
        sticky
        actions={
          <Select value={period} onValueChange={(v: PeriodMode) => setPeriod(v)}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(periodLabel) as PeriodMode[]).map(p => (
                <SelectItem key={p} value={p}>{periodLabel[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Kpi label="إجمالي الإيرادات" value={fmtCompact(totals.revenue)} icon={TrendingUp} tone="good" />
        <Kpi label="إجمالي التكاليف" value={fmtCompact(totals.cost)} icon={TrendingDown} tone="bad" />
        <Kpi label="صافي الربح" value={fmtCompact(totals.net)} icon={Activity}
             tone={totals.net >= 0 ? "good" : "bad"}
             sub={`${totals.revenue > 0 ? ((totals.net / totals.revenue) * 100).toFixed(1) : 0}% هامش`} />
        <Kpi label="نسبة المصروفات للإيراد" value={`${totals.revenue > 0 ? ((totals.cost / totals.revenue) * 100).toFixed(1) : 0}%`} icon={Activity} tone="warn" />
      </div>

      {/* Trend chart */}
      <div className="bg-card border rounded-md p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold">اتجاه الأداء الشهري (12 شهر)</div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-success rounded-sm" /> إيرادات</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-destructive rounded-sm" /> تكاليف</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-primary rounded-sm" /> صافي</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-40">
          {trend.map(t => (
            <div key={t.month} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="flex items-end gap-0.5 w-full justify-center h-32">
                <div className="w-2 bg-success rounded-t-sm" style={{ height: `${(t.revenue / max) * 100}%` }} title={`إيراد: ${fmtCompact(t.revenue)}`} />
                <div className="w-2 bg-destructive rounded-t-sm" style={{ height: `${(t.cost / max) * 100}%` }} title={`تكلفة: ${fmtCompact(t.cost)}`} />
                <div className="w-2 bg-primary rounded-t-sm" style={{ height: `${Math.max(0, t.net / max) * 100}%` }} title={`صافي: ${fmtCompact(t.net)}`} />
              </div>
              <div className="text-[11.5px] text-muted-foreground">{t.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Three column analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <RankCard title="أعلى الأقسام ربحية" icon={Trophy} items={topProfitable} valueKey="net" tone="good" />
        <RankCard title="أعلى مراكز الإنفاق" icon={AlertTriangle} items={topExpense} valueKey="cost" tone="bad" />

        {/* Branches */}
        <div className="bg-card border rounded-md p-3">
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-4 w-4 text-primary" />
            <div className="text-sm font-semibold">أداء الفروع</div>
          </div>
          <div className="space-y-2">
            {branches.sort((a, b) => b.net - a.net).map(b => (
              <Link key={b.center.id} to="/costing/branches"
                    className="block p-2 border rounded hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{b.center.name_ar}</span>
                  <Badge variant="outline" className={`text-[11.5px] ${b.net >= 0 ? "border-success text-success" : "border-destructive text-destructive"}`}>
                    {b.net_margin.toFixed(1)}%
                  </Badge>
                </div>
                <div className="flex justify-between text-[12px] text-muted-foreground tabular-nums">
                  <span>إيراد {fmtCompact(b.revenue)}</span>
                  <span className={b.net >= 0 ? "text-success" : "text-destructive"}>صافي {fmtCompact(b.net)}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue mix */}
      <div className="bg-card border rounded-md p-4 mt-4">
        <div className="text-sm font-semibold mb-3">مزيج الإيرادات حسب المركز</div>
        <div className="space-y-1.5">
          {departments.filter(d => d.revenue > 0).sort((a, b) => b.revenue - a.revenue).map(d => {
            const pct = totals.revenue > 0 ? (d.revenue / departments.reduce((s, x) => s + x.revenue, 0)) * 100 : 0;
            return (
              <div key={d.center.id} className="flex items-center gap-3">
                <div className="w-40 text-xs truncate">{d.center.name_ar}</div>
                <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                  <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
                <div className="w-20 text-left text-xs tabular-nums">{pct.toFixed(1)}%</div>
                <div className="w-20 text-left text-xs tabular-nums text-muted-foreground">{fmtCompact(d.revenue)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, icon: Icon, tone = "default" }: any) {
  const cls = { default: "border-border", good: "border-success/40 bg-success/5", bad: "border-destructive/40 bg-destructive/5", warn: "border-warning/40 bg-warning/5" }[tone];
  return (
    <div className={`bg-card border rounded-md p-3 ${cls}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground font-medium">{label}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function RankCard({ title, icon: Icon, items, valueKey, tone }: {
  title: string; icon: any; items: CenterAnalytics[];
  valueKey: "net" | "cost"; tone: "good" | "bad";
}) {
  return (
    <div className="bg-card border rounded-md p-3">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${tone === "good" ? "text-success" : "text-destructive"}`} />
        <div className="text-sm font-semibold">{title}</div>
      </div>
      <div className="space-y-2">
        {items.map((r, i) => {
          const v = valueKey === "net" ? r.net : r.cogs + r.opex;
          return (
            <div key={r.center.id} className="flex items-center justify-between p-2 border rounded">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-muted text-[11.5px] flex items-center justify-center font-bold">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{r.center.name_ar}</div>
                  <Badge variant="outline" className={`text-[11.5px] ${centerKindColor[r.center.kind]}`}>{centerKindLabel[r.center.kind]}</Badge>
                </div>
              </div>
              <div className={`text-sm font-semibold tabular-nums ${tone === "good" ? "text-success" : "text-destructive"}`}>{fmtCompact(v)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
