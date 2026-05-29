import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { allocationService } from "@/services/erp/allocations";
import { purchasingService, fmtSAR, fmtDate, type LineItem, type PurchaseOrder } from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPoId?: string;
  onCreated?: (allocationId: string) => void;
}

/** A flat row representing exactly ONE physical vehicle unit. */
type UnitRow = {
  key: string;
  po_line_id: string;
  manufacturer: string;
  model: string;
  trim?: string;
  year: number;
  color: string;
  unit_cost: number;
  vat_pct: number;
  unit_index: number;       // 1..qty per PO line
  unit_total: number;       // qty of that line, for "Unit 2 / 3" label
  vin: string;
  engine_no: string;
};

function poLineLabel(li: LineItem): { manufacturer: string; model: string; trim?: string; year: number; color: string } {
  return {
    manufacturer: li.manufacturer || li.brand || "—",
    model: li.model || li.description || "—",
    trim: li.trim,
    year: li.year ?? new Date().getFullYear(),
    color: li.color_name || "—",
  };
}

function expandPO(po: PurchaseOrder): UnitRow[] {
  const rows: UnitRow[] = [];
  for (const li of po.items) {
    if (li.kind !== "vehicle") continue;
    const meta = poLineLabel(li);
    const total = Math.max(1, Math.floor(li.qty));
    for (let i = 0; i < total; i++) {
      rows.push({
        key: `${li.id}_${i}`,
        po_line_id: li.id,
        manufacturer: meta.manufacturer,
        model: meta.model,
        trim: meta.trim,
        year: meta.year,
        color: meta.color,
        unit_cost: li.unit_cost,
        vat_pct: li.vat_pct ?? 15,
        unit_index: i + 1,
        unit_total: total,
        vin: "",
        engine_no: "",
      });
    }
  }
  return rows;
}

