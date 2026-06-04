import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { createPurchaseOrder, listActiveSuppliers, type POLineInput } from "@/services/erp/purchasingDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const empty = (): POLineInput => ({
  brand: "", model: "", year: new Date().getFullYear(), color: "",
  quantity: 1, unit_cost: 0, vat_pct: 15,
});

export function PurchaseOrderDbDialog({ open, onOpenChange, onCreated }: Props) {
  const { data: suppliers = [] } = useQuery({
    queryKey: ["active-suppliers"],
    queryFn: listActiveSuppliers,
    enabled: open,
  });
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLineInput[]>([empty()]);
  const [saving, setSaving] = useState(false);

  const reset = () => { setSupplierId(""); setExpected(""); setNotes(""); setLines([empty()]); };

  const update = (i: number, patch: Partial<POLineInput>) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const submit = async () => {
    if (!supplierId) return toast.error("اختر المورد");
    const valid = lines.filter(l => l.brand.trim() && l.model.trim() && Number(l.quantity) > 0 && Number(l.unit_cost) > 0);
    if (!valid.length) return toast.error("أضِف بنداً صالحاً (ماركة + موديل + كمية + سعر)");
    setSaving(true);
    try {
      const po = await createPurchaseOrder({
        supplier_id: supplierId,
        expected_delivery: expected || null,
        notes: notes.trim() || undefined,
        lines: valid,
      });
      toast.success(`تم إنشاء أمر الشراء ${po.po_no}`);
      onOpenChange(false); reset(); onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء أمر الشراء");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>أنشئ أمر شراء مباشر إلى المورد. يبدأ كمسودة، ثم يُرسل ويُؤكّد.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} {s.code ? `— ${s.code}` : ""}</SelectItem>
                ))}
                {suppliers.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">لا يوجد موردون نشطون</div>}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">تاريخ الوصول المتوقع</Label>
            <Input type="date" className="h-9" value={expected} onChange={e => setExpected(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">ملاحظات</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">بنود الأمر</Label>
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, empty()])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> بند
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="erp-table text-xs w-full">
              <thead>
                <tr>
                  <th>الماركة</th><th>الموديل</th><th>السنة</th><th>اللون</th>
                  <th className="w-20">الكمية</th><th className="w-28">سعر الوحدة</th>
                  <th className="w-16">VAT%</th><th className="w-32">الإجمالي مع الضريبة</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const sub = (l.quantity || 0) * (l.unit_cost || 0);
                  const total = sub * (1 + (l.vat_pct ?? 15) / 100);
                  return (
                    <tr key={i}>
                      <td><Input className="h-8" value={l.brand} onChange={e => update(i, { brand: e.target.value })} /></td>
                      <td><Input className="h-8" value={l.model} onChange={e => update(i, { model: e.target.value })} /></td>
                      <td><Input className="h-8" type="number" value={l.year ?? ""} onChange={e => update(i, { year: e.target.value ? Number(e.target.value) : null })} /></td>
                      <td><Input className="h-8" value={l.color ?? ""} onChange={e => update(i, { color: e.target.value })} /></td>
                      <td><Input className="h-8" type="number" min={1} value={l.quantity} onChange={e => update(i, { quantity: Number(e.target.value) || 0 })} /></td>
                      <td><Input className="h-8" type="number" min={0} value={l.unit_cost} onChange={e => update(i, { unit_cost: Number(e.target.value) || 0 })} /></td>
                      <td><Input className="h-8" type="number" min={0} max={100} value={l.vat_pct ?? 15} onChange={e => update(i, { vat_pct: Number(e.target.value) || 0 })} /></td>
                      <td className="num font-semibold">{total.toLocaleString()}</td>
                      <td>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                          disabled={lines.length === 1}
                          onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>إنشاء (مسودة)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
