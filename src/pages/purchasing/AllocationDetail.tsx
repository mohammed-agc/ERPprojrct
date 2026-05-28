import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, ShieldCheck } from "lucide-react";
import {
  allocationService, ALC_STATUS_LABEL, ALC_STATUS_TONE,
  ALC_VSTATUS_LABEL, ALC_VSTATUS_TONE,
} from "@/services/erp/allocations";
import { purchasingService, fmtDate } from "@/services/erp/purchasing";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { AllocationConfirmationDialog } from "@/components/erp/AllocationConfirmationDialog";
import { useRole } from "@/services/erp/erpRoles";

export default function AllocationDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);
  const [confOpen, setConfOpen] = useState(false);
  const refresh = () => setTick(t => t + 1);
  const [activeRole] = useRole();

  const alloc = useMemo(() => allocationService.get(id), [id, tick]);
  if (!alloc) return <div className="p-6 text-sm text-muted-foreground">التخصيص غير موجود</div>;

  const supplier = purchasingService.getSupplier(alloc.supplier_id);
  const po = purchasingService.getPO(alloc.po_id);
  const cc = allocationService.confirmationFor(alloc.id);

  const onConfirm = () => { allocationService.confirmAllocation(alloc.id); toast.success("تم التأكيد"); refresh(); };

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
        title={`تخصيص ${alloc.code}`}
        subtitle={`${supplier?.name ?? "—"} · ${alloc.lines.length} مركبة`}
        actions={
          <div className="flex gap-2">
            {po && <Button variant="outline" size="sm" asChild><Link to={`/purchasing/orders`}><FileText className="h-4 w-4 ml-1" />{po.code}</Link></Button>}
            {alloc.status === "confirmed" && !cc && (
              <Button size="sm" variant="secondary" onClick={() => setConfOpen(true)}>
                <ShieldCheck className="h-4 w-4 ml-1" /> إصدار وثيقة التأكيد
              </Button>
            )}
          </div>
        }
      />
      <AllocationConfirmationDialog open={confOpen} onOpenChange={setConfOpen} allocationId={alloc.id} onCreated={refresh} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="space-y-3">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/40 font-semibold text-sm">المركبات المخصصة</div>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>VIN</th>
                  <th>رقم المحرك</th>
                  <th>الماركة / الموديل</th>
                  <th>السنة</th>
                  <th>اللون</th>
                  <th>الفئة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {alloc.lines.map(l => (
                  <tr key={l.id}>
                    <td className="font-mono text-[11px]">{l.vin}</td>
                    <td className="font-mono text-[11px]">{l.engine_no}</td>
                    <td className="text-xs">{l.brand} {l.model}</td>
                    <td className="text-xs num">{l.year}</td>
                    <td className="text-xs">{l.color}</td>
                    <td className="text-xs">{l.trim || "—"}</td>
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
                <Link to={`/purchasing/allocation-confirmations/${cc.id}`} className="font-mono text-primary hover:underline">{cc.code}</Link>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div><span className="text-muted-foreground">تاريخ التخصيص:</span> {fmtDate(cc.allocation_date)}</div>
                <div><span className="text-muted-foreground">عدد المركبات:</span> {cc.vehicle_count}</div>
                <div><span className="text-muted-foreground">الفاتورة:</span> {cc.invoice_id ? "مرتبطة" : "—"}</div>
              </div>
              {cc.notes && <div className="mt-2 text-[11px] text-muted-foreground">{cc.notes}</div>}
            </div>
          )}
        </div>

        <DocGovernancePanel
          status={ALC_STATUS_LABEL[alloc.status]}
          statusTone={ALC_STATUS_TONE[alloc.status]}
          responsibleRole={responsibleRole}
          previous={po ? { kind: "po", id: po.id, code: po.code } : undefined}
          audit={alloc.audit}
          approvals={alloc.approvals}
          nextActions={[
            ...(alloc.status === "draft" ? [{ label: "تأكيد التخصيص", onClick: onConfirm, role: "purchasing_officer" as const }] : []),
            ...(alloc.status === "confirmed" && !cc ? [{ label: "إصدار وثيقة التأكيد", onClick: () => setConfOpen(true), role: "purchasing_officer" as const }] : []),
          ]}
        />
      </div>
    </div>
  );
}
