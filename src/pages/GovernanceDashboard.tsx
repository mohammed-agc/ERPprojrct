import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { governanceService, auditKindLabel, auditSeverityTone, approvalStatusLabel, approvalStatusTone } from "@/services/erp/governance";
import { fmtSAR } from "@/lib/erpFormat";
import { CalendarRange, ClipboardCheck, ShieldAlert, FileWarning, Lock, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";

export default function GovernanceDashboard() {
  const [k, setK] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      governanceService.dashboard(),
      governanceService.listAudit({ severity: "all" }),
      governanceService.listApprovals({ status: "pending_approval" }),
    ]).then(([d, a, ap]) => { setK(d); setAudit(a.slice(0, 6)); setApprovals(ap.slice(0, 6)); });
  }, []);

  if (!k) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل…</div>;

  const kpis = [
    { label: "فترات مفتوحة", value: k.open_periods, icon: CalendarRange, tone: "text-emerald-600", to: "/governance/periods" },
    { label: "قيد الإقفال", value: k.pending_close, icon: Hourglass, tone: "text-amber-600", to: "/governance/monthly-close" },
    { label: "فترات مغلقة نهائياً", value: k.locked_periods, icon: Lock, tone: "text-rose-600", to: "/governance/periods" },
    { label: "موافقات معلقة", value: k.pending_approvals, icon: ClipboardCheck, tone: "text-amber-600", to: "/governance/approvals" },
    { label: "موافقات مرفوضة", value: k.rejected_approvals, icon: FileWarning, tone: "text-rose-600", to: "/governance/approvals" },
    { label: "تنبيهات حرجة", value: k.audit_alerts, icon: ShieldAlert, tone: "text-rose-600", to: "/governance/audit" },
    { label: "تحذيرات تدقيق", value: k.audit_warnings, icon: FileWarning, tone: "text-amber-600", to: "/governance/audit" },
    { label: "مهام متأخرة", value: k.overdue_tasks, icon: Hourglass, tone: "text-rose-600", to: "/governance/monthly-close" },
  ];

  return (
    <div>
      <PageHeader title="لوحة الحوكمة المالية" subtitle="رؤية تنفيذية على الإقفال والاعتمادات والمراجعة" sticky />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {kpis.map(kp => (
          <Link key={kp.label} to={kp.to}
            className="border rounded-lg p-3 bg-card hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">{kp.label}</div>
              <kp.icon className={cn("h-4 w-4", kp.tone)} />
            </div>
            <div className={cn("font-bold text-2xl mt-1", kp.tone)}>{kp.value}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/40 text-sm font-bold flex items-center justify-between">
            <span>أحدث طلبات الاعتماد</span>
            <Link to="/governance/approvals" className="text-xs text-primary">عرض الكل</Link>
          </div>
          <ul className="divide-y">
            {approvals.length === 0 && <li className="p-4 text-sm text-muted-foreground text-center">لا توجد طلبات معلقة</li>}
            {approvals.map(a => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm truncate">{a.entity_label}</div>
                  <div className="text-[11px] text-muted-foreground">{a.entity_ref} · {a.requester}</div>
                </div>
                <div className="text-sm font-semibold num">{fmtSAR(a.amount)}</div>
                <Badge variant="outline" className={cn("text-[10px]", approvalStatusTone[a.status])}>
                  {approvalStatusLabel[a.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </div>

        <div className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/40 text-sm font-bold flex items-center justify-between">
            <span>أحدث أحداث المراجعة</span>
            <Link to="/governance/audit" className="text-xs text-primary">عرض الكل</Link>
          </div>
          <ul className="divide-y">
            {audit.map(a => (
              <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                <Badge variant="outline" className={cn("text-[10px] shrink-0", auditSeverityTone[a.severity])}>
                  {a.severity === "critical" ? "حرج" : a.severity === "warning" ? "تحذير" : "معلوماتي"}
                </Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{auditKindLabel[a.kind]} — <span className="font-mono text-xs">{a.entity_ref}</span></div>
                  <div className="text-[11px] text-muted-foreground">{a.description}</div>
                </div>
                <div className="text-[10px] text-muted-foreground shrink-0">{a.at.slice(0, 10)}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
