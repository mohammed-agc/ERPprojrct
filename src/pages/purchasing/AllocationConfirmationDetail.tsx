import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { getConfirmation, fmtDate } from "@/services/erp/allocationsDb";
import { listPurchaseOrders, listActiveSuppliers } from "@/services/erp/purchasingDb";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";

export default function AllocationConfirmationDetail() {
  const { id = "" } = useParams();
  const { data: cc, isLoading } = useQuery({
    queryKey: ["alloc-conf", id], queryFn: () => getConfirmation(id), enabled: !!id,
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers });
  const { data: pos = [] } = useQuery({ queryKey: ["pos"], queryFn: listPurchaseOrders });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (!cc) return <div className="p-6 text-sm text-muted-foreground">الوثيقة غير موجودة</div>;

  const sup = suppliers.find(s => s.id === cc.supplier_id);
  const po = pos.find(p => p.id === cc.po_id);

  return (
    <div className="space-y-3">
      <PageHeader
        title={`وثيقة تأكيد ${cc.conf_no}`}
        subtitle={`${sup?.name ?? "—"} · ${cc.vehicle_count} مركبة`}
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={`/purchasing/allocations/${cc.allocation_id}`}><FileText className="h-4 w-4 ml-1" /> التخصيص</Link>
          </Button>
        }
      />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg p-3 text-xs grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">المورد:</span> <span className="font-medium">{sup?.name ?? "—"}</span></div>
            <div><span className="text-muted-foreground">أمر الشراء:</span> <span className="font-mono">{po?.po_no ?? "—"}</span></div>
            <div><span className="text-muted-foreground">تاريخ التخصيص:</span> {fmtDate(cc.allocation_date)}</div>
            <div><span className="text-muted-foreground">عدد المركبات:</span> <span className="font-semibold">{cc.vehicle_count}</span></div>
            <div className="col-span-2"><span className="text-muted-foreground">الفاتورة المرتبطة:</span> {cc.purchase_invoice_id ? <span className="text-success">مرتبطة</span> : <span className="text-muted-foreground">لم تُربط بعد</span>}</div>
            {cc.notes && <div className="col-span-2 text-muted-foreground text-[11px] pt-1 border-t border-border mt-1">{cc.notes}</div>}
          </div>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold text-sm">قائمة VIN</div>
            <ul className="divide-y divide-border">
              {cc.vin_list.map((v, i) => (
                <li key={i} className="px-3 py-1.5 font-mono text-[11px]">{v}</li>
              ))}
            </ul>
          </div>
        </div>
        <DocGovernancePanel
          status="مُصدرة"
          responsibleRole="purchasing_officer"
          previous={{ kind: "allocation", id: cc.allocation_id, code: "التخصيص" }}
        />
      </div>
    </div>
  );
}
