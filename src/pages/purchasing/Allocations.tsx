import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { allocationService, ALC_STATUS_LABEL, ALC_STATUS_TONE, type AllocationStatus } from "@/services/erp/allocations";
import { purchasingService, fmtDate } from "@/services/erp/purchasing";
import { AllocationCreateDialog } from "@/components/erp/AllocationCreateDialog";

const STATUS_OPTS: { value: AllocationStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  ...(Object.keys(ALC_STATUS_LABEL) as AllocationStatus[]).map(s => ({ value: s, label: ALC_STATUS_LABEL[s] })),
];

export default function Allocations() {
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<AllocationStatus | "all">("all");
  const [open, setOpen] = useState(false);

  const all = useMemo(() => allocationService.list(), [tick]);
  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(a => {
      if (status !== "all" && a.status !== status) return false;
      if (!qv) return true;
      const sup = suppliers.find(s => s.id === a.supplier_id);
      return `${a.code} ${sup?.name ?? ""} ${a.lines.map(l => l.vin).join(" ")}`.toLowerCase().includes(qv);
    });
  }, [all, q, status, suppliers]);

  return (
    <div>
      <PageHeader
        title="تخصيص المركبات"
        subtitle={`${all.length} وثيقة · ${all.reduce((s, a) => s + a.lines.length, 0)} مركبة مخصصة`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> تخصيص جديد</Button>}
      />
      <AllocationCreateDialog open={open} onOpenChange={setOpen} onCreated={() => setTick(t => t + 1)} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مورد، VIN..." value={q} onChange={e => setQ(e.target.value)} />
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
              const po = purchasingService.getPO(a.po_id);
              const cc = allocationService.confirmationFor(a.id);
              return (
                <tr key={a.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/purchasing/allocations/${a.id}`} className="text-primary hover:underline">{a.code}</Link>
                  </td>
                  <td className="text-xs">{sup?.name ?? "—"}</td>
                  <td className="font-mono text-[11px]">{po?.code ?? "—"}</td>
                  <td className="text-xs"><span className="num font-semibold">{a.lines.length}</span> مركبة</td>
                  <td className="font-mono text-[10px]">
                    {cc ? <Link to={`/purchasing/allocation-confirmations/${cc.id}`} className="text-primary hover:underline">{cc.code}</Link> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="text-[10px]">{a.invoice_id ? <span className="text-success">مفوتر</span> : <span className="text-muted-foreground">—</span>}</td>
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
