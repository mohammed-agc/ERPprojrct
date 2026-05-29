import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt, Wallet, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  purchasingService, PINV_LABEL, PINV_TONE,
  fmtSAR, fmtDate, type InvoiceStatus,
} from "@/services/erp/purchasing";
import { PurchaseInvoiceCreateDialog } from "@/components/erp/PurchaseInvoiceCreateDialog";
import { PaymentDialog, type PaymentSubmitPayload, type PaymentInvoiceContext } from "@/components/erp/PaymentDialog";

const METHOD_MAP: Record<string, "cash" | "bank_transfer" | "cheque" | "credit_utilization"> = {
  cash: "cash", bank_transfer: "bank_transfer", card: "bank_transfer", check: "cheque", credit: "credit_utilization",
};


const STATUS_OPTS: { value: InvoiceStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "issued", label: PINV_LABEL.issued },
  { value: "partially_paid", label: PINV_LABEL.partially_paid },
  { value: "paid", label: PINV_LABEL.paid },
  { value: "cancelled", label: PINV_LABEL.cancelled },
];

export default function PurchaseInvoices() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [payOpen, setPayOpen] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);


  const invs = useMemo(() => purchasingService.listPurchaseInvoices(), [tick]);
  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const pos = useMemo(() => purchasingService.listPOs(), [tick]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return invs.filter(i => {
      if (status !== "all" && i.status !== status) return false;
      if (!qv) return true;
      const sup = suppliers.find(s => s.id === i.supplier_id);
      const po = pos.find(p => p.id === i.po_id);
      return `${i.code} ${sup?.name ?? ""} ${po?.code ?? ""}`.toLowerCase().includes(qv);
    });
  }, [invs, q, status, suppliers, pos]);

  const totals = useMemo(() => ({
    count: filtered.length,
    billed: filtered.reduce((s, i) => s + i.total, 0),
    paid: filtered.reduce((s, i) => s + i.paid, 0),
    outstanding: filtered.reduce((s, i) => s + (i.total - i.paid), 0),
  }), [filtered]);

  const activeInv = invs.find(i => i.id === payOpen);
  const activeSupplier = activeInv ? suppliers.find(s => s.id === activeInv.supplier_id) : null;
  const paymentCtx: PaymentInvoiceContext | null = activeInv ? {
    id: activeInv.id, invoice_no: activeInv.code,
    customer_name: activeSupplier?.name, total: activeInv.total, paid_amount: activeInv.paid,
  } : null;
  const [submitting, setSubmitting] = useState(false);
  const handleSubmitPayment = async (p: PaymentSubmitPayload) => {
    setSubmitting(true);
    try {
      const r = purchasingService.recordPurchasePayment({
        invoice_id: p.invoiceId, amount: p.amount,
        method: METHOD_MAP[p.method] ?? "bank_transfer",
        reference: p.reference || undefined,
      });
      if (!r) { toast.error("تعذر تسجيل الدفعة"); return; }
      toast.success(`تم تسجيل الدفعة ${r.code}`);
      setPayOpen(null); refresh();
    } finally { setSubmitting(false); }
  };


  return (
    <div>
      <PageHeader
        title="فواتير الشراء"
        subtitle={`${totals.count} فاتورة · مفوتر ${fmtSAR(totals.billed)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.outstanding)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم فاتورة، مورد، أمر شراء..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{STATUS_OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" className="h-9" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 ml-1" /> فاتورة جديدة
        </Button>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>

      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>المورد</th>
              <th>أمر الشراء</th>
              <th>الصدور</th>
              <th>الاستحقاق</th>
              <th>الإجمالي</th>
              <th>المدفوع</th>
              <th>المتبقي</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد فواتير مطابقة</td></tr>
            )}
            {filtered.map(i => {
              const sup = suppliers.find(s => s.id === i.supplier_id);
              const po = pos.find(p => p.id === i.po_id);
              const remaining = i.total - i.paid;
              const overdue = remaining > 0 && new Date(i.due_date) < new Date();
              return (
                <tr key={i.id}>
                  <td className="font-mono text-[11px]">
                    <Link to={`/purchasing/invoices/${i.id}`} className="flex items-center gap-1.5 text-primary hover:underline"><Receipt className="h-3 w-3" />{i.code}</Link>
                  </td>

                  <td className="text-xs">{sup?.name ?? "—"}</td>
                  <td className="font-mono text-[10px] text-muted-foreground">{po?.code ?? "—"}</td>
                  <td className="text-xs">{fmtDate(i.issued_at)}</td>
                  <td className={`text-xs ${overdue ? "text-destructive font-semibold" : ""}`}>{fmtDate(i.due_date)}</td>
                  <td className="num text-xs font-semibold">{fmtSAR(i.total)}</td>
                  <td className="num text-xs text-success">{fmtSAR(i.paid)}</td>
                  <td className="num text-xs">{fmtSAR(remaining)}</td>
                  <td><Badge className={PINV_TONE[i.status]}>{PINV_LABEL[i.status]}</Badge></td>
                  <td>
                    {remaining > 0 && i.status !== "cancelled" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setPayOpen(i.id)}>
                        <Wallet className="h-3.5 w-3.5 ml-1" /> تسجيل دفعة
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PaymentDialog
        open={!!payOpen}
        onOpenChange={(o) => !o && setPayOpen(null)}
        invoice={paymentCtx}
        submitting={submitting}
        onSubmit={handleSubmitPayment}
      />
      <PurchaseInvoiceCreateDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />

    </div>
  );
}
