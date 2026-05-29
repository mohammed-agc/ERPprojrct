import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Wallet } from "lucide-react";
import {
  purchasingService, PINV_LABEL, PINV_TONE, PAYMENT_METHOD_LABEL,
  fmtSAR, fmtDate,
} from "@/services/erp/purchasing";
import { allocationService } from "@/services/erp/allocations";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintablePurchaseDoc } from "@/components/erp/PrintablePurchaseDoc";
import { makeAudit, type AuditEntry } from "@/services/erp/erpRoles";
import { PaymentDialog, type PaymentSubmitPayload, type PaymentInvoiceContext } from "@/components/erp/PaymentDialog";

const METHOD_MAP: Record<string, "cash" | "bank_transfer" | "cheque" | "credit_utilization"> = {
  cash: "cash", bank_transfer: "bank_transfer", card: "bank_transfer", check: "cheque", credit: "credit_utilization",
};

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
            <div className="bg-card border border-border rounded-lg overflow-hidden text-xs">
              <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold">
                المركبات المفوترة ({allocs.reduce((s, a) => s + a.lines.length, 0)})
              </div>
              <table className="erp-table">
                <thead>
                  <tr>
                    <th>التخصيص</th>
                    <th>الصانع / الموديل</th>
                    <th>الفئة</th>
                    <th>السنة</th>
                    <th>اللون</th>
                    <th>VIN</th>
                    <th>رقم المحرك</th>
                    <th>السعر</th>
                  </tr>
                </thead>
                <tbody>
                  {allocs.flatMap(a => a.lines.map(l => (
                    <tr key={l.id}>
                      <td className="font-mono text-[10px]">
                        <Link to={`/purchasing/allocations/${a.id}`} className="text-primary hover:underline">{a.code}</Link>
                      </td>
                      <td className="font-semibold">{(l.manufacturer || l.brand)} {l.model}</td>
                      <td>{l.trim || "—"}</td>
                      <td className="num">{l.year}</td>
                      <td>{l.color}</td>
                      <td className="font-mono text-[11px]">{l.vin}</td>
                      <td className="font-mono text-[11px]">{l.engine_no}</td>
                      <td className="num">{l.cost ? fmtSAR(l.cost) : "—"}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
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

      <PaymentDialogHost
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceId={inv.id}
        invoiceCode={inv.code}
        supplierName={supplier?.name}
        total={inv.total}
        paid={inv.paid}
        onPaid={() => { setPayOpen(false); refresh(); }}
      />
    </div>
  );
}

function PaymentDialogHost({ open, onClose, invoiceId, invoiceCode, supplierName, total, paid, onPaid }: {
  open: boolean; onClose: () => void; invoiceId: string; invoiceCode: string;
  supplierName?: string; total: number; paid: number; onPaid: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const ctx: PaymentInvoiceContext = {
    id: invoiceId, invoice_no: invoiceCode, customer_name: supplierName, total, paid_amount: paid,
  };
  const handle = async (p: PaymentSubmitPayload) => {
    setSubmitting(true);
    try {
      const r = purchasingService.recordPurchasePayment({
        invoice_id: p.invoiceId, amount: p.amount,
        method: METHOD_MAP[p.method] ?? "bank_transfer",
        reference: p.reference || undefined,
      });
      if (!r) { toast.error("تعذر تسجيل الدفعة"); return; }
      toast.success(`تم تسجيل الدفعة ${r.code}`);
      onPaid();
    } finally { setSubmitting(false); }
  };
  return (
    <PaymentDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      invoice={ctx}
      submitting={submitting}
      onSubmit={handle}
    />
  );
}


