import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import { RotateCw, FileText, Download } from "lucide-react";
import { accounting, type ARCustomerBalance } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function exportCsv(rows: ARCustomerBalance[]) {
  const headers = ["الكود", "العميل", "عدد الفواتير", "إجمالي مدين", "مدفوع", "متبقي", "متأخر", "حالي", "0-30", "31-60", "61-90", "+90"];
  const lines = rows.map(r => [
    r.customer_code, r.customer_name, r.invoice_count,
    r.total_receivable, r.paid_amount, r.remaining_balance, r.overdue_amount,
    r.aging.current, r.aging.d_0_30, r.aging.d_31_60, r.aging.d_61_90, r.aging.d_90_plus,
  ].join(","));
  const csv = "\uFEFF" + [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "accounts-receivable.csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function AccountsReceivable() {
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [query, setQuery] = useState("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [rows, setRows] = useState<ARCustomerBalance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accounting.listReceivables(asOf).then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [asOf]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    return rows.filter(r =>
      (!onlyOpen || r.remaining_balance > 0) &&
      (!t || r.customer_name.toLowerCase().includes(t) || r.customer_code.toLowerCase().includes(t))
    );
  }, [rows, query, onlyOpen]);

  const totals = useMemo(() => filtered.reduce((a, r) => ({
    receivable: a.receivable + r.total_receivable,
    paid: a.paid + r.paid_amount,
    remaining: a.remaining + r.remaining_balance,
    overdue: a.overdue + r.overdue_amount,
    current: a.current + r.aging.current,
    d030: a.d030 + r.aging.d_0_30,
    d3160: a.d3160 + r.aging.d_31_60,
    d6190: a.d6190 + r.aging.d_61_90,
    d90: a.d90 + r.aging.d_90_plus,
  }), { receivable: 0, paid: 0, remaining: 0, overdue: 0, current: 0, d030: 0, d3160: 0, d6190: 0, d90: 0 }), [filtered]);

  return (
    <div>
      <PageHeader
        title="الذمم المدينة"
        subtitle={`${filtered.length} عميل — المتبقي ${fmt(totals.remaining)} | المتأخر ${fmt(totals.overdue)}`}
        sticky
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/ar/reconciliation">
                <FileText className="h-3.5 w-3.5 ml-1" /> مطابقة الذمم
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCsv(filtered)}>
              <Download className="h-3.5 w-3.5 ml-1" /> تصدير CSV
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث
            </Button>
          </>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <Kpi label="إجمالي مدين" value={fmt(totals.receivable)} />
        <Kpi label="مدفوع" value={fmt(totals.paid)} tone="success" />
        <Kpi label="المتبقي" value={fmt(totals.remaining)} />
        <Kpi label="المتأخر" value={fmt(totals.overdue)} tone="destructive" />
        <Kpi label="+90 يوم" value={fmt(totals.d90)} tone="destructive" />
      </div>

      {/* Sticky filters */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">كما في تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={asOf} onChange={e => setAsOf(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">بحث</Label>
          <Input className="h-8" placeholder="اسم أو كود العميل" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-1">
          <input type="checkbox" checked={onlyOpen} onChange={e => setOnlyOpen(e.target.checked)} />
          عرض ذوي الرصيد فقط
        </label>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>العميل</th>
              <th className="text-center">الفواتير</th>
              <th className="text-left">إجمالي</th>
              <th className="text-left">مدفوع</th>
              <th className="text-left">المتبقي</th>
              <th className="text-left">حالي</th>
              <th className="text-left">0-30</th>
              <th className="text-left">31-60</th>
              <th className="text-left">61-90</th>
              <th className="text-left">+90</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={12} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && filtered.length === 0 && <EmptyState inTable colSpan={12} title="لا توجد ذمم" description="لا يوجد عملاء لديهم فواتير مفتوحة." />}
            {!loading && filtered.map(r => (
              <tr key={r.customer_id}>
                <td className="font-mono text-xs">{r.customer_code}</td>
                <td className="font-medium">{r.customer_name}</td>
                <td className="text-center">{r.invoice_count}</td>
                <td className="num text-left">{fmt(r.total_receivable)}</td>
                <td className="num text-left text-success">{fmt(r.paid_amount)}</td>
                <td className="num text-left font-semibold">{fmt(r.remaining_balance)}</td>
                <td className="num text-left">{fmt(r.aging.current)}</td>
                <td className="num text-left">{fmt(r.aging.d_0_30)}</td>
                <td className="num text-left text-warning">{fmt(r.aging.d_31_60)}</td>
                <td className="num text-left text-warning">{fmt(r.aging.d_61_90)}</td>
                <td className={`num text-left font-semibold ${r.aging.d_90_plus > 0 ? "text-destructive" : ""}`}>{fmt(r.aging.d_90_plus)}</td>
                <td>
                  <Link to={`/ar/${r.customer_id}`} className="text-primary text-xs inline-flex items-center gap-1 hover:underline">
                    <FileText className="h-3 w-3" /> كشف
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={3} className="text-left">الإجمالي</td>
                <td className="num text-left">{fmt(totals.receivable)}</td>
                <td className="num text-left">{fmt(totals.paid)}</td>
                <td className="num text-left">{fmt(totals.remaining)}</td>
                <td className="num text-left">{fmt(totals.current)}</td>
                <td className="num text-left">{fmt(totals.d030)}</td>
                <td className="num text-left">{fmt(totals.d3160)}</td>
                <td className="num text-left">{fmt(totals.d6190)}</td>
                <td className="num text-left">{fmt(totals.d90)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "success" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="p-2.5 bg-card border border-border rounded">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-bold mt-0.5 num ${color}`}>{value}</div>
    </div>
  );
}
