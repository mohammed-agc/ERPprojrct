import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CalendarCheck, X } from "lucide-react";
import { toast } from "sonner";
import { inventoryService, RES_LABEL, RES_TONE, fmtDate, type ReservationStatus } from "@/services/erp/inventory";

export default function Reservations() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ReservationStatus | "all">("active");

  const reservations = useMemo(() => inventoryService.listReservations(), [tick]);
  const vehicles = useMemo(() => inventoryService.listVehicles(), [tick]);
  const parts = useMemo(() => inventoryService.listParts(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return reservations.filter(r => {
      if (status !== "all" && r.status !== status) return false;
      if (!qv) return true;
      return `${r.code} ${r.customer} ${r.branch} ${r.order_ref ?? ""}`.toLowerCase().includes(qv);
    });
  }, [reservations, q, status]);

  const unitLabel = (r: typeof reservations[number]) => {
    if (r.kind === "vehicle") {
      const v = vehicles.find(x => x.id === r.unit_id);
      return v ? `${v.make} ${v.model} · ${v.vin.slice(-6)}` : "—";
    }
    const p = parts.find(x => x.id === r.unit_id);
    return p ? `${p.sku} · ${p.description}` : "—";
  };

  const onRelease = (id: string) => {
    inventoryService.releaseReservation(id);
    toast.success("تم تحرير الحجز");
    refresh();
  };

  return (
    <div>
      <PageHeader title="حجوزات المخزون" subtitle={`${reservations.length} حجز`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، فرع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="active">{RES_LABEL.active}</SelectItem>
            <SelectItem value="expired">{RES_LABEL.expired}</SelectItem>
            <SelectItem value="released">{RES_LABEL.released}</SelectItem>
            <SelectItem value="fulfilled">{RES_LABEL.fulfilled}</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الحجز</th>
              <th>النوع</th>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>العميل</th>
              <th>الفرع</th>
              <th>المرجع</th>
              <th>تاريخ الحجز</th>
              <th>الانتهاء</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">لا توجد حجوزات</td></tr>}
            {filtered.map(r => {
              const expiringSoon = r.status === "active" && new Date(r.expires_at).getTime() - Date.now() < 86_400_000 * 2;
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[12px]"><div className="flex items-center gap-1.5"><CalendarCheck className="h-3 w-3 text-muted-foreground" />{r.code}</div></td>
                  <td className="text-xs">{r.kind === "vehicle" ? "مركبة" : "قطعة"}</td>
                  <td className="text-xs">{unitLabel(r)}</td>
                  <td className="num text-xs">{r.qty}</td>
                  <td className="text-xs">{r.customer}</td>
                  <td className="text-xs">{r.branch}</td>
                  <td className="font-mono text-[12px] text-muted-foreground">{r.order_ref ?? "—"}</td>
                  <td className="text-xs">{fmtDate(r.created_at)}</td>
                  <td className={`text-xs ${expiringSoon ? "text-warning font-semibold" : ""}`}>{fmtDate(r.expires_at)}</td>
                  <td><Badge className={RES_TONE[r.status]}>{RES_LABEL[r.status]}</Badge></td>
                  <td>
                    {r.status === "active" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => onRelease(r.id)} title="تحرير الحجز">
                        <X className="h-3.5 w-3.5" />
                      </Button>
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
