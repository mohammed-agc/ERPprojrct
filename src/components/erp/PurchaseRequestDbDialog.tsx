import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createPurchaseRequest, type PRLineInput } from "@/services/erp/purchasingDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const empty = (): PRLineInput => ({
  brand: "", model: "", year: new Date().getFullYear(), color: "",
  quantity: 1, estimated_unit_cost: 0, notes: "",
});

export function PurchaseRequestDbDialog({ open, onOpenChange, onCreated }: Props) {
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<PRLineInput[]>([empty()]);
  const [saving, setSaving] = useState(false);

  const reset = () => { setNotes(""); setLines([empty()]); };

  const update = (i: number, patch: Partial<PRLineInput>) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const submit = async (asDraft: boolean) => {
    const valid = lines.filter(l => l.brand.trim() && l.model.trim() && Number(l.quantity) > 0);
    if (!valid.length) return toast.error("أضِف صنفاً واحداً على الأقل (الماركة + الموديل + الكمية)");
    setSaving(true);
    try {
      const pr = await createPurchaseRequest({
        notes: notes.trim() || undefined,
        lines: valid,
        submit: !asDraft,
      });
      toast.success(asDraft ? `حُفظت المسودة ${pr.pr_no}` : `أُرسل الطلب ${pr.pr_no} للاعتماد`);
      onOpenChange(false); reset(); onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء الطلب");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
          <DialogDescription>طلب شراء داخلي يحتاج اعتماد قبل تحويله لأمر شراء.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs">ملاحظات / مبرر الطلب</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">بنود الطلب</Label>
            <Button size="sm" variant="outline" onClick={() => setLines([...lines, empty()])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> بند
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="erp-table text-xs w-full">
              <thead>
                <tr>
                  <th>الماركة</th><th>الموديل</th><th>السنة</th><th>اللون</th>
                  <th className="w-20">الكمية</th><th className="w-28">سعر تقديري</th>
                  <th className="w-28">إجمالي</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td><Input className="h-8" value={l.brand} onChange={e => update(i, { brand: e.target.value })} /></td>
                    <td><Input className="h-8" value={l.model} onChange={e => update(i, { model: e.target.value })} /></td>
                    <td><Input className="h-8" type="number" value={l.year ?? ""} onChange={e => update(i, { year: e.target.value ? Number(e.target.value) : null })} /></td>
                    <td><Input className="h-8" value={l.color ?? ""} onChange={e => update(i, { color: e.target.value })} /></td>
                    <td><Input className="h-8" type="number" min={1} value={l.quantity} onChange={e => update(i, { quantity: Number(e.target.value) || 0 })} /></td>
                    <td><Input className="h-8" type="number" min={0} value={l.estimated_unit_cost} onChange={e => update(i, { estimated_unit_cost: Number(e.target.value) || 0 })} /></td>
                    <td className="num font-semibold">{(l.quantity * l.estimated_unit_cost).toLocaleString()}</td>
                    <td>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                        disabled={lines.length === 1}
                        onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)} disabled={saving}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)} disabled={saving}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
