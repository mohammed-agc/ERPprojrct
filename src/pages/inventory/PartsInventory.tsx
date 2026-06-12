import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Package, AlertTriangle } from "lucide-react";
import { inventoryService, fmtSAR, fmtDate } from "@/services/erp/inventory";

export default function PartsInventory() {
  const [q, setQ] = useState("");
  const [warehouse, setWarehouse] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out" | "available">("all");

  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);
  const all = useMemo(() => inventoryService.listParts(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(p => {
      const avail = inventoryService.partAvailable(p);
      if (stockFilter === "low" && !(p.on_hand <= p.reorder_level && p.on_hand > 0)) return false;
      if (stockFilter === "out" && p.on_hand !== 0) return false;
      if (stockFilter === "available" && avail <= 0) return false;
      if (warehouse !== "all" && p.warehouse_id !== warehouse) return false;
      if (!qv) return true;
      return `${p.sku} ${p.oem_no} ${p.barcode} ${p.description} ${p.category} ${p.compatible.join(" ")}`.toLowerCase().includes(qv);
    });
  }, [all, q, warehouse, stockFilter]);

  const totalValue = filtered.reduce((s, p) => s + p.on_hand * p.avg_cost, 0);

  return (
    <div>
      <PageHeader title="مخزون قطع الغيار" subtitle={`${filtered.length} صنف · قيمة ${fmtSAR(totalValue)}`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: SKU، باركود، OEM، وصف..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المخزون</SelectItem>
            <SelectItem value="available">متاح للبيع</SelectItem>
            <SelectItem value="low">منخفض / إعادة طلب</SelectItem>
            <SelectItem value="out">نفاد</SelectItem>
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
              <th>SKU</th>
              <th>الوصف</th>
              <th>OEM / باركود</th>
              <th>الفئة</th>
              <th>المستودع / الموقع</th>
              <th>المخزون</th>
              <th>محجوز</th>
              <th>متاح</th>
              <th>إعادة طلب</th>
              <th>متوسط التكلفة</th>
              <th>القيمة</th>
              <th>آخر حركة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={12} className="text-center text-muted-foreground py-8">لا توجد قطع مطابقة</td></tr>}
            {filtered.map(p => {
              const wh = warehouses.find(w => w.id === p.warehouse_id);
              const avail = inventoryService.partAvailable(p);
              const isLow = p.on_hand <= p.reorder_level;
              const isOut = p.on_hand === 0;
              return (
                <tr key={p.id}>
                  <td className="font-mono text-[12px]"><div className="flex items-center gap-1.5"><Package className="h-3 w-3 text-muted-foreground" />{p.sku}</div></td>
                  <td className="text-xs">
                    <div>{p.description}</div>
                    <div className="text-[11.5px] text-muted-foreground">{p.compatible.slice(0, 2).join(" · ")}</div>
                  </td>
                  <td className="font-mono text-[11.5px] text-muted-foreground">{p.oem_no}<div>{p.barcode}</div></td>
                  <td className="text-xs">{p.category}</td>
                  <td className="text-xs">{wh?.name ?? "—"}<div className="text-[11.5px] text-muted-foreground font-mono">{p.bin_id ?? "—"}</div></td>
                  <td className="num text-xs font-semibold">{p.on_hand}</td>
                  <td className="num text-xs text-warning">{p.reserved}</td>
                  <td className={`num text-xs font-semibold ${avail === 0 ? "text-destructive" : "text-success"}`}>{avail}</td>
                  <td className="num text-xs text-muted-foreground">{p.reorder_level}
                    {isOut ? (
                      <Badge className="bg-destructive/10 text-destructive border border-destructive/40 mr-1 mt-0.5 text-[12px]">نفاد</Badge>
                    ) : isLow ? (
                      <span className="text-warning inline-flex items-center gap-0.5 mr-1"><AlertTriangle className="h-3 w-3" /></span>
                    ) : null}
                  </td>
                  <td className="num text-xs">{fmtSAR(p.avg_cost)}</td>
                  <td className="num text-xs font-semibold">{fmtSAR(p.on_hand * p.avg_cost)}</td>
                  <td className="text-xs">{fmtDate(p.last_movement_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
