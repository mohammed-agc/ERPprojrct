import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck, ShieldAlert, Lock, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  customerSettlementService, fmtSAR,
  type CreditGateResult,
} from "@/services/erp/customerSettlement";

/**
 * Credit Gate Banner — full parity with supplier governance.
 *
 * Shown on Sales Order / Invoice / Delivery pages to surface the customer's
 * credit status before action. When `requires_override` is true, callers
 * should require a manager override and call
 * `customerSettlementService.logGateDecision` with the user's decision.
 */
export function CreditGateBanner({
  customerId,
  additionalExposure = 0,
  documentType,
  documentId,
  documentCode,
  compact = false,
}: {
  customerId: string | null | undefined;
  additionalExposure?: number;
  documentType: "sales_order" | "invoice" | "delivery";
  documentId?: string;
  documentCode?: string;
  compact?: boolean;
}) {
  const [gate, setGate] = useState<CreditGateResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!customerId) { setGate(null); return; }
    setLoading(true);
    customerSettlementService
      .checkCreditGate({ customerId, additionalExposure })
      .then(setGate)
      .catch(() => setGate(null))
      .finally(() => setLoading(false));
  }, [customerId, additionalExposure]);

  if (!customerId || loading || !gate) return null;
  const { summary, warnings, blocked, requires_override, ok } = gate;
  if (!summary) return null;

  const tone = blocked
    ? "border-destructive/50 bg-destructive/5"
    : requires_override
    ? "border-warning/50 bg-warning/5"
    : "border-success/40 bg-success/5";
  const Icon = blocked ? Lock : requires_override ? ShieldAlert : ShieldCheck;
  const iconTone = blocked ? "text-destructive" : requires_override ? "text-warning" : "text-success";

  return (
    <div className={`border rounded-lg p-3 mb-3 ${tone}`} role={blocked ? "alert" : "status"}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconTone}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-semibold text-sm">
                {blocked
                  ? "حساب العميل موقوف أو تجاوز الحد الائتماني"
                  : requires_override
                  ? "تحذير ائتماني — يلزم تجاوز مدير"
                  : "حالة الائتمان جيدة"}
              </div>
              {!summary.is_active && (
                <Badge className="bg-destructive/15 text-destructive border border-destructive/40 text-[10px]">
                  حساب موقوف
                </Badge>
              )}
              {summary.over_limit && (
                <Badge className="bg-destructive/15 text-destructive border border-destructive/40 text-[10px]">
                  تجاوز الحد
                </Badge>
              )}
              {summary.overdue_balance > 0 && (
                <Badge className="bg-warning/15 text-warning border border-warning/40 text-[10px]">
                  متأخر {summary.max_days_overdue} يوم
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-[11px]">
                <Link to={`/ar/${summary.id}`}>
                  <ExternalLink className="h-3 w-3 ml-1" /> كشف الحساب
                </Link>
              </Button>
            </div>
          </div>

          {!compact && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11px]">
              <Stat label="الحد الائتماني" value={fmtSAR(summary.credit_limit)} />
              <Stat label="المستخدم" value={fmtSAR(summary.utilized)} tone="warning" />
              <Stat
                label="المتبقي"
                value={fmtSAR(summary.remaining)}
                tone={summary.remaining < 0 ? "destructive" : "success"}
              />
              <Stat
                label="متأخر"
                value={fmtSAR(summary.overdue_balance)}
                tone={summary.overdue_balance > 0 ? "destructive" : "default"}
              />
            </div>
          )}

          {warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {warnings.map((w, i) => (
                <li key={i} className="text-[11px] flex items-start gap-1.5">
                  <AlertTriangle
                    className={`h-3 w-3 mt-0.5 shrink-0 ${
                      w.severity === "critical" ? "text-destructive" : "text-warning"
                    }`}
                  />
                  <span>{w.message}</span>
                </li>
              ))}
            </ul>
          )}

          {ok && warnings.length === 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">
              لا توجد تحذيرات — يمكن إصدار {documentType === "sales_order" ? "أمر البيع" : documentType === "invoice" ? "الفاتورة" : "التسليم"} بأمان.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: {
  label: string; value: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const c = tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-background/60 border border-border rounded px-2 py-1.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold num ${c}`}>{value}</div>
    </div>
  );
}
