import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, PR_LABEL, PR_TONE, URGENCY_LABEL, URGENCY_TONE,
  fmtSAR, fmtDate, type PRStatus,
} from "@/services/erp/purchasing";
import { PurchaseRequestDialog } from "@/components/erp/PurchaseRequestDialog";

const STATUS_OPTS: { value: PRStatus | "all"; label: string }[] = [

  { value: "all", label: "كل الحالات" },
  { value: "draft", label: PR_LABEL.draft },
  { value: "pending", label: PR_LABEL.pending },
  { value: "approved", label: PR_LABEL.approved },
  { value: "converted_to_po", label: PR_LABEL.converted_to_po },
  { value: "rejected", label: PR_LABEL.rejected },
];

export default function PurchaseRequests() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PRStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);


  const all = useMemo(() => purchasingService.listPRs(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(p => {
      if (status !== "all" && p.status !== status) return false;
      if (!qv) return true;
      const hay = `${p.code} ${p.requester} ${p.department} ${p.branch} ${p.justification}`.toLowerCase();
      return hay.includes(qv);
    });
  }, [all, q, status]);

  const counts = useMemo(() => ({
    total: all.length,
    pending: all.filter(p => p.status === "pending").length,
    approved: all.filter(p => p.status === "approved").length,
  }), [all]);

  const onApprove = (id: string) => { purchasingService.approvePR(id); toast.success("تم اعتماد الطلب"); refresh(); };
  const onReject = (id: string) => { purchasingService.rejectPR(id); toast.error("تم رفض الطلب"); refresh(); };

  return (
    <div>
      <PageHeader
        title="طلبات الشراء"
        subtitle={`${counts.total} طلب · ${counts.pending} بانتظار اعتماد · ${counts.approved} معتمد`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 ml-1" /> طلب جديد</Button>}
      />
      <PurchaseRequestDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />


      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، طالب، قسم، فرع..." value={q} onChange={e => setQ(e.target.value)} />
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
              <th>الطالب</th>
              <th>القسم / الفرع</th>
              <th>الأصناف</th>
              <th>القيمة التقديرية</th>
              <th>الأولوية</th>
              <th>الحالة</th>
              <th>التاريخ</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد طلبات مطابقة</td></tr>
            )}
            {filtered.map(p => {
              const qty = p.items.reduce((s, i) => s + i.qty, 0);
              const total = p.items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
              return (
                <tr key={p.id}>
                  <td className="font-mono text-[11px]">{p.code}</td>
                  <td>
                    <div className="font-medium text-sm">{p.requester}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">{p.justification}</div>
                  </td>
                  <td className="text-xs">
                    <div>{p.department}</div>
                    <div className="text-[10px] text-muted-foreground">{p.branch}</div>
                  </td>
                  <td className="text-xs">
                    {p.items.length} صنف · <span className="num">{qty}</span> وحدة
                  </td>
                  <td className="num text-xs">{fmtSAR(total)}</td>
                  <td><Badge className={URGENCY_TONE[p.urgency]}>{URGENCY_LABEL[p.urgency]}</Badge></td>
                  <td><Badge className={PR_TONE[p.status]}>{PR_LABEL[p.status]}</Badge></td>
                  <td className="text-xs">{fmtDate(p.created_at)}</td>
                  <td className="whitespace-nowrap">
                    {p.status === "pending" && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-success" onClick={() => onApprove(p.id)}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => onReject(p.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
