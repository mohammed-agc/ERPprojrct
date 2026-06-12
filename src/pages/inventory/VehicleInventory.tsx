import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Car, ShieldAlert, Clock, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { parseVehicleMeta } from "@/lib/vehicleMeta";
import { inventoryService, V_STATUS_LABEL, V_STATUS_TONE, fmtSAR, fmtDate, type VehicleInvStatus } from "@/services/erp/inventory";

const STATUS_OPTS: { value: VehicleInvStatus | "all" | "sellable"; label: string }[] = [
  { value: "sellable", label: "متاح للبيع" },
  { value: "all", label: "الكل" },
  { value: "available", label: V_STATUS_LABEL.available },
  { value: "reserved", label: V_STATUS_LABEL.reserved },
  { value: "sold", label: V_STATUS_LABEL.sold },
  { value: "blocked", label: V_STATUS_LABEL.blocked },
];

type Row = {
  id: string;
  vin: string;
  engine_no: string;
  make: string;
  model: string;
  trim?: string;
  year: number;
  color: string;
  mileage: number;
  transmission?: string;
  fuel?: string;
  warehouse_id?: string;
  branch?: string;
  bin_id?: string;
  landed_cost: number;
  status: VehicleInvStatus;
  reserved_for?: string;
  reserved_until?: string;
  received_at?: string;
  aging_days: number;
  notes?: string;
};

function daysBetween(iso?: string | null): number {
  if (!iso) return 0;
  const d = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
}

function mapDbStatus(s: string | null | undefined): VehicleInvStatus {
  switch (s) {
    case "available": return "available";
    case "active": return "available";
    case "reserved": return "reserved";
    case "sold": return "sold";
    case "delivered": return "delivered";
    case "returned": return "returned";
    case "blocked": return "blocked";
    default: return "available";
  }
}

export default function VehicleInventory() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<VehicleInvStatus | "all" | "sellable">("sellable");
  const [warehouse, setWarehouse] = useState<string>("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const warehouses = useMemo(() => inventoryService.listWarehouses(), []);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory_items")
      .select("id, sku, name, brand, model, year, vin, color, cost_price, avg_cost, sale_price, status, notes, created_at, warehouse_id")
      .eq("item_type", "vehicle").order("created_at", { ascending: false }).limit(1000);
    if (error) {
      console.error("[VehicleInventory] fetch error:", error);
      setRows([]);
      setLoading(false);
      return;
    }
    const mapped: Row[] = (data ?? []).map((v: any) => {
      const meta = parseVehicleMeta(v.notes ?? null);
      return {
        id: v.id,
        vin: v.vin || "—",
        engine_no: meta.engine || "—",
        make: v.brand || "—",
        model: v.model || "—",
        trim: meta.trim,
        year: v.year,
        color: v.color || "—",
        mileage: v.mileage || 0,
        transmission: meta.transmission,
        fuel: meta.fuel_type,
        branch: meta.branch,
        landed_cost: Number(v.cost_price) || 0,
        status: mapDbStatus(v.status),
        reserved_for: meta.reservation?.customer_name,
        reserved_until: meta.reservation?.expires_at,
        received_at: v.created_at,
        aging_days: daysBetween(v.created_at),
        notes: meta.note,
      };
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // realtime: pick up new intakes immediately
    const ch = supabase
      .channel("inventory-items-channel")
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter(v => {
      if (status === "sellable" && v.status !== "available") return false;
      if (status !== "all" && status !== "sellable" && v.status !== status) return false;
      if (warehouse !== "all" && (v.branch || "") !== warehouse) return false;
      if (!qv) return true;
      return `${v.vin} ${v.engine_no} ${v.make} ${v.model} ${v.color} ${v.year}`.toLowerCase().includes(qv);
    });
  }, [rows, q, status, warehouse]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => r.branch && s.add(r.branch));
    return Array.from(s);
  }, [rows]);

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
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">
          {loading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> تحميل...</span> : `${filtered.length} نتيجة`}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الهيكل (VIN)</th>
              <th>المركبة</th>
              <th>اللون / السنة</th>
              <th>الفرع</th>
              <th>التكلفة المرحّلة</th>
              <th>العمر</th>
              <th>الحالة</th>
              <th>الحجز</th>
            </tr>
          </thead>
          <tbody>
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد مركبات مطابقة</td></tr>}
            {filtered.map(v => {
              const aged = v.aging_days >= 90 && (v.status === "available" || v.status === "blocked");
              return (
                <tr key={v.id}>
                  <td className="font-mono text-[11.5px]">
                    <div className="flex items-center gap-1.5"><Car className="h-3 w-3 text-muted-foreground" />{v.vin}</div>
                    <div className="text-[12px] text-muted-foreground">محرك: {v.engine_no}</div>
                  </td>
                  <td className="text-xs">
                    <div className="font-medium">{v.make} {v.model} {v.trim && <span className="text-muted-foreground">{v.trim}</span>}</div>
                    <div className="text-[11.5px] text-muted-foreground">{v.transmission || "—"} · {v.fuel || "—"}</div>
                  </td>
                  <td className="text-xs">{v.color} <span className="text-muted-foreground num">· {v.year}</span></td>
                  <td className="text-xs">{v.branch ?? "—"}</td>
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
                      <div className="text-[11.5px] text-destructive mt-0.5 inline-flex items-center gap-0.5"><ShieldAlert className="h-3 w-3" />{v.notes}</div>
                    )}
                  </td>
                  <td className="text-xs">
                    {v.reserved_for ? (
                      <>
                        <div>{v.reserved_for}</div>
                        {v.reserved_until && <div className="text-[11.5px] text-muted-foreground">حتى {fmtDate(v.reserved_until)}</div>}
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




