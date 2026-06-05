import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, PackageCheck } from "lucide-react";
import {
  listGRNs, GRN_LABEL, GRN_TONE, fmtDate, type GrnRow,
} from "@/services/erp/receivingDb";
import { GRNDbCreateDialog } from "@/components/erp/GRNDbCreateDialog";

export default function Receiving() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data: grns = [], isLoading } = useQuery({
    queryKey: ["grns"], queryFn: listGRNs,
  });

  const filtered = grns.filter((g: GrnRow) => {
    const v = q.trim().toLowerCase();
    if (!v) return true;
    return `${g.grn_no} ${g.warehouse ?? ""} ${g.notes ?? ""}`.toLowerCase().includes(v);
  });

  const k = {
    received: grns.filter(g => g.status === "received").length,
    inspected: grns.filter(g => g.status === "inspected").length,
    closed: grns.filter(g => g.status === "closed").length,
    cancelled: grns.filter(g => g.status === "cancelled").length,
  };

  return (
    <div>
      <PageHeader
        title="استلام البضائع"
        subtitle={`${grns.length} مذكرة استلام`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> مذكرة جديدة</Button>}
      />
      <GRNDbCreateDialog open={open} onOpenChange={setOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["grns"] })} />

      <div className="grid grid-cols-4 gap-2 mb-4">
        <Kpi label="مستلم" value={k.received} tone="primary" />
        <Kpi label="مفحوص" value={k.inspected} tone="info" />
        <Kpi label="مغلق" value={k.closed} tone="success" />
        <Kpi label="ملغي" value={k.cancelled} tone="destructive" />
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث برقم المذكرة..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>المذكرة</th><th>الشحنة</th><th>التخصيص</th><th>تاريخ الاستلام</th>
              <th>المستودع</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-xs">جارٍ التحميل...</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-xs">لا توجد مذكرات</td></tr>
            )}
            {filtered.map(g => (
              <tr key={g.id}>
                <td className="font-mono text-[11px]">
                  <Link to={`/grn/${g.id}`} className="hover:underline flex items-center gap-1.5">
                    <PackageCheck className="h-3 w-3 text-muted-foreground" />{g.grn_no}
                  </Link>
                </td>
                <td className="font-mono text-[11px] text-muted-foreground">{g.shipment_id ? g.shipment_id.slice(0, 8) : "—"}</td>
                <td className="font-mono text-[11px] text-muted-foreground">{g.allocation_id ? g.allocation_id.slice(0, 8) : "—"}</td>
                <td className="text-xs">{fmtDate(g.received_at)}</td>
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

function Kpi({ label, value, tone }: { label: string; value: number; tone: "primary" | "info" | "success" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "info" ? "text-info"
    : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
