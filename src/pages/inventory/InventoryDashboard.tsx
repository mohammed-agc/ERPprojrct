import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { inventoryService, fmtSAR } from "@/services/erp/inventory";
import { Boxes, Car, Package, AlertTriangle, Clock, Warehouse, TrendingUp, ShieldAlert } from "lucide-react";

export default function InventoryDashboard() {
  const k = useMemo(() => inventoryService.kpis(), []);
  return (
    <div>
      <PageHeader title="لوحة المخزون" subtitle="نظرة عامة على المخزون والمستودعات" />

      {/* Vehicle KPIs */}
      <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Car className="h-3.5 w-3.5" /> مخزون المركبات
      </div>
      <div className="grid grid-cols-6 gap-2 mb-4">
        <Kpi label="إجمالي" value={k.vehicles.total} tone="muted" icon={Boxes} />
        <Kpi label="متاح للبيع" value={k.vehicles.available} tone="success" icon={Car} />
        <Kpi label="محجوز" value={k.vehicles.reserved} tone="warning" icon={Clock} />
        <Kpi label="بانتظار الفحص" value={k.vehicles.inspection} tone="warning" />
        <Kpi label="في الطريق" value={k.vehicles.inTransit} tone="muted" />
        <Kpi label="موقوف" value={k.vehicles.blocked} tone="destructive" icon={ShieldAlert} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <BigKpi label="قيمة مخزون المركبات" value={fmtSAR(k.vehicles.value)} icon={TrendingUp} tone="success" />
        <BigKpi label="مركبات راكدة (≥90 يوم)" value={String(k.vehicles.aged90)} icon={AlertTriangle} tone={k.vehicles.aged90 > 0 ? "warning" : "muted"} />
        <BigKpi label="حجوزات قطع الغيار" value={String(k.parts.reserved)} icon={Clock} tone="muted" />
      </div>

      {/* Parts KPIs */}
      <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5" /> مخزون قطع الغيار
      </div>
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Kpi label="إجمالي الأصناف" value={k.parts.total} tone="muted" />
        <Kpi label="منخفض/إعادة طلب" value={k.parts.low} tone="warning" icon={AlertTriangle} />
        <Kpi label="نفاد المخزون" value={k.parts.out} tone="destructive" />
        <BigKpi label="قيمة مخزون القطع" value={fmtSAR(k.parts.value)} icon={TrendingUp} tone="success" />
      </div>

      {/* Occupancy + movers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5"><Warehouse className="h-3.5 w-3.5" /> إشغال المستودعات</div>
          <div className="space-y-2">
            {k.occupancy.map(o => (
              <Link key={o.id} to="/inventory/warehouses" className="block hover:bg-muted/40 rounded p-1.5 -m-1.5 transition-colors">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="truncate">{o.name}</span>
                  <span className="text-muted-foreground num">{o.vCount} مركبة · {o.pCount} صنف</span>
                </div>
                <div className="flex gap-1">
                  <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-primary" style={{ width: `${o.vPct}%` }} /></div>
                  <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden"><div className="h-full bg-success" style={{ width: `${o.pPct}%` }} /></div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs font-semibold mb-2">المركبات الأبطأ حركة</div>
          <table className="erp-table">
            <tbody>
              {k.slowVehicles.length === 0 && <tr><td className="text-center text-muted-foreground py-3 text-xs">—</td></tr>}
              {k.slowVehicles.map(v => (
                <tr key={v.id}>
                  <td className="font-mono text-[10px]">{v.vin.slice(-6)}</td>
                  <td className="text-xs">{v.make} {v.model} <span className="text-muted-foreground">{v.year}</span></td>
                  <td className="text-xs text-warning num">{v.aging_days} يوم</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="text-xs font-semibold mt-4 mb-2">القطع الأسرع حركة</div>
          <table className="erp-table">
            <tbody>
              {k.fastParts.length === 0 && <tr><td className="text-center text-muted-foreground py-3 text-xs">—</td></tr>}
              {k.fastParts.map(({ part, qty }) => (
                <tr key={part!.id}>
                  <td className="font-mono text-[10px]">{part!.sku}</td>
                  <td className="text-xs">{part!.description}</td>
                  <td className="text-xs text-success num">{qty} حركة</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon: Icon }: { label: string; value: number; tone: "muted" | "warning" | "success" | "destructive"; icon?: any }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />} {label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}

function BigKpi({ label, value, icon: Icon, tone }: { label: string; value: string; icon: any; tone: "success" | "warning" | "muted" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
        <div className={`text-lg font-bold num ${c}`}>{value}</div>
      </div>
      <Icon className={`h-6 w-6 ${c}`} />
    </div>
  );
}
