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
  const shipments = useMemo(() => purchasingService.listShipments(), []);
  const pos = useMemo(() => purchasingService.listPOs(), []);

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
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد شحنات مطابقة</td></tr>
            )}
            {filtered.map(s => {
              const po = pos.find(p => p.id === s.po_id);
              return (
                <tr key={s.id}>
                  <td className="font-mono text-[11px]">
                    <div className="flex items-center gap-1.5"><Ship className="h-3 w-3 text-muted-foreground" />{s.code}</div>
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
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
