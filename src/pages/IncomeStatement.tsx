import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileSpreadsheet, RotateCw } from "lucide-react";
import { accounting, type IncomeStatement } from "@/services/erp/accounting";
import { fmtSAR, startOfYearIso, todayIso } from "@/lib/erpFormat";

type Compare = "none" | "prev_period" | "prev_year";

const subRange = (from: string, to: string, mode: Compare): [string, string] => {
  const f = new Date(from), t = new Date(to);
  if (mode === "prev_year") {
    f.setFullYear(f.getFullYear() - 1); t.setFullYear(t.getFullYear() - 1);
  } else {
    const days = Math.round((t.getTime() - f.getTime()) / 86400000) + 1;
    t.setDate(f.getDate() - 1); f.setDate(f.getDate() - days);
  }
  return [f.toISOString().slice(0, 10), t.toISOString().slice(0, 10)];
};

function pct(a: number, b: number) {
  if (!b) return null;
  return ((a - b) / Math.abs(b)) * 100;
}

export default function IncomeStatementPage() {
  const [from, setFrom] = useState(startOfYearIso());
  const [to, setTo] = useState(todayIso());
  const [compare, setCompare] = useState<Compare>("none");
  const [report, setReport] = useState<IncomeStatement | null>(null);
  const [prev, setPrev] = useState<IncomeStatement | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const cur = await accounting.incomeStatement(from, to);
      setReport(cur);
      if (compare !== "none") {
        const [pf, pt] = subRange(from, to, compare);
        setPrev(await accounting.incomeStatement(pf, pt));
      } else setPrev(null);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, compare]);

  const exportCsv = () => {
    if (!report) return;
    const lines: string[] = ["البند,القيمة"];
    lines.push(`الإيرادات,${report.revenue.total.toFixed(2)}`);
    report.revenue.rows.forEach(r => lines.push(`  ${r.code} ${r.name_ar},${r.amount.toFixed(2)}`));
    lines.push(`المصروفات,${report.expense.total.toFixed(2)}`);
    report.expense.rows.forEach(r => lines.push(`  ${r.code} ${r.name_ar},${r.amount.toFixed(2)}`));
    lines.push(`صافي الربح,${report.net_income.toFixed(2)}`);
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `income-statement-${from}-${to}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const renderSection = (sec: IncomeStatement["revenue"], prevSec?: IncomeStatement["revenue"], tone: "rev" | "exp" = "rev") => {
    const prevMap = new Map((prevSec?.rows ?? []).map(r => [r.account_id, r.amount]));
    return (
      <>
        <tr className={`font-semibold ${tone === "rev" ? "bg-emerald-50" : "bg-rose-50"}`}>
          <td colSpan={2}>{sec.label}</td>
          <td className="num text-right">{fmtSAR(sec.total)}</td>
          {prevSec && <td className="num text-right">{fmtSAR(prevSec.total)}</td>}
          {prevSec && <td className="num text-right text-xs">{pct(sec.total, prevSec.total)?.toFixed(1) ?? "—"}%</td>}
        </tr>
        {sec.rows.map(r => {
          const p = prevMap.get(r.account_id);
          return (
            <tr key={r.account_id} className="hover:bg-muted/40">
              <td className="font-mono text-xs pr-6"><Link to={`/accounts/${r.account_id}`} className="hover:text-primary">{r.code}</Link></td>
              <td>{r.name_ar}</td>
              <td className="num text-right">{fmtSAR(r.amount)}</td>
              {prevSec && <td className="num text-right text-muted-foreground">{p !== undefined ? fmtSAR(p) : "—"}</td>}
              {prevSec && <td className="num text-right text-xs">{p !== undefined ? `${pct(r.amount, p)?.toFixed(1) ?? "—"}%` : "—"}</td>}
            </tr>
          );
        })}
      </>
    );
  };

  return (
    <div>
      <PageHeader
        title="قائمة الدخل"
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
        <div className="flex flex-col gap-1">
          <Label className="text-xs">مقارنة</Label>
          <Select value={compare} onValueChange={(v: any) => setCompare(v)}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">بدون مقارنة</SelectItem>
              <SelectItem value="prev_period">الفترة السابقة</SelectItem>
              <SelectItem value="prev_year">العام السابق</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {report && (
          <div className="mr-auto flex gap-2 items-end">
            <Badge variant="secondary">إيراد {fmtSAR(report.revenue.total)}</Badge>
            <Badge variant="secondary">مصروف {fmtSAR(report.expense.total)}</Badge>
            <Badge className={report.net_income >= 0 ? "bg-success" : "bg-destructive"}>صافي {fmtSAR(report.net_income)}</Badge>
          </div>
        )}
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-24">الكود</th>
              <th>البند</th>
              <th className="text-right w-32">الفترة الحالية</th>
              {prev && <th className="text-right w-32">المقارنة</th>}
              {prev && <th className="text-right w-20">التغير</th>}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && report && (
              <>
                {renderSection(report.revenue, prev?.revenue, "rev")}
                {renderSection(report.expense, prev?.expense, "exp")}
                <tr className="bg-muted font-bold text-base">
                  <td colSpan={2}>صافي الربح / الخسارة</td>
                  <td className={`num text-right ${report.net_income < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(report.net_income)}</td>
                  {prev && <td className={`num text-right ${prev.net_income < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(prev.net_income)}</td>}
                  {prev && <td className="num text-right text-xs">{pct(report.net_income, prev.net_income)?.toFixed(1) ?? "—"}%</td>}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}