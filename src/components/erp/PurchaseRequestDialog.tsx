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
import { purchasingService, type Urgency, type ItemKind, fmtSAR } from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

type Draft = { kind: ItemKind; description: string; qty: number; unit_cost: number };

const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];
const DEPARTMENTS = ["المبيعات", "قطع الغيار", "الورشة", "الإدارة", "خدمة العملاء"];

export function PurchaseRequestDialog({ open, onOpenChange, onCreated }: Props) {
  const [requester, setRequester] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<Draft[]>([
    { kind: "vehicle", description: "", qty: 1, unit_cost: 0 },
  ]);

  const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);

  const update = (idx: number, patch: Partial<Draft>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const reset = () => {
    setRequester(""); setDepartment(DEPARTMENTS[0]); setBranch(BRANCHES[0]);
    setUrgency("normal"); setJustification("");
    setItems([{ kind: "vehicle", description: "", qty: 1, unit_cost: 0 }]);
  };

  const submit = (asDraft: boolean) => {
    if (!requester.trim()) return toast.error("يرجى إدخال اسم الطالب");
    if (!justification.trim()) return toast.error("يرجى إدخال مبرر الطلب");
    const valid = items.filter(i => i.description.trim() && i.qty > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل");

    const pr = purchasingService.createPR({
      requester, department, branch, urgency, justification,
      items: valid, submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظت المسودة ${pr.code}` : `أُرسل الطلب ${pr.code} للاعتماد`);
    onOpenChange(false); reset(); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
          <DialogDescription>أنشئ طلب شراء داخلي للاعتماد قبل تحويله إلى أمر شراء.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الطالب</Label>
            <Input value={requester} onChange={e => setRequester(e.target.value)} className="h-9" placeholder="اسم الموظف" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الأولوية</Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="normal">عادية</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="critical">حرجة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">القسم</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الفرع</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">مبرر الطلب</Label>
          <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} placeholder="اشرح سبب الحاجة لهذه الأصناف..." />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">الأصناف</Label>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setItems([...items, { kind: "vehicle", description: "", qty: 1, unit_cost: 0 }])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> إضافة صنف
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr><th className="w-[100px]">النوع</th><th>الوصف</th><th className="w-[80px]">الكمية</th><th className="w-[120px]">سعر الوحدة</th><th className="w-[110px]">الإجمالي</th><th className="w-[40px]"></th></tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <Select value={it.kind} onValueChange={(v) => update(idx, { kind: v as ItemKind })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vehicle">مركبة</SelectItem>
                          <SelectItem value="part">قطعة غيار</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td><Input className="h-8" value={it.description} onChange={e => update(idx, { description: e.target.value })} placeholder="وصف الصنف" /></td>
                    <td><Input className="h-8 num" type="number" min={1} value={it.qty} onChange={e => update(idx, { qty: Number(e.target.value) })} /></td>
                    <td><Input className="h-8 num" type="number" min={0} value={it.unit_cost} onChange={e => update(idx, { unit_cost: Number(e.target.value) })} /></td>
                    <td className="num text-xs">{fmtSAR(it.qty * it.unit_cost)}</td>
                    <td>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-left mt-2 text-sm">القيمة التقديرية: <span className="font-semibold num">{fmtSAR(total)}</span></div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
