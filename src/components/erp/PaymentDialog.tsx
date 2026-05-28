import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Banknote, CreditCard, Landmark, FileText, Wallet } from "lucide-react";

export type PaymentMethod = "cash" | "bank_transfer" | "card" | "check" | "credit";

export interface PaymentSubmitPayload {
  invoiceId: string;
  method: PaymentMethod;
  accountId: string;
  amount: number;
  paymentDate: string;
  reference: string;
  notes: string;
  isFullPayment: boolean;
}

export interface FinancialAccount {
  id: string;
  label: string;
  type: "cash" | "bank" | "treasury";
}

export interface PaymentInvoiceContext {
  id: string;
  invoice_no: string;
  customer_name?: string;
  total: number;
  paid_amount?: number; // backend value when available
  currency?: string;
}

// Default account list (mock — backend will replace later via /erp/accounts)
const DEFAULT_ACCOUNTS: FinancialAccount[] = [
  { id: "cash-main", label: "صندوق نقدي رئيسي", type: "cash" },
  { id: "bank-rajhi", label: "بنك الراجحي — الحساب التشغيلي", type: "bank" },
  { id: "bank-snb", label: "البنك الأهلي السعودي", type: "bank" },
  { id: "treasury", label: "الخزينة العامة", type: "treasury" },
];

const METHOD_META: Record<PaymentMethod, { label: string; icon: any; needsRef: boolean }> = {
  cash:          { label: "نقدًا",          icon: Banknote,  needsRef: false },
  bank_transfer: { label: "تحويل بنكي",     icon: Landmark,  needsRef: true  },
  card:          { label: "بطاقة",          icon: CreditCard, needsRef: true },
  check:         { label: "شيك",            icon: FileText,  needsRef: true  },
  credit:        { label: "آجل / ذمم",      icon: Wallet,    needsRef: false },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: PaymentInvoiceContext | null;
  accounts?: FinancialAccount[];
  submitting?: boolean;
  onSubmit: (payload: PaymentSubmitPayload) => Promise<void> | void;
}

const fmt = (n: number) =>
  n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PaymentDialog({
  open, onOpenChange, invoice, accounts = DEFAULT_ACCOUNTS, submitting, onSubmit,
}: Props) {
  const total = invoice?.total ?? 0;
  const alreadyPaid = invoice?.paid_amount ?? 0;
  const outstanding = Math.max(0, total - alreadyPaid);

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Reset on open
  useEffect(() => {
    if (open && invoice) {
      setMethod("cash");
      setAccountId(accounts[0]?.id ?? "");
      setAmount(outstanding.toFixed(2));
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setNotes("");
    }
  }, [open, invoice?.id]);

  const numericAmount = Number(amount) || 0;
  const remaining = Math.max(0, outstanding - numericAmount);
  const isFull = numericAmount >= outstanding && outstanding > 0;
  const isPartial = numericAmount > 0 && numericAmount < outstanding;
  const overpay = numericAmount > outstanding;

  const paymentStatus: "unpaid" | "partial" | "paid" = useMemo(() => {
    if (numericAmount <= 0) return alreadyPaid > 0 ? "partial" : "unpaid";
    if (isFull) return "paid";
    return "partial";
  }, [numericAmount, isFull, alreadyPaid]);

  const statusBadge = {
    unpaid:  <Badge variant="destructive">غير مدفوعة</Badge>,
    partial: <Badge variant="secondary">مدفوعة جزئيًا</Badge>,
    paid:    <Badge className="bg-success text-success-foreground hover:bg-success/90">مدفوعة بالكامل</Badge>,
  }[paymentStatus];

  const meta = METHOD_META[method];
  const refRequired = meta.needsRef;
  const canSubmit =
    invoice &&
    numericAmount > 0 &&
    !overpay &&
    accountId &&
    paymentDate &&
    (!refRequired || reference.trim().length > 0) &&
    !submitting;

  const handleSubmit = async () => {
    if (!invoice || !canSubmit) return;
    await onSubmit({
      invoiceId: invoice.id,
      method,
      accountId,
      amount: numericAmount,
      paymentDate,
      reference: reference.trim(),
      notes: notes.trim(),
      isFullPayment: isFull,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            تسجيل دفعة — فاتورة {invoice?.invoice_no ?? ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {invoice?.customer_name ?? "—"} · سند قبض محاسبي
          </DialogDescription>
        </DialogHeader>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2 text-xs border border-border rounded-md bg-muted/30 p-2.5">
          <div>
            <div className="text-muted-foreground">إجمالي الفاتورة</div>
            <div className="font-bold tabular-nums">{fmt(total)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">المدفوع سابقًا</div>
            <div className="font-bold tabular-nums">{fmt(alreadyPaid)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">المستحق</div>
            <div className="font-bold tabular-nums text-primary">{fmt(outstanding)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">الحالة</div>
            <div className="mt-0.5">{statusBadge}</div>
          </div>
        </div>

        {/* Form grid — dense ERP layout */}
        <div className="grid grid-cols-2 gap-3">
          {/* Method */}
          <div className="space-y-1">
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_META) as PaymentMethod[]).map((k) => {
                  const Icon = METHOD_META[k].icon;
                  return (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" /> {METHOD_META[k].label}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Account */}
          <div className="space-y-1">
            <Label className="text-xs">الحساب المالي</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر الحساب" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount + quick fill */}
          <div className="space-y-1">
            <Label className="text-xs flex items-center justify-between">
              <span>المبلغ المدفوع</span>
              <button
                type="button"
                onClick={() => setAmount(outstanding.toFixed(2))}
                className="text-[10px] text-primary hover:underline"
              >
                المبلغ الكامل
              </button>
            </Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 tabular-nums font-mono"
              dir="ltr"
            />
            {overpay && (
              <p className="text-[10px] text-destructive">المبلغ يتجاوز المستحق</p>
            )}
          </div>

          {/* Remaining display */}
          <div className="space-y-1">
            <Label className="text-xs">المتبقي بعد الدفعة</Label>
            <div className={`h-9 rounded-md border bg-muted/40 px-3 flex items-center font-mono tabular-nums text-sm ${remaining === 0 && numericAmount > 0 ? "text-success" : ""}`}>
              {fmt(remaining)}
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs">تاريخ الدفع</Label>
            <Input
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="h-9"
              dir="ltr"
            />
          </div>

          {/* Reference */}
          <div className="space-y-1">
            <Label className="text-xs">
              رقم المرجع
              {refRequired && <span className="text-destructive"> *</span>}
              <span className="text-muted-foreground font-normal">
                {method === "bank_transfer" && " (رقم التحويل)"}
                {method === "check" && " (رقم الشيك)"}
                {method === "card" && " (رقم العملية)"}
              </span>
            </Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={refRequired ? "مطلوب" : "اختياري"}
              className="h-9 font-mono"
              dir="ltr"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1 col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
              placeholder="ملاحظات محاسبية…"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? "جارٍ الحفظ…" : isPartial ? "تسجيل دفعة جزئية" : "تسجيل الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
