import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { treasuryService, type TreasuryAccount, type TransferKind, transferKindLabel } from "@/services/erp/treasury";

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  accounts: TreasuryAccount[]; onSaved?: () => void;
}
export function TransferDialog({ open, onOpenChange, accounts, onSaved }: Props) {
  const [kind, setKind] = useState<TransferKind>("cash_to_bank");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [fees, setFees] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setKind("cash_to_bank"); setDate(new Date().toISOString().slice(0, 10));
      setFromId(""); setToId(""); setAmount(""); setFees(""); setReference(""); setNotes("");
    }
  }, [open]);

  const submit = async () => {
    if (!fromId || !toId || !amount) { toast.error("الحقول المطلوبة غير مكتملة"); return; }
    if (fromId === toId) { toast.error("لا يمكن التحويل لنفس الحساب"); return; }
    await treasuryService.createTransfer({
      kind, date, from_account_id: fromId, to_account_id: toId,
      amount: Number(amount), fees: fees ? Number(fees) : undefined,
      reference: reference || undefined, notes: notes || undefined,
    });
    toast.success("تم إنشاء التحويل");
    onOpenChange(false); onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>تحويل داخلي جديد</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">نوع التحويل</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(transferKindLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" className="h-8" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">من حساب *</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {accounts.filter(a => a.active).map(a => (
                  <SelectItem key={a.id} value={a.id}><span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">إلى حساب *</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {accounts.filter(a => a.active).map(a => (
                  <SelectItem key={a.id} value={a.id}><span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">المبلغ *</Label>
            <Input type="number" step="0.01" className="h-8" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">رسوم التحويل</Label>
            <Input type="number" step="0.01" className="h-8" value={fees} onChange={e => setFees(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">المرجع</Label>
            <Input className="h-8" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>تنفيذ التحويل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