export function AllocationCreateDialog({ open, onOpenChange, defaultPoId, onCreated }: Props) {
  const eligiblePOs = useMemo(
    () => purchasingService.listPOs().filter(p => ["ready_for_allocation", "allocation_pending"].includes(p.status)),
    [open],
  );
  const [poId, setPoId] = useState(defaultPoId ?? eligiblePOs[0]?.id ?? "");
  const [rows, setRows] = useState<UnitRow[]>([]);

  const po = useMemo(() => (poId ? purchasingService.getPO(poId) : undefined), [poId]);
  const supplier = po ? purchasingService.getSupplier(po.supplier_id) : undefined;

  useEffect(() => {
    if (!open) return;
    setPoId(defaultPoId ?? eligiblePOs[0]?.id ?? "");
  }, [open, defaultPoId, eligiblePOs]);

  useEffect(() => {
    if (po) setRows(expandPO(po));
    else setRows([]);
  }, [po]);

  const update = (key: string, patch: Partial<UnitRow>) =>
    setRows(prev => prev.map(r => (r.key === key ? { ...r, ...patch } : r)));

  const filledCount = rows.filter(r => r.vin.trim() && r.engine_no.trim()).length;

  const submit = (confirm: boolean) => {
    if (!poId) return toast.error("اختر أمر الشراء");
    if (rows.length === 0) return toast.error("لا توجد مركبات للتخصيص في هذا الأمر");

    // VIN/Engine validation
    const seen = new Set<string>();
    for (const r of rows) {
      const vin = r.vin.trim().toUpperCase();
      const eng = r.engine_no.trim().toUpperCase();
      if (!vin) return toast.error(`الوحدة ${r.unit_index} من ${r.model}: VIN مطلوب`);
      if (!eng) return toast.error(`الوحدة ${r.unit_index} من ${r.model}: رقم المحرك مطلوب`);
      if (vin.length < 11) return toast.error(`VIN غير صالح: ${vin}`);
      if (seen.has(vin)) return toast.error(`VIN مكرر داخل الطلب: ${vin}`);
      seen.add(vin);
    }

    const res = allocationService.createAllocation({
      po_id: poId,
      lines: rows.map(r => ({
        vin: r.vin.trim().toUpperCase(),
        engine_no: r.engine_no.trim().toUpperCase(),
        brand: r.manufacturer,
        manufacturer: r.manufacturer,
        model: r.model,
        year: r.year,
        color: r.color,
        trim: r.trim,
        cost: r.unit_cost,
        vat_pct: r.vat_pct,
        po_line_id: r.po_line_id,
      })),
    });
    if ("error" in res) return toast.error(res.error);
    if (confirm) allocationService.confirmAllocation(res.id);
    toast.success(`تم إنشاء التخصيص ${res.code} — ${rows.length} مركبة`);
    onCreated?.(res.id);
    onOpenChange(false);
  };

  // Group rows by PO line for the visual sections
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
            كل وحدة مادية تحصل على VIN ورقم محرك مستقل. لا يتم تكرار بيانات المنتج — تُورث تلقائياً من أمر الشراء.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {/* PO picker */}
          <div className="grid grid-cols-3 gap-2 items-end">
            <div className="col-span-2">
              <Label className="text-xs">أمر الشراء</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر أمر الشراء" /></SelectTrigger>
                <SelectContent>
                  {eligiblePOs.length === 0 && <div className="text-xs text-muted-foreground p-2">لا توجد أوامر جاهزة للتخصيص</div>}
                  {eligiblePOs.map(p => {
                    const s = purchasingService.getSupplier(p.supplier_id);
                    return <SelectItem key={p.id} value={p.id}>{p.code} — {s?.name ?? "—"}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-2 text-center">
              {rows.length === 0 ? "—" : <><span className="font-bold text-foreground num">{filledCount}</span> / <span className="num">{rows.length}</span> VIN مُدخل</>}
            </div>
          </div>

          {/* Supplier + PO header banner */}
          {po && supplier && (
            <div className="border border-primary/30 bg-primary/5 rounded-md p-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground">المورد</div>
                <div className="font-semibold text-sm">{supplier.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{supplier.code}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">أمر الشراء</div>
                <div className="font-mono font-semibold">{po.code}</div>
                <div className="text-[10px] text-muted-foreground">{fmtDate(po.created_at)}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">الفرع الوجهة</div>
                <div className="text-sm">{po.branch_destination}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">الإجمالي</div>
                <div className="font-bold num">{fmtSAR(po.total)}</div>
              </div>
            </div>
          )}

          {/* Unit cards grouped by PO line */}
          {grouped.map(([lineId, units]) => {
            const u0 = units[0];
            const lineTotal = u0.unit_cost * units.length;
            const lineVat = lineTotal * (u0.vat_pct / 100);
            return (
              <div key={lineId} className="border border-border rounded-md overflow-hidden">
                {/* PO line summary */}
                <div className="bg-muted/40 px-3 py-2 grid grid-cols-2 sm:grid-cols-7 gap-2 items-center border-b border-border">
                  <div className="sm:col-span-2">
                    <div className="text-[10px] text-muted-foreground">المنتج</div>
                    <div className="font-semibold">{u0.manufacturer} {u0.model}</div>
                  </div>
                  <div><div className="text-[10px] text-muted-foreground">الفئة</div><div>{u0.trim || "—"}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">السنة</div><div className="num">{u0.year}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">اللون</div><div>{u0.color}</div></div>
                  <div><div className="text-[10px] text-muted-foreground">الكمية</div><div className="num font-bold">{units.length}</div></div>
                  <div className="text-left">
                    <div className="text-[10px] text-muted-foreground">الإجمالي + ض</div>
                    <div className="num font-bold">{fmtSAR(lineTotal + lineVat)}</div>
                    <div className="text-[10px] text-muted-foreground num">{fmtSAR(u0.unit_cost)} × {units.length}</div>
                  </div>
                </div>

                {/* Per-unit VIN rows */}
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
              لا توجد بنود مركبات في هذا الأمر للتخصيص.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="secondary" onClick={() => submit(false)} disabled={rows.length === 0}>حفظ كمسودة</Button>
          <Button onClick={() => submit(true)} disabled={rows.length === 0 || filledCount < rows.length}>
            تأكيد التخصيص ({filledCount}/{rows.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
