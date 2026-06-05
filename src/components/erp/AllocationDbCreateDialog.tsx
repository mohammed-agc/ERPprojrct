import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  listPurchaseOrders, getPurchaseOrder, listActiveSuppliers, fmtSAR, fmtDate,
  type PORow, type POLineRow,
} from "@/services/erp/purchasingDb";
import { createAllocation, listEmployees, RECV_METHOD_LABEL, type AllocationLineInput, type ReceivingMethod } from "@/services/erp/allocationsDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPoId?: string;
  onCreated?: (allocationId: string) => void;
}

type UnitRow = {
  key: string;
  po_line_id: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  unit_cost: number;
  vat_pct: number;
  unit_index: number;
  unit_total: number;
  vin: string;
  engine_no: string;
};

function expandLines(lines: POLineRow[]): UnitRow[] {
  const rows: UnitRow[] = [];
  for (const li of lines) {
    const total = Math.max(1, Math.floor(Number(li.quantity) || 1));
    for (let i = 0; i < total; i++) {
      rows.push({
        key: `${li.id}_${i}`,
        po_line_id: li.id,
        brand: li.brand,
        model: li.model,
        year: li.year,
        color: li.color,
        unit_cost: Number(li.unit_cost) || 0,
        vat_pct: Number(li.vat_pct) || 15,
        unit_index: i + 1,
        unit_total: total,
        vin: "",
        engine_no: "",
      });
    }
  }
  return rows;
}

