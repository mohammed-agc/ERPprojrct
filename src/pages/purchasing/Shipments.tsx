import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Ship } from "lucide-react";
import {
  purchasingService, SHIPMENT_LABEL, SHIPMENT_TONE, fmtDate, type ShipmentStatus,
} from "@/services/erp/purchasing";
import { getPoVehicleUnits } from "@/lib/poVehicleUnits";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_OPTS: { value: ShipmentStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "preparing", label: SHIPMENT_LABEL.preparing },
  { value: "shipped", label: SHIPMENT_LABEL.shipped },
  { value: "in_transit", label: SHIPMENT_LABEL.in_transit },
  { value: "at_customs", label: SHIPMENT_LABEL.at_customs },
  { value: "cleared", label: SHIPMENT_LABEL.cleared },
  { value: "arrived", label: SHIPMENT_LABEL.arrived },
];

const CUSTOMS_LABEL: Record<string, string> = {
  not_started: "لم تبدأ", in_progress: "قيد التخليص", cleared: "تم التخليص",
};
const CUSTOMS_TONE: Record<string, string> = {
  not_started: "bg-muted text-muted-foreground border border-border",
  in_progress: "bg-warning/10 text-warning border border-warning/40",
  cleared: "bg-success/10 text-success border border-success/40",
};

export default function Shipments() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const shipments = useMemo(() => purchasingService.listShipments(), []);
  const pos = useMemo(() => purchasingService.listPOs(), []);

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return shipments.filter(s => {
      if (status !== "all" && s.status !== status) return false;
      if (!qv) return true;
      const po = pos.find(p => p.id === s.po_id);
      return `${s.code} ${s.carrier} ${s.reference} ${s.origin} ${s.destination} ${po?.code ?? ""}`.toLowerCase().includes(qv);
    });
  }, [shipments, q, status, pos]);

  return (
    <div>
      <PageHeader title="تتبع الشحنات" subtitle={`${shipments.length} شحنة · ${shipments.filter(s => s.status === "in_transit").length} في الطريق`} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، ناقل، BL، أمر شراء..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-6"></th>
              <th>الشحنة</th>
              <th>أمر الشراء</th>
              <th>الناقل</th>
              <th>المرجع (BL)</th>
              <th>المصدر</th>
              <th>الوجهة</th>
              <th>الوصول</th>
              <th>الجمارك</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد شحنات مطابقة</td></tr>
            )}
            {filtered.map(s => {
              const po = pos.find(p => p.id === s.po_id);
              const units = getPoVehicleUnits(s.po_id);
              const isOpen = expanded.has(s.id);
              return (
                <>
                <tr key={s.id} className={units.length ? "cursor-pointer hover:bg-muted/30" : ""} onClick={() => units.length && toggle(s.id)}>
                  <td className="text-muted-foreground">
                    {units.length > 0 && (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />)}
                  </td>
                  <td className="font-mono text-[11px]">
                    <div className="flex items-center gap-1.5"><Ship className="h-3 w-3 text-muted-foreground" />{s.code}</div>
                    {units.length > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{units.length} مركبة · VIN جاهز</div>}
                  </td>
                  <td className="font-mono text-[11px]">{po?.code ?? "—"}</td>
                  <td className="text-xs">{s.carrier}</td>
                  <td className="font-mono text-[11px]" dir="ltr">{s.reference}</td>
                  <td className="text-xs">{s.origin}</td>
                  <td className="text-xs">{s.destination}</td>
                  <td className="text-xs">{fmtDate(s.eta)}</td>
                  <td><Badge className={CUSTOMS_TONE[s.customs_status]}>{CUSTOMS_LABEL[s.customs_status]}</Badge></td>
                  <td><Badge className={SHIPMENT_TONE[s.status]}>{SHIPMENT_LABEL[s.status]}</Badge></td>
                </tr>
                {isOpen && units.length > 0 && (
                  <tr key={s.id + "_x"} className="bg-muted/20">
                    <td></td>
                    <td colSpan={9} className="p-2">
                      <div className="text-[11px] font-semibold mb-1.5">المركبات في هذه الشحنة ({units.length})</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                        {units.map(u => (
                          <div key={u.alloc_line_id} className="bg-background border border-border rounded px-2 py-1 text-[10px] flex items-center justify-between gap-2">
                            <div dir="ltr" className="font-mono font-semibold">{u.vin}</div>
                            <div className="text-muted-foreground truncate">
                              {u.manufacturer} {u.model} {u.year} · {u.color}{u.trim ? " · " + u.trim : ""}
                              <span className="ml-1" dir="ltr">⚙ {u.engine_no}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
