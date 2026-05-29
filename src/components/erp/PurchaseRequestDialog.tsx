import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { purchasingService, type Urgency } from "@/services/erp/purchasing";
import { LinesEditor, emptyLine, type LineDraft } from "@/components/erp/LinesEditor";
import { categoryFromDepartment, type ProductCategory } from "@/services/erp/masterData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];
const DEPARTMENTS = ["المبيعات", "قطع الغيار", "الورشة", "الإدارة", "خدمة العملاء"];

export function PurchaseRequestDialog({ open, onOpenChange, onCreated }: Props) {
  const [requester, setRequester] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<LineDraft[]>([emptyLine()]);

  const allowedCategory: ProductCategory | null = categoryFromDepartment(department);

  const reset = () => {
    setRequester(""); setDepartment(DEPARTMENTS[0]); setBranch(BRANCHES[0]);
    setUrgency("normal"); setJustification("");
    setItems([emptyLine()]);
  };

  const submit = (asDraft: boolean) => {
    if (!requester.trim()) return toast.error("يرجى إدخال اسم الطالب");
    if (!justification.trim()) return toast.error("يرجى إدخال مبرر الطلب");
    const valid = items.filter(i => (i.description.trim() || i.model || i.manufacturer) && i.qty > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل");

    const pr = purchasingService.createPR({
      requester, department, branch, urgency, justification,
      items: valid.map(i => ({
        ...i,
        description: i.description.trim() || [i.manufacturer, i.model, i.trim, i.year].filter(Boolean).join(" "),
      })),
      submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظت المسودة ${pr.code}` : `أُرسل الطلب ${pr.code} للاعتماد`);
    onOpenChange(false); reset(); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
          <DialogDescription>أنشئ طلب شراء داخلي للاعتماد قبل تحويله إلى أمر شراء.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الطالب</Label>
            <Input value={requester} onChange={e => setRequester(e.target.value)} className="h-9" />
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
        </div>

        {allowedCategory && (
          <div className="text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
            بناءً على القسم، يُسمح بإضافة: <span className="font-semibold text-foreground">
              {allowedCategory === "vehicle" ? "مركبات" : allowedCategory === "part" ? "قطع غيار" : "خدمات"}
            </span> فقط.
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">مبرر الطلب</Label>
          <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} />
        </div>

        <LinesEditor items={items} onChange={setItems} lockedCategory={allowedCategory} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
