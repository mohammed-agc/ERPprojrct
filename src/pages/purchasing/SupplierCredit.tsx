import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import {
  Search, AlertTriangle, ShieldCheck, FileText, Clock, RotateCw,
} from "lucide-react";
import {
  supplierSettlementService, fmtSAR, fmtDate, SETTLEMENT_LABEL,
  type SupplierCreditRow,
} from "@/services/erp/supplierSettlement";

/**
 * Supplier Credit Governance — full parity with /sales/customer-credit.
 *
 * يعرض حدود الائتمان، الاستخدام (من Open Items)، الأرصدة المتأخرة،
 * ويربط بكشف حساب المورد الموثوق (دفتر الأستاذ المساعد).
 */
export default function SupplierCredit() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SupplierCreditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    supplierSettlementService.listSupplierCredit()
      .then(setRows)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    if (!qv) return rows;
    return rows.filter(r => `${r.code} ${r.name}`.toLowerCase().includes(qv));
  }, [rows, q]);

  const totals = useMemo(() => ({
    limit: rows.reduce((s, x) => s + x.credit_limit, 0),
    used: rows.reduce((s, x) => s + x.utilized, 0),
    remaining: rows.reduce((s, x) => s + Math.max(0, x.remaining), 0),
    due: rows.reduce((s, x) => s + x.due_balance, 0),
    overdue: rows.reduce((s, x) => s + x.overdue_balance, 0),
    over: rows.filter(x => x.over_limit).length,
    blocked: rows.filter(x => !x.is_active).length,
  }), [rows]);

  return (
    <div>
      <PageHeader
        title="إدارة ائتمان الموردين"
        subtitle="حدود الائتمان، الاستخدام، والأرصدة المتأخرة — مصدرها الموثوق دفتر الذمم"
        sticky
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <Kpi icon={ShieldCheck} label="إجمالي الحدود" value={fmtSAR(totals.limit)} tone="primary" />
        <Kpi icon={ShieldCheck} label="المستخدم" value={fmtSAR(totals.used)} tone="warning" />
        <Kpi icon={ShieldCheck} label="المتبقي" value={fmtSAR(totals.remaining)} tone="success" />
        <Kpi icon={Clock} label="رصيد مستحق" value={fmtSAR(totals.due)} />
        <Kpi icon={AlertTriangle} label="رصيد متأخر" value={fmtSAR(totals.overdue)} tone={totals.overdue > 0 ? "destructive" : "default"} />
        <Kpi icon={AlertTriangle} label="متجاوزون / موقوفون" value={`${totals.over} / ${totals.blocked}`} tone={(totals.over + totals.blocked) > 0 ? "destructive" : "default"} />
      </div>

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث عن مورد..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} مورد</div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-10 text-sm">جارٍ التحميل…</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="لا يوجد موردون" description="لا توجد بيانات ائتمان موردين." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(c => {
            const usage = c.usage_pct;
            return (
              <div key={c.id} className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-[12px] text-muted-foreground flex items-center gap-1 flex-wrap">
                      <span className="font-mono">{c.code}</span>
                      <Badge variant="outline" className="text-[11.5px] h-4 px-1">
                        {SETTLEMENT_LABEL[c.settlement_policy]}
                        {c.grace_days ? ` · سماح ${c.grace_days}ي` : ""}
                      </Badge>
                      {!c.is_active && (
                        <Badge className="text-[11.5px] h-4 px-1 bg-destructive/10 text-destructive border border-destructive/40">
                          موقوف
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {c.overdue_balance > 0 && (
                      <Badge className="bg-destructive/10 text-destructive border border-destructive/40 gap-1 text-[11.5px]">
                        <Clock className="h-3 w-3" /> متأخر {c.max_days_overdue}ي
                      </Badge>
                    )}
                    {c.over_limit && (
                      <Badge className="bg-destructive/10 text-destructive border border-destructive/40 gap-1 text-[11.5px]">
                        <AlertTriangle className="h-3 w-3" /> تجاوز
                      </Badge>
                    )}
                    <Button
                      size="sm" variant="outline" className="h-7 px-2 text-[12px]"
                      onClick={() => nav(`/accounting/partner-ledger?partner=${c.id}`)}
                    >
                      <FileText className="h-3 w-3 ml-1" /> كشف
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mb-2">
                  <Cell label="الحد" value={fmtSAR(c.credit_limit)} />
                  <Cell label="المستخدم" value={fmtSAR(c.utilized)} tone="warning" />
                  <Cell label="المتبقي" value={fmtSAR(c.remaining)} tone={c.remaining < 0 ? "destructive" : "success"} />
                </div>
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <Cell label="مستحق" value={fmtSAR(c.due_balance)} />
                  <Cell label="متأخر" value={fmtSAR(c.overdue_balance)} tone={c.overdue_balance > 0 ? "destructive" : "default"} />
                  <Cell label="أقرب استحقاق" value={c.next_due_date ? fmtDate(c.next_due_date) : "—"} />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1">
                    <span>نسبة الاستخدام</span>
                    <span className={`num font-semibold ${c.over_limit ? "text-destructive" : usage > 80 ? "text-warning" : "text-success"}`}>
                      {usage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full ${c.over_limit ? "bg-destructive" : usage > 80 ? "bg-warning" : "bg-success"}`}
                      style={{ width: `${Math.min(100, usage)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone = "default" }: {
  icon: any; label: string; value: string | number;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-3">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} /><span>{label}</span>
      </div>
      <div className={`text-lg font-bold num ${c}`}>{value}</div>
    </div>
  );
}

function Cell({ label, value, tone = "default" }: {
  label: string; value: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded p-2">
      <div className="text-[11.5px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold num ${c}`}>{value}</div>
    </div>
  );
}
