import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, FileText, Car } from "lucide-react";
import { toast } from "sonner";
import {
  getInvoice, confirmInvoice, cancelInvoice,
  PINV_STATUS_LABEL, PINV_STATUS_TONE, fmtSAR, fmtDate,
} from "@/services/erp/purchaseInvoicesDb";

export default function PurchaseInvoiceDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["purchase-invoice", id], queryFn: () => getInvoice(id), enabled: !!id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["purchase-invoice", id] });
    qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const confirmMut = useMutation({
    mutationFn: () => confirmInvoice(id),
    onSuccess: ({ created }) => {
      toast.success(`تم تأكيد الفاتورة — أُنشئت ${created} مركبة في المخزون (قيد الطلب)`);
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelInvoice(id),
    onSuccess: () => { toast.success("تم إلغاء الفاتورة"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (!q.data) return <div className="p-6 text-sm text-destructive">الفاتورة غير موجودة</div>;

  const { header: inv, lines } = q.data;
  const isDraft = inv.status === "draft";
  const remaining = Number(inv.total) - Number(inv.paid_amount);

  return (
    <div className="space-y-3">
      <PageHeader
        title={`فاتورة شراء ${inv.code}`}
        subtitle={`${inv.supplier_name ?? "—"} · ${lines.length} مركبة`}
        actions={
          <div className="flex gap-2">
            {inv.po_id && (
              <Button variant="outline" size="sm" asChild>
                <Link to={`/purchasing/orders/${inv.po_id}`}><FileText className="h-4 w-4 ml-1" />أمر الشراء</Link>
              </Button>
            )}
            {isDraft && (
              <>
                <Button size="sm" onClick={() => confirmMut.mutate()} disabled={confirmMut.isPending}>
                  <CheckCircle2 className="h-4 w-4 ml-1" /> تأكيد الفاتورة
                </Button>
                <Button size="sm" variant="outline" className="text-destructive" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                  <XCircle className="h-4 w-4 ml-1" /> إلغاء
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* بطاقة الحالة + معلومات */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <InfoCard label="الحالة" value={<Badge className={PINV_STATUS_TONE[inv.status]}>{PINV_STATUS_LABEL[inv.status]}</Badge>} />
        <InfoCard label="رقم فاتورة المورد" value={<span className="font-mono text-xs" dir="ltr">{inv.invoice_no ?? "—"}</span>} />
        <InfoCard label="تاريخ الفاتورة" value={fmtDate(inv.invoice_date)} />
        <InfoCard label="تاريخ الاستحقاق" value={fmtDate(inv.due_date)} />
      </div>

      {isDraft && (
        <div className="bg-warning/5 border border-warning/30 rounded-md p-3 text-xs text-warning">
          الفاتورة مسودة. عند التأكيد ستُنشأ المركبات في المخزون بحالة «قيد الطلب» (غير متاحة للبيع حتى الاستلام والفحص).
        </div>
      )}

      {/* البنود */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>#</th><th>المركبة</th><th>VIN</th><th>التكلفة</th>
              <th>الخصم</th><th>الصافي</th><th>الضريبة %</th><th>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td className="num text-xs">{l.line_no}</td>
                <td className="text-xs">
                  <div className="flex items-center gap-1"><Car className="h-3 w-3 text-muted-foreground" />
                    {[l.manufacturer || l.brand, l.model, l.trim, l.year, l.color].filter(Boolean).join(" ")}</div>
                </td>
                <td className="font-mono text-[10px]" dir="ltr">{l.vin}</td>
                <td className="num text-xs">{fmtSAR(l.unit_cost)}</td>
                <td className="num text-xs text-destructive">{l.discount_amount > 0 ? `-${fmtSAR(l.discount_amount)}` : "—"}</td>
                <td className="num text-xs">{fmtSAR(l.net_cost)}</td>
                <td className="num text-xs">{l.vat_pct}%</td>
                <td className="num text-xs font-semibold">{fmtSAR(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الإجماليات */}
      <div className="flex justify-end">
        <div className="w-full sm:w-80 bg-card border border-border rounded-lg p-3 space-y-1.5 text-xs">
          <Row label="المجموع قبل الخصم" value={fmtSAR(inv.subtotal)} />
          {inv.lines_discount > 0 && <Row label="خصم البنود" value={`-${fmtSAR(inv.lines_discount)}`} tone="text-destructive" />}
          {inv.discount_amount > 0 && (
            <Row label={`الخصم الإجمالي${inv.discount_pct > 0 ? ` (${inv.discount_pct}%)` : ""}`} value={`-${fmtSAR(inv.discount_amount)}`} tone="text-destructive" />
          )}
          <Row label="ضريبة القيمة المضافة" value={fmtSAR(inv.vat_amount)} />
          <div className="border-t border-border pt-1.5 mt-1.5">
            <Row label="الإجمالي" value={fmtSAR(inv.total)} bold />
          </div>
          {inv.status !== "draft" && (
            <>
              <Row label="المدفوع" value={fmtSAR(inv.paid_amount)} tone="text-success" />
              <Row label="المتبقّي" value={fmtSAR(remaining)} tone="text-warning" bold />
            </>
          )}
        </div>
      </div>

      {inv.notes && (
        <div className="bg-muted/30 border border-border rounded-md p-3 text-xs">
          <span className="text-muted-foreground">ملاحظات: </span>{inv.notes}
        </div>
      )}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`num ${bold ? "font-bold text-sm" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
