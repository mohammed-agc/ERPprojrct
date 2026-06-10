import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt } from "lucide-react";
import {
  listInvoices, PINV_STATUS_LABEL, PINV_STATUS_TONE, fmtSAR, fmtDate,
  type PurchaseInvoiceStatus,
} from "@/services/erp/purchaseInvoicesDb";

const STATUS_OPTS: { value: PurchaseInvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  ...(Object.keys(PINV_STATUS_LABEL) as PurchaseInvoiceStatus[]).map(s => ({ value: s, label: PINV_STATUS_LABEL[s] })),
];

export default function PurchaseInvoices() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PurchaseInvoiceStatus | "all">("all");

  const { data: invoices = [] } = useQuery({ queryKey: ["purchase-invoices"], queryFn: listInvoices });

  const filtered = useMemo(() => {
    return invoices.filter(inv => {
      if (status !== "all" && inv.status !== status) return false;
      if (q) {
        const hay = `${inv.code} ${inv.invoice_no ?? ""} ${inv.supplier_name ?? ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [invoices, q, status]);

  const totalUnpaid = filtered
    .filter(i => i.status === "confirmed" || i.status === "partially_paid")
    .reduce((s, i) => s + (Number(i.total) - Number(i.paid_amount)), 0);

  return (
    <div className="space-y-3">
      <PageHeader title="فواتير الشراء" subtitle={`${filtered.length} فاتورة · غير مسدّد: ${fmtSAR(totalUnpaid)}`} />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث: رقم الفاتورة، المورد…" className="pr-8" />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as PurchaseInvoiceStatus | "all")}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>فاتورة المورد</th>
              <th>المورد</th>
              <th>التاريخ</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقّي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد فواتير</td></tr>
            )}
            {filtered.map(inv => {
              const remaining = Number(inv.total) - Number(inv.paid_amount);
              return (
                <tr key={inv.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/purchasing/invoices/${inv.id}`} className="text-primary hover:underline flex items-center gap-1">
                      <Receipt className="h-3 w-3" />{inv.code}
                    </Link>
                  </td>
                  <td className="font-mono text-[11px]" dir="ltr">{inv.invoice_no ?? "—"}</td>
                  <td className="text-xs">{inv.supplier_name ?? "—"}</td>
                  <td className="text-xs">{fmtDate(inv.invoice_date)}</td>
                  <td className="num text-xs font-semibold">{fmtSAR(inv.total)}</td>
                  <td className="num text-xs text-success">{fmtSAR(inv.paid_amount)}</td>
                  <td className="num text-xs text-warning">{fmtSAR(remaining)}</td>
                  <td><Badge className={PINV_STATUS_TONE[inv.status]}>{PINV_STATUS_LABEL[inv.status]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
