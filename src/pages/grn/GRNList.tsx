import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, AlertTriangle, PackageCheck } from "lucide-react";
import {
  purchasingService, RECV_LABEL, RECV_TONE, INSP_LABEL, INSP_TONE, fmtDate,
  type ReceivingStatus,
} from "@/services/erp/purchasing";
import { GRNCreateDialog } from "@/components/erp/GRNCreateDialog";

const STATUS_OPTS: { value: ReceivingStatus | "all" | "open"; label: string }[] = [
  { value: "open", label: "النشطة" },
  { value: "all", label: "الكل" },
  { value: "draft", label: RECV_LABEL.draft },
  { value: "partial", label: RECV_LABEL.partial },
  { value: "received", label: RECV_LABEL.received },
  { value: "with_discrepancy", label: RECV_LABEL.with_discrepancy },
  { value: "awaiting_inspection", label: RECV_LABEL.awaiting_inspection },
  { value: "completed", label: RECV_LABEL.completed },
  { value: "cancelled", label: RECV_LABEL.cancelled },
];

export default function GRNList() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReceivingStatus | "all" | "open">("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [tick, setTick] = useState(0);

  const pos = useMemo(() => purchasingService.listPOs(), [tick]);
  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const grns = useMemo(() => purchasingService.listGRNs(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const open: ReceivingStatus[] = ["draft", "receiving", "pending", "partial", "with_discrepancy", "awaiting_inspection", "received"];
    return grns.filter(g => {
      if (status === "open" && !open.includes(g.status)) return false;
      if (status !== "all" && status !== "open" && g.status !== status) return false;
      if (!qv) return true;
      const po = pos.find(p => p.id === g.po_id);
      const sup = suppliers.find(s => s.id === po?.supplier_id);
      return `${g.code} ${g.warehouse} ${g.receiver} ${po?.code ?? ""} ${sup?.name ?? ""} ${g.shipment_ref ?? ""}`
        .toLowerCase().includes(qv);
    });
  }, [grns, q, status, pos, suppliers]);

  return (
    <div>
      <PageHeader
        title="قائمة إشعارات الاستلام"
        subtitle={`${filtered.length} إشعار`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 ml-1" /> إشعار جديد
          </Button>
        }
      />
      <GRNCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => setTick(t => t + 1)} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، PO، مورد، شحنة..." value={q} onChange={e => setQ(e.target.value)} />
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
              <th>أمر الشراء</th>
              <th>المورد</th>
              <th>المستودع</th>
              <th>الشحنة</th>
              <th>المستلم</th>
              <th>التاريخ</th>
              <th>التقدم</th>
              <th>الفروقات</th>
              <th>الحالة</th>
              <th>الفحص</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} className="text-center text-muted-foreground py-8">لا توجد إشعارات</td></tr>
            )}
            {filtered.map(g => {
              const po = pos.find(p => p.id === g.po_id);
              const sup = suppliers.find(s => s.id === po?.supplier_id);
              const prog = po ? purchasingService.poReceivingProgress(po.id) : null;
              const discCount = (g.discrepancies?.length ?? 0)
                + g.items.filter(i => i.condition !== "ok").length;
              return (
                <tr key={g.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/grn/${g.id}`} className="hover:underline flex items-center gap-1.5">
                      <PackageCheck className="h-3 w-3 text-muted-foreground" />{g.code}
                    </Link>
                  </td>
                  <td className="font-mono text-[11px]">{po?.code ?? "—"}</td>
                  <td className="text-xs">{sup?.name ?? "—"}</td>
                  <td className="text-xs">{g.warehouse}</td>
                  <td className="text-xs font-mono">{g.shipment_ref ?? "—"}</td>
                  <td className="text-xs">{g.receiver}</td>
                  <td className="text-xs">{fmtDate(g.received_at)}</td>
                  <td className="w-[110px]">
                    {prog ? (
                      <>
                        <div className="h-1.5 bg-muted rounded overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${prog.pct}%` }} />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 num">{prog.receivedQty}/{prog.orderedQty}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td className="text-xs">
                    {discCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <AlertTriangle className="h-3 w-3" /><span className="num">{discCount}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td><Badge className={RECV_TONE[g.status]}>{RECV_LABEL[g.status]}</Badge></td>
                  <td><Badge className={INSP_TONE[g.inspection_status]}>{INSP_LABEL[g.inspection_status]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
