import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt, FileText } from "lucide-react";
import {
  purchasingService, PINV_LABEL, PINV_TONE, fmtSAR, fmtDate, type InvoiceStatus,
} from "@/services/erp/purchasing";
import { allocationService } from "@/services/erp/allocations";

const STATUS_OPTS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "issued", label: PINV_LABEL.issued },
  { value: "partially_paid", label: PINV_LABEL.partially_paid },
  { value: "paid", label: PINV_LABEL.paid },
  { value: "cancelled", label: PINV_LABEL.cancelled },
];

export default function PurchaseInvoicesRegistry() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");

  const invs = useMemo(() => purchasingService.listPurchaseInvoices(), []);
  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const pos = useMemo(() => purchasingService.listPOs(), []);
  const allocs = useMemo(() => allocationService.list(), []);

  const rows = useMemo(() => invs.map(i => {
    const sup = suppliers.find(s => s.id === i.supplier_id);
    const po = pos.find(p => p.id === i.po_id);
    const alloc = allocs.find(a => a.po_id === i.po_id);
    return {
      inv: i,
      supplierName: sup?.name ?? "—",
      poCode: po?.code ?? "—",
      allocCode: alloc?.code ?? "—",
      branch: po?.branch_destination ?? "—",
    };
  }), [invs, suppliers, pos, allocs]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter(r => {
      if (status !== "all" && r.inv.status !== status) return false;
      if (!qv) return true;
      return `${r.inv.code} ${r.supplierName} ${r.poCode} ${r.allocCode} ${r.branch}`.toLowerCase().includes(qv);
    });
  }, [rows, q, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    sub: filtered.reduce((s, r) => s + r.inv.subtotal, 0),
    vat: filtered.reduce((s, r) => s + r.inv.vat_amount, 0),
    total: filtered.reduce((s, r) => s + r.inv.total, 0),
    paid: filtered.reduce((s, r) => s + r.inv.paid, 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="فواتير الشراء — سجل المحاسبة"
        subtitle={`${totals.count} فاتورة · إجمالي ${fmtSAR(totals.total)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.total - totals.paid)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، PO، تخصيص، فرع..." value={q} onChange={e => setQ(e.target.value)} />
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
              <th>المورد</th>
              <th>أمر الشراء</th>
              <th>التخصيص</th>
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
              <tr><td colSpan={12} className="text-center text-muted-foreground py-8 text-xs">لا توجد فواتير مطابقة</td></tr>
            )}
            {filtered.map(r => {
              const remaining = r.inv.total - r.inv.paid;
              const overdue = remaining > 0 && new Date(r.inv.due_date) < new Date();
              return (
                <tr key={r.inv.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/purchasing/invoices/${r.inv.id}`} className="flex items-center gap-1.5 text-primary hover:underline">
                      <Receipt className="h-3 w-3" />{r.inv.code}
                    </Link>
                  </td>
                  <td className="text-xs">{r.supplierName}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{r.poCode}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{r.allocCode}</td>
                  <td className="text-xs">{r.branch}</td>
                  <td className="text-xs">{fmtDate(r.inv.issued_at)}</td>
                  <td className={`text-xs ${overdue ? "text-destructive font-semibold" : ""}`}>{fmtDate(r.inv.due_date)}</td>
                  <td className="num text-xs text-left">{fmtSAR(r.inv.subtotal)}</td>
                  <td className="num text-xs text-left">{fmtSAR(r.inv.vat_amount)}</td>
                  <td className="num text-xs text-left font-semibold">{fmtSAR(r.inv.total)}</td>
                  <td className="num text-xs text-left">{fmtSAR(remaining)}</td>
                  <td><Badge className={PINV_TONE[r.inv.status]}>{PINV_LABEL[r.inv.status]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={7} className="text-left text-xs">الإجمالي</td>
                <td className="num text-xs text-left">{fmtSAR(totals.sub)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.vat)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total - totals.paid)}</td>
                <td><FileText className="h-3 w-3 text-muted-foreground" /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
