import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  purchasingService, PR_LABEL, PR_TONE, URGENCY_LABEL, URGENCY_TONE, fmtSAR, fmtDate,
} from "@/services/erp/purchasing";
import { PrintablePurchaseDoc } from "@/components/erp/PrintablePurchaseDoc";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { DocGovernancePanel } from "@/components/erp/DocGovernancePanel";
import { makeAudit, type AuditEntry, type ErpGovRole } from "@/services/erp/erpRoles";

export default function PurchaseRequestDetail() {
  const { id = "" } = useParams();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);

  const pr = useMemo(() => purchasingService.listPRs().find(p => p.id === id), [id, tick]);
  if (!pr) return <div className="p-6 text-sm text-muted-foreground">طلب الشراء غير موجود</div>;

  const po = pr.po_id ? purchasingService.getPO(pr.po_id) : undefined;
  const totalEst = pr.items.reduce((s, i) => s + i.qty * i.unit_cost, 0);

  // Synthesize audit from timestamps if not present
  const audit: AuditEntry[] = pr.audit && pr.audit.length > 0 ? pr.audit : [
    makeAudit({ role: "purchasing_officer", action: "إنشاء طلب الشراء", to_status: "draft", actor: pr.requester }),
    ...(pr.status !== "draft" ? [makeAudit({ role: "purchasing_officer", action: "إرسال للاعتماد", to_status: "pending", actor: pr.requester })] : []),
    ...(pr.approved_at ? [makeAudit({ role: "purchasing_manager", action: "اعتماد", to_status: "approved", actor: pr.approver })] : []),
  ];

  const responsibleRole: ErpGovRole =
    pr.status === "draft" || pr.status === "pending" ? "purchasing_manager" :
    pr.status === "approved" ? "purchasing_officer" : "purchasing_officer";

  const approve = () => {
    const generatedPO = purchasingService.approvePR(pr.id);
    toast.success(generatedPO ? `تم الاعتماد وإنشاء أمر الشراء ${generatedPO.code}` : "تم الاعتماد");
    refresh();
  };
  const reject = () => { purchasingService.rejectPR(pr.id); toast.error("تم الرفض"); refresh(); };

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title={`طلب شراء ${pr.code}`} subtitle={pr.requester} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-base font-bold">{pr.code}</div>
                <div className="text-muted-foreground">{pr.department} · {pr.branch}</div>
              </div>
              <div className="flex gap-2">
                <Badge className={URGENCY_TONE[pr.urgency]}>{URGENCY_LABEL[pr.urgency]}</Badge>
                <Badge className={PR_TONE[pr.status]}>{PR_LABEL[pr.status]}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">التاريخ</div><div>{fmtDate(pr.created_at)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">عدد الأصناف</div><div>{pr.items.length}</div></div>
              <div><div className="text-[10px] text-muted-foreground">إجمالي تقديري</div><div className="font-bold">{fmtSAR(totalEst)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">أمر الشراء المرتبط</div>
                <div>{po ? <Link to={`/purchasing/orders/${po.id}`} className="text-primary hover:underline font-mono">{po.code}</Link> : "—"}</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground mb-1">التبرير</div>
              <div className="bg-muted/30 rounded p-2">{pr.justification}</div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border font-semibold text-xs">الأصناف</div>
            <table className="erp-table text-xs">
              <thead>
                <tr><th>الوصف</th><th>النوع</th><th>الكمية</th><th>تكلفة الوحدة</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {pr.items.map(i => (
                  <tr key={i.id}>
                    <td>{i.description}</td>
                    <td>{i.kind === "vehicle" ? "مركبة" : "قطعة غيار"}</td>
                    <td className="num">{i.qty}</td>
                    <td className="num">{fmtSAR(i.unit_cost)}</td>
                    <td className="num font-semibold">{fmtSAR(i.qty * i.unit_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <DocGovernancePanel
            status={PR_LABEL[pr.status]}
            statusTone={PR_TONE[pr.status]}
            responsibleRole={responsibleRole}
            audit={audit}
            approvals={pr.approvals ?? []}
            nextActions={
              pr.status === "pending" || pr.status === "draft"
                ? [
                    { label: "اعتماد", role: "purchasing_manager", onClick: approve },
                    { label: "رفض", role: "purchasing_manager", onClick: reject, variant: "destructive" },
                  ]
                : []
            }
          />
          {pr.status === "pending" && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={approve}><Check className="h-4 w-4 ml-1" /> اعتماد</Button>
              <Button variant="destructive" className="flex-1" onClick={reject}><X className="h-4 w-4 ml-1" /> رفض</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
