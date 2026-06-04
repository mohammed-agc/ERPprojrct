import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listPurchaseRequests, setPurchaseRequestStatus,
  PR_STATUS_LABEL, PR_STATUS_TONE, fmtSAR, fmtDate, type PRStatus,
} from "@/services/erp/purchasingDb";
import { PurchaseRequestDbDialog } from "@/components/erp/PurchaseRequestDbDialog";

const STATUS_OPTS: { value: PRStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: PR_STATUS_LABEL.draft },
  { value: "submitted", label: PR_STATUS_LABEL.submitted },
  { value: "approved", label: PR_STATUS_LABEL.approved },
  { value: "converted", label: PR_STATUS_LABEL.converted },
  { value: "rejected", label: PR_STATUS_LABEL.rejected },
  { value: "cancelled", label: PR_STATUS_LABEL.cancelled },
];

export default function PurchaseRequests() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<PRStatus | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["purchase-requests"],
    queryFn: listPurchaseRequests,
  });

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(p => {
      if (status !== "all" && p.status !== status) return false;
      if (!qv) return true;
      return `${p.pr_no} ${p.notes ?? ""}`.toLowerCase().includes(qv);
    });
  }, [all, q, status]);

  const counts = useMemo(() => ({
    total: all.length,
    submitted: all.filter(p => p.status === "submitted").length,
    approved: all.filter(p => p.status === "approved").length,
  }), [all]);

  const onAction = async (id: string, newStatus: PRStatus, label: string) => {
    try {
      await setPurchaseRequestStatus(id, newStatus);
      toast.success(label);
      qc.invalidateQueries({ queryKey: ["purchase-requests"] });
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التحديث");
    }
  };

  return (
    <div>
      <PageHeader
        title="طلبات الشراء"
        subtitle={`${counts.total} طلب · ${counts.submitted} بانتظار اعتماد · ${counts.approved} معتمد`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 ml-1" /> طلب جديد</Button>}
      />
      <PurchaseRequestDbDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["purchase-requests"] })}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، ملاحظات..." value={q} onChange={e => setQ(e.target.value)} />
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
              <th>التاريخ</th>
              <th>القسم</th>
              <th>الإجمالي التقديري</th>
              <th>الحالة</th>
              <th>ملاحظات</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد طلبات مطابقة</td></tr>
            )}
            {filtered.map(p => (
              <tr key={p.id} className="cursor-pointer hover:bg-muted/40" onClick={() => nav(`/purchasing/requests/${p.id}`)}>
                <td className="font-mono text-[11px] text-primary hover:underline">{p.pr_no}</td>
                <td className="text-xs">{fmtDate(p.request_date)}</td>
                <td className="text-xs">{p.department_code}</td>
                <td className="num text-xs">{fmtSAR(Number(p.total_estimated))}</td>
                <td><Badge className={PR_STATUS_TONE[p.status]}>{PR_STATUS_LABEL[p.status]}</Badge></td>
                <td className="text-xs line-clamp-1 max-w-[300px]">{p.notes ?? "—"}</td>
                <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {p.status === "draft" && (
                    <Button size="sm" variant="outline" className="h-7 text-[11px]"
                      onClick={() => onAction(p.id, "submitted", "أُرسل للاعتماد")}>إرسال</Button>
                  )}
                  {p.status === "submitted" && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-success"
                        onClick={() => onAction(p.id, "approved", "تم الاعتماد")}>اعتماد</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                        onClick={() => onAction(p.id, "rejected", "تم الرفض")}>رفض</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
