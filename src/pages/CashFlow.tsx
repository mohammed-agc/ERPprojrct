import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowDownCircle, ArrowUpCircle, FileSpreadsheet, RotateCw } from "lucide-react";
import { accounting, type CashFlowReport } from "@/services/erp/accounting";
import { fmtSAR, startOfYearIso, todayIso } from "@/lib/erpFormat";

export default function CashFlow() {
  const [from, setFrom] = useState(startOfYearIso());
  const [to, setTo] = useState(todayIso());
  const [report, setReport] = useState<CashFlowReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accounting.cashFlow(from, to).then(setReport).finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  const exportCsv = () => {
    if (!report) return;
    const lines: string[] = ["البند,القيمة"];
    lines.push(`الرصيد الافتتاحي,${report.opening.toFixed(2)}`);
    lines.push("التدفقات الداخلة,");
    report.inflows.forEach(r => lines.push(`  ${r.code} ${r.name_ar},${r.amount.toFixed(2)}`));
    lines.push("التدفقات الخارجة,");
    report.outflows.forEach(r => lines.push(`  ${r.code} ${r.name_ar},${r.amount.toFixed(2)}`));
    lines.push(`صافي التغير,${report.net_change.toFixed(2)}`);
    lines.push(`الرصيد الختامي,${report.closing.toFixed(2)}`);
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `cash-flow-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const totalIn = report?.inflows.reduce((s, r) => s + r.amount, 0) ?? 0;
  const totalOut = report?.outflows.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div>
      <PageHeader
        title="قائمة التدفقات النقدية"
        subtitle={report ? `الفترة ${report.from} → ${report.to}` : ""}
        sticky
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button variant="outline" size="sm" onClick={load}><RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث</Button>
          </div>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {loading && <div className="text-center text-muted-foreground py-8">جارٍ التحميل…</div>}
      {!loading && report && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <div className="bg-card border rounded-md p-3">
              <div className="text-[12px] text-muted-foreground">الرصيد الافتتاحي</div>
              <div className="text-lg font-bold">{fmtSAR(report.opening)}</div>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
              <div className="text-[12px] text-emerald-700">إجمالي الداخل</div>
              <div className="text-lg font-bold text-emerald-700">{fmtSAR(totalIn)}</div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-md p-3">
              <div className="text-[12px] text-rose-700">إجمالي الخارج</div>
              <div className="text-lg font-bold text-rose-700">{fmtSAR(totalOut)}</div>
            </div>
            <div className="bg-card border rounded-md p-3">
              <div className="text-[12px] text-muted-foreground">الرصيد الختامي</div>
              <div className={`text-lg font-bold ${report.closing < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(report.closing)}</div>
              <Badge variant="secondary" className="mt-1 text-[11.5px]">صافي {fmtSAR(report.net_change)}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="bg-emerald-50 px-3 py-2 font-semibold text-sm text-emerald-800 flex items-center gap-2">
                <ArrowDownCircle className="h-4 w-4" /> التدفقات الداخلة
              </div>
              <table className="erp-table">
                <thead><tr><th className="w-20">الكود</th><th>المصدر</th><th className="text-left w-28">القيمة</th></tr></thead>
                <tbody>
                  {report.inflows.length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-6">لا توجد تدفقات داخلة</td></tr>}
                  {report.inflows.map((r, i) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td className="num text-left text-emerald-700 font-medium">{fmtSAR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="bg-rose-50 px-3 py-2 font-semibold text-sm text-rose-800 flex items-center gap-2">
                <ArrowUpCircle className="h-4 w-4" /> التدفقات الخارجة
              </div>
              <table className="erp-table">
                <thead><tr><th className="w-20">الكود</th><th>الاستخدام</th><th className="text-left w-28">القيمة</th></tr></thead>
                <tbody>
                  {report.outflows.length === 0 && <tr><td colSpan={3} className="text-center text-muted-foreground py-6">لا توجد تدفقات خارجة</td></tr>}
                  {report.outflows.map((r, i) => (
                    <tr key={i}>
                      <td className="font-mono text-xs">{r.code}</td>
                      <td>{r.name_ar}</td>
                      <td className="num text-left text-rose-700 font-medium">{fmtSAR(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
