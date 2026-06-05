import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, ShieldCheck } from "lucide-react";
import {
  getPurchaseOrder, setPurchaseOrderStatus, listActiveSuppliers,
  PO_STATUS_LABEL, PO_STATUS_TONE, fmtSAR, fmtDate, type POStatus,
} from "@/services/erp/purchasingDb";

export default function PurchaseOrderDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["po", id],
    queryFn: () => getPurchaseOrder(id),
    enabled: !!id,
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ["active-suppliers"], queryFn: listActiveSuppliers });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">أمر الشراء غير موجود</div>;

  const { header: po, lines } = data;
  const supplier = suppliers.find(s => s.id === po.supplier_id);
  const refresh = () => qc.invalidateQueries({ queryKey: ["po", id] });

  const onStatus = async (s: POStatus, label: string) => {
    try {
      await setPurchaseOrderStatus(id, s);
      toast.success(label);
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "تعذّر التحديث"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title={`أمر شراء ${po.po_no}`} subtitle={supplier?.name ?? ""} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-base font-bold">{po.po_no}</div>
                <div className="text-muted-foreground">{supplier?.name ?? "—"}</div>
              </div>
              <Badge className={PO_STATUS_TONE[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">التاريخ</div><div>{fmtDate(po.order_date)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الوصول المتوقع</div><div>{fmtDate(po.expected_delivery)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">عدد البنود</div><div>{lines.length}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الإجمالي</div><div className="font-bold">{fmtSAR(Number(po.total))}</div></div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">الفرعي</div><div className="num">{fmtSAR(Number(po.subtotal))}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الضريبة</div><div className="num">{fmtSAR(Number(po.vat_amount))}</div></div>
              <div><div className="text-[10px] text-muted-foreground">طلب الشراء</div>
                <div>{po.pr_id ? <Link to={`/purchasing/requests/${po.pr_id}`} className="text-primary hover:underline">عرض</Link> : "—"}</div>
              </div>
            </div>
            {po.notes && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">ملاحظات</div>
                <div className="bg-muted/30 rounded p-2">{po.notes}</div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border font-semibold text-xs">البنود</div>
            <table className="erp-table text-xs">
              <thead>
                <tr><th>#</th><th>الصانع</th><th>الموديل</th><th>الفئة</th><th>السنة</th><th>اللون</th><th>الكمية</th><th>سعر الوحدة</th><th>VAT%</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id}>
                    <td>{l.line_no}</td>
                    <td>{(l as any).manufacturer ?? l.brand}</td>
                    <td>{l.model}</td>
                    <td>{(l as any).trim ?? "—"}</td>
                    <td>{l.year ?? "—"}</td>
                    <td>{l.color ?? "—"}</td>
                    <td className="num">{Number(l.quantity)}</td>
                    <td className="num">{fmtSAR(Number(l.unit_cost))}</td>
                    <td className="num">{Number(l.vat_pct)}%</td>
                    <td className="num font-semibold">{fmtSAR(Number(l.line_total))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          {po.status === "draft" && (
            <Button className="w-full" onClick={() => onStatus("sent", "أُرسل للمورد")}>
              <Send className="h-4 w-4 ml-1" /> إرسال للمورد
            </Button>
          )}
          {po.status === "sent" && (
            <Button className="w-full" onClick={() => onStatus("acknowledged", "تم تأكيد المورد")}>
              <ShieldCheck className="h-4 w-4 ml-1" /> تسجيل تأكيد المورد
            </Button>
          )}
          {(po.status === "draft" || po.status === "sent" || po.status === "acknowledged" || po.status === "partially_received") && (
            <Button variant="outline" className="w-full"
              onClick={() => onStatus("cancelled", "تم إلغاء أمر الشراء")}>إلغاء</Button>
          )}
          {po.acknowledged_at && (
            <div className="text-[11px] text-muted-foreground bg-muted/30 rounded p-2">
              أكّده المورد في {fmtDate(po.acknowledged_at)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
