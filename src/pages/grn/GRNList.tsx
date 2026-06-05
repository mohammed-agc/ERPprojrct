import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, PackageCheck } from "lucide-react";
import {
  listGRNs, GRN_LABEL, GRN_TONE, fmtDate, type GrnStatus,
} from "@/services/erp/receivingDb";
import { useDocRefs, refLabel } from "@/hooks/useDocRefs";
import { GRNDbCreateDialog } from "@/components/erp/GRNDbCreateDialog";

const STATUSES: { v: GrnStatus | "all"; label: string }[] = [
  { v: "all", label: "الكل" },
  { v: "draft", label: GRN_LABEL.draft },
  { v: "received", label: GRN_LABEL.received },
  { v: "inspected", label: GRN_LABEL.inspected },
  { v: "closed", label: GRN_LABEL.closed },
  { v: "cancelled", label: GRN_LABEL.cancelled },
];

export default function GRNList() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<GrnStatus | "all">("all");
  const [open, setOpen] = useState(false);

  const { data: grns = [] } = useQuery({ queryKey: ["grns"], queryFn: listGRNs });
  const refs = useDocRefs({
    shipmentIds: grns.map(g => g.shipment_id),
    allocationIds: grns.map(g => g.allocation_id),
  });

  const filtered = useMemo(() => grns.filter(g => {
    if (status !== "all" && g.status !== status) return false;
    const v = q.trim().toLowerCase();
    if (!v) return true;
    return `${g.grn_no} ${g.warehouse ?? ""} ${g.notes ?? ""}`.toLowerCase().includes(v);
  }), [grns, q, status]);

  return (
    <div>
      <PageHeader
        title="قائمة إشعارات الاستلام"
        subtitle={`${filtered.length} إشعار`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> إشعار جديد</Button>}
      />
      <GRNDbCreateDialog open={open} onOpenChange={setOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["grns"] })} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as GrnStatus | "all")}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUSES.map(s => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th><th>تاريخ الاستلام</th><th>الشحنة</th><th>التخصيص</th>
              <th>المستودع</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8 text-xs">لا توجد إشعارات</td></tr>
            )}
            {filtered.map(g => (
              <tr key={g.id}>
                <td className="font-mono text-[11px]">
                  <Link to={`/grn/${g.id}`} className="hover:underline flex items-center gap-1.5">
                    <PackageCheck className="h-3 w-3 text-muted-foreground" />{g.grn_no}
                  </Link>
                </td>
                <td className="text-xs">{fmtDate(g.received_at)}</td>
                <td className="font-mono text-[11px] text-muted-foreground">{g.shipment_id ? g.shipment_id.slice(0, 8) : "—"}</td>
                <td className="font-mono text-[11px] text-muted-foreground">{g.allocation_id ? g.allocation_id.slice(0, 8) : "—"}</td>
                <td className="text-xs">{g.warehouse ?? "—"}</td>
                <td><Badge className={GRN_TONE[g.status]}>{GRN_LABEL[g.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
