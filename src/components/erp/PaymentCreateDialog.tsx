import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  createPayment, incentiveBalance, PAYMENT_METHOD_LABEL, fmtSAR,
  type PaymentMethod,
} from "@/services/erp/purchasePaymentsDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoiceId: string;
  remaining: number;      // المتبقّي على الفاتورة
  supplierId?: string | null;  // لجلب رصيد الحوافز
}

export function PaymentCreateDialog({ open, onOpenChange, invoiceId, remaining, supplierId }: Props) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // رصيد الحوافز المتاح للمورد
  const { data: incBalance = 0 } = useQuery({
    queryKey: ["incentive-balance", supplierId],
    queryFn: () => incentiveBalance(supplierId!),
    enabled: open && !!supplierId,
  });

  // السقف حسب الطريقة: الحوافز محدودة بالرصيد، غيرها بالمتبقّي
  const cap = method === "incentive" ? Math.min(remaining, incBalance) : remaining;

  useEffect(() => {
    if (open) {
      setAmount(remaining > 0 ? String(Math.round(remaining * 100) / 100) : "");
      setMethod("bank_transfer"); setReference(""); setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, remaining]);

  // عند تغيير الطريقة للحوافز، اضبط المبلغ على السقف المتاح
  useEffect(() => {
    if (method === "incentive") {
      const c = Math.min(remaining, incBalance);
      setAmount(c > 0 ? String(Math.round(c * 100) / 100) : "0");
    }
  }, [method, incBalance, remaining]);

  const pay = useMutation({
    mutationFn: () => createPayment({
      invoice_id: invoiceId,
      amount: Number(amount),
      payment_method: method,
      payment_date: date,
      reference: reference || undefined,
      notes: notes || undefined,
    }),
    onSuccess: (p) => {
      toast.success(`تم تسجيل الدفعة ${p.code}`);
      qc.invalidateQueries({ queryKey: ["purchase-invoice", invoiceId] });
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      qc.invalidateQueries({ queryKey: ["payments", invoiceId] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const amountNum = Number(amount) || 0;
  const overRemaining = amountNum > remaining + 0.01;
  const overIncentive = method === "incentive" && amountNum > incBalance + 0.01;
  const invalid = amountNum <= 0 || overRemaining || overIncentive;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>تسجيل دفعة</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="bg-muted/30 border border-border rounded-md p-2.5 text-xs flex items-center justify-between">
            <span className="text-muted-foreground">المتبقّي على الفاتورة</span>
            <span className="num font-bold text-warning">{fmtSAR(remaining)}</span>
          </div>

          {method === "incentive" && (
            <div className="bg-success/5 border border-success/30 rounded-md p-2.5 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">رصيد الحوافز المتاح</span>
              <span className="num font-bold text-success">{fmtSAR(incBalance)}</span>
            </div>
          )}

          <div>
            <Label className="text-xs">المبلغ</Label>
            <div className="flex gap-2">
              <Input type="number" value={amount} dir="ltr" placeholder="0"
                onChange={e => setAmount(e.target.value)}
                className={`h-9 flex-1 ${invalid && amount ? "border-destructive" : ""}`} />
              <Button type="button" variant="outline" size="sm" className="h-9 text-[11px] whitespace-nowrap"
                onClick={() => setAmount(String(Math.round(cap * 100) / 100))}>
                {method === "incentive" ? "الحد الأقصى" : "المتبقّي كاملاً"}
              </Button>
            </div>
            {overRemaining && (
              <div className="text-[10px] text-destructive mt-0.5">المبلغ يتجاوز المتبقّي</div>
            )}
            {overIncentive && (
              <div className="text-[10px] text-destructive mt-0.5">المبلغ يتجاوز رصيد الحوافز المتاح</div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">طريقة الدفع</Label>
              <Select value={method} onValueChange={v => setMethod(v as PaymentMethod)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(m => (
                    <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">تاريخ الدفع</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-9 text-xs" />
            </div>
          </div>

          <div>
            <Label className="text-xs">المرجع {method === "bank_transfer" ? "(رقم التحويل)" : ""}</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} dir="ltr" className="h-9 text-xs" />
          </div>

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-9 text-xs" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pay.isPending}>إلغاء</Button>
          <Button onClick={() => pay.mutate()} disabled={pay.isPending || invalid}>
            تسجيل الدفعة ({fmtSAR(amountNum)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
