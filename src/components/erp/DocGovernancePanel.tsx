import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Clock, CheckCircle2, XCircle, ArrowRight, User, AlertCircle } from "lucide-react";
import {
  type AuditEntry, type ApprovalEntry, type DocLink, type ErpGovRole,
  ROLE_LABEL, fmtAuditTime, useRole,
} from "@/services/erp/erpRoles";

interface NextAction {
  label: string;
  onClick: () => void;
  role: ErpGovRole;
  disabled?: boolean;
  disabledReason?: string;
  variant?: "default" | "outline" | "destructive" | "secondary";
}

interface Props {
  title?: string;
  status: string;
  statusTone?: string;
  responsibleRole?: ErpGovRole;
  previous?: DocLink;
  audit?: AuditEntry[];
  approvals?: ApprovalEntry[];
  nextActions?: NextAction[];
}

const docPath = (kind: string, id: string): string => {
  switch (kind) {
    case "pr": return `/purchasing/requests`;
    case "po": return `/purchasing/orders`;
    case "allocation": return `/purchasing/allocations/${id}`;
    case "allocation_confirmation": return `/purchasing/allocation-confirmations/${id}`;
    case "p_invoice": return `/purchasing/invoices`;
    case "grn": return `/grn/${id}`;
    case "inspection": return `/purchasing/inspection`;
    case "sales_request": return `/sales/requests`;
    case "sales_order": return `/sales-orders/${id}`;
    case "s_invoice": return `/sales/invoices`;
    case "delivery": return `/sales/deliveries`;
    default: return "#";
  }
};

export function DocGovernancePanel({
  title = "حوكمة الوثيقة",
  status, statusTone,
  responsibleRole, previous, audit = [], approvals = [], nextActions = [],
}: Props) {
  const [activeRole] = useRole();

  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-3 text-xs">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="font-semibold text-sm">{title}</div>
        <Badge className={statusTone || "bg-primary/10 text-primary border border-primary/30"}>{status}</Badge>
      </div>

      {/* Responsible + previous */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-1.5 text-[11px]">
          <User className="h-3 w-3 text-muted-foreground" />
          <span className="text-muted-foreground">المسؤول:</span>
          <span className="font-medium">{responsibleRole ? ROLE_LABEL[responsibleRole] : "—"}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">الوثيقة السابقة:</span>
          {previous ? (
            <Link to={docPath(previous.kind, previous.id)} className="text-primary hover:underline font-mono">
              {previous.code}
            </Link>
          ) : <span className="text-muted-foreground">—</span>}
        </div>
      </div>

      {/* Next actions */}
      {nextActions.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">الإجراء التالي</div>
          <div className="flex flex-wrap gap-1.5">
            {nextActions.map((a, i) => {
              const roleMatch = activeRole === a.role;
              const disabled = a.disabled || !roleMatch;
              const reason = !roleMatch ? `يتطلب صلاحية: ${ROLE_LABEL[a.role]}` : a.disabledReason;
              return (
                <Button
                  key={i} size="sm" variant={a.variant || "default"}
                  className="h-7 text-[11px]"
                  disabled={disabled}
                  onClick={a.onClick}
                  title={disabled ? reason : a.label}
                >
                  {a.label}
                  <ArrowRight className="h-3 w-3 mr-1" />
                </Button>
              );
            })}
          </div>
          {nextActions.some(a => activeRole !== a.role) && (
            <div className="flex items-start gap-1 text-[10px] text-muted-foreground">
              <AlertCircle className="h-3 w-3 mt-0.5" />
              <span>الإجراءات الرمادية تتطلب تبديل الدور النشط من شريط الأدوار.</span>
            </div>
          )}
        </div>
      )}

      {/* Approval history */}
      {approvals.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">سجل الاعتمادات</div>
          <ul className="space-y-1">
            {approvals.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-2 py-1 bg-muted/40 rounded">
                <div className="flex items-center gap-1.5">
                  {a.decision === "approved" ? <CheckCircle2 className="h-3 w-3 text-success" /> :
                   a.decision === "rejected" ? <XCircle className="h-3 w-3 text-destructive" /> :
                   <ArrowRight className="h-3 w-3 text-warning" />}
                  <span className="font-medium">{a.actor}</span>
                  <span className="text-muted-foreground">({ROLE_LABEL[a.role]})</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{fmtAuditTime(a.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Audit timeline */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">سجل التدقيق</div>
        {audit.length === 0 ? (
          <div className="text-[11px] text-muted-foreground py-2">لا توجد إجراءات مسجلة بعد</div>
        ) : (
          <ul className="space-y-1 max-h-56 overflow-y-auto">
            {audit.slice().reverse().map((e, i) => (
              <li key={i} className="flex items-start gap-2 px-2 py-1.5 border-r-2 border-primary/30 bg-muted/30 rounded">
                <Clock className="h-3 w-3 mt-0.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[11px]">{e.action}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{fmtAuditTime(e.at)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {e.actor} · {ROLE_LABEL[e.role]}
                    {e.from_status && e.to_status && ` · ${e.from_status} → ${e.to_status}`}
                  </div>
                  {e.note && <div className="text-[10px] text-muted-foreground mt-0.5">{e.note}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
