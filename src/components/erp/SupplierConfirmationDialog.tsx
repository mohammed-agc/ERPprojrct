import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { purchasingService } from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poId: string;
  onDone?: () => void;
}

type Outcome = "confirm_all" | "confirm_partial" | "model_change" | "qty_change" | "rejected";

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "confirm_all", label: "تأكيد جميع المركبات" },
  { value: "confirm_partial", label: "تأكيد جزئي" },
  { value: "model_change", label: "تغيير في الموديلات" },
  { value: "qty_change", label: "تغيير في الكميات" },
  { value: "rejected", label: "رفض التخصيص" },
];

export function SupplierConfirmationDialog({ open, onOpenChange, poId, onDone }: Props) {
  const [outcome, setOutcome] = useState<Outcome>("confirm_all");
  const [note, setNote] = useState("");

  const submit = () => {
  const submit = () => {
    purchasingService.supplierConfirm(poId, outcome, undefined, note || undefined);
    toast.success(outcome === "rejected" ? "تم تسجيل الرفض" : "تم تسجيل تأكيد المورد");
    onDone?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>تأكيد المورد</DialogTitle>
          <DialogDescription className="text-xs">
            سجّل استجابة المورد لأمر الشراء. عند التأكيد يُفتح تخصيص المركبات.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <div>
            <Label className="text-xs">نتيجة التأكيد</Label>
            <Select value={outcome} onValueChange={v => setOutcome(v as Outcome)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea className="text-xs min-h-[60px]" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} variant={outcome === "rejected" ? "destructive" : "default"}>تسجيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
