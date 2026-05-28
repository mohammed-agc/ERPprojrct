import { useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Trophy, GitBranch, Percent, Calendar, TrendingUp } from "lucide-react";
import { salesService, fmtSAR } from "@/services/erp/sales";

function KpiCard({ icon: Icon, label, value, sub, tone = "default" }: any) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} /><span>{label}</span>
      </div>
      <div className={`text-2xl font-bold num ${c}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SalesAnalytics() {
  const a = useMemo(() => salesService.analytics(), []);

  return (
    <div>
      <PageHeader
        title="تحليلات أداء المبيعات"
        subtitle="مؤشرات الأداء، تحويل العروض، مقارنة الفروع، وترتيب المندوبين"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <KpiCard icon={Percent} label="نسبة تحويل العروض" value={`${a.quote_conversion.toFixed(1)}%`} tone="success" sub={`${a.quote_total} عرض`} />
        <KpiCard icon={Calendar} label="نسبة تحويل الحجوزات" value={`${a.reservation_conversion.toFixed(1)}%`} tone="primary" />
        <KpiCard icon={TrendingUp} label="نسبة العروض المنتهية" value={`${a.quote_expiry_rate.toFixed(1)}%`} tone={a.quote_expiry_rate > 20 ? "warning" : "default"} />
        <KpiCard icon={Trophy} label="عدد المندوبين" value={a.byPerson.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Salesperson ranking */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <Trophy className="h-4 w-4 text-warning" /> ترتيب المندوبين
          </div>
          <table className="erp-table">
            <thead><tr><th>#</th><th>المندوب</th><th>الإيراد</th><th>الربح</th><th>الهامش</th><th>التحقيق</th><th>التحويل</th></tr></thead>
            <tbody>
              {a.byPerson.map((p, i) => (
                <tr key={p.id}>
                  <td className={`text-[10px] font-bold ${i === 0 ? "text-warning" : "text-muted-foreground"}`}>#{i + 1}</td>
                  <td>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.branch}</div>
                  </td>
                  <td className="num text-xs">{fmtSAR(p.revenue_mtd)}</td>
                  <td className="num text-xs text-success">{fmtSAR(p.profit_mtd)}</td>
                  <td className="num text-xs">{p.margin.toFixed(1)}%</td>
                  <td className="w-[100px]">
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${p.attainment >= 100 ? "bg-success" : p.attainment >= 70 ? "bg-primary" : "bg-warning"}`} style={{ width: `${Math.min(100, p.attainment)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{p.achieved_monthly}/{p.target_monthly}</div>
                  </td>
                  <td className="num text-xs">{p.conversion.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Branch comparison */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-sm font-semibold">
            <GitBranch className="h-4 w-4 text-primary" /> مقارنة الفروع
          </div>
          <table className="erp-table">
            <thead><tr><th>الفرع</th><th>الإيراد</th><th>الربح</th><th>المركبات</th><th>التحقيق</th></tr></thead>
            <tbody>
              {a.branches.map(b => (
                <tr key={b.branch}>
                  <td className="text-sm font-medium">{b.branch}</td>
                  <td className="num text-xs">{fmtSAR(b.revenue)}</td>
                  <td className="num text-xs text-success">{fmtSAR(b.profit)}</td>
                  <td className="num text-xs">{b.achieved}/{b.target}</td>
                  <td className="w-[140px]">
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${b.attainment >= 100 ? "bg-success" : b.attainment >= 70 ? "bg-primary" : "bg-warning"}`} style={{ width: `${Math.min(100, b.attainment)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{b.attainment.toFixed(0)}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
