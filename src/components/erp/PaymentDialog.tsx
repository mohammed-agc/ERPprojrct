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
import {
  Banknote, CreditCard, Landmark, FileText, Wallet, ShieldCheck, AlertTriangle,
  ScanLine, Layers,
} from "lucide-react";
import { AmountInput } from "@/components/erp/AmountInput";

export type PaymentMethod =
  | "cash" | "bank_transfer" | "card" | "pos" | "check"
  | "credit" | "supplier_credit" | "mixed";

export interface PaymentSubmitPayload {
  invoiceId: string;
  method: PaymentMethod;
  accountId: string;
  amount: number;            // total being settled (credit + cash for mixed)
  creditAmount?: number;     // mixed only
  cashAmount?: number;       // mixed only
  cashMethod?: PaymentMethod;// mixed only — concrete cash leg method
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
  paid_amount?: number;
  currency?: string;
}

/** Supplier credit position — only passed for purchase invoices. */
export interface SupplierCreditContext {
  supplier_name: string;
  credit_limit: number;
  credit_utilized: number;
  credit_remaining: number;
  credit_expiry?: string;
  credit_status?: "active" | "expired" | "suspended";
}

const DEFAULT_ACCOUNTS: FinancialAccount[] = [
  { id: "cash-main", label: "صندوق نقدي رئيسي", type: "cash" },
  { id: "bank-rajhi", label: "بنك الراجحي — الحساب التشغيلي", type: "bank" },
  { id: "bank-snb", label: "البنك الأهلي السعودي", type: "bank" },
  { id: "treasury", label: "الخزينة العامة", type: "treasury" },
];

const METHOD_META: Record<PaymentMethod, { label: string; icon: any; needsRef: boolean }> = {
  cash:            { label: "نقدًا",              icon: Banknote,    needsRef: false },
  bank_transfer:   { label: "تحويل بنكي",         icon: Landmark,    needsRef: true  },
  pos:             { label: "نقطة بيع (POS)",     icon: ScanLine,    needsRef: true  },
  card:            { label: "بطاقة",              icon: CreditCard,  needsRef: true  },
  check:           { label: "شيك",                icon: FileText,    needsRef: true  },
  credit:          { label: "آجل / ذمم",          icon: Wallet,      needsRef: false },
  supplier_credit: { label: "ائتمان مورد",        icon: ShieldCheck, needsRef: false },
  mixed:           { label: "تسوية مختلطة",       icon: Layers,      needsRef: false },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: PaymentInvoiceContext | null;
  supplierCredit?: SupplierCreditContext | null;
  accounts?: FinancialAccount[];
  submitting?: boolean;
  onSubmit: (payload: PaymentSubmitPayload) => Promise<void> | void;
}

