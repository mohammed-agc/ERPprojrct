import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createGRNFromShipment } from "@/services/erp/receivingDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultShipmentId?: string | null;
  onCreated?: (grnId: string) => void;
}

interface ShipOpt { id: string; shipment_no: string; allocation_id: string | null }
interface ALine {
  id: string; vin: string; brand: string; model: string;
  color: string | null; year: number | null; allocation_id: string;
  already: boolean;
}

export function GRNDbCreateDialog({ open, onOpenChange, defaultShipmentId, onCreated }: Props) {
  const [shipments, setShipments] = useState<ShipOpt[]>([]);
  const [shipmentId, setShipmentId] = useState<string>("");
  const [lines, setLines] = useState<ALine[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [warehouse, setWarehouse] = useState("");
  const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  // جلب المستودعات
  useEffect(() => {
    if (!open) return;
    supabase.from("warehouses").select("id, name").order("name").then(({ data }) => {
      const ws = (data ?? []) as { id: string; name: string }[];
      setWarehouses(ws);
      setWarehouse(prev => prev || ws[0]?.name || "");
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("shipments")
        .select("id, shipment_no, allocation_id, status")
        .in("status", ["arrived", "cleared", "in_transit", "at_customs", "shipped"])
        .order("created_at", { ascending: false });
      const opts = (data ?? []).filter(s => s.allocation_id) as ShipOpt[];
      setShipments(opts);
      const initial = defaultShipmentId ?? opts[0]?.id ?? "";
      setShipmentId(initial);
    })();
  }, [open, defaultShipmentId]);

  useEffect(() => {
    if (!shipmentId) { setLines([]); setSelected(new Set()); return; }
    (async () => {
      const ship = shipments.find(s => s.id === shipmentId);
      if (!ship?.allocation_id) return;
      const { data: aLines } = await supabase
        .from("allocation_lines")
        .select("id, vin, brand, model, color, year, allocation_id")
        .eq("allocation_id", ship.allocation_id)
        .order("line_no");
      const ids = (aLines ?? []).map(l => l.id);
      const { data: already } = await supabase
        .from("goods_receipt_lines").select("allocation_line_id").in("allocation_line_id", ids);
      const set = new Set((already ?? []).map(r => r.allocation_line_id));
      const out: ALine[] = (aLines ?? []).map(l => ({ ...l, already: set.has(l.id) } as ALine));
      setLines(out);
      setSelected(new Set(out.filter(l => !l.already).map(l => l.id)));
    })();
  }, [shipmentId, shipments]);

  const eligible = useMemo(() => lines.filter(l => !l.already), [lines]);

  const submit = async () => {
    if (!shipmentId) { toast.error("اختر الشحنة"); return; }
    const line_ids = Array.from(selected);
    if (line_ids.length === 0) { toast.error("اختر بنوداً للاستلام"); return; }
    setBusy(true);
    try {
      const grn = await createGRNFromShipment({
        shipment_id: shipmentId, warehouse, notes: notes || undefined, line_ids,
      });
      toast.success(`تم إنشاء ${grn.grn_no}`);
      onCreated?.(grn.id);
      onOpenChange(false);
      setNotes("");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر الإنشاء");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" dir="rtl">
        <DialogHeader><DialogTitle>إنشاء مذكرة استلام (GRN)</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          <div>
            <Label className="text-xs">الشحنة</Label>
            <Select value={shipmentId} onValueChange={setShipmentId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر شحنة" /></SelectTrigger>
              <SelectContent>
                {shipments.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا توجد شحنات مؤهلة</div>}
                {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.shipment_no}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">المستودع</Label>
              <Select value={warehouse} onValueChange={setWarehouse}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ملاحظات</Label>
              <Input className="h-9" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          {eligible.length === 0 && lines.length > 0 && (
            <div className="text-xs text-warning bg-warning/5 border border-warning/30 rounded p-2">
              جميع بنود هذه الشحنة سبق استلامها
            </div>
          )}

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
          <Button onClick={submit} disabled={busy || selected.size === 0}>إنشاء المذكرة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
