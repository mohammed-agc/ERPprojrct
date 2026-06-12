import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Receipt } from "lucide-react";
import { accounting, type PurchaseInvoiceDetail } from "@/services/erp/accounting";

const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", posted: "مرحَّلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة",
};
const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  posted: "bg-primary/10 text-primary",
  partially_paid: "bg-warning/10 text-warning",
  paid: "bg-success/10 text-success",
  cancelled: "bg-destructive/10 text-destructive",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "نقد", bank: "بنك", bank_transfer: "تحويل بنكي", transfer: "تحويل بنكي",
  pos: "نقاط بيع", card: "بطاقة", cheque: "شيك", check: "شيك",
};

export default function PurchaseInvoiceAccountingDetail() {
  const { id = "" } = useParams();
  const [inv, setInv] = useState<PurchaseInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    accounting.getPurchaseInvoice(id)
      .then(r => { if (alive) setInv(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="p-6 text-sm text-muted-foreground" dir="rtl">جاري التحميل...</div>;
  if (!inv) return <div className="p-6 text-sm text-muted-foreground" dir="rtl">الفاتورة غير موجودة</div>;

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={`فاتورة شراء ${inv.invoice_no}`}
        subtitle={inv.supplier_name ?? ""}
      />

      <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-base font-bold flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" />{inv.invoice_no}
            </div>
            <div className="text-muted-foreground">
              المورد: <span className="font-medium text-foreground">{inv.supplier_name ?? "—"}</span>
              {inv.supplier_code && <span className="font-mono text-[11.5px] mr-2">({inv.supplier_code})</span>}
            </div>
            {inv.supplier_invoice_ref && (
              <div className="text-muted-foreground">مرجع المورد: <span className="font-mono text-[12px]">{inv.supplier_invoice_ref}</span></div>
            )}
          </div>
          <Badge className={STATUS_TONE[inv.status] ?? "bg-muted"}>{STATUS_LABEL[inv.status] ?? inv.status}</Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-border">
          <div><div className="text-[11.5px] text-muted-foreground">تاريخ الإصدار</div><div>{fmtDate(inv.invoice_date)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">تاريخ الاستحقاق</div><div>{fmtDate(inv.due_date)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">الصافي</div><div>{fmtSAR(inv.subtotal)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">الضريبة</div><div>{fmtSAR(inv.vat_amount)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">الإجمالي</div><div className="font-bold">{fmtSAR(inv.total)}</div></div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
          <div><div className="text-[11.5px] text-muted-foreground">المدفوع</div><div className="text-success">{fmtSAR(inv.paid_amount)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">المتبقي</div><div className="font-bold text-warning">{fmtSAR(inv.remaining)}</div></div>
          <div>
            <div className="text-[11.5px] text-muted-foreground">قيد محاسبي</div>
            {inv.journal_entry_id ? (
              <Link to={`/journals/${inv.journal_entry_id}`} className="inline-flex items-center gap-1 text-primary text-xs hover:underline">
                <BookOpen className="h-3 w-3" /> عرض القيد
              </Link>
            ) : <div className="text-xs text-muted-foreground">—</div>}
          </div>
          <div><div className="text-[11.5px] text-muted-foreground">تاريخ الترحيل</div><div className="text-xs">{fmtDate(inv.posted_at)}</div></div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden text-xs">
        <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold">
          البنود ({inv.lines.length})
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الوصف</th>
              <th>المركبة</th>
              <th className="text-right">الكمية</th>
              <th className="text-right">تكلفة الوحدة</th>
              <th className="text-right">الضريبة %</th>
              <th className="text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6">لا توجد بنود</td></tr>
            )}
            {inv.lines.map(l => (
              <tr key={l.id}>
                <td className="num">{l.line_no}</td>
                <td>{l.description}</td>
                <td className="font-mono text-[11.5px]">
                  {l.vehicle_id ? (
                    <Link to={`/vehicles/${l.vehicle_id}`} className="text-primary hover:underline">
                      {l.vehicle_vin ?? l.vehicle_code ?? l.vehicle_id.slice(0, 8)}
                    </Link>
                  ) : "—"}
                </td>
                <td className="num text-right">{l.quantity}</td>
                <td className="num text-right">{fmtSAR(l.unit_cost)}</td>
                <td className="num text-right">{l.vat_pct}%</td>
                <td className="num text-right font-semibold">{fmtSAR(l.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden text-xs">
        <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold">
          الدفعات للمورد ({inv.payments.length})
        </div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>الطريقة</th>
              <th>المرجع</th>
              <th className="text-right">المبلغ</th>
              <th>قيد GL</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {inv.payments.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-6">لا توجد دفعات بعد</td></tr>
            )}
            {inv.payments.map(p => (
              <tr key={p.id}>
                <td className="font-mono text-[12px]">{p.payment_no}</td>
                <td>{fmtDate(p.payment_date)}</td>
                <td>{METHOD_LABEL[p.method] ?? p.method}</td>
                <td className="font-mono text-[11.5px] text-muted-foreground">{p.reference ?? "—"}</td>
                <td className="num text-right font-semibold">{fmtSAR(p.amount)}</td>
                <td>
                  {p.journal_entry_id ? (
                    <Link to={`/journals/${p.journal_entry_id}`} className="inline-flex items-center gap-1 text-primary text-[12px] hover:underline">
                      <BookOpen className="h-3 w-3" /> مرتبط
                    </Link>
                  ) : <span className="text-[11.5px] text-muted-foreground">—</span>}
                </td>
                <td><Badge className={STATUS_TONE[p.status] ?? "bg-muted"}>{STATUS_LABEL[p.status] ?? p.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {inv.notes && (
        <div className="bg-card border border-border rounded-lg p-3 text-xs">
          <div className="font-semibold mb-1">ملاحظات</div>
          <div className="text-muted-foreground whitespace-pre-wrap">{inv.notes}</div>
        </div>
      )}
    </div>
  );
}