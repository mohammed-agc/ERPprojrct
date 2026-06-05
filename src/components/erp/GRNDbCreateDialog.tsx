import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createGRNFromShipment, createGRNFromAllocation } from "@/services/erp/receivingDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultShipmentId?: string | null;
  defaultAllocationId?: string | null;
  onCreated?: (grnId: string) => void;
}

type Source = "allocation" | "shipment";
interface ShipOpt { id: string; shipment_no: string; allocation_id: string | null }
interface AllocOpt { id: string; alloc_no: string; target_warehouse: string | null }
interface ALine {
  id: string; vin: string; brand: string; model: string;
  color: string | null; year: number | null;
  already: boolean;
}

export function GRNDbCreateDialog({ open, onOpenChange, defaultShipmentId, defaultAllocationId, onCreated }: Props) {
  const [source, setSource] = useState<Source>(defaultShipmentId ? "shipment" : "allocation");
  const [shipments, setShipments] = useState<ShipOpt[]>([]);
  const [allocations, setAllocations] = useState<AllocOpt[]>([]);
  const [shipmentId, setShipmentId] = useState<string>("");
  const [allocationId, setAllocationId] = useState<string>("");
  const [lines, setLines] = useState<ALine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warehouse, setWarehouse] = useState("WH-A");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [shipRes, allocRes] = await Promise.all([
        supabase.from("shipments")
          .select("id, shipment_no, allocation_id, status")
          .in("status", ["arrived", "cleared", "in_transit", "at_customs", "shipped"])
          .order("created_at", { ascending: false }),
        supabase.from("allocations")
          .select("id, alloc_no, target_warehouse, status")
          .in("status", ["confirmed", "invoiced", "in_transit"])
          .order("created_at", { ascending: false }),
      ]);
      setShipments(((shipRes.data ?? []) as ShipOpt[]).filter(s => s.allocation_id));
      setAllocations((allocRes.data ?? []) as AllocOpt[]);
      if (defaultShipmentId) { setSource("shipment"); setShipmentId(defaultShipmentId); }
      else if (defaultAllocationId) { setSource("allocation"); setAllocationId(defaultAllocationId); }
    })();
  }, [open, defaultShipmentId, defaultAllocationId]);

  const activeAllocId = useMemo(() => {
    if (source === "allocation") return allocationId;
    return shipments.find(s => s.id === shipmentId)?.allocation_id ?? "";
  }, [source, allocationId, shipmentId, shipments]);

  useEffect(() => {
    if (!activeAllocId) { setLines([]); setSelected(new Set()); return; }
    (async () => {
      const { data: aLines } = await supabase
        .from("allocation_lines")
        .select("id, vin, brand, model, color, year")
        .eq("allocation_id", activeAllocId).order("line_no");
      const ids = (aLines ?? []).map(l => l.id);
      const { data: already } = await supabase
        .from("goods_receipt_lines").select("allocation_line_id").in("allocation_line_id", ids);
      const set = new Set((already ?? []).map(r => r.allocation_line_id));
      const out: ALine[] = (aLines ?? []).map(l => ({ ...l, already: set.has(l.id) } as ALine));
      setLines(out);
      setSelected(new Set(out.filter(l => !l.already).map(l => l.id)));
      // Pre-fill warehouse from allocation target if available
      if (source === "allocation") {
        const a = allocations.find(x => x.id === activeAllocId);
        if (a?.target_warehouse) setWarehouse(a.target_warehouse);
      }
    })();
  }, [activeAllocId, source, allocations]);

  const submit = async () => {
    const line_ids = Array.from(selected);
    if (line_ids.length === 0) { toast.error("اختر بنوداً للاستلام"); return; }
    setBusy(true);
    try {
      const grn = source === "shipment"
        ? await createGRNFromShipment({ shipment_id: shipmentId, warehouse, notes: notes || undefined, line_ids })
        : await createGRNFromAllocation({ allocation_id: allocationId, warehouse, notes: notes || undefined, line_ids });
      toast.success(`تم إنشاء ${grn.grn_no}`);
      onCreated?.(grn.id);
      onOpenChange(false);
      setNotes("");
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string; hint?: string; code?: string };
      const msg = err?.message || err?.details || err?.hint || "تعذر الإنشاء";
      toast.error(msg, { description: err?.code ? `code: ${err.code}` : undefined });
      console.error("[GRN create]", e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء مذكرة استلام (GRN)</DialogTitle>
          <DialogDescription className="text-xs">
            استلم مباشرة من التخصيص، أو من سجل نقل/تسليم إن وُجد.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <RadioGroup value={source} onValueChange={(v) => setSource(v as Source)} className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 border border-border rounded p-2 cursor-pointer text-xs">
              <RadioGroupItem value="allocation" />
              <span>من التخصيص مباشرة</span>
            </label>
            <label className="flex items-center gap-2 border border-border rounded p-2 cursor-pointer text-xs">
              <RadioGroupItem value="shipment" />
              <span>من سجل نقل/تسليم</span>
            </label>
          </RadioGroup>

          {source === "shipment" ? (
            <div>
              <Label className="text-xs">سجل النقل/التسليم</Label>
              <Select value={shipmentId} onValueChange={setShipmentId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر سجلاً" /></SelectTrigger>
                <SelectContent>
                  {shipments.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا توجد سجلات مؤهلة</div>}
                  {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.shipment_no}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div>
              <Label className="text-xs">التخصيص</Label>
              <Select value={allocationId} onValueChange={setAllocationId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر تخصيصاً" /></SelectTrigger>
                <SelectContent>
                  {allocations.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا توجد تخصيصات مؤكدة</div>}
                  {allocations.map(a => <SelectItem key={a.id} value={a.id}>{a.alloc_no}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">المستودع</Label>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WH-A">المستودع أ</SelectItem>
                  <SelectItem value="WH-B">المستودع ب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input className="h-9" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="border border-border rounded overflow-hidden">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th></th><th>VIN</th><th>الموديل</th><th>السنة</th><th>اللون</th><th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr><td colSpan={6} className="text-center text-muted-foreground py-4">—</td></tr>
                )}
                {lines.map(l => (
                  <tr key={l.id} className={l.already ? "opacity-50" : ""}>
                    <td>
                      <Checkbox
                        checked={selected.has(l.id)}
                        disabled={l.already}
                        onCheckedChange={(v) => {
                          const n = new Set(selected);
                          if (v) n.add(l.id); else n.delete(l.id);
                          setSelected(n);
                        }}
                      />
                    </td>
                    <td className="font-mono text-[10px]" dir="ltr">{l.vin}</td>
                    <td>{l.brand} {l.model}</td>
                    <td className="num">{l.year ?? "—"}</td>
                    <td>{l.color ?? "—"}</td>
                    <td className="text-[10px]">{l.already ? "مستلم سابقاً" : "متاح"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={busy || selected.size === 0 || (source === "shipment" ? !shipmentId : !allocationId)}>
            إنشاء المذكرة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
