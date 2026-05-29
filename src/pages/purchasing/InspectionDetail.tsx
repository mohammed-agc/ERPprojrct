import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, X, Car } from "lucide-react";
import {
  purchasingService, INSP_LABEL, INSP_TONE, fmtDate,
} from "@/services/erp/purchasing";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { VehicleIntakeDialog } from "@/components/erp/VehicleIntakeDialog";
import { makeAudit, type AuditEntry, type ErpGovRole } from "@/services/erp/erpRoles";
import { getPoVehicleUnits, groupUnitsByPoLine } from "@/lib/poVehicleUnits";

export default function InspectionDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const refresh = () => setTick(t => t + 1);

  const ins = useMemo(() => purchasingService.listInspections().find(i => i.id === id), [id, tick]);
  if (!ins) {
    return <div className="p-6 text-sm text-muted-foreground">
      سجل الفحص غير موجود — <Link to="/purchasing/inspection" className="text-primary">رجوع</Link>
    </div>;
  }

  const po = purchasingService.getPO(ins.po_id);
  const grn = purchasingService.getGRN(ins.grn_id);
  const passed = ins.items.reduce((s, x) => s + x.passed, 0);
  const failed = ins.items.reduce((s, x) => s + x.failed, 0);

  const audit: AuditEntry[] = [
    makeAudit({ role: "inspection", action: "بدء الفحص", to_status: "in_progress" }),
    ...(ins.status === "approved" ? [makeAudit({ role: "inspection", action: "اعتماد الفحص", to_status: "approved" })] : []),
    ...(ins.status === "rejected" ? [makeAudit({ role: "inspection", action: "رفض الفحص", to_status: "rejected" })] : []),
    ...((ins.vehicle_ids?.length ?? 0) > 0 ? [makeAudit({ role: "inventory", action: `إدخال ${ins.vehicle_ids!.length} مركبة للمخزون` })] : []),
  ];

  const responsibleRole: ErpGovRole =
    ins.status === "approved" ? "inventory" :
    ins.status === "rejected" ? "purchasing_manager" : "inspection";

  const vehicleApproved = po
    ? ins.items.reduce((s, it) => {
        const line = po.items.find(l => l.id === it.line_id);
        return s + (line?.kind === "vehicle" ? (it.passed ?? 0) : 0);
      }, 0)
    : 0;
  const intaked = ins.vehicle_ids?.length ?? 0;
  const remaining = Math.max(0, vehicleApproved - intaked);

  const approve = () => { purchasingService.setInspectionStatus(ins.id, "approved"); toast.success("تم الاعتماد"); refresh(); };
  const reject = () => { purchasingService.setInspectionStatus(ins.id, "rejected"); toast.error("تم الرفض"); refresh(); };

  const nextActions: any[] = [];
  if (ins.status === "pending" || ins.status === "in_progress") {
    nextActions.push({ label: "اعتماد", role: "inspection", onClick: approve });
    nextActions.push({ label: "رفض", role: "inspection", onClick: reject, variant: "destructive" });
  }
  if (ins.status === "approved" && remaining > 0) {
    nextActions.push({ label: "إدخال المركبات للمخزون", role: "inventory", onClick: () => setIntakeOpen(true) });
  }

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader
        title={`فحص ${ins.id}`}
        subtitle={
          <div className="flex items-center gap-2 text-xs">
            <Badge className={INSP_TONE[ins.status]}>{INSP_LABEL[ins.status]}</Badge>
            <span className="text-muted-foreground">PO:</span>
            {po && <Link to={`/purchasing/orders/${po.id}`} className="text-primary font-mono hover:underline">{po.code}</Link>}
            {grn && <>
              <span className="text-muted-foreground">· GRN:</span>
              <Link to={`/grn/${grn.id}`} className="text-primary font-mono hover:underline">{grn.code}</Link>
            </>}
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><div className="text-[10px] text-muted-foreground">المفتش</div><div>{ins.inspector}</div></div>
            <div><div className="text-[10px] text-muted-foreground">تاريخ البدء</div><div>{fmtDate(ins.started_at)}</div></div>
            <div><div className="text-[10px] text-muted-foreground">ناجح</div><div className="text-success font-bold num">{passed}</div></div>
            <div><div className="text-[10px] text-muted-foreground">راسب</div><div className="text-destructive font-bold num">{failed}</div></div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border font-semibold text-xs">نتائج الفحص حسب البند</div>
            <table className="erp-table text-xs">
              <thead><tr><th>الصنف</th><th>VIN / مرجع</th><th>ناجح</th><th>راسب</th><th>ملاحظات</th></tr></thead>
              <tbody>
                {ins.items.map((it, i) => {
                  const line = po?.items.find(l => l.id === it.line_id);
                  return (
                    <tr key={i}>
                      <td>{line?.description ?? it.line_id}</td>
                      <td className="font-mono text-[10px]">{line?.kind === "vehicle" ? (line as any).vin ?? "—" : "—"}</td>
                      <td className="num text-success">{it.passed}</td>
                      <td className="num text-destructive">{it.failed}</td>
                      <td>{it.remarks ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {ins.notes && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs">
              <div className="text-[10px] text-muted-foreground mb-1">ملاحظات</div>
              <div className="bg-muted/30 rounded p-2">{ins.notes}</div>
            </div>
          )}

          {vehicleApproved > 0 && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-semibold">إدخال المخزون</div>
                <div className="text-muted-foreground">{intaked}/{vehicleApproved} مركبة</div>
              </div>
              {ins.status === "approved" && remaining > 0 && (
                <Button size="sm" className="mt-2" onClick={() => setIntakeOpen(true)}>
                  <Car className="h-3.5 w-3.5 ml-1" /> إدخال {remaining} مركبة
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <DocGovernancePanel
            status={INSP_LABEL[ins.status]}
            statusTone={INSP_TONE[ins.status]}
            responsibleRole={responsibleRole}
            previous={grn ? { kind: "grn", id: grn.id, code: grn.code } : undefined}
            audit={audit}
            nextActions={nextActions}
          />

          {(ins.status === "pending" || ins.status === "in_progress") && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={approve}><ShieldCheck className="h-4 w-4 ml-1" /> اعتماد</Button>
              <Button variant="destructive" className="flex-1" onClick={reject}><X className="h-4 w-4 ml-1" /> رفض</Button>
            </div>
          )}
        </div>
      </div>

      <VehicleIntakeDialog
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        inspection={ins}
        po={po ?? null}
        onCreated={refresh}
      />
    </div>
  );
}