const fmt = (n: number) =>
  n.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PaymentDialog({
  open, onOpenChange, invoice, supplierCredit, accounts = DEFAULT_ACCOUNTS, submitting, onSubmit,
}: Props) {
  const total = invoice?.total ?? 0;
  const alreadyPaid = invoice?.paid_amount ?? 0;
  const outstanding = Math.max(0, total - alreadyPaid);

  // Allowed methods depend on whether supplier credit is available
  const allMethods: PaymentMethod[] = supplierCredit
    ? ["cash", "bank_transfer", "pos", "supplier_credit", "mixed", "check"]
    : ["cash", "bank_transfer", "card", "check", "credit"];

  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [creditAmount, setCreditAmount] = useState<number | undefined>(undefined);
  const [cashAmount, setCashAmount] = useState<number | undefined>(undefined);
  const [cashMethod, setCashMethod] = useState<PaymentMethod>("bank_transfer");
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const creditRemaining = supplierCredit?.credit_remaining ?? 0;
  const creditCoversInvoice = creditRemaining >= outstanding && outstanding > 0;
  const creditStatus = supplierCredit?.credit_status ?? "active";

  // Reset on open
  useEffect(() => {
    if (open && invoice) {
      // Smart default: if credit fully covers → supplier_credit; if partially → mixed; else cash
      let m: PaymentMethod = "cash";
      if (supplierCredit && creditStatus === "active") {
        if (creditCoversInvoice) m = "supplier_credit";
        else if (creditRemaining > 0) m = "mixed";
      }
      setMethod(m);
      setAccountId(accounts[0]?.id ?? "");
      setAmount(outstanding > 0 ? outstanding : undefined);
      const initCredit = Math.min(creditRemaining, outstanding);
      setCreditAmount(initCredit);
      setCashAmount(Math.max(0, outstanding - initCredit));
      setCashMethod("bank_transfer");
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setReference("");
      setNotes("");
    }
  }, [open, invoice?.id]);

  // Auto-sync amount fields when method changes
  useEffect(() => {
    if (!open) return;
    if (method === "supplier_credit") {
      setAmount(Math.min(creditRemaining, outstanding));
    } else if (method === "mixed") {
      const c = Math.min(creditRemaining, outstanding);
      setCreditAmount(c);
      setCashAmount(Math.max(0, outstanding - c));
      setAmount(outstanding);
    } else {
      setAmount(outstanding);
    }
  }, [method]);

  const numericAmount = method === "mixed"
    ? (creditAmount ?? 0) + (cashAmount ?? 0)
    : (amount ?? 0);
  const remaining = Math.max(0, outstanding - numericAmount);
  const isFull = numericAmount >= outstanding - 0.005 && outstanding > 0;
  const isPartial = numericAmount > 0 && numericAmount < outstanding - 0.005;
  const overpay = numericAmount > outstanding + 0.005;

  // Mixed validation
  const mixedCreditOver = method === "mixed" && (creditAmount ?? 0) > creditRemaining + 0.005;

  const paymentStatus: "unpaid" | "partial" | "paid" = useMemo(() => {
    if (total <= 0) return "unpaid";
    if (outstanding <= 0.005) return "paid";
    if (alreadyPaid > 0) return "partial";
    return "unpaid";
  }, [total, outstanding, alreadyPaid]);

  const statusBadge = {
    unpaid:  <Badge variant="destructive">غير مدفوعة</Badge>,
    partial: <Badge variant="secondary">مدفوعة جزئيًا</Badge>,
    paid:    <Badge className="bg-success text-success-foreground hover:bg-success/90">مدفوعة بالكامل</Badge>,
  }[paymentStatus];

  const meta = METHOD_META[method];
  const refMethod = method === "mixed" ? cashMethod : method;
  const refRequired = METHOD_META[refMethod]?.needsRef ?? false;
  const creditDisabled = !supplierCredit
    || creditStatus !== "active"
    || creditRemaining <= 0;

  // Financial account is only required for methods that move cash/bank funds
  const needsFinancialAccount = method === "cash" || method === "bank_transfer" || method === "pos" || method === "card" || method === "check" || method === "mixed";

  const canSubmit =
    invoice &&
    numericAmount > 0 &&
    !overpay &&
    !mixedCreditOver &&
    paymentDate &&
    (!needsFinancialAccount || accountId) &&
    (!refRequired || reference.trim().length > 0) &&
    !(method === "supplier_credit" && creditDisabled) &&
    !submitting;

  const handleSubmit = async () => {
    if (!invoice || !canSubmit) return;
    await onSubmit({
      invoiceId: invoice.id,
      method,
      accountId: needsFinancialAccount ? accountId : "",
      amount: numericAmount,
      creditAmount: method === "mixed" ? (creditAmount ?? 0) : (method === "supplier_credit" ? numericAmount : undefined),
      cashAmount: method === "mixed" ? (cashAmount ?? 0) : undefined,
      cashMethod: method === "mixed" ? cashMethod : undefined,
      paymentDate,
      reference: reference.trim(),
      notes: notes.trim(),
      isFullPayment: isFull,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            تسجيل دفعة — فاتورة {invoice?.invoice_no ?? ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {invoice?.customer_name ?? "—"} · سند قبض محاسبي
          </DialogDescription>
        </DialogHeader>

        {/* Supplier Credit Summary — only when supplier credit context is provided */}
        {supplierCredit && (
          <div className="border border-primary/30 rounded-md bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" />
                ائتمان المورد — {supplierCredit.supplier_name}
              </div>
              <Badge className={
                creditStatus === "active" ? "bg-success/10 text-success border border-success/30"
                : creditStatus === "expired" ? "bg-destructive/10 text-destructive border border-destructive/30"
                : "bg-warning/10 text-warning border border-warning/30"
              }>
                {creditStatus === "active" ? "نشط" : creditStatus === "expired" ? "منتهي" : "موقوف"}
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <CreditTile label="حد الائتمان" value={supplierCredit.credit_limit} />
              <CreditTile label="المستخدم" value={supplierCredit.credit_utilized} tone="warning" />
              <CreditTile label="المتاح" value={supplierCredit.credit_remaining} tone="success" />
              <CreditTile label="الفاتورة الحالية" value={outstanding} tone="primary" />
            </div>
            {supplierCredit.credit_expiry && (
              <div className="text-[11px] text-muted-foreground">
                انتهاء الاتفاقية: <span dir="ltr" className="tabular-nums">{supplierCredit.credit_expiry}</span>
              </div>
            )}
            {/* Verdict */}
            {creditStatus !== "active" ? (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/30 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                لا يمكن استخدام ائتمان المورد — الحالة: {creditStatus === "expired" ? "اتفاقية منتهية" : "موقوف"}
              </div>
            ) : creditCoversInvoice ? (
              <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/30 rounded p-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                ✓ الائتمان يغطي الفاتورة بالكامل — يمكن الدفع عبر «ائتمان مورد»
              </div>
            ) : creditRemaining > 0 ? (
              <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/30 rounded p-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                ⚠ الائتمان لا يغطي الفاتورة — متاح <b className="num mx-1">{fmt(creditRemaining)}</b>،
                مطلوب نقدًا <b className="num mx-1">{fmt(outstanding - creditRemaining)}</b> (تسوية مختلطة)
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded p-2">
                لا يوجد رصيد ائتمان متاح — يجب السداد نقدًا أو بحوالة
              </div>
            )}
          </div>
        )}

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-2 border border-border rounded-md bg-muted/30 p-3">
          <SummaryTile label="إجمالي الفاتورة" value={total} />
          <SummaryTile label="المدفوع سابقًا" value={alreadyPaid} />
          <SummaryTile label="المتبقي" value={outstanding} highlight />
          <div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">الحالة</div>
            <div className="mt-1">{statusBadge}</div>
          </div>
        </div>

        {/* Form grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Method */}
          <div className="space-y-1">
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {allMethods.map((k) => {
                  const Icon = METHOD_META[k].icon;
                  const disabled = (k === "supplier_credit" || k === "mixed") && creditDisabled;
                  return (
                    <SelectItem key={k} value={k} disabled={disabled}>
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
                  <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {method === "mixed" ? (
            <>
              {/* Credit leg */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>الجزء المغطّى بالائتمان</span>
                  <button
                    type="button"
                    onClick={() => {
                      const c = Math.min(creditRemaining, outstanding);
                      setCreditAmount(c);
                      setCashAmount(Math.max(0, outstanding - c));
                    }}
                    className="text-[10px] text-primary hover:underline"
                  >
                    تعبئة المتاح
                  </button>
                </Label>
                <AmountInput
                  value={creditAmount}
                  onChange={(v) => {
                    setCreditAmount(v);
                    if (v !== undefined) setCashAmount(Math.max(0, outstanding - v));
                  }}
                  min={0}
                  placeholder="0.00"
                />
                {mixedCreditOver && (
                  <p className="text-[10px] text-destructive">يتجاوز الائتمان المتاح ({fmt(creditRemaining)})</p>
                )}
              </div>

              {/* Cash leg */}
              <div className="space-y-1">
                <Label className="text-xs">الجزء النقدي / البنكي</Label>
                <AmountInput
                  value={cashAmount}
                  onChange={(v) => {
                    setCashAmount(v);
                    if (v !== undefined) setCreditAmount(Math.max(0, outstanding - v));
                  }}
                  min={0}
                  placeholder="0.00"
                />
              </div>

              {/* Cash method */}
              <div className="space-y-1">
                <Label className="text-xs">طريقة الجزء النقدي</Label>
                <Select value={cashMethod} onValueChange={(v) => setCashMethod(v as PaymentMethod)}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["cash","bank_transfer","pos","check"] as PaymentMethod[]).map(k => (
                      <SelectItem key={k} value={k}>{METHOD_META[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Verification */}
              <div className="space-y-1">
                <Label className="text-xs">المجموع</Label>
                <div className={`h-9 rounded-md border bg-muted/40 px-3 flex items-center font-mono tabular-nums text-sm ${
                  isFull ? "text-success border-success/40" : ""
                }`} dir="ltr">
                  {fmt(numericAmount)} / {fmt(outstanding)}
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Amount + quick fill */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center justify-between">
                  <span>المبلغ المدفوع</span>
                  <button
                    type="button"
                    onClick={() => setAmount(method === "supplier_credit" ? Math.min(creditRemaining, outstanding) : outstanding)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {method === "supplier_credit" ? "أقصى ائتمان متاح" : "المبلغ الكامل"}
                  </button>
                </Label>
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  min={0}
                  placeholder="0.00"
                />
                {overpay && (
                  <p className="text-[10px] text-destructive">المبلغ يتجاوز المستحق</p>
                )}
                {method === "supplier_credit" && (amount ?? 0) > creditRemaining + 0.005 && (
                  <p className="text-[10px] text-destructive">المبلغ يتجاوز الائتمان المتاح ({fmt(creditRemaining)})</p>
                )}
              </div>

              {/* Remaining display */}
              <div className="space-y-1">
                <Label className="text-xs">المتبقي بعد الدفعة</Label>
                <div className={`h-9 rounded-md border bg-muted/40 px-3 flex items-center font-mono tabular-nums text-sm ${remaining === 0 && numericAmount > 0 ? "text-success" : ""}`} dir="ltr">
                  {fmt(remaining)}
                </div>
              </div>
            </>
          )}

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
                {refMethod === "bank_transfer" && " (رقم التحويل)"}
                {refMethod === "check" && " (رقم الشيك)"}
                {refMethod === "pos" && " (رقم العملية)"}
                {refMethod === "card" && " (رقم العملية)"}
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
            {submitting ? "جارٍ الحفظ…"
              : method === "mixed" ? "تسجيل التسوية المختلطة"
              : method === "supplier_credit" ? "تسوية عبر الائتمان"
              : isPartial ? "تسجيل دفعة جزئية" : "تسجيل الدفعة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryTile({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${highlight ? "text-primary" : ""}`} dir="ltr">{fmt(value)}</div>
    </div>
  );
}

function CreditTile({ label, value, tone }: { label: string; value: number; tone?: "warning" | "success" | "primary" }) {
  const colorCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "primary" ? "text-primary" : "";
  return (
    <div className="bg-card border border-border rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold tabular-nums num ${colorCls}`} dir="ltr">{fmt(value)}</div>
    </div>
  );
}
