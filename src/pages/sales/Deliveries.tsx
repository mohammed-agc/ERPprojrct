import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, Truck, UserCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  salesService, DLV_LABEL, DLV_TONE, fmtRelative, fmtDateTime,
  type DeliveryStatus,
} from "@/services/erp/sales";

const OPTS: { value: DeliveryStatus | "all" | "open"; label: string }[] = [
  { value: "open", label: "العمليات النشطة" },
  { value: "all", label: "كل الحالات" },
  { value: "scheduled", label: DLV_LABEL.scheduled },
  { value: "ready", label: DLV_LABEL.ready },
  { value: "in_progress", label: DLV_LABEL.in_progress },
  { value: "blocked", label: DLV_LABEL.blocked },
  { value: "completed", label: DLV_LABEL.completed },
];

export default function SalesDeliveries() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | "all" | "open">("open");
  const all = useMemo(() => salesService.listDeliveries(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const open: DeliveryStatus[] = ["scheduled", "ready", "in_progress", "blocked"];
    return all.filter(d => {
      if (status === "open" && !open.includes(d.status)) return false;
      if (status !== "all" && status !== "open" && d.status !== status) return false;
      if (!qv) return true;
      const hay = `${d.code} ${d.so_code} ${d.customer} ${d.vehicle} ${d.delivery_officer} ${d.branch}`.toLowerCase();
      return hay.includes(qv);
    });
  }, [all, q, status]);

  const counts = useMemo(() => ({
    today: all.filter(d => new Date(d.scheduled_at).toDateString() === new Date().toDateString()).length,
    ready: all.filter(d => d.status === "ready").length,
    blocked: all.filter(d => d.status === "blocked").length,
  }), [all]);

  const onToggle = (id: string, idx: number) => { salesService.toggleChecklist(id, idx); refresh(); };
  const onComplete = (id: string) => { salesService.setDeliveryStatus(id, "completed"); toast.success("تم تأكيد التسليم"); refresh(); };
  const onConfirm = (id: string) => { salesService.confirmCustomer(id); toast.success("تم تسجيل تأكيد العميل"); refresh(); };

  return (
    <div>
      <PageHeader
        title="تنسيق التسليم"
        subtitle={`${counts.today} اليوم · ${counts.ready} جاهز · ${counts.blocked} متوقف`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، أمر بيع، عميل، موظف..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && <div className="text-center text-muted-foreground py-12 text-sm bg-card border border-border rounded-lg">لا توجد عمليات تسليم مطابقة</div>}
        {filtered.map(d => {
          const done = d.checklist.filter(c => c.done).length;
          const pct = (done / d.checklist.length) * 100;
          return (
            <div key={d.id} className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-primary" />
                  <span className="font-mono text-xs">{d.code}</span>
                  <span className="text-[10px] text-muted-foreground">· {d.so_code}</span>
                </div>
                <Badge className={DLV_TONE[d.status]}>{DLV_LABEL[d.status]}</Badge>
                {d.status === "blocked" && <span className="text-[10px] text-destructive flex items-center gap-0.5"><AlertTriangle className="h-2.5 w-2.5" />{d.notes}</span>}
                <div className="text-[11px] text-muted-foreground ml-auto">{fmtDateTime(d.scheduled_at)} · {fmtRelative(d.scheduled_at)}</div>
              </div>

              <div className="grid md:grid-cols-4 gap-3 p-3">
                <div className="text-xs space-y-1">
                  <div className="text-[10px] text-muted-foreground">العميل</div>
                  <div className="font-medium text-sm">{d.customer}</div>
                  <div className="text-[10px] flex items-center gap-1">
                    {d.customer_confirmed
                      ? <span className="text-success flex items-center gap-0.5"><Check className="h-3 w-3" /> أكد التسليم</span>
                      : <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-warning" onClick={() => onConfirm(d.id)}>تسجيل تأكيد العميل</Button>}
                  </div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="text-[10px] text-muted-foreground">المركبة</div>
                  <div className="font-medium text-sm">{d.vehicle}</div>
                  <div className="text-[10px] text-muted-foreground">{d.branch}</div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="text-[10px] text-muted-foreground">موظف التسليم</div>
                  <div className="font-medium text-sm flex items-center gap-1"><UserCheck className="h-3 w-3 text-primary" />{d.delivery_officer}</div>
                </div>
                <div className="text-xs space-y-1">
                  <div className="text-[10px] text-muted-foreground">الجهوزية</div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div className={`h-full ${pct === 100 ? "bg-success" : pct >= 50 ? "bg-primary" : "bg-warning"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[10px] num">{done}/{d.checklist.length} متطلبات مكتملة</div>
                </div>
              </div>

              <div className="px-3 pb-3">
                <div className="text-[10px] text-muted-foreground mb-1.5">قائمة التحقق</div>
                <div className="flex flex-wrap gap-1.5">
                  {d.checklist.map((c, idx) => (
                    <button
                      key={idx}
                      onClick={() => onToggle(d.id, idx)}
                      disabled={d.status === "completed"}
                      className={`text-[11px] px-2 py-1 rounded border transition-colors flex items-center gap-1 ${c.done ? "bg-success/10 text-success border-success/40" : "bg-muted border-border hover:bg-accent"}`}
                    >
                      <Check className={`h-3 w-3 ${c.done ? "opacity-100" : "opacity-30"}`} />
                      {c.label}
                    </button>
                  ))}
                  <div className="ml-auto">
                    {d.status === "ready" && d.customer_confirmed && (
                      <Button size="sm" className="h-7" onClick={() => onComplete(d.id)}>
                        <Check className="h-3.5 w-3.5 ml-1" /> تأكيد التسليم
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
