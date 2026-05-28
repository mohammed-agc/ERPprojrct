import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Send, ShieldCheck } from "lucide-react";
import {
  purchasingService, PO_LABEL, PO_TONE, fmtSAR, fmtDate,
} from "@/services/erp/purchasing";
import { allocationService } from "@/services/erp/allocations";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { SupplierConfirmationDialog } from "@/components/erp/SupplierConfirmationDialog";
import { makeAudit, type AuditEntry, type ErpGovRole } from "@/services/erp/erpRoles";

export default function PurchaseOrderDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const refresh = () => setTick(t => t + 1);

  const po = useMemo(() => purchasingService.getPO(id), [id, tick]);
  if (!po) return <div className="p-6 text-sm text-muted-foreground">أمر الشراء غير موجود</div>;

  const supplier = purchasingService.getSupplier(po.supplier_id);
  const allocs = allocationService.listByPO(po.id);
  const invs = purchasingService.invoicesForPO(po.id);

  const audit: AuditEntry[] = po.audit && po.audit.length > 0 ? po.audit : [
    makeAudit({ role: "purchasing_officer", action: "إنشاء أمر الشراء", to_status: "draft" }),
    ...(po.approved_at ? [makeAudit({ role: "purchasing_manager", action: "اعتماد أمر الشراء", to_status: "approved" })] : []),
    ...(po.awaiting_supplier_at ? [makeAudit({ role: "purchasing_officer", action: "إرسال للمورد", to_status: "awaiting_supplier_confirmation" })] : []),
    ...(po.supplier_confirmed_at ? [makeAudit({ role: "purchasing_manager", action: "تأكيد المورد", to_status: "ready_for_allocation" })] : []),
  ];

  const responsibleRole: ErpGovRole =
    po.status === "draft" ? "purchasing_manager" :
    po.status === "approved" ? "purchasing_officer" :
    po.status === "awaiting_supplier_confirmation" ? "purchasing_manager" :
    po.status === "ready_for_allocation" || po.status === "allocation_pending" ? "purchasing_officer" :
    po.status === "allocated" ? "accounting" :
    po.status === "invoiced" ? "purchasing_officer" :
    po.status === "in_transit" || po.status === "received" ? "receiving" :
    po.status === "inspection_pending" ? "inspection" :
    "purchasing_manager";

  const approve = () => { purchasingService.approvePO(po.id); toast.success("تم الاعتماد"); refresh(); };
  const sendToSupplier = () => { purchasingService.moveToAwaitingSupplier(po.id); toast.success("تم الإرسال للمورد"); refresh(); };
  const goAllocate = () => { /* navigate manually */ };

  const nextActions: any[] = [];
  if (po.status === "draft") {
    nextActions.push({ label: "اعتماد", role: "purchasing_manager", onClick: approve });
  }
  if (po.status === "approved") {
    nextActions.push({ label: "إرسال للمورد", role: "purchasing_officer", onClick: sendToSupplier });
  }
  if (po.status === "awaiting_supplier_confirmation") {
    nextActions.push({ label: "تسجيل تأكيد المورد", role: "purchasing_manager", onClick: () => setConfirmOpen(true) });
  }

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title={`أمر شراء ${po.code}`} subtitle={supplier?.name ?? ""} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-base font-bold">{po.code}</div>
                <div className="text-muted-foreground">{supplier?.name} · {po.branch_destination}</div>
              </div>
              <Badge className={PO_TONE[po.status]}>{PO_LABEL[po.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">التاريخ</div><div>{fmtDate(po.created_at)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الوصول المتوقع</div><div>{fmtDate(po.expected_delivery)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">عدد الأصناف</div><div>{po.items.length}</div></div>
              <div><div className="text-[10px] text-muted-foreground">الإجمالي</div><div className="font-bold">{fmtSAR(po.total)}</div></div>
            </div>
            {po.supplier_confirm_outcome && (
              <div className="bg-success/5 border border-success/30 rounded p-2 text-[11px]">
                <span className="font-semibold text-success">نتيجة تأكيد المورد:</span> {po.supplier_confirm_outcome}
                {po.supplier_confirm_note && <span className="text-muted-foreground"> — {po.supplier_confirm_note}</span>}
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border font-semibold text-xs">الأصناف</div>
            <table className="erp-table text-xs">
              <thead><tr><th>الوصف</th><th>النوع</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr></thead>
              <tbody>
                {po.items.map(i => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>{i.kind === "vehicle" ? "مركبة" : "قطعة"}</td>
                    <td className="num">{i.qty}</td>
                    <td className="num">{fmtSAR(i.unit_cost)}</td>
                    <td className="num font-semibold">{fmtSAR(i.qty * i.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(allocs.length > 0 || invs.length > 0) && (
            <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2">
              <div className="font-semibold">الوثائق المرتبطة</div>
              {allocs.map(a => (
                <div key={a.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1">
                  <Link to={`/purchasing/allocations/${a.id}`} className="text-primary hover:underline font-mono">{a.code}</Link>
                  <span>{a.lines.length} مركبة · {a.status}</span>
                </div>
              ))}
              {invs.map(inv => (
                <div key={inv.id} className="flex items-center justify-between bg-muted/40 rounded px-2 py-1">
                  <Link to={`/purchasing/invoices/${inv.id}`} className="text-primary hover:underline font-mono">{inv.code}</Link>
                  <span>{fmtSAR(inv.total)} · {inv.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <DocGovernancePanel
            status={PO_LABEL[po.status]}
            statusTone={PO_TONE[po.status]}
            responsibleRole={responsibleRole}
            previous={po.pr_id ? { kind: "pr", id: po.pr_id, code: "PR" } : undefined}
            audit={audit}
            approvals={po.approvals ?? []}
            nextActions={nextActions}
          />

          {po.status === "draft" && (
            <Button className="w-full" onClick={approve}><Check className="h-4 w-4 ml-1" /> اعتماد</Button>
          )}
          {po.status === "approved" && (
            <Button className="w-full" onClick={sendToSupplier}><Send className="h-4 w-4 ml-1" /> إرسال للمورد</Button>
          )}
          {po.status === "awaiting_supplier_confirmation" && (
            <Button className="w-full" onClick={() => setConfirmOpen(true)}>
              <ShieldCheck className="h-4 w-4 ml-1" /> تسجيل تأكيد المورد
            </Button>
          )}
          {(po.status === "ready_for_allocation" || po.status === "allocation_pending") && (
            <Link to="/purchasing/allocations" className="block">
              <Button className="w-full" variant="default">انتقال إلى تخصيص المركبات</Button>
            </Link>
          )}
        </div>
      </div>

      <SupplierConfirmationDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        poId={po.id}
        onDone={refresh}
      />
    </div>
  );
}
