import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Car, Calendar, Truck, Banknote, AlertTriangle, Trophy, ArrowLeft, Clock } from "lucide-react";

const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("en-GB") : "—";
const fmtSAR = (n: number) => Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 0 }) + " ر.س";

// ─── KPI Card ─────────────────────────────────────────────────
function KPICard({ label, value, sub, icon: Icon, tone = "default" }: any) {
  const tones: Record<string, string> = {
    default: "bg-card border-border",
    green: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    rose: "bg-rose-50 border-rose-200",
    blue: "bg-blue-50 border-blue-200",
  };
  return (
    <div className={`border rounded-xl p-4 ${tones[tone]}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground mb-1">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
          {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
        </div>
        {Icon && <Icon className="h-8 w-8 text-muted-foreground/30" />}
      </div>
    </div>
  );
}

export default function SalesDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  // ─── Queries ──────────────────────────────────────────────
  const { data: orders = [] } = useQuery({
    queryKey: ["dash-orders"],
    queryFn: async () => (await supabase.from("sales_orders").select("id,total,status,created_at,customer_name,sales_rep_name,sales_rep_id,branch")).data ?? [],
    refetchInterval: 30000,
  });

  const { data: deliveries = [] } = useQuery({
    queryKey: ["dash-deliveries"],
    queryFn: async () => (await supabase.from("deliveries").select("*,contact:contacts(name),order:sales_orders(order_no)").order("scheduled_date")).data ?? [],
    refetchInterval: 30000,
  });

  const { data: reservations = [] } = useQuery({
    queryKey: ["dash-reservations"],
    queryFn: async () => (await supabase.from("reservations").select("id,status")).data ?? [],
    refetchInterval: 30000,
  });

  const { data: financing = [] } = useQuery({
    queryKey: ["dash-financing"],
    queryFn: async () => (await supabase.from("financing_applications").select("id,status")).data ?? [],
    refetchInterval: 30000,
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ["dash-quotes"],
    queryFn: async () => (await supabase.from("quotations").select("id,status,valid_until,total,customer_name,quote_no")).data ?? [],
    refetchInterval: 30000,
  });

  const { data: reps = [] } = useQuery({
    queryKey: ["dash-reps"],
    queryFn: async () => (await supabase.from("sales_reps").select("id,name,branch,monthly_target,achieved")).data ?? [],
  });

  // ─── KPIs ─────────────────────────────────────────────────
  const todayOrders = orders.filter(o => o.created_at?.slice(0, 10) === today && o.status !== "cancelled");
  const monthOrders = orders.filter(o => o.created_at >= startOfMonth && o.status !== "cancelled");
  const dailyRevenue = todayOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const monthRevenue = monthOrders.reduce((s, o) => s + Number(o.total || 0), 0);
  const soldVehicles = monthOrders.filter(o => o.status !== 'cancelled' && o.status !== 'draft').length;
  const activeReservations = (reservations as any[]).filter(r => r.status === "active" || r.status === "confirmed").length;
  const pendingDeliveries = (deliveries as any[]).filter(d => d.status !== "completed" && d.status !== "cancelled").length;
  const financeReview = (financing as any[]).filter(f => f.status === "under_review" || f.status === "submitted").length;

  // عروض قاربت الانتهاء
  const expiringQuotes = (quotes as any[]).filter(q => {
    if (!q.valid_until) return false;
    const h = (new Date(q.valid_until).getTime() - Date.now()) / 3600000;
    return h < 48 && h >= 0 && (q.status === "sent" || q.status === "negotiating");
  });

  // التسليمات القادمة
  const upcomingDeliveries = (deliveries as any[]).filter(d => d.status !== "completed" && d.status !== "cancelled").slice(0, 5);

  // أفضل المندوبين
  const repStats = (reps as any[]).map(r => {
    const repOrders = monthOrders.filter(o => o.sales_rep_id === r.id);
    const revenue = repOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const achieved = repOrders.filter(o => o.status !== 'cancelled' && o.status !== 'draft').length;
    return { ...r, revenue, achieved, pct: r.monthly_target ? Math.round((achieved / r.monthly_target) * 100) : 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  // حالة التسليم
  const DLV_LABEL: Record<string, string> = {
    scheduled: "مجدول", in_progress: "قيد التسليم", completed: "مكتمل", cancelled: "ملغي"
  };
  const DLV_TONE: Record<string, string> = {
    scheduled: "secondary", in_progress: "default", completed: "outline", cancelled: "destructive"
  };

  return (
    <div dir="rtl">
      <PageHeader title="لوحة المبيعات" subtitle="نظرة تنفيذية على العمليات اليومية، الحجوزات، التسليم، والتمويل" />

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 mb-6">
        <KPICard label="مبيعات اليوم" value={fmtSAR(dailyRevenue)} icon={TrendingUp} tone="green" />
        <KPICard label="مبيعات الشهر" value={fmtSAR(monthRevenue)} sub={`${soldVehicles} مركبة مباعة`} icon={TrendingUp} />
        <KPICard label="حجوزات نشطة" value={activeReservations} icon={Calendar} tone={activeReservations > 0 ? "amber" : "default"} />
        <KPICard label="تسليمات قيد العمل" value={pendingDeliveries} icon={Truck} tone={pendingDeliveries > 0 ? "blue" : "default"} />
        <KPICard label="تمويل قيد الدراسة" value={financeReview} icon={Banknote} tone={financeReview > 0 ? "amber" : "default"} />
        <KPICard label="عروض قاربت الانتهاء" value={expiringQuotes.length} icon={Clock} tone={expiringQuotes.length > 0 ? "rose" : "default"} />
        <KPICard label="أوامر بيع هذا الشهر" value={monthOrders.length} icon={Car} />
        <KPICard label="إجمالي الأوامر" value={orders.length} icon={Car} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-4 mb-6">
        {/* أفضل المندوبين */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="font-semibold text-sm">أفضل مندوبي البيع</span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">المندوب</th>
                <th className="text-right px-3 py-2 font-medium">الفرع</th>
                <th className="text-right px-3 py-2 font-medium">الإيراد</th>
                <th className="text-right px-3 py-2 font-medium">التحقيق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {repStats.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground text-xs">لا توجد بيانات</td></tr>
              ) : repStats.map((r, i) => (
                <tr key={r.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">#{i+1}</span>
                      <div>
                        <div className="font-medium">{r.name}</div>
                        <div className="text-xs text-muted-foreground">{r.achieved}/{r.monthly_target} مركبة</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{r.branch}</td>
                  <td className="px-3 py-2 text-sm font-medium">{fmtSAR(r.revenue)}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-muted rounded-full h-1.5">
                        <div className="bg-primary rounded-full h-1.5" style={{ width: `${Math.min(r.pct, 100)}%` }} />
                      </div>
                      <span className="text-xs font-mono w-8">{r.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* عروض قاربت الانتهاء */}
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-500" />
              <span className="font-semibold text-sm">عروض قاربت على الانتهاء</span>
            </div>
            <Link to="/sales/quotations" className="text-xs text-primary hover:underline flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">الرقم</th>
                <th className="text-right px-3 py-2 font-medium">العميل</th>
                <th className="text-right px-3 py-2 font-medium">القيمة</th>
                <th className="text-right px-3 py-2 font-medium">تنتهي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {expiringQuotes.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-6 text-muted-foreground text-xs">لا توجد عروض قاربت الانتهاء</td></tr>
              ) : expiringQuotes.map(q => (
                <tr key={q.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{q.quote_no}</td>
                  <td className="px-3 py-2 text-sm">{q.customer_name || "—"}</td>
                  <td className="px-3 py-2 text-sm">{fmtSAR(Number(q.total))}</td>
                  <td className="px-3 py-2 text-xs text-rose-600">{q.valid_until}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* التسليمات القادمة */}
      <div className="px-4 mb-6">
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="bg-muted/50 px-4 py-3 flex items-center justify-between border-b border-border">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-blue-500" />
              <span className="font-semibold text-sm">تسليمات قادمة</span>
            </div>
            <Link to="/sales/deliveries" className="text-xs text-primary hover:underline flex items-center gap-1">
              تنسيق التسليم <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">الرقم</th>
                <th className="text-right px-3 py-2 font-medium">أمر البيع</th>
                <th className="text-right px-3 py-2 font-medium">العميل</th>
                <th className="text-right px-3 py-2 font-medium">المركبة</th>
                <th className="text-right px-3 py-2 font-medium">الفرع</th>
                <th className="text-right px-3 py-2 font-medium">الموعد</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {upcomingDeliveries.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-6 text-muted-foreground text-xs">لا توجد تسليمات</td></tr>
              ) : upcomingDeliveries.map(d => (
                <tr key={d.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-xs">{d.delivery_no}</td>
                  <td className="px-3 py-2 font-mono text-xs">{d.order?.order_no || "—"}</td>
                  <td className="px-3 py-2 text-sm">{d.contact?.name || d.customer_name || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{d.vehicle_desc || "—"}</td>
                  <td className="px-3 py-2 text-xs">{d.branch || "—"}</td>
                  <td className="px-3 py-2 text-xs">{fmtDate(d.scheduled_date)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={DLV_TONE[d.status] as any ?? "secondary"}>
                      {DLV_LABEL[d.status] ?? d.status}
                    </Badge>
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



