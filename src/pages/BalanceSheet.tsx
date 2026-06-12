import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, RotateCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { accounting, type BalanceSheet, type ReportSection } from "@/services/erp/accounting";
import { fmtSAR, todayIso } from "@/lib/erpFormat";

function Section({ sec, extraRow }: { sec: ReportSection; extraRow?: { label: string; amount: number } }) {
  return (
    <div className="bg-card border rounded-lg overflow-hidden">
      <div className="bg-muted px-3 py-2 font-semibold text-sm">{sec.label}</div>
      <table className="erp-table">
        <tbody>
          {sec.rows.map(r => (
            <tr key={r.account_id} className="hover:bg-muted/40">
              <td className="font-mono text-xs w-20"><Link to={`/accounts/${r.account_id}`} className="hover:text-primary">{r.code}</Link></td>
              <td>{r.name_ar}</td>
              <td className="num text-right w-32">{fmtSAR(r.amount)}</td>
            </tr>
          ))}
          {extraRow && (
            <tr className="bg-accent/30 italic">
              <td className="font-mono text-xs">—</td>
              <td>{extraRow.label}</td>
              <td className="num text-right">{fmtSAR(extraRow.amount)}</td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="bg-muted/60 font-bold">
            <td colSpan={2}>إجمالي {sec.label}</td>
            <td className="num text-right">{fmtSAR(sec.total + (extraRow?.amount ?? 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function BalanceSheetPage() {
  const [asOf, setAsOf] = useState(todayIso());
  const [report, setReport] = useState<BalanceSheet | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accounting.balanceSheet(asOf).then(setReport).finally(() => setLoading(false));
  };
  useEffect(load, [asOf]);

  const exportCsv = () => {
    if (!report) return;
    const lines: string[] = ["البند,القيمة"];
    const dump = (sec: ReportSection) => {
      lines.push(`${sec.label},${sec.total.toFixed(2)}`);
      sec.rows.forEach(r => lines.push(`  ${r.code} ${r.name_ar},${r.amount.toFixed(2)}`));
    };
    dump(report.assets); dump(report.liabilities); dump(report.equity);
    lines.push(`الأرباح المحتجزة,${report.retained_earnings.toFixed(2)}`);
    lines.push(`إجمالي الأصول,${report.total_assets.toFixed(2)}`);
    lines.push(`إجمالي الالتزامات وحقوق الملكية,${report.total_liab_equity.toFixed(2)}`);
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `balance-sheet-${asOf}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="الميزانية العمومية"
        subtitle={report ? `كما في ${report.as_of}` : ""}
        sticky
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button variant="outline" size="sm" onClick={load}><RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث</Button>
          </div>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">كما في تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={asOf} onChange={e => setAsOf(e.target.value)} /></div>
        {report && (
          <div className="mr-auto flex gap-2 items-end">
            {report.balanced
              ? <Badge className="bg-success gap-1"><CheckCircle2 className="h-3 w-3" /> متوازنة</Badge>
              : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> فرق {fmtSAR(report.total_assets - report.total_liab_equity)}</Badge>}
          </div>
        )}
      </div>

      {loading && <div className="text-center text-muted-foreground py-8">جارٍ التحميل…</div>}
      {!loading && report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="space-y-3">
            <Section sec={report.assets} />
          </div>
          <div className="space-y-3">
            <Section sec={report.liabilities} />
            <Section sec={report.equity} extraRow={{ label: "الأرباح المحتجزة (السنة الحالية)", amount: report.retained_earnings }} />
          </div>
        </div>
      )}

      {report && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex justify-between items-center">
            <span className="font-semibold">إجمالي الأصول</span>
            <span className="text-xl font-bold">{fmtSAR(report.total_assets)}</span>
          </div>
          <div className="bg-primary/5 border border-primary/30 rounded-lg p-3 flex justify-between items-center">
            <span className="font-semibold">إجمالي الالتزامات + حقوق الملكية</span>
            <span className="text-xl font-bold">{fmtSAR(report.total_liab_equity)}</span>
          </div>
        </div>
      )}
    </div>
  );
}