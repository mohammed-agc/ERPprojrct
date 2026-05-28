import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Car, Calendar, Truck, Banknote, AlertTriangle,
  Trophy, ArrowLeft, Percent, ShoppingCart, FileText, Clock,
} from "lucide-react";
import {
  salesService, fmtSAR, fmtRelative, QUOTE_LABEL, QUOTE_TONE, DLV_LABEL, DLV_TONE,
} from "@/services/erp/sales";

function Kpi({ icon: Icon, label, value, tone = "default", sub, to }: {
  icon: any; label: string; value: string | number; sub?: string; to?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const c = tone === "success" ? "text-success"
    : tone === "warning" ? "text-warning"
    : tone === "destructive" ? "text-destructive"
    : tone === "primary" ? "text-primary" : "text-foreground";
  const inner = (
    <div className="border border-border bg-card rounded-lg p-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} />
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold num ${c}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function SalesDashboard() {
  const d = useMemo(() => salesService.dashboard(), []);
  const analytics = useMemo(() => salesService.analytics(), []);
  const expiringQuotes = useMemo(() =>
    salesService.listQuotations().filter(q => {
      const h = (new Date(q.valid_until).getTime() - Date.now()) / 3600_000;
      return (q.status === "sent" || q.status === "negotiated") && h >= 0 && h < 72;
    }).slice(0, 5), []);
  const upcomingDeliveries = useMemo(() =>
    salesService.listDeliveries().filter(x => x.status !== "completed").slice(0, 5), []);

  return (
    <div>
      <PageHeader
        title="لوحة المبيعات"
        subtitle="نظرة تنفيذية على العمليات اليومية، الحجوزات، التسليم، والتمويل"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
        <Kpi icon={TrendingUp} label="مبيعات اليوم" value={fmtSAR(d.daily_revenue)} tone="primary" />
        <Kpi icon={TrendingUp} label="مبيعات الشهر" value={fmtSAR(d.monthly_revenue)} tone="success" sub={`ربح ${fmtSAR(d.monthly_profit)}`} />
        <Kpi icon={Car} label="مركبات مباعة" value={d.sold_vehicles} tone="success" sub={`متوسط الربح ${fmtSAR(d.avg_profit_per_vehicle)}`} />
        <Kpi icon={Calendar} label="حجوزات نشطة" value={d.reserved} tone="warning" to="/sales/reservations" />
        <Kpi icon={Truck} label="تسليمات قيد العمل" value={d.pending_deliveries} tone="primary" to="/sales/deliveries" />
        <Kpi icon={Banknote} label="تمويل قيد الدراسة" value={d.fin_review} tone="warning" to="/sales/financing" />
        <Kpi icon={Clock} label="عروض قاربت الانتهاء" value={d.expiring_quotes} tone="warning" to="/sales/quotations" />
        <Kpi icon={Percent} label="خصومات بانتظار الاعتماد" value={d.discount_pending} tone={d.discount_pending ? "destructive" : "default"} to="/sales/quotations" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top salespersons */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-warning" /> أفضل مندوبي البيع
            </div>
            <Link to="/sales/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
              التحليلات <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>المندوب</th><th>الفرع</th><th>الإيراد</th><th>الربح</th><th>التحقيق</th></tr></thead>
            <tbody>
              {analytics.byPerson.slice(0, 5).map((p, i) => (
                <tr key={p.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold w-4 ${i === 0 ? "text-warning" : "text-muted-foreground"}`}>#{i + 1}</span>
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-[10px] text-muted-foreground">{p.achieved_monthly}/{p.target_monthly} مركبة</div>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs">{p.branch}</td>
                  <td className="num text-xs">{fmtSAR(p.revenue_mtd)}</td>
                  <td className="num text-xs text-success">{fmtSAR(p.profit_mtd)}</td>
                  <td className="w-[120px]">
                    <div className="h-1.5 bg-muted rounded overflow-hidden">
                      <div className={`h-full ${p.attainment >= 100 ? "bg-success" : p.attainment >= 70 ? "bg-primary" : "bg-warning"}`} style={{ width: `${Math.min(100, p.attainment)}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{p.attainment.toFixed(0)}%</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expiring quotes */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" /> عروض قاربت على الانتهاء
            </div>
            <Link to="/sales/quotations" className="text-xs text-primary hover:underline flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>العميل</th><th>القيمة</th><th>تنتهي</th><th>الحالة</th></tr></thead>
            <tbody>
              {expiringQuotes.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">لا توجد عروض قاربت الانتهاء</td></tr>}
              {expiringQuotes.map(q => (
                <tr key={q.id}>
                  <td className="font-mono text-[11px]">{q.code}</td>
                  <td className="text-xs">{q.customer}</td>
                  <td className="num text-xs">{fmtSAR(q.net_price)}</td>
                  <td className="text-xs text-warning">{fmtRelative(q.valid_until)}</td>
                  <td><Badge className={QUOTE_TONE[q.status]}>{QUOTE_LABEL[q.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Upcoming deliveries */}
        <div className="bg-card border border-border rounded-lg overflow-hidden lg:col-span-2">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-primary" /> تسليمات قادمة
            </div>
            <Link to="/sales/deliveries" className="text-xs text-primary hover:underline flex items-center gap-1">
              تنسيق التسليم <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>أمر البيع</th><th>العميل</th><th>المركبة</th><th>الفرع</th><th>الموعد</th><th>الجهوزية</th><th>الحالة</th></tr></thead>
            <tbody>
              {upcomingDeliveries.map(dl => {
                const done = dl.checklist.filter(c => c.done).length;
                const pct = (done / dl.checklist.length) * 100;
                return (
                  <tr key={dl.id}>
                    <td className="font-mono text-[11px]">{dl.code}</td>
                    <td className="font-mono text-[11px]">{dl.so_code}</td>
                    <td className="text-xs">{dl.customer}</td>
                    <td className="text-xs">{dl.vehicle}</td>
                    <td className="text-xs">{dl.branch}</td>
                    <td className="text-xs">{fmtRelative(dl.scheduled_at)}</td>
                    <td className="w-[100px]">
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div className={`h-full ${pct === 100 ? "bg-success" : pct >= 50 ? "bg-primary" : "bg-warning"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{done}/{dl.checklist.length}</div>
                    </td>
                    <td><Badge className={DLV_TONE[dl.status]}>{DLV_LABEL[dl.status]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
