import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { listConfirmations, fmtDate } from "@/services/erp/allocationsDb";
import { listPurchaseOrders, listActiveSuppliers } from "@/services/erp/purchasingDb";

export default function AllocationConfirmations() {
  const [q, setQ] = useState("");
  const { data: all = [] } = useQuery({ queryKey: ["alloc-confs"], queryFn: listConfirmations });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers });
  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders });

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(c => {
      if (!qv) return true;
      const sup = suppliers.find(s => s.id === c.supplier_id);
      return `${c.conf_no} ${sup?.name ?? ""} ${c.vin_list.join(" ")}`.toLowerCase().includes(qv);
    });
  }, [all, q, suppliers]);

  return (
    <div>
      <PageHeader title="وثائق تأكيد التخصيص" subtitle={`${all.length} وثيقة`} />
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، VIN..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th><th>المورد</th><th>أمر الشراء</th><th>التخصيص</th>
              <th>تاريخ التخصيص</th><th>عدد المركبات</th><th>الفاتورة</th><th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد وثائق</td></tr>
            )}
            {filtered.map(c => {
              const sup = suppliers.find(s => s.id === c.supplier_id);
              const po = pos.find(p => p.id === c.po_id);
              return (
                <tr key={c.id}>
                  <td className="font-mono text-[11px]"><Link to={`/purchasing/allocation-confirmations/${c.id}`} className="text-primary hover:underline">{c.conf_no}</Link></td>
                  <td className="text-xs">{sup?.name ?? "—"}</td>
                  <td className="font-mono text-[11px]">{po?.po_no ?? "—"}</td>
                  <td className="font-mono text-[11px]"><Link to={`/purchasing/allocations/${c.allocation_id}`} className="text-primary hover:underline">عرض</Link></td>
                  <td className="text-xs">{fmtDate(c.allocation_date)}</td>
                  <td className="text-xs num font-semibold">{c.vehicle_count}</td>
                  <td className="text-[10px]">{c.purchase_invoice_id ? <span className="text-success">مرتبطة</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-xs">{fmtDate(c.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
