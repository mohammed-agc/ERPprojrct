import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { allocationService } from "@/services/erp/allocations";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocationId: string;
  onCreated?: (confirmationId: string) => void;
}

export function AllocationConfirmationDialog({ open, onOpenChange, allocationId, onCreated }: Props) {
  const [notes, setNotes] = useState("");
  const alloc = allocationService.get(allocationId);

  const submit = () => {
    const res = allocationService.createConfirmation(allocationId, notes || undefined);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(`تم إصدار وثيقة التأكيد ${res.code}`);
    onCreated?.(res.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>وثيقة تأكيد التخصيص</DialogTitle>
          <DialogDescription className="text-xs">
            وثيقة رسمية تربط التخصيص بالمورد قبل الشحن. مطلوبة قبل بدء النقل.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 p-2 bg-muted/40 rounded">
            <div><span className="text-muted-foreground">التخصيص:</span> <span className="font-mono">{alloc?.code}</span></div>
            <div><span className="text-muted-foreground">عدد المركبات:</span> <span className="font-semibold">{alloc?.lines.length ?? 0}</span></div>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="text-xs min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات إضافية على وثيقة التأكيد..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>إصدار الوثيقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
