import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, ArrowLeftRight } from "lucide-react";
import { inventoryService, MOV_LABEL, fmtDate } from "@/services/erp/inventory";

export default function Movements() {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | "vehicle" | "part">("all");
  const [warehouse, setWarehouse] = useState("all");

  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);
  const vehicles = useMemo(() => inventoryService.listVehicles(), []);
  const parts = useMemo(() => inventoryService.listParts(), []);

  const filtered = useMemo(() => {
    const all = inventoryService.listMovements({
      kind: kind === "all" ? undefined : kind,
      warehouseId: warehouse === "all" ? undefined : warehouse,
    });
    const qv = q.trim().toLowerCase();
    if (!qv) return all;
    return all.filter(m => `${m.code} ${m.reference ?? ""} ${m.user} ${MOV_LABEL[m.kind]}`.toLowerCase().includes(qv));
  }, [kind, warehouse, q]);

  const unitLabel = (m: typeof filtered[number]) => {
    if (m.unit_kind === "vehicle") {
      const v = vehicles.find(x => x.id === m.unit_id);
      return v ? `${v.make} ${v.model} · ${v.vin.slice(-6)}` : "—";
    }
    const p = parts.find(x => x.id === m.unit_id);
    return p ? `${p.sku} · ${p.description}` : "—";
  };

  return (
    <div>
      <PageHeader title="حركات المخزون" subtitle={`${filtered.length} حركة — سجل تدقيق كامل`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، مرجع، مستخدم..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={kind} onValueChange={(v) => setKind(v as any)}>
          <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحركات</SelectItem>
            <SelectItem value="vehicle">مركبات</SelectItem>
            <SelectItem value="part">قطع غيار</SelectItem>
          </SelectContent>
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
              <th>رقم الحركة</th>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>الصنف</th>
              <th>الكمية</th>
              <th>المستودع</th>
              <th>إلى</th>
              <th>المرجع</th>
              <th>المستخدم</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد حركات</td></tr>}
            {filtered.map(m => {
              const wh = warehouses.find(w => w.id === m.warehouse_id);
              const toWh = m.to_warehouse_id ? warehouses.find(w => w.id === m.to_warehouse_id) : null;
              const isReceive = m.kind.includes("receive");
              const isIssue = m.kind.includes("issue") || m.kind.includes("consume") || m.kind.includes("sell");
              return (
                <tr key={m.id}>
                  <td className="font-mono text-[12px]">
                    <div className="flex items-center gap-1.5"><ArrowLeftRight className="h-3 w-3 text-muted-foreground" />{m.code}</div>
                  </td>
                  <td className="text-xs">{fmtDate(m.at)}</td>
                  <td>
                    <Badge className={isReceive ? "bg-success/10 text-success border border-success/40" :
                      isIssue ? "bg-destructive/10 text-destructive border border-destructive/40" :
                        "bg-muted text-muted-foreground border border-border"}>{MOV_LABEL[m.kind]}</Badge>
                  </td>
                  <td className="text-xs">{unitLabel(m)}</td>
                  <td className="num text-xs font-semibold">{m.qty}</td>
                  <td className="text-xs">{wh?.name ?? "—"}</td>
                  <td className="text-xs">{toWh?.name ?? "—"}</td>
                  <td className="font-mono text-[12px] text-muted-foreground">{m.reference ?? "—"}</td>
                  <td className="text-xs">{m.user}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
