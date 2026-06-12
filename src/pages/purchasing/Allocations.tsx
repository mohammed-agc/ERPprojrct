import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import {
  listAllocations, listConfirmations, ALC_STATUS_LABEL, ALC_STATUS_TONE, fmtDate,
  type AllocationStatus,
} from "@/services/erp/allocationsDb";
import { listPurchaseOrders, listActiveSuppliers } from "@/services/erp/purchasingDb";
import { supabase } from "@/integrations/supabase/client";
import { AllocationDbCreateDialog } from "@/components/erp/AllocationDbCreateDialog";

const STATUS_OPTS: { value: AllocationStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  ...(Object.keys(ALC_STATUS_LABEL) as AllocationStatus[]).map(s => ({ value: s, label: ALC_STATUS_LABEL[s] })),
];

async function listLineCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("allocation_lines").select("allocation_id");
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { allocation_id: string }[]) {
    counts[r.allocation_id] = (counts[r.allocation_id] ?? 0) + 1;
  }
  return counts;
}

export default function Allocations() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AllocationStatus | "all">("all");
  const [open, setOpen] = useState(false);

  const { data: allocs = [], refetch } = useQuery({ queryKey: ["allocations"], queryFn: listAllocations });
  const { data: confirmations = [] } = useQuery({ queryKey: ["alloc-confs"], queryFn: listConfirmations });
  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers });
  const { data: lineCounts = {} } = useQuery({ queryKey: ["alloc-line-counts"], queryFn: listLineCounts });

  const totalLines = useMemo(() => Object.values(lineCounts).reduce((a, b) => a + b, 0), [lineCounts]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return allocs.filter(a => {
      if (status !== "all" && a.status !== status) return false;
      if (!qv) return true;
      const sup = suppliers.find(s => s.id === a.supplier_id);
      const po = pos.find(p => p.id === a.po_id);
      return `${a.alloc_no} ${sup?.name ?? ""} ${po?.po_no ?? ""}`.toLowerCase().includes(qv);
    });
  }, [allocs, q, status, suppliers, pos]);

  return (
    <div>
      <PageHeader
        title="تخصيص المركبات"
        subtitle={`${allocs.length} وثيقة · ${totalLines} مركبة مخصصة`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> تخصيص جديد</Button>}
      />
      <AllocationDbCreateDialog open={open} onOpenChange={setOpen} onCreated={() => refetch()} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، أمر شراء..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as AllocationStatus | "all")}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>المورد</th>
              <th>أمر الشراء</th>
              <th>عدد المركبات</th>
              <th>وثيقة التأكيد</th>
              <th>الفاتورة</th>
              <th>الحالة</th>
              <th>التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد وثائق مطابقة</td></tr>
            )}
            {filtered.map(a => {
              const sup = suppliers.find(s => s.id === a.supplier_id);
              const po = pos.find(p => p.id === a.po_id);
              const cc = confirmations.find(c => c.allocation_id === a.id);
              return (
                <tr key={a.id}>
                  <td className="font-mono text-[12px]">
                    <Link to={`/purchasing/allocations/${a.id}`} className="text-primary hover:underline">{a.alloc_no}</Link>
                  </td>
                  <td className="text-xs">{sup?.name ?? "—"}</td>
                  <td className="font-mono text-[12px]">{po?.po_no ?? "—"}</td>
                  <td className="text-xs"><span className="num font-semibold">{lineCounts[a.id] ?? 0}</span> مركبة</td>
                  <td className="font-mono text-[11.5px]">
                    {cc ? <Link to={`/purchasing/allocation-confirmations/${cc.id}`} className="text-primary hover:underline">{cc.conf_no}</Link> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-[11.5px]">{a.purchase_invoice_id ? <span className="text-success">مفوتر</span> : <span className="text-muted-foreground">—</span>}</td>
                  <td><Badge className={ALC_STATUS_TONE[a.status]}>{ALC_STATUS_LABEL[a.status]}</Badge></td>
                  <td className="text-xs">{fmtDate(a.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
