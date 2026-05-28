import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, AlertTriangle, Clock, X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  salesService, RES_LABEL, RES_TONE, fmtSAR, fmtRelative, fmtDateTime,
  type ReservationStatus,
} from "@/services/erp/sales";

const OPTS: { value: ReservationStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "active", label: RES_LABEL.active },
  { value: "expiring", label: RES_LABEL.expiring },
  { value: "expired", label: RES_LABEL.expired },
  { value: "released", label: RES_LABEL.released },
  { value: "converted", label: RES_LABEL.converted },
];

export default function SalesReservations() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "all">("all");
  const all = useMemo(() => salesService.listReservations(), [tick]);
  const sps = useMemo(() => salesService.listSalespeople(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(r => {
      if (status !== "all" && r.status !== status) return false;
      if (!qv) return true;
      const hay = `${r.code} ${r.customer} ${r.vehicle} ${r.branch}`.toLowerCase();
      return hay.includes(qv);
    });
  }, [all, q, status]);

  const counts = useMemo(() => ({
    active: all.filter(r => r.status === "active").length,
    expiring: all.filter(r => r.status === "expiring").length,
    expired: all.filter(r => r.status === "expired").length,
    deposits: all.filter(r => r.status === "active" || r.status === "expiring").reduce((s, r) => s + r.deposit, 0),
  }), [all]);

  const onRelease = (id: string) => { salesService.releaseReservation(id, "أُفرج يدوياً"); toast.message("تم الإفراج عن الحجز"); refresh(); };
  const onExtend = (id: string) => { salesService.extendReservation(id, 24); toast.success("تم تمديد الحجز 24 ساعة"); refresh(); };

  return (
    <div>
      <PageHeader
        title="إدارة الحجوزات"
        subtitle={`${counts.active} نشط · ${counts.expiring} قارب الانتهاء · ${counts.expired} منتهي · عرابين بقيمة ${fmtSAR(counts.deposits)}`}
        actions={<Button size="sm"><Plus className="h-4 w-4 ml-1" /> حجز جديد</Button>}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، مركبة..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>العميل / المركبة</th>
              <th>المندوب</th>
              <th>الفرع</th>
              <th>الحجز</th>
              <th>الانتهاء</th>
              <th>العربون</th>
              <th>الربح المتوقع</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد حجوزات مطابقة</td></tr>}
            {filtered.map(r => {
              const sp = sps.find(s => s.id === r.salesperson_id);
              const margin = r.expected_price - r.expected_cost;
              const expiringSoon = r.status === "expiring";
              const overlap = (r.status === "active" || r.status === "expiring") && salesService.vehicleHasActiveReservation(r.vehicle_id, r.id);
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[11px]">
                    {r.code}
                    {overlap && <div className="text-[9px] text-destructive flex items-center gap-0.5 mt-0.5"><AlertTriangle className="h-2.5 w-2.5" />تعارض حجز</div>}
                  </td>
                  <td>
                    <div className="text-sm">{r.customer}</div>
                    <div className="text-[10px] text-muted-foreground">{r.vehicle}</div>
                  </td>
                  <td className="text-xs">{sp?.name ?? "—"}</td>
                  <td className="text-xs">{r.branch}</td>
                  <td className="text-xs">{fmtDateTime(r.reserved_at)}</td>
                  <td className="text-xs">
                    <div>{fmtDateTime(r.expires_at)}</div>
                    <div className={`text-[10px] flex items-center gap-0.5 ${expiringSoon ? "text-warning font-semibold" : "text-muted-foreground"}`}>
                      {expiringSoon && <AlertTriangle className="h-2.5 w-2.5" />} {fmtRelative(r.expires_at)}
                    </div>
                  </td>
                  <td className="num text-xs">{fmtSAR(r.deposit)}</td>
                  <td className="num text-xs text-success">{fmtSAR(margin)}</td>
                  <td><Badge className={RES_TONE[r.status]}>{RES_LABEL[r.status]}</Badge></td>
                  <td className="whitespace-nowrap">
                    {(r.status === "active" || r.status === "expiring") && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-primary" onClick={() => onExtend(r.id)} title="تمديد 24 ساعة">
                          <Clock className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => onRelease(r.id)} title="إفراج">
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
