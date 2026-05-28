import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { allocationService } from "@/services/erp/allocations";
import { purchasingService } from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPoId?: string;
  onCreated?: (allocationId: string) => void;
}

type Draft = { vin: string; engine_no: string; brand: string; model: string; year: number; color: string; trim: string; cost: number };

const blankLine = (): Draft => ({ vin: "", engine_no: "", brand: "Toyota", model: "", year: new Date().getFullYear(), color: "أبيض", trim: "", cost: 0 });

export function AllocationCreateDialog({ open, onOpenChange, defaultPoId, onCreated }: Props) {
  const [poId, setPoId] = useState(defaultPoId ?? "");
  const [lines, setLines] = useState<Draft[]>([blankLine()]);

  const eligiblePOs = purchasingService.listPOs().filter(p =>
    ["approved","awaiting_supplier_confirmation","allocation_pending","ready_for_allocation","ordered"].includes(p.status)
  );

  const updateLine = (idx: number, patch: Partial<Draft>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));

  const submit = (confirm: boolean) => {
    if (!poId) { toast.error("اختر أمر الشراء"); return; }
    if (lines.length === 0 || lines.some(l => !l.vin.trim() || !l.engine_no.trim())) {
      toast.error("VIN ورقم المحرك مطلوبان لكل مركبة"); return;
    }
    const res = allocationService.createAllocation({
      po_id: poId,
      lines: lines.map(l => ({
        vin: l.vin.trim().toUpperCase(), engine_no: l.engine_no.trim().toUpperCase(),
        brand: l.brand, model: l.model, year: Number(l.year), color: l.color, trim: l.trim || undefined,
        cost: Number(l.cost) || undefined,
      })),
    });
    if ("error" in res) { toast.error(res.error); return; }
    if (confirm) allocationService.confirmAllocation(res.id);
    toast.success(`تم إنشاء التخصيص ${res.code}`);
    onCreated?.(res.id);
    onOpenChange(false);
    setLines([blankLine()]); setPoId("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تخصيص مركبات من المورد</DialogTitle>
          <DialogDescription className="text-xs">
            تبدأ سجلات المركبات هنا — قبل الفاتورة والشحن. أرقام VIN فريدة عالمياً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">أمر الشراء</Label>
              <Select value={poId} onValueChange={setPoId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر أمر الشراء" /></SelectTrigger>
                <SelectContent>
                  {eligiblePOs.map(p => <SelectItem key={p.id} value={p.id}>{p.code} — {p.branch_destination}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border border-border rounded">
            <div className="flex items-center justify-between p-2 border-b border-border bg-muted/40">
              <span className="font-semibold">المركبات المخصصة</span>
              <Button size="sm" variant="outline" className="h-7" onClick={() => setLines(l => [...l, blankLine()])}>
                <Plus className="h-3 w-3 ml-1" /> إضافة مركبة
              </Button>
            </div>
            <div className="divide-y divide-border">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_90px_70px_90px_90px_60px_28px] gap-1.5 p-2 items-center">
                  <Input className="h-8 text-[11px] font-mono" placeholder="VIN" value={l.vin} onChange={e => updateLine(i, { vin: e.target.value })} />
                  <Input className="h-8 text-[11px] font-mono" placeholder="رقم المحرك" value={l.engine_no} onChange={e => updateLine(i, { engine_no: e.target.value })} />
                  <Input className="h-8 text-[11px]" placeholder="الماركة" value={l.brand} onChange={e => updateLine(i, { brand: e.target.value })} />
                  <Input className="h-8 text-[11px]" placeholder="السنة" type="number" value={l.year} onChange={e => updateLine(i, { year: Number(e.target.value) })} />
                  <Input className="h-8 text-[11px]" placeholder="الموديل" value={l.model} onChange={e => updateLine(i, { model: e.target.value })} />
                  <Input className="h-8 text-[11px]" placeholder="اللون" value={l.color} onChange={e => updateLine(i, { color: e.target.value })} />
                  <Input className="h-8 text-[11px]" placeholder="الفئة" value={l.trim} onChange={e => updateLine(i, { trim: e.target.value })} />
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => setLines(prev => prev.filter((_, x) => x !== i))} disabled={lines.length === 1}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="secondary" onClick={() => submit(false)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(true)}>إنشاء وتأكيد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
