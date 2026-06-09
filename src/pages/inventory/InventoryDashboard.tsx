import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { inventoryService, fmtSAR, type InventoryKPIs } from "@/services/erp/inventory";
import { Boxes, Car, Package, AlertTriangle, Clock, Warehouse, TrendingUp, ShieldAlert, RefreshCw } from "lucide-react";

export default function InventoryDashboard() {
  const [kpis, setKpis] = useState<InventoryKPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await inventoryService.kpis();
      setKpis(data);
    } catch (e: any) {
      setError(e.message || "خطأ في تحميل البيانات");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="mr-2 text-muted-foreground text-sm">جاري تحميل المخزون…</span>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-destructive text-sm">{error}</p>
      <button onClick={load} className="text-xs text-primary underline">إعادة المحاولة</button>
    </div>
  );

  if (!kpis) return null;

  const k = kpis;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="لوحة المخزون" subtitle="نظرة عامة على المخزون والمستودعات" />
        <button onClick={load} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> تحديث
        </button>
      </div>

      {/* Vehicle KPIs */}
      <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Car className="h-3.5 w-3.5" /> مخزون المركبات
      </div>
      <div className="grid grid-cols-6 gap-2 mb-4">
        <Kpi label="إجمالي"          value={k.vehicles.total}      tone="muted"       icon={Boxes} />
        <Kpi label="متاح للبيع"      value={k.vehicles.available}  tone="success"     icon={Car} />
        <Kpi label="محجوز"           value={k.vehicles.reserved}   tone="warning"     icon={Clock} />
        <Kpi label="بانتظار الفحص"   value={k.vehicles.inspection} tone="warning" />
        <Kpi label="في الطريق"       value={k.vehicles.inTransit}  tone="muted" />
        <Kpi label="موقوف"           value={k.vehicles.blocked}    tone="destructive" icon={ShieldAlert} />
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <BigKpi label="قيمة مخزون المركبات"   value={fmtSAR(k.vehicles.value)} icon={TrendingUp}    tone="success" />
        <BigKpi label="مركبات راكدة (≥90 يوم)" value={String(k.vehicles.aged90)} icon={AlertTriangle} tone={k.vehicles.aged90 > 0 ? "warning" : "muted"} />
        <BigKpi label="حجوزات قطع الغيار"     value={String(k.parts.reserved)}  icon={Clock}         tone="muted" />
      </div>

      {/* Parts KPIs */}
      <div className="text-[11px] font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
        <Package className="h-3.5 w-3.5" /> مخزون قطع الغيار
      </div>
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Kpi label="إجمالي الأصناف"   value={k.parts.total} tone="muted" />
        <Kpi label="منخفض/إعادة طلب" value={k.parts.low}   tone="warning"     icon={AlertTriangle} />
        <Kpi label="نفاد المخزون"     value={k.parts.out}   tone="destructive" />
        <BigKpi label="قيمة مخزون القطع" value={fmtSAR(k.parts.value)} icon={TrendingUp} tone="success" />
      </div>

      {/* Occupancy + movers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
            <Warehouse className="h-3.5 w-3.5" /> إشغال المستودعات
          </div>
          {k.occupancy.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">لا توجد مستودعات — <Link to="/inventory/warehouses" className="text-primary underline">أضف مستودع</Link></p>
          ) : (
            <div className="space-y-2">
              {k.occupancy.map(o => (
                <Link key={o.id} to="/inventory/warehouses" className="block hover:bg-muted/40 rounded p-1.5 -m-1.5 transition-colors">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="truncate">{o.name}</span>
                    <span className="text-muted-foreground">{o.vCount} مركبة · {o.pCount} صنف</span>
                  </div>
                  <div className="flex gap-1">
                    <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${o.vPct}%` }} />
                    </div>
                    <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${o.pPct}%` }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs font-semibold mb-2">المركبات الأبطأ حركة</div>
          <table className="w-full text-xs">
            <tbody>
              {k.slowVehicles.length === 0
                ? <tr><td className="text-center text-muted-foreground py-3">—</td></tr>
                : k.slowVehicles.map(v => (
                  <tr key={v.id}>
                    <td className="font-mono text-[10px] py-1">{v.vin.slice(-6)}</td>
                    <td>{v.make} {v.model} <span className="text-muted-foreground">{v.year}</span></td>
                    <td className="text-yellow-600">{v.aging_days} يوم</td>
                  </tr>
                ))
              }
            </tbody>
          </table>

          <div className="text-xs font-semibold mt-4 mb-2">القطع الأسرع حركة</div>
          <table className="w-full text-xs">
            <tbody>
              {k.fastParts.length === 0
                ? <tr><td className="text-center text-muted-foreground py-3">—</td></tr>
                : k.fastParts.map(({ part, qty }) => (
                  <tr key={part?.id}>
                    <td className="font-mono text-[10px] py-1">{part?.sku}</td>
                    <td>{part?.description}</td>
                    <td className="text-green-600">{qty} حركة</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────

function Kpi({ label, value, tone, icon: Icon }: {
  label: string;
  value: number;
  tone: "muted" | "warning" | "success" | "destructive";
  icon?: any;
}) {
  const c = tone === "success"     ? "text-green-600"
          : tone === "warning"     ? "text-yellow-600"
          : tone === "destructive" ? "text-red-600"
          : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5 flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />} {label}
      </div>
      <div className={`text-xl font-bold tabular-nums ${c}`}>{value}</div>
    </div>
  );
}

function BigKpi({ label, value, icon: Icon, tone }: {
  label: string;
  value: string;
  icon: any;
  tone: "success" | "warning" | "muted" | "destructive";
}) {
  const c = tone === "success"     ? "text-green-600"
          : tone === "warning"     ? "text-yellow-600"
          : tone === "destructive" ? "text-red-600"
          : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3 flex items-center justify-between">
      <div>
        <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
        <div className={`text-lg font-bold tabular-nums ${c}`}>{value}</div>
      </div>
      <Icon className={`h-6 w-6 ${c}`} />
    </div>
  );
}
