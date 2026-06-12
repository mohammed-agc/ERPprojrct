import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import {
  getAllocation, confirmationForAllocation, setAllocationStatus,
  ALC_STATUS_LABEL, ALC_STATUS_TONE, ALC_VSTATUS_LABEL, ALC_VSTATUS_TONE, fmtDate,
} from "@/services/erp/allocationsDb";
import { getPurchaseOrder, listActiveSuppliers } from "@/services/erp/purchasingDb";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";

import { PurchaseInvoiceCreateDialog } from "@/components/erp/PurchaseInvoiceCreateDialog";

export default function AllocationDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [confOpen, setConfOpen] = useState(false);
  const [invOpen, setInvOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["allocation", id],
    queryFn: () => getAllocation(id),
    enabled: !!id,
  });
  const { data: cc } = useQuery({
    queryKey: ["allocation-conf", id],
    queryFn: () => confirmationForAllocation(id),
    enabled: !!id,
  });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers-active"], queryFn: listActiveSuppliers });
  const { data: poData } = useQuery({
    queryKey: ["po-detail", data?.header.po_id],
    queryFn: () => getPurchaseOrder(data!.header.po_id),
    enabled: !!data?.header.po_id,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">التخصيص غير موجود</div>;

  const alloc = data.header;
  const lines = data.lines;
  const supplier = suppliers.find(s => s.id === alloc.supplier_id);
  const po = poData?.header;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["allocation", id] });
    qc.invalidateQueries({ queryKey: ["allocation-conf", id] });
    qc.invalidateQueries({ queryKey: ["allocations"] });
  };

  const onConfirm = async () => {
    try {
      await setAllocationStatus(alloc.id, "confirmed");
      toast.success("تم التأكيد");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل التحديث");
    }
  };

  const responsibleRole =
    alloc.status === "draft" ? "purchasing_officer" :
    alloc.status === "confirmed" ? "purchasing_officer" :
    alloc.status === "invoiced" ? "accounting" :
    alloc.status === "in_transit" ? "receiving" :
    alloc.status === "received" ? "inspection" :
    "purchasing_manager";

  return (
    <div className="space-y-3">
      <PageHeader
        title={`تخصيص ${alloc.alloc_no}`}
        subtitle={`${supplier?.name ?? "—"} · ${lines.length} مركبة`}
        actions={
          po ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/purchasing/orders/${po.id}`}><FileText className="h-4 w-4 ml-1" />{po.po_no}</Link>
            </Button>
          ) : undefined
        }
      />
      <PurchaseInvoiceCreateDialog open={invOpen} onOpenChange={setInvOpen} allocationId={alloc.id} />

      {supplier && (
        <div className="border border-primary/30 bg-primary/5 rounded-md p-3 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
          <div>
            <div className="text-[11.5px] text-muted-foreground">المورد</div>
            <div className="font-semibold text-sm">{supplier.name}</div>
            <div className="text-[11.5px] text-muted-foreground font-mono">{supplier.code}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted-foreground">أمر الشراء</div>
            {po
              ? <Link to={`/purchasing/orders/${po.id}`} className="font-mono font-semibold text-primary hover:underline whitespace-nowrap">{po.po_no}</Link>
              : <div>—</div>}
            <div className="text-[11.5px] text-muted-foreground">{po ? fmtDate(po.created_at) : "—"}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted-foreground">التسليم المتوقع</div>
            <div>{fmtDate(po?.expected_delivery)}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted-foreground">عدد المركبات</div>
            <div className="num font-bold">{lines.length}</div>
          </div>
          <div>
            <div className="text-[11.5px] text-muted-foreground">إجمالي تقديري</div>
            <div className="num font-bold">
              {lines.reduce((s, l) => s + (Number(l.unit_cost) || 0), 0).toLocaleString("ar-SA")} ر.س
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold text-sm">المركبات المخصصة</div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الصانع / الموديل</th>
                  <th>الفئة</th>
                  <th>السنة</th>
                  <th>اللون</th>
                  <th>VIN</th>
                  <th>رقم المحرك</th>
                  <th>تكلفة الوحدة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={l.id}>
                    <td className="text-xs num">{idx + 1}</td>
                    <td className="text-xs font-semibold">{l.manufacturer || l.brand} {l.model}</td>
                    <td className="text-xs">{l.trim || "—"}</td>
                    <td className="text-xs num">{l.year ?? "—"}</td>
                    <td className="text-xs">{l.color ?? "—"}</td>
                    <td className="font-mono text-[12px]">{l.vin}</td>
                    <td className="font-mono text-[12px]">{l.engine_no}</td>
                    <td className="text-xs num">{l.unit_cost ? Number(l.unit_cost).toLocaleString("ar-SA") : "—"}</td>
                    <td><Badge className={ALC_VSTATUS_TONE[l.status]}>{ALC_VSTATUS_LABEL[l.status]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cc && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold text-sm">وثيقة تأكيد التخصيص</div>
                <Link to={`/purchasing/allocation-confirmations/${cc.id}`} className="font-mono text-primary hover:underline">{cc.conf_no}</Link>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[12px]">
                <div><span className="text-muted-foreground">تاريخ التخصيص:</span> {fmtDate(cc.allocation_date)}</div>
                <div><span className="text-muted-foreground">عدد المركبات:</span> {cc.vehicle_count}</div>
                <div><span className="text-muted-foreground">الفاتورة:</span> {cc.purchase_invoice_id ? "مرتبطة" : "—"}</div>
              </div>
              {cc.notes && <div className="mt-2 text-[12px] text-muted-foreground">{cc.notes}</div>}
            </div>
          )}
        </div>

        <DocGovernancePanel
          status={ALC_STATUS_LABEL[alloc.status]}
          statusTone={ALC_STATUS_TONE[alloc.status]}
          responsibleRole={responsibleRole}
          previous={po ? { kind: "po", id: po.id, code: po.po_no } : undefined}
          nextActions={[
            ...(alloc.status === "draft" ? [{ label: "تأكيد التخصيص", onClick: onConfirm, role: "purchasing_officer" as const }] : []),
            ...(alloc.status === "confirmed" ? [{ label: "إنشاء فاتورة شراء", onClick: () => setInvOpen(true), role: "purchasing_officer" as const }] : []),
          ]}
        />
      </div>
    </div>
  );
}