import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import {
  treasuryService, type TreasuryAccount, type VoucherType, type PaymentMethod,
  type ReceiptKind, type PaymentKind,
  receiptKindLabel, paymentKindLabel, methodLabel,
} from "@/services/erp/treasury";
import { AmountInput } from "@/components/erp/AmountInput";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  type: VoucherType;
  accounts: TreasuryAccount[];
  defaultAccountId?: string;
  onSaved?: () => void;
}

export function VoucherDialog({ open, onOpenChange, type, accounts, defaultAccountId, onSaved }: Props) {
  const kindOptions = type === "receipt" ? receiptKindLabel : paymentKindLabel;
  const [kind, setKind] = useState<ReceiptKind | PaymentKind>(type === "receipt" ? "customer" : "vendor");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [linkedInvoice, setLinkedInvoice] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setKind(type === "receipt" ? "customer" : "vendor");
      setDate(new Date().toISOString().slice(0, 10));
      setAccountId(defaultAccountId ?? accounts[0]?.id ?? "");
      setCounterparty(""); setAmount(""); setMethod("cash");
      setReference(""); setLinkedInvoice(""); setNotes("");
    }
  }, [open, type, defaultAccountId, accounts]);

  const submit = async () => {
    if (!accountId || !counterparty || !amount) {
      toast.error("الحقول المطلوبة غير مكتملة");
      return;
    }
    await treasuryService.createVoucher({
      type, kind: kind as any, date, account_id: accountId,
      counterparty, amount: Number(amount), method, reference: reference || undefined,
      linked_invoice: linkedInvoice || undefined, notes: notes || undefined,
    });
    toast.success(type === "receipt" ? "تم إنشاء سند القبض" : "تم إنشاء سند الصرف");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{type === "receipt" ? "سند قبض جديد" : "سند صرف جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">النوع</Label>
            <Select value={kind} onValueChange={(v: any) => setKind(v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(kindOptions).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">التاريخ</Label>
            <Input type="date" className="h-8" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">{type === "receipt" ? "الدافع" : "المستفيد"} *</Label>
            <Input className="h-8" value={counterparty} onChange={e => setCounterparty(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الحساب الخزينة *</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-8"><SelectValue placeholder="اختر" /></SelectTrigger>
              <SelectContent>
                {accounts.filter(a => a.active).map(a => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">المبلغ *</Label>
            <Input type="number" step="0.01" className="h-8" value={amount} onChange={e => setAmount(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={method} onValueChange={(v: any) => setMethod(v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(methodLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">المرجع</Label>
            <Input className="h-8" value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم شيك / مرجع تحويل" />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">الفاتورة المرتبطة</Label>
            <Input className="h-8" value={linkedInvoice} onChange={e => setLinkedInvoice(e.target.value)} placeholder="رقم الفاتورة (اختياري)" />
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>حفظ وترحيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
