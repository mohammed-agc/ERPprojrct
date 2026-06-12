import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarClock, AlertTriangle } from "lucide-react";
import { getAging, fmtSAR, type AgingRow } from "@/services/erp/agingService";

const BUCKETS: { key: keyof AgingRow; label: string; tone: string }[] = [
  { key: "current_amount", label: "غير مستحق", tone: "text-success" },
  { key: "d1_30", label: "1–30 يوم", tone: "text-foreground" },
  { key: "d31_60", label: "31–60 يوم", tone: "text-warning" },
  { key: "d61_90", label: "61–90 يوم", tone: "text-warning" },
  { key: "d91_120", label: "91–120 يوم", tone: "text-destructive" },
  { key: "over_120", label: "أكثر من 120", tone: "text-destructive" },
];

export default function AgingReport() {
  const [kind, setKind] = useState<"vendor" | "customer">("vendor");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["aging", kind, asOf],
    queryFn: () => getAging(kind, asOf),
  });

  const totals = useMemo(() => {
    const t = { current_amount: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91_120: 0, over_120: 0, total_outstanding: 0 };
    rows.forEach(r => {
      t.current_amount += Number(r.current_amount);
      t.d1_30 += Number(r.d1_30);
      t.d31_60 += Number(r.d31_60);
      t.d61_90 += Number(r.d61_90);
      t.d91_120 += Number(r.d91_120);
      t.over_120 += Number(r.over_120);
      t.total_outstanding += Number(r.total_outstanding);
    });
    return t;
  }, [rows]);

  const overdue = totals.d31_60 + totals.d61_90 + totals.d91_120 + totals.over_120;

  return (
    <div className="space-y-3" dir="rtl">
      <PageHeader
        title="تقرير أعمار الديون"
        subtitle="تصنيف البنود المفتوحة حسب العمر — معيار Open Items"
      />

      <div className="bg-card border border-border rounded-lg p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <Label className="text-xs">النوع</Label>
          <Select value={kind} onValueChange={v => setKind(v as any)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vendor">موردون (ذمم دائنة)</SelectItem>
              <SelectItem value="customer">عملاء (ذمم مدينة)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">حتى تاريخ</Label>
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} dir="ltr" className="h-9" />
        </div>
        <div className="flex items-end">
          {overdue > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded-md px-3 h-9">
              <AlertTriangle className="h-3.5 w-3.5" />
              متأخّرات (أكثر من 30 يوم): <b className="num">{fmtSAR(overdue)}</b>
            </div>
          )}
        </div>
      </div>

      {/* ملخّص الفئات */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-2">
        {BUCKETS.map(b => (
          <div key={b.key} className="bg-card border border-border rounded-lg p-2.5 text-center">
            <div className="text-[11.5px] text-muted-foreground mb-1">{b.label}</div>
            <div className={`text-xs font-bold num ${b.tone}`}>{fmtSAR(Number(totals[b.key]))}</div>
          </div>
        ))}
        <div className="bg-primary/5 border border-primary/30 rounded-lg p-2.5 text-center">
          <div className="text-[11.5px] text-muted-foreground mb-1">الإجمالي</div>
          <div className="text-xs font-bold num text-primary">{fmtSAR(totals.total_outstanding)}</div>
        </div>
      </div>

      {/* الجدول */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الطرف</th>
              {BUCKETS.map(b => <th key={b.key} className="text-center">{b.label}</th>)}
              <th className="text-center">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-6">جارٍ التحميل…</td></tr>
            )}
            {!isFetching && rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">
                <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                لا توجد بنود مفتوحة
              </td></tr>
            )}
            {rows.map(r => (
              <tr key={r.partner_id}>
                <td className="text-xs">
                  {r.partner_name}
                  {r.partner_code && <span className="text-[11.5px] text-muted-foreground mr-1">({r.partner_code})</span>}
                </td>
                {BUCKETS.map(b => (
                  <td key={b.key} className={`num text-xs text-center ${Number(r[b.key]) > 0 ? b.tone : "text-muted-foreground/40"}`}>
                    {Number(r[b.key]) > 0 ? fmtSAR(Number(r[b.key])) : "—"}
                  </td>
                ))}
                <td className="num text-xs text-center font-bold">{fmtSAR(r.total_outstanding)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-bold bg-muted/30">
                <td className="text-xs">الإجمالي</td>
                {BUCKETS.map(b => (
                  <td key={b.key} className="num text-xs text-center">{fmtSAR(Number(totals[b.key]))}</td>
                ))}
                <td className="num text-xs text-center text-primary">{fmtSAR(totals.total_outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
