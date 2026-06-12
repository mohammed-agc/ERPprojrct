import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileSearch, Info } from "lucide-react";
import { listInspections, INS_LABEL, INS_TONE, fmtDate } from "@/services/erp/receivingDb";

export default function Inspection() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { data: items = [] } = useQuery({ queryKey: ["inspections"], queryFn: listInspections });

  const filtered = useMemo(() => items.filter(i => {
    const v = q.trim().toLowerCase();
    if (!v) return true;
    return `${i.insp_no} ${i.notes ?? ""}`.toLowerCase().includes(v);
  }), [items, q]);

  const k = {
    pending: items.filter(i => i.status === "pending" || i.status === "in_progress").length,
    approved: items.filter(i => i.status === "approved").length,
    rejected: items.filter(i => i.status === "rejected").length,
  };

  return (
    <div>
      <PageHeader title="الفحص والاعتماد" subtitle="فحص المركبات بعد الاستلام وإنشاء سجلات المخزون" />

      <div className="bg-warning/5 border border-warning/30 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
        <div>
          المركبات لا تصبح <span className="font-semibold">متاحة</span> إلا بعد:
          الاستلام → الفحص → الاعتماد → <span className="font-semibold">إنشاء سجل المركبة تلقائياً</span>.
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        <Kpi label="قيد الفحص" value={k.pending} tone="warning" />
        <Kpi label="معتمد" value={k.approved} tone="success" />
        <Kpi label="مرفوض" value={k.rejected} tone="destructive" />
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث برقم الفحص..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>رقم الفحص</th><th>المذكرة</th><th>تاريخ البدء</th><th>إنتهى في</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-8 text-xs">لا توجد سجلات</td></tr>
            )}
            {filtered.map(i => (
              <tr key={i.id} className="cursor-pointer hover:bg-muted/40" onClick={() => nav(`/purchasing/inspection/${i.id}`)}>
                <td className="font-mono text-[12px]">
                  <div className="flex items-center gap-1.5">
                    <FileSearch className="h-3 w-3 text-muted-foreground" />{i.insp_no}
                  </div>
                </td>
                <td className="font-mono text-[12px] text-muted-foreground">{i.grn_id.slice(0, 8)}</td>
                <td className="text-xs">{fmtDate(i.started_at)}</td>
                <td className="text-xs">{fmtDate(i.completed_at)}</td>
                <td><Badge className={INS_TONE[i.status]}>{INS_LABEL[i.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "warning" | "success" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-destructive";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[11.5px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
