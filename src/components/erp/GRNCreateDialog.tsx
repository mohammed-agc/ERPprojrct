import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { purchasingService } from "@/services/erp/purchasing";
import { inventoryService } from "@/services/erp/inventory";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (grnId: string) => void;
  /** Optionally pin to a specific PO */
  poId?: string;
}

export function GRNCreateDialog({ open, onOpenChange, onCreated, poId }: Props) {
  const pos = useMemo(
    () => purchasingService.listPOs().filter(p => ["approved", "ordered", "partially_received"].includes(p.status)),
    [open],
  );
  const warehouses = useMemo(() => inventoryService.listWarehouses().filter(w => w.active), [open]);

  const [selectedPo, setSelectedPo] = useState<string>(poId || "");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [yard, setYard] = useState<string>("");
  const [receiver, setReceiver] = useState<string>("م. ماجد");
  const [shipmentRef, setShipmentRef] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const po = pos.find(p => p.id === selectedPo);
  const invoices = useMemo(
    () => (selectedPo ? purchasingService.invoicesForPO(selectedPo) : []),
    [selectedPo],
  );
  const [invoiceId, setInvoiceId] = useState<string>("");

  const wh = warehouses.find(w => w.id === warehouseId);
  const gate = selectedPo ? purchasingService.canCreateGRN(selectedPo) : { allowed: false, reason: "اختر أمر شراء" };

  function handleCreate() {
    if (!selectedPo) { toast.error("اختر أمر الشراء"); return; }
    if (!gate.allowed) { toast.error(gate.reason || "غير مسموح"); return; }
    if (!warehouseId) { toast.error("اختر المستودع"); return; }
    const grn = purchasingService.createGRN({
      po_id: selectedPo,
      invoice_id: invoiceId || undefined,
      warehouse: wh?.name ?? "",
      warehouse_id: warehouseId,
      branch: wh?.branch ?? po?.branch_destination,
      yard: yard || undefined,
      receiver,
      shipment_ref: shipmentRef || undefined,
      notes: notes || undefined,
    });
    if (!grn) { toast.error("تعذّر إنشاء إشعار الاستلام"); return; }
    toast.success(`تم إنشاء ${grn.code}`);
    onOpenChange(false);
    onCreated?.(grn.id);
    // reset
    setSelectedPo(poId || ""); setWarehouseId(""); setYard(""); setShipmentRef(""); setNotes(""); setInvoiceId("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إنشاء إشعار استلام (GRN)</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <Label className="text-xs">أمر الشراء *</Label>
            <Select value={selectedPo} onValueChange={setSelectedPo} disabled={!!poId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر أمر شراء معتمد" /></SelectTrigger>
              <SelectContent>
                {pos.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code} — {p.branch_destination}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!gate.allowed && selectedPo && (
              <div className="text-[11px] text-destructive mt-1">{gate.reason}</div>
            )}
          </div>

          <div>
            <Label className="text-xs">فاتورة الشراء</Label>
            <Select value={invoiceId} onValueChange={setInvoiceId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختياري" /></SelectTrigger>
              <SelectContent>
                {invoices.map(i => <SelectItem key={i.id} value={i.id}>{i.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">المستلم *</Label>
            <Input className="h-9" value={receiver} onChange={e => setReceiver(e.target.value)} />
          </div>

          <div>
            <Label className="text-xs">المستودع *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر المستودع" /></SelectTrigger>
              <SelectContent>
                {warehouses.map(w => (
                  <SelectItem key={w.id} value={w.id}>{w.name} — {w.city}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">الساحة / الموقع</Label>
            <Input className="h-9" placeholder="YARD-A-014" value={yard} onChange={e => setYard(e.target.value)} />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">مرجع الشحنة</Label>
            <Input className="h-9" placeholder="BL-KL-44821" value={shipmentRef} onChange={e => setShipmentRef(e.target.value)} />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={handleCreate} disabled={!gate.allowed || !warehouseId}>إنشاء GRN</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
