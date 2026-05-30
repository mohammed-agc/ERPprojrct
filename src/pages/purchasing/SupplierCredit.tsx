import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, AlertTriangle, CalendarClock, ShieldCheck, FileText } from "lucide-react";
import { purchasingService, fmtSAR, fmtDate } from "@/services/erp/purchasing";
import { SupplierStatementDialog } from "@/components/erp/SupplierStatementDialog";

export default function SupplierCredit() {
  const [q, setQ] = useState("");
  const [stmtId, setStmtId] = useState<string | null>(null);
  const suppliers = useMemo(() => purchasingService.listSuppliers(), [stmtId]);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    if (!qv) return suppliers;
    return suppliers.filter(s =>
      `${s.code} ${s.name} ${s.country}`.toLowerCase().includes(qv),
    );
  }, [suppliers, q]);

  const totals = useMemo(() => {
    const limit = suppliers.reduce((s, x) => s + x.credit_limit, 0);
    const used = suppliers.reduce((s, x) => s + x.utilized, 0);
    return { limit, used, remaining: limit - used, over: suppliers.filter(s => s.utilized > s.credit_limit).length };
  }, [suppliers]);

  return (
    <div>
      <PageHeader title="إدارة ائتمان الموردين" subtitle="حدود الائتمان، الاستخدام، وتجديد الاتفاقيات" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Kpi icon={ShieldCheck} label="إجمالي الحدود" value={fmtSAR(totals.limit)} tone="primary" />
        <Kpi icon={ShieldCheck} label="المستخدم" value={fmtSAR(totals.used)} tone="warning" />
        <Kpi icon={ShieldCheck} label="المتبقي" value={fmtSAR(totals.remaining)} tone="success" />
        <Kpi icon={AlertTriangle} label="موردون متجاوزون" value={totals.over} tone={totals.over > 0 ? "destructive" : "default"} />
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث عن مورد..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} مورد</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {filtered.map(s => {
          const c = purchasingService.creditSummary(s);
          const expiringSoon = c.daysToExpiry <= 60 && c.daysToExpiry >= 0;
          return (
            <div key={s.id} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold text-sm">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.code} · {s.country} · {s.agreement_type === "framework" ? "إطارية" : s.agreement_type === "spot" ? "فورية" : "أمانة"}</div>
                </div>
                <div className="flex items-center gap-2">
                  {c.over && (
                    <Badge className="bg-destructive/10 text-destructive border border-destructive/40 gap-1">
                      <AlertTriangle className="h-3 w-3" /> تجاوز الحد
                    </Badge>
                  )}
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setStmtId(s.id)}>
                    <FileText className="h-3 w-3 ml-1" /> كشف حساب
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Cell label="الحد" value={fmtSAR(s.credit_limit)} />
                <Cell label="المستخدم" value={fmtSAR(s.utilized)} tone="warning" />
                <Cell label="المتبقي" value={fmtSAR(c.remaining)} tone={c.remaining < 0 ? "destructive" : "success"} />
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>نسبة الاستخدام</span>
                  <span className={`num font-semibold ${c.over ? "text-destructive" : c.usage > 80 ? "text-warning" : "text-success"}`}>
                    {c.usage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className={`h-full ${c.over ? "bg-destructive" : c.usage > 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, c.usage)}%` }} />
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] border-t border-border pt-2">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <CalendarClock className="h-3 w-3" />
                  ينتهي: {fmtDate(s.agreement_expiry)}
                </div>
                <div className={expiringSoon ? "text-warning font-semibold" : "text-muted-foreground"}>
                  {c.daysToExpiry >= 0 ? `${c.daysToExpiry} يوم متبقي` : `منتهية منذ ${Math.abs(c.daysToExpiry)} يوم`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
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
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
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
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold num ${c}`}>{value}</div>
    </div>
  );
}
