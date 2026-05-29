import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import {
  purchasingService, PINV_LABEL, PINV_TONE, PAYMENT_METHOD_LABEL,
  fmtSAR, fmtDate, type PaymentMethod,
} from "@/services/erp/purchasing";
import { allocationService } from "@/services/erp/allocations";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintablePurchaseDoc } from "@/components/erp/PrintablePurchaseDoc";
import { makeAudit, type AuditEntry } from "@/services/erp/erpRoles";

export default function PurchaseInvoiceDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const refresh = () => setTick(t => t + 1);

  const inv = useMemo(() => purchasingService.getPurchaseInvoice(id), [id, tick]);
  if (!inv) return <div className="p-6 text-sm text-muted-foreground">الفاتورة غير موجودة</div>;

  const supplier = purchasingService.getSupplier(inv.supplier_id);
  const po = purchasingService.getPO(inv.po_id);
  const allocs = allocationService.list().filter(a => a.invoice_id === inv.id);
  const payments = purchasingService.paymentsForInvoice(inv.id);

  // Synthesize audit from inv creation + payments (no native audit yet)
  const audit: AuditEntry[] = [
    makeAudit({ role: "accounting", action: "إصدار فاتورة شراء", to_status: "issued", note: inv.code }),
    ...payments.map(p => makeAudit({
      role: "accounting", action: "تسجيل دفعة", note: `${fmtSAR(p.amount)} • ${PAYMENT_METHOD_LABEL[p.method]}`,
    })),
    ...(inv.status === "paid" ? [makeAudit({ role: "accounting", action: "إقفال الفاتورة", to_status: "paid" })] : []),
  ];

  const remaining = inv.total - inv.paid;
  const responsibleRole = inv.status === "paid" ? "purchasing_officer" : "accounting";

  const printable = (
    <PrintablePurchaseDoc
      title={inv.code}
      docType="purchase_invoice"
      documentNo={inv.code}
      documentDate={fmtDate(inv.issued_at)}
      watermark={inv.status === "paid" ? "مدفوعة" : inv.status === "cancelled" ? "ملغاة" : "أصلية"}
      partyTitle="المورد"
      partyName={supplier?.name ?? "—"}
      partyMeta={[
        { label: "رقم المورد", value: supplier?.code ?? "—" },
        { label: "أمر الشراء", value: po?.code ?? "—" },
        { label: "تاريخ الاستحقاق", value: fmtDate(inv.due_date) },
      ]}
      meta={[
        { label: "الحالة", value: PINV_LABEL[inv.status] },
        { label: "المدفوع", value: fmtSAR(inv.paid) },
        { label: "المتبقي", value: fmtSAR(remaining) },
      ]}
      items={po?.items ?? []}
      subtotal={inv.subtotal}
      vatAmount={inv.vat_amount}
      total={inv.total}
      notes={inv.notes}
    />
  );

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={`فاتورة شراء ${inv.code}`}
        subtitle={supplier?.name ?? ""}
        actions={<DocPrintActions doc={printable} />}
      />


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-base font-bold">{inv.code}</div>
                <div className="text-muted-foreground">
                  أمر الشراء: {po ? <Link to="/purchasing/orders" className="text-primary hover:underline font-mono">{po.code}</Link> : "—"}
                </div>
              </div>
              <Badge className={PINV_TONE[inv.status]}>{PINV_LABEL[inv.status]}</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">تاريخ الإصدار</div><div>{fmtDate(inv.issued_at)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">تاريخ الاستحقاق</div><div>{fmtDate(inv.due_date)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الإجمالي</div><div className="font-bold">{fmtSAR(inv.total)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">المتبقي</div><div className="font-bold text-warning">{fmtSAR(remaining)}</div></div>
            </div>
          </div>

          {allocs.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs">
              <div className="font-semibold mb-2">التخصيصات المرتبطة</div>
              <ul className="space-y-1">
                {allocs.map(a => (
                  <li key={a.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1">
                    <Link to={`/purchasing/allocations/${a.id}`} className="text-primary hover:underline font-mono">{a.code}</Link>
                    <span>{a.lines.length} مركبة</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="bg-card border border-border rounded-lg p-3 text-xs">
            <div className="font-semibold mb-2">الدفعات</div>
            {payments.length === 0 ? (
              <div className="text-muted-foreground py-3 text-center">لا توجد دفعات بعد</div>
            ) : (
              <ul className="space-y-1">
                {payments.map(p => (
                  <li key={p.id} className="flex items-center justify-between bg-muted/30 rounded px-2 py-1">
                    <span className="font-mono">{p.code}</span>
                    <span>{PAYMENT_METHOD_LABEL[p.method]}</span>
                    <span className="font-semibold">{fmtSAR(p.amount)}</span>
                    <span className="text-muted-foreground">{fmtDate(p.paid_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <DocGovernancePanel
            status={PINV_LABEL[inv.status]}
            statusTone={PINV_TONE[inv.status]}
            responsibleRole={responsibleRole}
            previous={po ? { kind: "po", id: po.id, code: po.code } : undefined}
            audit={audit}
            nextActions={
              inv.status !== "paid" && inv.status !== "cancelled"
                ? [{ label: "تسجيل دفعة", role: "accounting", onClick: () => setPayOpen(true) }]
                : []
            }
          />

          <Button className="w-full" disabled={inv.status === "paid" || inv.status === "cancelled"} onClick={() => setPayOpen(true)}>
            <Wallet className="h-4 w-4 ml-1" /> تسجيل دفعة
          </Button>
        </div>
      </div>

      <PayDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceId={inv.id}
        invoiceCode={inv.code}
        remaining={remaining}
        onPaid={() => { setPayOpen(false); refresh(); toast.success("تم تسجيل الدفعة"); }}
      />
    </div>
  );
}

function PayDialog({ open, onClose, invoiceId, invoiceCode, remaining, onPaid }: {
  open: boolean; onClose: () => void; invoiceId: string; invoiceCode: string;
  remaining: number; onPaid: () => void;
}) {
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");

  const submit = () => {
    if (amount <= 0) return toast.error("أدخل مبلغاً صحيحاً");
    const p = purchasingService.recordPurchasePayment({
      invoice_id: invoiceId, amount, method, reference: reference || undefined,
    });
    if (!p) return toast.error("تعذر تسجيل الدفعة");
    onPaid();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>تسجيل دفعة — {invoiceCode}</DialogTitle>
          <DialogDescription>متبقي: <span className="font-semibold">{fmtSAR(remaining)}</span></DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-xs">
          <div><Label className="text-xs">المبلغ</Label><Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} className="h-9" /></div>
          <div>
            <Label className="text-xs">طريقة الدفع</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map(m => (
                  <SelectItem key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">المرجع</Label><Input value={reference} onChange={e => setReference(e.target.value)} className="h-9" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit}>تسجيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

