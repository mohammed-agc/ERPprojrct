import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt, FileText, BookOpen } from "lucide-react";
import { accounting, type PurchaseInvoiceRow } from "@/services/erp/accounting";

const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  posted: "مرحَّلة",
  partially_paid: "مدفوعة جزئياً",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  posted: "bg-primary/10 text-primary",
  partially_paid: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const STATUS_OPTS = [
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: STATUS_LABEL.draft },
  { value: "posted", label: STATUS_LABEL.posted },
  { value: "partially_paid", label: STATUS_LABEL.partially_paid },
  { value: "paid", label: STATUS_LABEL.paid },
  { value: "cancelled", label: STATUS_LABEL.cancelled },
];

export default function PurchaseInvoicesRegistry() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [rows, setRows] = useState<PurchaseInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    accounting.listPurchaseInvoices()
      .then(r => { if (alive) setRows(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== "all" && r.status !== status) return false;
      if (!qv) return true;
      return `${r.invoice_no} ${r.supplier_name ?? ""} ${r.supplier_code ?? ""} ${r.supplier_invoice_ref ?? ""}`
        .toLowerCase().includes(qv);
    });
  }, [rows, q, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    sub: filtered.reduce((s, r) => s + r.subtotal, 0),
    vat: filtered.reduce((s, r) => s + r.vat_amount, 0),
    total: filtered.reduce((s, r) => s + r.total, 0),
    paid: filtered.reduce((s, r) => s + r.paid_amount, 0),
  }), [filtered]);

  return (
    <div dir="rtl">
      <PageHeader
        title="فواتير الشراء — سجل المحاسبة"
        subtitle={`${totals.count} فاتورة · إجمالي ${fmtSAR(totals.total)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.total - totals.paid)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، مرجع المورد..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>المورد</th>
              <th>مرجع المورد</th>
              <th>الإصدار</th>
              <th>الاستحقاق</th>
              <th className="text-left">المبلغ</th>
              <th className="text-left">الضريبة</th>
              <th className="text-left">الإجمالي</th>
              <th className="text-left">المتبقي</th>
              <th>قيد GL</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8 text-xs">جاري التحميل...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8 text-xs">لا توجد فواتير مطابقة</td></tr>
            )}
            {filtered.map(r => {
              const overdue = r.remaining > 0 && r.due_date && new Date(r.due_date) < new Date();
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/accounting/purchase-invoices/${r.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                      <Receipt className="h-3 w-3" />{r.invoice_no}
                    </Link>
                  </td>
                  <td className="text-xs">{r.supplier_name ?? "—"}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{r.supplier_invoice_ref ?? "—"}</td>
                  <td className="text-xs">{fmtDate(r.invoice_date)}</td>
                  <td className={`text-xs ${overdue ? "text-destructive font-semibold" : ""}`}>{fmtDate(r.due_date)}</td>
                  <td className="num text-xs text-left">{fmtSAR(r.subtotal)}</td>
                  <td className="num text-xs text-left">{fmtSAR(r.vat_amount)}</td>
                  <td className="num text-xs text-left font-semibold">{fmtSAR(r.total)}</td>
                  <td className="num text-xs text-left">{fmtSAR(r.remaining)}</td>
                  <td>
                    {r.journal_entry_id ? (
                      <Link to={`/journals/${r.journal_entry_id}`} className="inline-flex items-center gap-1 text-primary text-[11px] hover:underline">
                        <BookOpen className="h-3 w-3" /> مرتبط
                      </Link>
                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>
                  <td><Badge className={STATUS_TONE[r.status] ?? "bg-muted"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={5} className="text-left text-xs">الإجمالي</td>
                <td className="num text-xs text-left">{fmtSAR(totals.sub)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.vat)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total - totals.paid)}</td>
                <td colSpan={2}><FileText className="h-3 w-3 text-muted-foreground" /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
