import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt } from "lucide-react";
import {
  salesService, SINV_LABEL, SINV_TONE, type SalesInvoiceStatus,
} from "@/services/erp/sales";
import { fmtSAR, fmtDate } from "@/services/erp/purchasing";

const STATUS_OPTS: { value: SalesInvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: SINV_LABEL.draft },
  { value: "issued", label: SINV_LABEL.issued },
  { value: "partially_paid", label: SINV_LABEL.partially_paid },
  { value: "paid", label: SINV_LABEL.paid },
  { value: "cancelled", label: SINV_LABEL.cancelled },
];

export default function SalesInvoicesRegistry() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<SalesInvoiceStatus | "all">("all");

  const invs = useMemo(() => salesService.listSalesInvoices(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return invs.filter(i => {
      if (status !== "all" && i.status !== status) return false;
      if (!qv) return true;
      return `${i.code} ${i.customer} ${i.vehicle} ${i.vin ?? ""} ${i.branch} ${i.so_code}`.toLowerCase().includes(qv);
    });
  }, [invs, q, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    sub: filtered.reduce((s, i) => s + i.subtotal, 0),
    vat: filtered.reduce((s, i) => s + i.vat_amount, 0),
    total: filtered.reduce((s, i) => s + i.total, 0),
    paid: filtered.reduce((s, i) => s + i.paid, 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="فواتير المبيعات — سجل المحاسبة"
        subtitle={`${totals.count} فاتورة · إجمالي ${fmtSAR(totals.total)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.total - totals.paid)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، VIN، فرع، أمر بيع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
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
              <th>العميل</th>
              <th>أمر البيع</th>
              <th>المركبة</th>
              <th>VIN</th>
              <th>الفرع</th>
              <th>الإصدار</th>
              <th>الاستحقاق</th>
              <th className="text-left">المبلغ</th>
              <th className="text-left">الضريبة</th>
              <th className="text-left">الإجمالي</th>
              <th className="text-left">المتبقي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={13} className="text-center text-muted-foreground py-8 text-xs">لا توجد فواتير مطابقة</td></tr>
            )}
            {filtered.map(i => {
              const remaining = i.total - i.paid;
              const overdue = remaining > 0 && new Date(i.due_date) < new Date();
              return (
                <tr key={i.id}>
                  <td className="font-mono text-[11px]">
                    <span className="flex items-center gap-1.5 text-primary">
                      <Receipt className="h-3 w-3" />{i.code}
                    </span>
                  </td>
                  <td className="text-xs">{i.customer}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{i.so_code}</td>
                  <td className="text-xs">{i.vehicle}</td>
                  <td className="font-mono text-[10px]">{i.vin ?? "—"}</td>
                  <td className="text-xs">{i.branch}</td>
                  <td className="text-xs">{fmtDate(i.issued_at)}</td>
                  <td className={`text-xs ${overdue ? "text-destructive font-semibold" : ""}`}>{fmtDate(i.due_date)}</td>
                  <td className="num text-xs text-left">{fmtSAR(i.subtotal)}</td>
                  <td className="num text-xs text-left">{fmtSAR(i.vat_amount)}</td>
                  <td className="num text-xs text-left font-semibold">{fmtSAR(i.total)}</td>
                  <td className="num text-xs text-left">{fmtSAR(remaining)}</td>
                  <td><Badge className={SINV_TONE[i.status]}>{SINV_LABEL[i.status]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={8} className="text-left text-xs">الإجمالي</td>
                <td className="num text-xs text-left">{fmtSAR(totals.sub)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.vat)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total - totals.paid)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
