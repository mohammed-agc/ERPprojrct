import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { costing, type CenterAnalytics, type PeriodMode, periodLabel } from "@/services/erp/costing";
import { fmtCompact, fmtSAR } from "@/lib/erpFormat";
import { Download, TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  scope: "branch" | "department";
  title: string;
  subtitle: string;
}

const exportCsv = (rows: CenterAnalytics[], title: string) => {
  const header = ["الكود", "المركز", "الإيراد", "تكلفة المبيعات", "المصروفات", "الربح الإجمالي", "الربح الصافي", "هامش إجمالي %", "هامش صافي %"];
  const lines = rows.map(r => [r.center.code, r.center.name_ar, r.revenue, r.cogs, r.opex, r.gross, r.net, r.gross_margin.toFixed(2), r.net_margin.toFixed(2)].join(","));
  const blob = new Blob(["\ufeff" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title}.csv`; a.click();
};

const Bar = ({ pct, tone }: { pct: number; tone: "good" | "bad" | "warn" }) => {
  const w = Math.min(100, Math.max(0, Math.abs(pct)));
  const cls = tone === "good" ? "bg-success" : tone === "bad" ? "bg-destructive" : "bg-warning";
  return (
    <div className="h-1.5 bg-muted rounded overflow-hidden w-24">
      <div className={`h-full ${cls}`} style={{ width: `${w}%` }} />
    </div>
  );
};

export default function CenterProfitability({ scope, title, subtitle }: Props) {
  const [period, setPeriod] = useState<PeriodMode>("ytd");
  const [quarter, setQuarter] = useState("1");
  const [data, setData] = useState<CenterAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const p = scope === "branch" ? costing.branchAnalytics(period, Number(quarter)) : costing.departmentAnalytics(period, Number(quarter));
    p.then(setData).finally(() => setLoading(false));
  }, [scope, period, quarter]);

  const totals = useMemo(() => data.reduce((a, r) => ({
    revenue: a.revenue + r.revenue, cogs: a.cogs + r.cogs, opex: a.opex + r.opex,
    gross: a.gross + r.gross, net: a.net + r.net,
  }), { revenue: 0, cogs: 0, opex: 0, gross: 0, net: 0 }), [data]);
  const totalNetMargin = totals.revenue > 0 ? (totals.net / totals.revenue) * 100 : 0;

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        sticky
        actions={
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(v: PeriodMode) => setPeriod(v)}>
              <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(periodLabel) as PeriodMode[]).map(p => (
                  <SelectItem key={p} value={p}>{periodLabel[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {period === "q" && (
              <Select value={quarter} onValueChange={setQuarter}>
                <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4].map(q => <SelectItem key={q} value={String(q)}>الربع {q}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => exportCsv(data, title)}>
              <Download className="h-3.5 w-3.5 ml-1" /> CSV
            </Button>
          </div>
        }
      />

      {/* KPI summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <KPI label="إجمالي الإيرادات" value={fmtCompact(totals.revenue)} tone="good" />
        <KPI label="تكلفة المبيعات" value={fmtCompact(totals.cogs)} />
        <KPI label="المصروفات التشغيلية" value={fmtCompact(totals.opex)} />
        <KPI label="الربح الإجمالي" value={fmtCompact(totals.gross)} tone={totals.gross >= 0 ? "good" : "bad"} />
        <KPI label={`الربح الصافي (${totalNetMargin.toFixed(1)}%)`} value={fmtCompact(totals.net)} tone={totals.net >= 0 ? "good" : "bad"} />
      </div>

      {/* Table */}
      <div className="bg-card border rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="text-right p-2">المركز</th>
              <th className="text-right p-2">الإيراد</th>
              <th className="text-right p-2">تكلفة المبيعات</th>
              <th className="text-right p-2">المصروفات</th>
              <th className="text-right p-2">ربح إجمالي</th>
              <th className="text-right p-2">ربح صافي</th>
              <th className="text-right p-2 w-32">هامش صافي</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6">جارٍ التحميل…</td></tr>
            ) : !data.length ? (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6">لا توجد بيانات</td></tr>
            ) : data
              .sort((a, b) => b.net - a.net)
              .map(r => (
                <tr key={r.center.id} className="border-t hover:bg-muted/30">
                  <td className="p-2">
                    <div className="font-medium">{r.center.name_ar}</div>
                    <div className="text-[11.5px] text-muted-foreground font-mono">{r.center.code}{r.center.manager ? ` · ${r.center.manager}` : ""}</div>
                  </td>
                  <td className="p-2 text-left tabular-nums">{fmtSAR(r.revenue)}</td>
                  <td className="p-2 text-left tabular-nums text-muted-foreground">{fmtSAR(r.cogs)}</td>
                  <td className="p-2 text-left tabular-nums text-muted-foreground">{fmtSAR(r.opex)}</td>
                  <td className={`p-2 text-left tabular-nums ${r.gross >= 0 ? "text-success" : "text-destructive"}`}>{fmtSAR(r.gross)}</td>
                  <td className={`p-2 text-left tabular-nums font-semibold ${r.net >= 0 ? "text-success" : "text-destructive"}`}>{fmtSAR(r.net)}</td>
                  <td className="p-2">
                    <div className="flex items-center gap-2 justify-end">
                      <Bar pct={r.net_margin} tone={r.net_margin >= 15 ? "good" : r.net_margin >= 0 ? "warn" : "bad"} />
                      <span className={`text-xs tabular-nums ${r.net_margin >= 0 ? "" : "text-destructive"}`}>{r.net_margin.toFixed(1)}%</span>
                      {r.net_margin >= 0
                        ? <TrendingUp className="h-3 w-3 text-success" />
                        : <TrendingDown className="h-3 w-3 text-destructive" />}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KPI({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const cls = tone === "good" ? "border-success/40 bg-success/5" : tone === "bad" ? "border-destructive/40 bg-destructive/5" : "border-border";
  return (
    <div className={`bg-card border rounded-md p-3 ${cls}`}>
      <div className="text-[12px] text-muted-foreground font-medium">{label}</div>
      <div className="text-lg font-bold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

export const DepartmentProfitability = () => (
  <CenterProfitability scope="department" title="ربحية الأقسام" subtitle="تحليل أداء الأقسام التشغيلية والداعمة" />
);
export const BranchProfitability = () => (
  <CenterProfitability scope="branch" title="ربحية الفروع" subtitle="مقارنة أداء الفروع وهوامش الربح" />
);