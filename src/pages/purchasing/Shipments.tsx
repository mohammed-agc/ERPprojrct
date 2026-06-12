import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Ship, Plus, ChevronDown, ChevronLeft } from "lucide-react";
import {
  listShipments, setShipmentStatus, SHIPMENT_LABEL, SHIPMENT_TONE, CUSTOMS_LABEL, CUSTOMS_TONE, fmtDate,
  type ShipmentStatus,
} from "@/services/erp/shipmentsDb";
import { listPurchaseOrders } from "@/services/erp/purchasingDb";
import { listAllocations } from "@/services/erp/allocationsDb";
import { supabase } from "@/integrations/supabase/client";
import { ShipmentCreateDialog } from "@/components/erp/ShipmentCreateDialog";
import { toast } from "sonner";

const STATUS_OPTS: { value: ShipmentStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  ...(Object.keys(SHIPMENT_LABEL) as ShipmentStatus[]).map(s => ({ value: s, label: SHIPMENT_LABEL[s] })),
];

interface ShipmentUnit { vin: string; engine_no: string; brand: string; model: string; year: number | null; color: string | null; }

async function listShipmentUnits(): Promise<Record<string, ShipmentUnit[]>> {
  const { data, error } = await supabase
    .from("allocation_lines")
    .select("allocation_id, vin, engine_no, brand, model, year, color");
  if (error) throw error;
  const byAlloc: Record<string, ShipmentUnit[]> = {};
  for (const r of (data ?? []) as (ShipmentUnit & { allocation_id: string })[]) {
    (byAlloc[r.allocation_id] ??= []).push(r);
  }
  return byAlloc;
}

export default function Shipments() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ShipmentStatus | "all">("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const { data: shipments = [], refetch } = useQuery({ queryKey: ["shipments"], queryFn: listShipments });

  // الانتقال للحالة التالية (متخطّياً الجمارك — شراء محلي)
  const NEXT_STATUS: Partial<Record<ShipmentStatus, ShipmentStatus>> = {
    preparing: "shipped", shipped: "in_transit", in_transit: "arrived",
  };
  const NEXT_LABEL: Partial<Record<ShipmentStatus, string>> = {
    preparing: "تأكيد الشحن", shipped: "بدء النقل", in_transit: "تأكيد الوصول",
  };
  const advanceShipment = async (id: string, current: ShipmentStatus) => {
    const next = NEXT_STATUS[current];
    if (!next) return;
    try {
      await setShipmentStatus(id, next);
      toast.success(`تم تحديث حالة الشحنة: ${SHIPMENT_LABEL[next]}`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders });
  const { data: allocs = [] } = useQuery({ queryKey: ["allocations"], queryFn: listAllocations });
  const { data: unitsByAlloc = {} } = useQuery({ queryKey: ["alloc-units"], queryFn: listShipmentUnits });

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return shipments.filter(s => {
      if (status !== "all" && s.status !== status) return false;
      if (!qv) return true;
      const po = pos.find(p => p.id === s.po_id);
      return `${s.shipment_no} ${s.carrier} ${s.reference ?? ""} ${s.origin ?? ""} ${s.destination ?? ""} ${po?.po_no ?? ""}`.toLowerCase().includes(qv);
    });
  }, [shipments, q, status, pos]);

  return (
    <div>
      <PageHeader
        title="تتبع الشحنات"
        subtitle={`${shipments.length} شحنة · ${shipments.filter(s => s.status === "in_transit").length} في الطريق`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> شحنة جديدة</Button>}
      />
      <ShipmentCreateDialog open={open} onOpenChange={setOpen} onCreated={() => refetch()} />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، ناقل، BL، أمر شراء..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as ShipmentStatus | "all")}>
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
              <th>التخصيص</th>
              <th>الناقل</th>
              <th>المرجع (BL)</th>
              <th>المصدر</th>
              <th>الوجهة</th>
              <th>الوصول</th>
              <th>الجمارك</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={12} className="text-center text-muted-foreground py-8">لا توجد شحنات مطابقة</td></tr>
            )}
            {filtered.map(s => {
              const po = pos.find(p => p.id === s.po_id);
              const alloc = s.allocation_id ? allocs.find(a => a.id === s.allocation_id) : undefined;
              const units = s.allocation_id ? (unitsByAlloc[s.allocation_id] ?? []) : [];
              const isOpen = expanded.has(s.id);
              return (
                <Fragment key={s.id}>
                  <tr className={units.length ? "cursor-pointer hover:bg-muted/30" : ""} onClick={() => units.length && toggle(s.id)}>
                    <td className="text-muted-foreground">
                      {units.length > 0 && (isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />)}
                    </td>
                    <td className="font-mono text-[12px]">
                      <div className="flex items-center gap-1.5"><Ship className="h-3 w-3 text-muted-foreground" />{s.shipment_no}</div>
                      {units.length > 0 && <div className="text-[11.5px] text-muted-foreground mt-0.5">{units.length} مركبة</div>}
                    </td>
                    <td className="font-mono text-[12px]">{po?.po_no ?? "—"}</td>
                    <td className="font-mono text-[12px]">{alloc?.alloc_no ?? "—"}</td>
                    <td className="text-xs">{s.carrier}</td>
                    <td className="font-mono text-[12px]" dir="ltr">{s.reference ?? "—"}</td>
                    <td className="text-xs">{s.origin ?? "—"}</td>
                    <td className="text-xs">{s.destination ?? "—"}</td>
                    <td className="text-xs">{fmtDate(s.eta)}</td>
                    <td><Badge className={CUSTOMS_TONE[s.customs_status]}>{CUSTOMS_LABEL[s.customs_status]}</Badge></td>
                    <td><Badge className={SHIPMENT_TONE[s.status]}>{SHIPMENT_LABEL[s.status]}</Badge></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {NEXT_STATUS[s.status] ? (
                        <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={() => advanceShipment(s.id, s.status)}>
                          {NEXT_LABEL[s.status]} <ChevronLeft className="h-3 w-3 mr-1" />
                        </Button>
                      ) : <span className="text-[11.5px] text-muted-foreground">—</span>}
                    </td>
                  </tr>
                  {isOpen && units.length > 0 && (
                    <tr className="bg-muted/20">
                      <td></td>
                      <td colSpan={11} className="p-2">
                        <div className="text-[12px] font-semibold mb-1.5">المركبات في هذه الشحنة ({units.length})</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                          {units.map(u => (
                            <div key={u.vin} className="bg-background border border-border rounded px-2 py-1 text-[11.5px] flex items-center justify-between gap-2">
                              <div dir="ltr" className="font-mono font-semibold">{u.vin}</div>
                              <div className="text-muted-foreground truncate">
                                {u.brand} {u.model} {u.year ?? ""} {u.color ? "· " + u.color : ""}
                                <span className="ml-1" dir="ltr">⚙ {u.engine_no}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}