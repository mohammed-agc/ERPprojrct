import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Search, Eye, ClipboardCheck, Truck, PackageCheck, FileSearch,
  ShieldCheck, XCircle, ShoppingCart,
} from "lucide-react";
import {
  parseVehicleMeta, landedCost, VehicleMeta, ProcurementState,
} from "@/lib/vehicleMeta";
import { PROCUREMENT_STATE_LABEL, PROCUREMENT_FLOW, VEHICLE_STATUS_CLASS } from "@/lib/vehicleStatus";

const STATE_FILTER: { value: ProcurementState | "all" | "active"; label: string }[] = [
  { value: "active", label: "قيد المعالجة" },
  { value: "all", label: "الكل" },
  ...PROCUREMENT_FLOW.map((s) => ({ value: s as ProcurementState, label: PROCUREMENT_STATE_LABEL[s] })),
  { value: "rejected" as ProcurementState, label: PROCUREMENT_STATE_LABEL.rejected },
];

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";
const fmtNum = (n?: number) =>
  Number(n ?? 0).toLocaleString("ar-SA");

export default function Procurement() {
  const nav = useNavigate();
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [state, setState] = useState<ProcurementState | "all" | "active">("active");
  const [supplier, setSupplier] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");

  const load = async () => {
    const { data } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const enriched = useMemo(
    () => rows
      .map((r) => {
        const _meta = parseVehicleMeta(r.notes) as VehicleMeta;
        return { ...r, _meta, _proc: _meta.procurement, _landed: landedCost(_meta) };
      })
      .filter((r) => !!r._proc?.state),
    [rows],
  );

  const suppliers = useMemo(
    () => Array.from(new Set(enriched.map((r) => r._proc?.supplier ?? r._meta.supplier).filter(Boolean))).sort() as string[],
    [enriched],
  );
  const branches = useMemo(
    () => Array.from(new Set(enriched.map((r) => r._proc?.branch_destination ?? r._meta.branch).filter(Boolean))).sort() as string[],
    [enriched],
  );

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return enriched.filter((r) => {
      const s = r._proc?.state as ProcurementState | undefined;
      if (state === "active" && (s === "approved" || s === "rejected" || !s)) return false;
      if (state !== "all" && state !== "active" && s !== state) return false;
      const sup = r._proc?.supplier ?? r._meta.supplier ?? "";
      const br = r._proc?.branch_destination ?? r._meta.branch ?? "";
      if (supplier !== "all" && sup !== supplier) return false;
      if (branch !== "all" && br !== branch) return false;
      if (!qv) return true;
      const hay = [
        r.code, r.name, r.brand, r.model, r.vin,
        r._proc?.request_no, r._proc?.po_reference, r._proc?.transit_tracking,
        sup, br, r._proc?.source_country,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qv);
    });
  }, [enriched, q, state, supplier, branch]);

  const kpis = useMemo(() => {
    const count = (s: ProcurementState) => enriched.filter((r) => r._proc?.state === s).length;
    return {
      requested: count("requested"),
      ordered: count("ordered"),
      in_transit: count("in_transit"),
      received: count("received"),
      inspection: count("inspection_pending"),
      approved: count("approved"),
      rejected: count("rejected"),
    };
  }, [enriched]);

  return (
    <div>
      <PageHeader
        title="المشتريات والإدخال"
        subtitle={`${enriched.length} طلب مشتريات`}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-2 mb-3">
        <Kpi icon={ClipboardCheck} label="مطلوب"      value={kpis.requested}   tone="muted" />
        <Kpi icon={ShoppingCart}   label="تم الطلب"   value={kpis.ordered}     tone="primary" />
        <Kpi icon={Truck}          label="في الطريق"  value={kpis.in_transit}  tone="primary" />
        <Kpi icon={PackageCheck}   label="مستلم"      value={kpis.received}    tone="warning" />
        <Kpi icon={FileSearch}     label="بانتظار فحص" value={kpis.inspection}  tone="warning" />
        <Kpi icon={ShieldCheck}    label="معتمد"      value={kpis.approved}    tone="success" />
        <Kpi icon={XCircle}        label="مرفوض"      value={kpis.rejected}    tone="destructive" />
      </div>

      {/* Sticky filters */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: PO، VIN، مورد، رقم تتبع..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <Select value={state} onValueChange={(v)=>setState(v as any)}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATE_FILTER.map((s)=> <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={supplier} onValueChange={setSupplier}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="المورد" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الموردين</SelectItem>
            {suppliers.map((s)=> <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.map((b)=> <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>المركبة</th>
              <th>المورد</th>
              <th>المرجع</th>
              <th>الفرع</th>
              <th>الوصول المتوقع</th>
              <th className="text-left">التكلفة (ر.س)</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد طلبات مشتريات مطابقة</td></tr>
            )}
            {filtered.map((r) => {
              const s = r._proc?.state as ProcurementState | undefined;
              return (
                <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/vehicles/${r.id}`)}>
                  <td className="font-mono text-xs">{r.code}</td>
                  <td>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-muted-foreground">{r.brand} {r.model} · {r.year}</div>
                  </td>
                  <td className="text-xs">
                    <div>{r._proc?.supplier ?? r._meta.supplier ?? "—"}</div>
                    {r._proc?.source_country && (
                      <div className="text-[10px] text-muted-foreground">{r._proc.source_country}</div>
                    )}
                  </td>
                  <td className="font-mono text-[11px]" dir="ltr">
                    {r._proc?.po_reference || r._proc?.request_no || "—"}
                  </td>
                  <td className="text-xs">{r._proc?.branch_destination ?? r._meta.branch ?? "—"}</td>
                  <td className="text-xs">{fmtDate(r._proc?.expected_arrival)}</td>
                  <td className="num text-left font-semibold">
                    {r._landed > 0 ? fmtNum(r._landed) : fmtNum(r._proc?.estimated_cost)}
                  </td>
                  <td>
                    {s && (
                      <Badge className={VEHICLE_STATUS_CLASS[s]}>
                        {PROCUREMENT_STATE_LABEL[s as Exclude<ProcurementState, "">]}
                      </Badge>
                    )}
                  </td>
                  <td onClick={(e)=>e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={()=>nav(`/vehicles/${r.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
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

function Kpi({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: number; tone: "default" | "success" | "warning" | "muted" | "primary" | "destructive" }) {
  const toneClass =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "muted" ? "text-muted-foreground" :
    tone === "primary" ? "text-primary" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-0.5">
        <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
        <span>{label}</span>
      </div>
      <div className={`text-xl font-bold num ${toneClass}`}>{value}</div>
    </div>
  );
}
