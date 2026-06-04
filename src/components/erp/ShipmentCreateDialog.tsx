import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listPurchaseOrders } from "@/services/erp/purchasingDb";
import { listAllocations } from "@/services/erp/allocationsDb";
import { createShipment } from "@/services/erp/shipmentsDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}

export function ShipmentCreateDialog({ open, onOpenChange, onCreated }: Props) {
  const [poId, setPoId] = useState("");
  const [allocId, setAllocId] = useState<string>("__none");
  const [carrier, setCarrier] = useState("");
  const [reference, setReference] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [eta, setEta] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders, enabled: open });
  const { data: allocs = [] } = useQuery({ queryKey: ["allocations"], queryFn: listAllocations, enabled: open });
  const allocsForPo = useMemo(() => allocs.filter(a => a.po_id === poId), [allocs, poId]);

  useEffect(() => {
    if (!open) {
      setPoId(""); setAllocId("__none"); setCarrier(""); setReference("");
      setOrigin(""); setDestination(""); setEta("");
    }
  }, [open]);

  const submit = async () => {
    if (!poId) return toast.error("اختر أمر الشراء");
    if (!carrier.trim()) return toast.error("الناقل مطلوب");
    setSaving(true);
    try {
      const res = await createShipment({
        po_id: poId,
        allocation_id: allocId !== "__none" ? allocId : null,
        carrier,
        reference: reference || undefined,
        origin: origin || undefined,
        destination: destination || undefined,
        eta: eta || undefined,
      });
      toast.success(`تم إنشاء الشحنة ${res.shipment_no}`);
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
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>شحنة جديدة</DialogTitle>
          <DialogDescription className="text-xs">شحنة قيد التجهيز مرتبطة بأمر شراء.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-xs">
          <div>
            <Label className="text-xs">أمر الشراء</Label>
            <Select value={poId} onValueChange={setPoId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر أمر الشراء" /></SelectTrigger>
              <SelectContent>
                {pos.map(p => <SelectItem key={p.id} value={p.id}>{p.po_no}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">التخصيص (اختياري)</Label>
            <Select value={allocId} onValueChange={setAllocId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— بدون —</SelectItem>
                {allocsForPo.map(a => <SelectItem key={a.id} value={a.id}>{a.alloc_no}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">الناقل</Label>
              <Input className="h-9" value={carrier} onChange={e => setCarrier(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">المرجع (BL)</Label>
              <Input className="h-9" dir="ltr" value={reference} onChange={e => setReference(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">المصدر</Label>
              <Input className="h-9" value={origin} onChange={e => setOrigin(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">الوجهة</Label>
              <Input className="h-9" value={destination} onChange={e => setDestination(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">تاريخ الوصول المتوقع</Label>
              <Input type="date" className="h-9" value={eta} onChange={e => setEta(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>إنشاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
