import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/erp/EmptyState";
import { RotateCw, AlertTriangle } from "lucide-react";
import { accountingService, type TrialBalanceRow } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const typeLabel: Record<string, string> = {
  asset: "أصل", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف"
};

export default function TrialBalance() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    accountingService.trialBalance(from || undefined, to || undefined)
      .then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, [from, to]);

  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }
  ), [rows]);
  const balanced = Math.abs(totals.d - totals.c) < 0.005;

  return (
    <div>
      <PageHeader
        title="ميزان المراجعة"
        subtitle={`${rows.length} حساب — مجموع المدين ${fmt(totals.d)} | مجموع الدائن ${fmt(totals.c)}`}
        sticky
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="mr-auto">
          {balanced
            ? <Badge className="gap-1">متوازن</Badge>
            : <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> غير متوازن — فرق {fmt(totals.d - totals.c)}</Badge>}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-24">الكود</th>
              <th>الحساب</th>
              <th className="w-28">النوع</th>
              <th className="text-left w-32">مدين</th>
              <th className="text-left w-32">دائن</th>
              <th className="text-left w-32">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && rows.length === 0 && <EmptyState inTable colSpan={6} title="لا توجد بيانات" description="لا توجد قيود مُرحَّلة ضمن النطاق المختار." />}
            {!loading && rows.map(r => (
              <tr key={r.account_id}>
                <td className="font-mono text-xs">{r.code}</td>
                <td className="font-medium">{r.name_ar}</td>
                <td><span className="text-xs text-muted-foreground">{typeLabel[r.type]}</span></td>
                <td className="num text-left">{r.debit ? fmt(r.debit) : "—"}</td>
                <td className="num text-left">{r.credit ? fmt(r.credit) : "—"}</td>
                <td className={`num text-left font-semibold ${r.balance < 0 ? "text-destructive" : ""}`}>{fmt(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={3} className="text-left">الإجمالي</td>
                <td className="num text-left">{fmt(totals.d)}</td>
                <td className="num text-left">{fmt(totals.c)}</td>
                <td className="num text-left">{fmt(totals.d - totals.c)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
