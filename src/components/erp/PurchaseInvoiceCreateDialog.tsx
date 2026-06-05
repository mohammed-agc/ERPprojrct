import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  listInvoiceableAllocations,
  createPurchaseInvoiceFromAllocation,
} from "@/services/erp/allocationsDb";
import { listActiveSuppliers, listPurchaseOrders } from "@/services/erp/purchasingDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultAllocationId?: string;
  onCreated?: (invoiceId: string) => void;
}

const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);

export function PurchaseInvoiceCreateDialog({ open, onOpenChange, defaultAllocationId, onCreated }: Props) {
  const [allocId, setAllocId] = useState(defaultAllocationId ?? "");
  const [vatPct, setVatPct] = useState(15);
  const [supplierRef, setSupplierRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: allocs = [], refetch } = useQuery({
    queryKey: ["invoiceable-allocations"],
    queryFn: listInvoiceableAllocations,
    enabled: open,
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers, enabled: open });
  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders, enabled: open });

  useEffect(() => {
    if (!open) return;
    setAllocId(defaultAllocationId ?? allocs[0]?.id ?? "");
    setVatPct(15); setSupplierRef(""); setNotes("");
  }, [open, defaultAllocationId, allocs]);

  const selected = useMemo(() => allocs.find(a => a.id === allocId), [allocs, allocId]);
  const supplier = useMemo(() => suppliers.find(s => s.id === selected?.supplier_id), [suppliers, selected]);
  const po = useMemo(() => pos.find(p => p.id === selected?.po_id), [pos, selected]);

  const vatAmount = selected ? +(selected.subtotal * vatPct / 100).toFixed(2) : 0;
  const total = selected ? +(selected.subtotal + vatAmount).toFixed(2) : 0;

  const submit = async () => {
    if (!selected) { toast.error("اختر تخصيصاً مؤكداً"); return; }
    setSaving(true);
    try {
      const res = await createPurchaseInvoiceFromAllocation({
        allocation_id: selected.id,
        vat_pct: vatPct,
        notes: notes || null,
        supplier_invoice_ref: supplierRef || null,
      });
      toast.success(`تم إنشاء الفاتورة ${res.invoice_no}`);
      onCreated?.(res.id);
      onOpenChange(false);
      refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر إنشاء الفاتورة");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>إنشاء فاتورة شراء</DialogTitle>
          <DialogDescription className="text-xs">
            تُنشأ الفاتورة من تخصيص مؤكَّد. بعد الإنشاء يصبح التخصيص (مفوتر) ولا يمكن ربطه بفاتورة أخرى.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          <div>
            <Label className="text-xs">التخصيص المؤكَّد</Label>
            <Select value={allocId} onValueChange={setAllocId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر التخصيص" /></SelectTrigger>
              <SelectContent>
                {allocs.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا توجد تخصيصات مؤهلة</div>}
                {allocs.map(a => {
                  const s = suppliers.find(x => x.id === a.supplier_id);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {a.alloc_no} — {s?.name ?? "—"} — {a.line_count} مركبة
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="bg-muted/40 rounded p-2 space-y-1 text-[11px]">
              <div className="flex justify-between"><span className="text-muted-foreground">المورد</span><span>{supplier?.name ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أمر الشراء</span><span className="font-mono">{po?.po_no ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عدد المركبات</span><span className="num">{selected.line_count}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي قبل الضريبة</span><span className="num">{fmtSAR(selected.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">قيمة الضريبة</span><span className="num">{fmtSAR(vatAmount)}</span></div>
              <div className="flex justify-between font-semibold"><span>الإجمالي مع الضريبة</span><span className="num">{fmtSAR(total)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">ضريبة القيمة المضافة %</Label>
              <Input type="number" className="h-9" value={vatPct} onChange={e => setVatPct(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">مرجع فاتورة المورد</Label>
              <Input className="h-9" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="رقم اختياري" />
            </div>
          </div>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="text-xs min-h-[60px]" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={!selected || saving}>إنشاء الفاتورة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
