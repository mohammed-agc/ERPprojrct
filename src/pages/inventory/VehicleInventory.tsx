import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Car, ShieldAlert, Clock } from "lucide-react";
import { inventoryService, V_STATUS_LABEL, V_STATUS_TONE, fmtSAR, fmtDate, type VehicleInvStatus } from "@/services/erp/inventory";

const STATUS_OPTS: { value: VehicleInvStatus | "all" | "sellable"; label: string }[] = [
  { value: "sellable", label: "متاح للبيع" },
  { value: "all", label: "الكل" },
  { value: "in_transit", label: V_STATUS_LABEL.in_transit },
  { value: "inspection", label: V_STATUS_LABEL.inspection },
  { value: "available", label: V_STATUS_LABEL.available },
  { value: "reserved", label: V_STATUS_LABEL.reserved },
  { value: "sold", label: V_STATUS_LABEL.sold },
  { value: "blocked", label: V_STATUS_LABEL.blocked },
];

export default function VehicleInventory() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<VehicleInvStatus | "all" | "sellable">("sellable");
  const [warehouse, setWarehouse] = useState<string>("all");

  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);
  const all = useMemo(() => inventoryService.listVehicles(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(v => {
      if (status === "sellable" && v.status !== "available") return false;
      if (status !== "all" && status !== "sellable" && v.status !== status) return false;
      if (warehouse !== "all" && v.warehouse_id !== warehouse) return false;
      if (!qv) return true;
      return `${v.vin} ${v.engine_no} ${v.make} ${v.model} ${v.color} ${v.year}`.toLowerCase().includes(qv);
    });
  }, [all, q, status, warehouse]);

  const totalValue = filtered.reduce((s, v) => s + v.landed_cost, 0);

  return (
    <div>
      <PageHeader title="مخزون المركبات" subtitle={`${filtered.length} مركبة · قيمة مرحّلة ${fmtSAR(totalValue)}`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: VIN، محرك، موديل، لون..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={warehouse} onValueChange={setWarehouse}>
          <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المستودعات</SelectItem>
            {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>VIN</th>
              <th>المركبة</th>
              <th>اللون / السنة</th>
              <th>المستودع / الموقع</th>
              <th>التكلفة المرحّلة</th>
              <th>العمر</th>
              <th>الحالة</th>
              <th>الحجز</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد مركبات مطابقة</td></tr>}
            {filtered.map(v => {
              const wh = warehouses.find(w => w.id === v.warehouse_id);
              const aged = v.aging_days >= 90 && (v.status === "available" || v.status === "blocked");
              return (
                <tr key={v.id}>
                  <td className="font-mono text-[10px]">
                    <div className="flex items-center gap-1.5"><Car className="h-3 w-3 text-muted-foreground" />{v.vin}</div>
                    <div className="text-[9px] text-muted-foreground">محرك: {v.engine_no}</div>
                  </td>
                  <td className="text-xs">
                    <div className="font-medium">{v.make} {v.model} {v.trim && <span className="text-muted-foreground">{v.trim}</span>}</div>
                    <div className="text-[10px] text-muted-foreground">{v.transmission} · {v.fuel}</div>
                  </td>
                  <td className="text-xs">{v.color} <span className="text-muted-foreground num">· {v.year}</span></td>
                  <td className="text-xs">{wh?.name ?? "—"} <div className="text-[10px] text-muted-foreground font-mono">{v.bin_id ?? "—"}</div></td>
                  <td className="num text-xs font-semibold">{fmtSAR(v.landed_cost)}</td>
                  <td className="text-xs">
                    {aged ? (
                      <span className="text-warning inline-flex items-center gap-1"><Clock className="h-3 w-3" />{v.aging_days} يوم</span>
                    ) : (
                      <span className="num text-muted-foreground">{v.aging_days} يوم</span>
                    )}
                  </td>
                  <td><Badge className={V_STATUS_TONE[v.status]}>{V_STATUS_LABEL[v.status]}</Badge>
                    {v.status === "blocked" && v.notes && (
                      <div className="text-[10px] text-destructive mt-0.5 inline-flex items-center gap-0.5"><ShieldAlert className="h-3 w-3" />{v.notes}</div>
                    )}
                  </td>
                  <td className="text-xs">
                    {v.reserved_for ? (
                      <>
                        <div>{v.reserved_for}</div>
                        <div className="text-[10px] text-muted-foreground">حتى {fmtDate(v.reserved_until)}</div>
                      </>
                    ) : <span className="text-muted-foreground">—</span>}
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
