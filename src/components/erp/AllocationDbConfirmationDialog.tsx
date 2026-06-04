import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { createConfirmation, getAllocation } from "@/services/erp/allocationsDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocationId: string;
  onCreated?: (confirmationId: string) => void;
}

export function AllocationDbConfirmationDialog({ open, onOpenChange, allocationId, onCreated }: Props) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: alloc } = useQuery({
    queryKey: ["allocation", allocationId],
    queryFn: () => getAllocation(allocationId),
    enabled: open && !!allocationId,
  });

  const submit = async () => {
    setSaving(true);
    try {
      const res = await createConfirmation(allocationId, notes || undefined);
      toast.success(`تم إصدار وثيقة التأكيد ${res.conf_no}`);
      onCreated?.(res.id);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>وثيقة تأكيد التخصيص</DialogTitle>
          <DialogDescription className="text-xs">
            وثيقة رسمية تربط التخصيص بالمورد قبل الشحن.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2 p-2 bg-muted/40 rounded">
            <div><span className="text-muted-foreground">التخصيص:</span> <span className="font-mono">{alloc?.header.alloc_no}</span></div>
            <div><span className="text-muted-foreground">عدد المركبات:</span> <span className="font-semibold">{alloc?.lines.length ?? 0}</span></div>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="text-xs min-h-[80px]" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>إصدار الوثيقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
