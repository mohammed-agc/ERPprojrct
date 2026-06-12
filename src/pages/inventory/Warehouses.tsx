import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Warehouse as WhIcon, Building2 } from "lucide-react";
import { inventoryService, WH_KIND_LABEL } from "@/services/erp/inventory";

const KIND_TONE: Record<string, string> = {
  main: "bg-primary/10 text-primary border border-primary/30",
  branch: "bg-primary/10 text-primary border border-primary/30",
  yard: "bg-warning/10 text-warning border border-warning/40",
  transit: "bg-muted text-muted-foreground border border-border",
  inspection: "bg-warning/10 text-warning border border-warning/40",
  delivery: "bg-success/10 text-success border border-success/40",
};

export default function Warehouses() {
  const [q, setQ] = useState("");
  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);
  const kpis = useMemo(() => inventoryService.kpis(), []);
  const occ = new Map(kpis.occupancy.map(o => [o.id, o]));
  const bins = inventoryService.listBins();

  const filtered = warehouses.filter(w =>
    !q || `${w.code} ${w.name} ${w.city} ${w.branch} ${w.manager}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <PageHeader title="المستودعات" subtitle={`${warehouses.length} مستودع · ${bins.length} موقع/خانة`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رمز، اسم، مدينة..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرمز</th>
              <th>الاسم</th>
              <th>النوع</th>
              <th>المدينة / الفرع</th>
              <th>المدير</th>
              <th>إشغال المركبات</th>
              <th>إشغال القطع</th>
              <th>المواقع</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد مستودعات</td></tr>}
            {filtered.map(w => {
              const o = occ.get(w.id);
              const binCount = bins.filter(b => b.warehouse_id === w.id).length;
              return (
                <tr key={w.id}>
                  <td className="font-mono text-[12px]">
                    <div className="flex items-center gap-1.5"><WhIcon className="h-3 w-3 text-muted-foreground" />{w.code}</div>
                  </td>
                  <td className="text-sm">{w.name}</td>
                  <td><Badge className={KIND_TONE[w.kind]}>{WH_KIND_LABEL[w.kind]}</Badge></td>
                  <td className="text-xs"><div className="flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground" />{w.city}</div><div className="text-[11.5px] text-muted-foreground">{w.branch}</div></td>
                  <td className="text-xs">{w.manager}</td>
                  <td className="w-[160px]">
                    {w.capacity_vehicles > 0 ? (
                      <>
                        <div className="h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${o?.vPct ?? 0}%` }} /></div>
                        <div className="text-[11.5px] text-muted-foreground mt-0.5 num">{o?.vCount ?? 0}/{w.capacity_vehicles} · {o?.vPct ?? 0}%</div>
                      </>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="w-[160px]">
                    {w.capacity_parts > 0 ? (
                      <>
                        <div className="h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-success" style={{ width: `${o?.pPct ?? 0}%` }} /></div>
                        <div className="text-[11.5px] text-muted-foreground mt-0.5 num">{o?.pCount ?? 0}/{w.capacity_parts} · {o?.pPct ?? 0}%</div>
                      </>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="text-xs num">{binCount}</td>
                  <td>{w.active ? <Badge className="bg-success/10 text-success border border-success/40">نشط</Badge> : <Badge className="bg-muted text-muted-foreground border border-border">موقوف</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
