import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { allocationService } from "@/services/erp/allocations";
import { purchasingService, fmtSAR } from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAllocationId?: string;
  onCreated?: (invoiceId: string) => void;
}

export function PurchaseInvoiceCreateDialog({ open, onOpenChange, defaultAllocationId, onCreated }: Props) {
  const [allocId, setAllocId] = useState(defaultAllocationId ?? "");
  const [vatPct, setVatPct] = useState(15);
  const [notes, setNotes] = useState("");

  const allocations = useMemo(
    () => allocationService.list().filter(a => a.status === "confirmed" && !a.invoice_id),
    [open],
  );
  const selected = allocations.find(a => a.id === allocId) ?? allocationService.get(allocId);
  const po = selected ? purchasingService.getPO(selected.po_id) : undefined;

  const submit = () => {
    if (!selected) { toast.error("اختر تخصيصاً مؤكداً"); return; }
    if (!po) { toast.error("أمر الشراء غير موجود"); return; }
    if (selected.invoice_id) { toast.error("التخصيص مرتبط بفاتورة مسبقاً"); return; }
    const inv = purchasingService.createPurchaseInvoice({
      po_id: po.id, vat_pct: vatPct, notes: notes || undefined,
    });
    if (!inv) { toast.error("تعذّر إنشاء الفاتورة — تحقق من حالة أمر الشراء"); return; }
    allocationService.attachInvoice(selected.id, inv.id, inv.code);
    toast.success(`تم إنشاء الفاتورة ${inv.code}`);
    onCreated?.(inv.id);
    onOpenChange(false);
    setAllocId(""); setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>إنشاء فاتورة شراء</DialogTitle>
          <DialogDescription className="text-xs">
            تُنشأ الفاتورة يدوياً من تخصيص مؤكد. عند السداد تنتقل المركبات إلى حالة (مفوترة) ويُسمح بالشحن.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div>
            <Label className="text-xs">التخصيص المؤكد</Label>
            <Select value={allocId} onValueChange={setAllocId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر التخصيص" /></SelectTrigger>
              <SelectContent>
                {allocations.length === 0 && <SelectItem value="_none" disabled>لا توجد تخصيصات مؤهلة</SelectItem>}
                {allocations.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.lines.length} مركبة</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && po && (
            <div className="bg-muted/40 rounded p-2 space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">أمر الشراء</span><span className="font-mono">{po.code}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عدد المركبات</span><span>{selected.lines.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إجمالي أمر الشراء</span><span className="font-semibold">{fmtSAR(po.total)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">ضريبة القيمة المضافة %</Label>
              <Input type="number" className="h-9" value={vatPct} onChange={e => setVatPct(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="text-xs min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={!selected}>إنشاء الفاتورة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
