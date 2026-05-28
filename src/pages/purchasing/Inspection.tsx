import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldCheck, X, FileSearch, Info } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, INSP_LABEL, INSP_TONE, fmtDate,
} from "@/services/erp/purchasing";

export default function Inspection() {
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const refresh = () => setTick(t => t + 1);

  const inspections = useMemo(() => purchasingService.listInspections(), [tick]);
  const pos = useMemo(() => purchasingService.listPOs(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return inspections.filter(i => {
      if (!qv) return true;
      const po = pos.find(p => p.id === i.po_id);
      return `${i.id} ${i.inspector} ${po?.code ?? ""}`.toLowerCase().includes(qv);
    });
  }, [inspections, q, pos]);

  const totals = {
    pending: inspections.filter(i => i.status === "pending").length,
    in_progress: inspections.filter(i => i.status === "in_progress").length,
    approved: inspections.filter(i => i.status === "approved").length,
    rejected: inspections.filter(i => i.status === "rejected").length,
  };

  return (
    <div>
      <PageHeader title="الفحص والاعتماد" subtitle="فحص البضائع المستلمة قبل إتاحتها للبيع" />

      <div className="bg-warning/5 border border-warning/30 rounded-lg p-3 mb-4 flex items-start gap-2 text-xs">
        <Info className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
        <div>
          الأصناف لا تصبح <span className="font-semibold">متاحة للبيع</span> إلا بعد:
          الاستلام → الفحص → الاعتماد → دخول المخزون.
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        <Kpi label="بانتظار الفحص" value={totals.pending} tone="muted" />
        <Kpi label="قيد الفحص" value={totals.in_progress} tone="warning" />
        <Kpi label="معتمد" value={totals.approved} tone="success" />
        <Kpi label="مرفوض" value={totals.rejected} tone="destructive" />
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>أمر الشراء</th>
              <th>المفتش</th>
              <th>تاريخ البدء</th>
              <th>نتائج الفحص</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">لا توجد سجلات</td></tr>
            )}
            {filtered.map(i => {
              const po = pos.find(p => p.id === i.po_id);
              const passed = i.items.reduce((s, x) => s + x.passed, 0);
              const failed = i.items.reduce((s, x) => s + x.failed, 0);
              const canDecide = i.status === "in_progress" || i.status === "pending";
              return (
                <tr key={i.id}>
                  <td className="font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <FileSearch className="h-3 w-3 text-muted-foreground" />{po?.code ?? "—"}
                    </div>
                  </td>
                  <td className="text-xs">{i.inspector}</td>
                  <td className="text-xs">{fmtDate(i.started_at)}</td>
                  <td className="text-xs">
                    <span className="text-success font-semibold num">{passed}</span> ناجح ·{" "}
                    <span className="text-destructive font-semibold num">{failed}</span> راسب
                  </td>
                  <td><Badge className={INSP_TONE[i.status]}>{INSP_LABEL[i.status]}</Badge></td>
                  <td>
                    {canDecide && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-success"
                          onClick={() => { purchasingService.setInspectionStatus(i.id, "approved"); toast.success("تم اعتماد الفحص — الأصناف متاحة للبيع"); refresh(); }}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                          onClick={() => { purchasingService.setInspectionStatus(i.id, "rejected"); toast.error("تم رفض الفحص"); refresh(); }}>
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

function Kpi({ label, value, tone }: { label: string; value: number; tone: "muted" | "warning" | "success" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
