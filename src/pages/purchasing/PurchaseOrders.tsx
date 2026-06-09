import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, FileText } from "lucide-react";
import {
  listPurchaseOrders, listActiveSuppliers,
  PO_STATUS_LABEL, PO_STATUS_TONE, fmtSAR, fmtDate, type POStatus,
} from "@/services/erp/purchasingDb";
import { PurchaseOrderDbDialog } from "@/components/erp/PurchaseOrderDbDialog";

const STATUS_OPTS: { value: POStatus | "all" | "open"; label: string }[] = [
  { value: "open", label: "المفتوحة" },
  { value: "all", label: "الكل" },
  { value: "draft", label: PO_STATUS_LABEL.draft },
  { value: "sent", label: PO_STATUS_LABEL.sent },
  { value: "acknowledged", label: PO_STATUS_LABEL.acknowledged },
  { value: "partially_received", label: PO_STATUS_LABEL.partially_received },
  { value: "received", label: PO_STATUS_LABEL.received },
  { value: "cancelled", label: PO_STATUS_LABEL.cancelled },
];

export default function PurchaseOrders() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<POStatus | "all" | "open">("open");
  const [supplier, setSupplier] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: pos = [], isLoading } = useQuery({ queryKey: ["purchase-orders"], queryFn: listPurchaseOrders });
  const { data: suppliers = [] } = useQuery({ queryKey: ["active-suppliers"], queryFn: listActiveSuppliers });

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const openStates: POStatus[] = ["draft", "sent", "acknowledged", "partially_received"];
    return pos.filter(p => {
      if (status === "open" && !openStates.includes(p.status)) return false;
      if (status !== "all" && status !== "open" && p.status !== status) return false;
      if (supplier !== "all" && p.supplier_id !== supplier) return false;
      if (!qv) return true;
      const s = suppliers.find(x => x.id === p.supplier_id);
      return `${p.po_no} ${s?.name ?? ""}`.toLowerCase().includes(qv);
    });
  }, [pos, q, status, supplier, suppliers]);

  const totals = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, p) => s + Number(p.total), 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="أوامر الشراء"
        subtitle={`${totals.count} أمر · إجمالي ${fmtSAR(totals.value)}`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 ml-1" /> أمر شراء جديد</Button>}
      />
      <PurchaseOrderDbDialog open={createOpen} onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["purchase-orders"] })} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم أو مورد..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th><th>المورد</th><th>التاريخ</th><th>الوصول المتوقع</th>
              <th>الإجمالي</th><th>الحالة</th><th>طلب الشراء</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد أوامر مطابقة</td></tr>
            )}
            {filtered.map(p => {
              const s = suppliers.find(x => x.id === p.supplier_id);
              return (
                <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => nav(`/purchasing/orders/${p.id}`)}>
                  <td className="font-mono text-[11px] text-primary hover:underline">
                    <div className="flex items-center gap-1.5"><FileText className="h-3 w-3 text-muted-foreground" />{p.po_no}</div>
                  </td>
                  <td>{(p as any).contact?.name ?? s?.name ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="text-xs">{fmtDate(p.order_date)}</td>
                  <td className="text-xs">{fmtDate(p.expected_delivery)}</td>
                  <td className="num text-xs font-semibold">{fmtSAR(Number(p.total))}</td>
                  <td><Badge className={PO_STATUS_TONE[p.status]}>{PO_STATUS_LABEL[p.status]}</Badge></td>
                  <td className="text-xs text-muted-foreground">{p.pr_id ? "من طلب شراء" : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