export function AllocationDbCreateDialog({ open, onOpenChange, defaultPoId, onCreated }: Props) {
  const [poId, setPoId] = useState(defaultPoId ?? "");
  const [rows, setRows] = useState<UnitRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [targetWarehouse, setTargetWarehouse] = useState<string>("WH-A");
  const [receivingMethod, setReceivingMethod] = useState<ReceivingMethod>("rep_pickup");
  const [receiverId, setReceiverId] = useState<string>("__none");

  const { data: pos = [] } = useQuery({ queryKey: ["pos-eligible"], queryFn: listPurchaseOrders, enabled: open });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers, enabled: open });
  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: listEmployees, enabled: open });
  const eligible = useMemo(
    () => pos.filter(p => ["acknowledged", "partially_received"].includes(p.status)),
    [pos],
  );

  const { data: poData } = useQuery({
    queryKey: ["po-detail", poId],
    queryFn: () => getPurchaseOrder(poId),
    enabled: open && !!poId,
  });

  const po: PORow | undefined = poData?.header;
  const supplier = useMemo(() => suppliers.find(s => s.id === po?.supplier_id), [suppliers, po]);

  useEffect(() => {
    if (!open) return;
    setPoId(defaultPoId ?? eligible[0]?.id ?? "");
  }, [open, defaultPoId, eligible]);

  useEffect(() => {
    if (poData?.lines) setRows(expandLines(poData.lines));
    else setRows([]);
  }, [poData]);

  const update = (key: string, patch: Partial<UnitRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const filledCount = rows.filter(r => r.vin.trim() && r.engine_no.trim()).length;

  const submit = async (confirm: boolean) => {
    if (!po) return toast.error("اختر أمر الشراء");
    if (!rows.length) return toast.error("لا توجد مركبات للتخصيص");
    setSaving(true);
    try {
      const lines: AllocationLineInput[] = rows.map(r => ({
        po_line_id: r.po_line_id,
        brand: r.brand,
        manufacturer: r.brand,
        model: r.model,
        year: r.year,
        color: r.color,
        vin: r.vin,
        engine_no: r.engine_no,
        unit_cost: r.unit_cost,
        vat_pct: r.vat_pct,
      }));
      const res = await createAllocation({
        po_id: po.id,
        supplier_id: po.supplier_id,
        target_warehouse: targetWarehouse || null,
        receiving_method: receivingMethod,
        receiver_id: receiverId !== "__none" ? receiverId : null,
        lines,
        confirm,
      });
      toast.success(`تم إنشاء التخصيص ${res.alloc_no}`);
      onCreated?.(res.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, UnitRow[]>();
    for (const r of rows) {
      if (!map.has(r.po_line_id)) map.set(r.po_line_id, []);
      map.get(r.po_line_id)!.push(r);
    }
    return Array.from(map.entries());
  }, [rows]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تخصيص المركبات — تعيين VIN</DialogTitle>
          <DialogDescription className="text-xs">
            كل وحدة مادية تحصل على VIN ورقم محرك مستقل. البيانات تُورث من أمر الشراء.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-xs">أمر الشراء</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر أمر الشراء" /></SelectTrigger>
                <SelectContent>
                  {eligible.length === 0 && <div className="text-xs text-muted-foreground p-2">لا توجد أوامر جاهزة للتخصيص</div>}
                  {eligible.map(p => {
                    const s = suppliers.find(x => x.id === p.supplier_id);
                    return <SelectItem key={p.id} value={p.id}>{p.po_no} — {s?.name ?? "—"}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-2 text-center">
              {rows.length === 0 ? "—" : <><span className="font-bold text-foreground num">{filledCount}</span> / <span className="num">{rows.length}</span> VIN</>}
            </div>
          </div>

          {po && supplier && (
            <div className="border border-primary/30 bg-primary/5 rounded-md p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground">المورد</div>
                <div className="font-semibold text-sm">{supplier.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{supplier.code}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">أمر الشراء</div>
                <div className="font-mono font-semibold">{po.po_no}</div>
                <div className="text-[10px] text-muted-foreground">{fmtDate(po.created_at)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">التسليم المتوقع</div>
                <div className="text-sm">{fmtDate(po.expected_delivery)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                <div className="font-bold num">{fmtSAR(po.total)}</div>
              </div>
            </div>
          )}

          {grouped.map(([lineId, units]) => {
            const u0 = units[0];
            const lineTotal = u0.unit_cost * units.length;
            return (
              <div key={lineId} className="border border-border rounded-md overflow-hidden">
                <div className="bg-muted/40 px-3 py-2 grid grid-cols-2 sm:grid-cols-6 gap-2 items-center border-b border-border">
                  <div className="sm:col-span-2">
                    <div className="text-[10px] text-muted-foreground">المنتج</div>
                    <div className="font-semibold">{u0.brand} {u0.model}</div>
                  </div>
                  <div><div className="text-[10px] text-muted-foreground">السنة</div><div className="num">{u0.year ?? "—"}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">اللون</div><div>{u0.color ?? "—"}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">الكمية</div><div className="num font-bold">{units.length}</div></div>
                  <div className="text-left">
                    <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                    <div className="num font-bold">{fmtSAR(lineTotal)}</div>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {units.map(u => {
                    const filled = u.vin.trim() && u.engine_no.trim();
                    return (
                      <div key={u.key} className="grid grid-cols-[90px_1fr_1fr_70px] gap-2 items-center px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge variant={filled ? "default" : "outline"} className="text-[10px] h-5">
                            وحدة {u.unit_index}/{u.unit_total}
                          </Badge>
                        </div>
                        <Input
                          className="h-8 text-[11px] font-mono uppercase"
                          placeholder="VIN (17 خانة)"
                          maxLength={17}
                          value={u.vin}
                          onChange={e => update(u.key, { vin: e.target.value.toUpperCase() })}
                        />
                        <Input
                          className="h-8 text-[11px] font-mono uppercase"
                          placeholder="رقم المحرك"
                          value={u.engine_no}
                          onChange={e => update(u.key, { engine_no: e.target.value.toUpperCase() })}
                        />
                        <div className="text-[10px] text-muted-foreground text-left num">{fmtSAR(u.unit_cost)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {po && rows.length === 0 && (
            <div className="text-center text-muted-foreground py-8 text-xs">
              لا توجد بنود في هذا الأمر للتخصيص.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={saving || rows.length === 0}>حفظ كمسودة</Button>
          <Button onClick={() => submit(true)} disabled={saving || rows.length === 0 || filledCount < rows.length}>
            تأكيد التخصيص ({filledCount}/{rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
