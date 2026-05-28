import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { Lock, RotateCw, FileText, AlertTriangle } from "lucide-react";
import { accountingService, type JournalEntryRow, type JournalListFilters } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sourceLabel = (t: string | null) => {
  if (!t) return "—";
  const map: Record<string, string> = { invoice: "فاتورة", payment: "دفعة", manual: "يدوي", sales_order: "أمر بيع" };
  return map[t] ?? t;
};

export default function Journals() {
  const [rows, setRows] = useState<JournalEntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<JournalListFilters>({ posted: "all" });
  const [query, setQuery] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await accountingService.listEntries({ ...filters, query });
      setRows(data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters.from, filters.to, filters.posted]);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ d: acc.d + r.total_debit, c: acc.c + r.total_credit }),
    { d: 0, c: 0 }
  ), [rows]);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter(r =>
      r.entry_no.toLowerCase().includes(t) ||
      (r.reference ?? "").toLowerCase().includes(t) ||
      (r.description ?? "").toLowerCase().includes(t)
    );
  }, [rows, query]);

  return (
    <div>
      <PageHeader
        title="قيود اليومية"
        subtitle={`${filtered.length} قيد — مدين ${fmt(totals.d)} | دائن ${fmt(totals.c)}`}
        sticky
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        }
      />

      {/* Sticky filters bar */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={filters.from ?? ""} onChange={e => setFilters(f => ({ ...f, from: e.target.value || undefined }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={filters.to ?? ""} onChange={e => setFilters(f => ({ ...f, to: e.target.value || undefined }))} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={filters.posted} onValueChange={(v: any) => setFilters(f => ({ ...f, posted: v }))}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="posted">مُرحَّل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">بحث</Label>
          <Input className="h-8" placeholder="رقم القيد / المرجع / البيان" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم القيد</th>
              <th>التاريخ</th>
              <th>المرجع</th>
              <th>البيان</th>
              <th>المصدر</th>
              <th className="text-left">مدين</th>
              <th className="text-left">دائن</th>
              <th>التوازن</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState inTable colSpan={9} title="لا توجد قيود" description="تُنشأ القيود تلقائياً عند ترحيل الفواتير والدفعات." />
            )}
            {!loading && filtered.map(r => {
              const balanced = Math.abs(r.total_debit - r.total_credit) < 0.005;
              return (
                <tr key={r.id}>
                  <td className="font-mono">
                    <Link to={`/journals/${r.id}`} className="text-primary hover:underline">{r.entry_no}</Link>
                  </td>
                  <td className="num">{r.entry_date}</td>
                  <td className="text-xs">{r.reference || "—"}</td>
                  <td className="max-w-[280px] truncate">{r.description || "—"}</td>
                  <td className="text-xs text-muted-foreground">{sourceLabel(r.source_type)}</td>
                  <td className="num text-left font-semibold">{fmt(r.total_debit)}</td>
                  <td className="num text-left font-semibold">{fmt(r.total_credit)}</td>
                  <td>
                    {balanced
                      ? <span className="text-success text-xs">متوازن</span>
                      : <span className="text-destructive text-xs inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> غير متوازن</span>}
                  </td>
                  <td>{r.is_posted
                    ? <Badge className="gap-1"><Lock className="h-3 w-3" /> مُرحَّل</Badge>
                    : <Badge variant="secondary">مسودة</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={5} className="text-left">الإجمالي</td>
                <td className="num text-left">{fmt(totals.d)}</td>
                <td className="num text-left">{fmt(totals.c)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
