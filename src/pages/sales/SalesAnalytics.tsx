import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { TrendingUp, Receipt, Wallet, Clock, Users, BarChart3, Percent } from "lucide-react";

const fmtSAR = (n: number) => Math.round(Number(n || 0)).toLocaleString("en-US") + " ر.س";
const monthKey = (iso: string) => (iso || "").slice(0, 7); // YYYY-MM
const monthLabel = (k: string) => {
  if (!k) return "—";
  const [y, m] = k.split("-");
  const names = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  return `${names[Number(m) - 1] ?? m} ${y}`;
};

interface Inv {
  id: string; total: number; subtotal: number; vat_amount: number;
  paid_amount: number; status: string; invoice_date: string; customer_id: string | null;
}

function Kpi({ icon: Icon, label, value, sub, tone = "default" }: any) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning"
    : tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} /><span>{label}</span>
      </div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function SalesAnalytics() {
  const [invoices, setInvoices] = useState<Inv[]>([]);
  const [custNames, setCustNames] = useState<Record<string, string>>({});
  const [quoteStats, setQuoteStats] = useState({ total: 0, converted: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: invs } = await supabase
        .from("invoices")
        .select("id, total, subtotal, vat_amount, paid_amount, status, invoice_date, customer_id")
        .neq("status", "cancelled")
        .order("invoice_date", { ascending: false });
      const list = (invs ?? []) as Inv[];
      setInvoices(list);

      const custIds = Array.from(new Set(list.map(i => i.customer_id).filter(Boolean))) as string[];
      if (custIds.length) {
        const { data: cs } = await supabase.from("contacts").select("id, name").in("id", custIds);
        setCustNames(Object.fromEntries((cs ?? []).map((c: any) => [c.id, c.name])));
      }

      // نسبة تحويل العروض (إن وُجد جدول quotations)
      try {
        const { data: qs } = await supabase.from("quotations").select("status");
        if (qs) {
          const total = qs.length;
          const converted = qs.filter((q: any) => q.status === "converted" || q.status === "accepted").length;
          setQuoteStats({ total, converted });
        }
      } catch { /* الجدول غير موجود — تجاهل */ }

      setLoading(false);
    })();
  }, []);

  const a = useMemo(() => {
    // المبيعات المحقّقة = الفواتير المدفوعة بالكامل فقط
    const paid = invoices.filter(i => i.status === "paid");
    const realizedRevenue = paid.reduce((s, i) => s + Number(i.total), 0);
    const realizedNet = paid.reduce((s, i) => s + Number(i.subtotal), 0);
    const realizedVat = paid.reduce((s, i) => s + Number(i.vat_amount), 0);

    // المفوتر غير المحصّل (للعلم فقط — لا يُحتسب مبيعات محقّقة)
    const unpaid = invoices.filter(i => i.status !== "paid");
    const outstanding = unpaid.reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount ?? 0)), 0);
    const collectedFromPartial = invoices.filter(i => i.status !== "paid")
      .reduce((s, i) => s + Number(i.paid_amount ?? 0), 0);

    const paidCount = paid.length;
    const avgInvoice = paidCount ? realizedRevenue / paidCount : 0;

    // حسب الشهر (من الفواتير المدفوعة)
    const byMonthMap = new Map<string, { revenue: number; count: number }>();
    for (const i of paid) {
      const k = monthKey(i.invoice_date);
      const prev = byMonthMap.get(k) ?? { revenue: 0, count: 0 };
      prev.revenue += Number(i.total); prev.count += 1;
      byMonthMap.set(k, prev);
    }
    const byMonth = Array.from(byMonthMap.entries())
      .map(([k, v]) => ({ month: k, ...v }))
      .sort((x, y) => y.month.localeCompare(x.month))
      .slice(0, 12);
    const maxMonth = Math.max(1, ...byMonth.map(m => m.revenue));

    // أعلى العملاء (من الفواتير المدفوعة)
    const byCustMap = new Map<string, { revenue: number; count: number }>();
    for (const i of paid) {
      if (!i.customer_id) continue;
      const prev = byCustMap.get(i.customer_id) ?? { revenue: 0, count: 0 };
      prev.revenue += Number(i.total); prev.count += 1;
      byCustMap.set(i.customer_id, prev);
    }
    const topCustomers = Array.from(byCustMap.entries())
      .map(([id, v]) => ({ id, name: custNames[id] ?? "—", ...v }))
      .sort((x, y) => y.revenue - x.revenue)
      .slice(0, 10);

    return {
      realizedRevenue, realizedNet, realizedVat, paidCount, avgInvoice,
      outstanding, collectedFromPartial,
      totalInvoices: invoices.length,
      byMonth, maxMonth, topCustomers,
    };
  }, [invoices, custNames]);

  const quoteConv = quoteStats.total ? (quoteStats.converted / quoteStats.total) * 100 : 0;

  return (
    <div dir="rtl">
      <PageHeader
        title="تحليلات أداء المبيعات"
        subtitle="المبيعات المحقّقة محسوبة من الفواتير المدفوعة بالكامل فقط — مصدرها الفواتير الفعلية"
      />

      {loading ? (
        <div className="text-center text-muted-foreground py-12 text-sm">جاري التحميل…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Kpi icon={TrendingUp} label="المبيعات المحقّقة (مدفوعة)" value={fmtSAR(a.realizedRevenue)} tone="success" sub={`${a.paidCount} فاتورة مدفوعة`} />
            <Kpi icon={Wallet} label="صافي قبل الضريبة" value={fmtSAR(a.realizedNet)} tone="primary" sub={`ضريبة: ${fmtSAR(a.realizedVat)}`} />
            <Kpi icon={Receipt} label="متوسط قيمة الفاتورة" value={fmtSAR(a.avgInvoice)} />
            <Kpi icon={Clock} label="مفوتر غير محصّل" value={fmtSAR(a.outstanding)} tone={a.outstanding > 0 ? "warning" : "default"} sub={`محصّل جزئياً: ${fmtSAR(a.collectedFromPartial)}`} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Kpi icon={BarChart3} label="إجمالي الفواتير (غير الملغاة)" value={a.totalInvoices} />
            <Kpi icon={Receipt} label="فواتير مدفوعة" value={a.paidCount} tone="success" />
            <Kpi icon={Percent} label="نسبة تحويل العروض" value={quoteStats.total ? `${quoteConv.toFixed(1)}%` : "—"} tone="primary" sub={quoteStats.total ? `${quoteStats.converted}/${quoteStats.total} عرض` : "لا عروض"} />
            <Kpi icon={Users} label="عملاء اشتروا فعلاً" value={a.topCustomers.length} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* المبيعات الشهرية */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> المبيعات المحقّقة شهرياً
              </div>
              <div className="p-3">
                {a.byMonth.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8 text-sm">لا توجد فواتير مدفوعة بعد</div>
                ) : (
                  <div className="space-y-2">
                    {a.byMonth.map(m => (
                      <div key={m.month}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{monthLabel(m.month)}</span>
                          <span className="num font-semibold">{fmtSAR(m.revenue)} · {m.count} فاتورة</span>
                        </div>
                        <div className="h-2 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-success" style={{ width: `${(m.revenue / a.maxMonth) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* أعلى العملاء */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4 text-primary" /> أعلى العملاء (مبيعات محقّقة)
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th className="text-right px-3 py-2 font-medium">#</th>
                    <th className="text-right px-3 py-2 font-medium">العميل</th>
                    <th className="text-center px-3 py-2 font-medium">عدد الفواتير</th>
                    <th className="text-left px-3 py-2 font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {a.topCustomers.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted-foreground py-8">لا توجد مبيعات محقّقة</td></tr>
                  ) : a.topCustomers.map((c, i) => (
                    <tr key={c.id} className="hover:bg-muted/30">
                      <td className={`px-3 py-2 text-[12px] font-bold ${i === 0 ? "text-warning" : "text-muted-foreground"}`}>#{i + 1}</td>
                      <td className="px-3 py-2">
                        <Link to={`/ar/${c.id}`} className="hover:underline font-medium">{c.name}</Link>
                      </td>
                      <td className="px-3 py-2 text-center num">{c.count}</td>
                      <td className="px-3 py-2 text-left num font-semibold text-success">{fmtSAR(c.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[12px] text-muted-foreground mt-3 px-1">
            * "المبيعات المحقّقة" تشمل الفواتير المسدّدة بالكامل فقط (الحالة: مدفوعة). الفواتير المسودة وغير المحصّلة لا تُحتسب ضمن الإيراد المحقّق.
          </p>
        </>
      )}
    </div>
  );
}
