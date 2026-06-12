import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Lock, AlertTriangle } from "lucide-react";
import { accountingService, type JournalEntryDetail } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sourceLabel = (t: string | null) => {
  if (!t) return "يدوي";
  const map: Record<string, string> = { invoice: "فاتورة", payment: "دفعة", manual: "يدوي", sales_order: "أمر بيع" };
  return map[t] ?? t;
};

export default function JournalDetail() {
  const { id = "" } = useParams();
  const [entry, setEntry] = useState<JournalEntryDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    accountingService.getEntry(id).then(setEntry).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;
  if (!entry) return <div className="text-destructive text-sm">القيد غير موجود</div>;

  const balanced = Math.abs(entry.total_debit - entry.total_credit) < 0.005;

  return (
    <div>
      <PageHeader
        title={`قيد ${entry.entry_no}`}
        subtitle={`${entry.entry_date} — ${sourceLabel(entry.source_type)}`}
        sticky
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/journals"><ArrowRight className="h-3.5 w-3.5 ml-1" /> رجوع</Link>
            </Button>
            {entry.is_posted
              ? <Badge className="gap-1"><Lock className="h-3 w-3" /> مُرحَّل</Badge>
              : <Badge variant="secondary">مسودة</Badge>}
          </>
        }
      />

      {/* Header info */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Info label="المرجع" value={entry.reference || "—"} />
        <Info label="المصدر" value={sourceLabel(entry.source_type)} />
        <Info label="تاريخ القيد" value={entry.entry_date} />
        <Info label="تاريخ الإنشاء" value={new Date(entry.created_at).toLocaleString("ar-SA")} />
        <div className="col-span-2 md:col-span-4">
          <Info label="البيان" value={entry.description || "—"} />
        </div>
      </div>

      {/* Lines */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th>الحساب</th>
              <th>البيان</th>
              <th className="text-left w-32">مدين</th>
              <th className="text-left w-32">دائن</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((l, i) => (
              <tr key={l.id}>
                <td className="font-mono text-muted-foreground">{i + 1}</td>
                <td>
                  <div className="font-mono text-xs text-muted-foreground">{l.account_code}</div>
                  <div className="font-medium">{l.account_name}</div>
                </td>
                <td className="text-xs">{l.description || "—"}</td>
                <td className="num text-left">{l.debit ? fmt(l.debit) : "—"}</td>
                <td className="num text-left">{l.credit ? fmt(l.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/60 font-semibold">
              <td colSpan={3} className="text-left">الإجمالي</td>
              <td className="num text-left">{fmt(entry.total_debit)}</td>
              <td className="num text-left">{fmt(entry.total_credit)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="py-2">
                {balanced
                  ? <span className="text-success text-xs">القيد متوازن ✓</span>
                  : <span className="text-destructive text-xs inline-flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> القيد غير متوازن — الفرق {fmt(entry.total_debit - entry.total_credit)}
                    </span>}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Audit */}
      <div className="mt-4 p-3 bg-muted/40 border border-border rounded-lg text-xs text-muted-foreground">
        <div className="font-semibold text-foreground mb-1">سجل التدقيق</div>
        <div>أُنشئ في: {new Date(entry.created_at).toLocaleString("ar-SA")}</div>
        {entry.is_posted
          ? <div>تم الترحيل — القيد مقفل ولا يمكن تعديله. لتصحيحه أنشئ قيد عكسي.</div>
          : <div>القيد لم يُرحَّل بعد — قابل للتعديل.</div>}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-2.5 bg-muted/40 border border-border rounded">
      <div className="text-[11.5px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-medium mt-0.5">{value}</div>
    </div>
  );
}
