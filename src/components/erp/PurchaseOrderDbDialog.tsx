import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { createPurchaseOrder, listActiveSuppliers, type POLineInput } from "@/services/erp/purchasingDb";
import { LinesEditor, emptyLine, type LineDraft } from "@/components/erp/LinesEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

export function PurchaseOrderDbDialog({ open, onOpenChange, onCreated }: Props) {
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-selector"],
    queryFn: listActiveSuppliers,
    enabled: open,
  });

  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setSupplierId(""); setExpected(""); setNotes(""); setLines([emptyLine()]);
  };

  const toPOLine = (l: LineDraft): POLineInput => ({
    brand: l.manufacturer || l.brand || "",
    manufacturer: l.manufacturer || l.brand || null,
    model: l.model || "",
    trim: l.trim || null,
    year: l.year ?? null,
    color: l.color_name || null,
    quantity: l.qty || 0,
    unit_cost: l.unit_cost || 0,
    vat_pct: l.vat_pct ?? 15,
  });

  const submit = async () => {
    if (!supplierId) return toast.error("اختر المورد");
    const valid = lines
      .filter(l => (l.manufacturer || l.brand) && l.model && (l.qty || 0) > 0 && (l.unit_cost || 0) > 0)
      .map(toPOLine);
    if (!valid.length) return toast.error("أضِف بنداً صالحاً (صانع + موديل + كمية + سعر)");

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

  const realSuppliers = suppliers.filter(s => s.source === "supplier");
  const contactVendors = suppliers.filter(s => s.source === "contact");

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" dir="rtl">
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
                {realSuppliers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">الموردون المعتمدون</SelectLabel>
                    {realSuppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` — ${s.code}` : ""}</SelectItem>)}
                  </SelectGroup>
                )}
                {contactVendors.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">جهات اتصال بدور مورّد</SelectLabel>
                    {contactVendors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` — ${s.code}` : ""}</SelectItem>)}
                  </SelectGroup>
                )}
                {suppliers.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">لا يوجد موردون نشطون</div>
                )}
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

        <LinesEditor items={lines} onChange={setLines} lockedCategory="vehicle" showTotals />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>إنشاء (مسودة)</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
