import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, ExternalLink, BookOpen } from "lucide-react";
import {
  incentiveEngine,
  PERIOD_LABEL, CALC_LABEL, PAYOUT_LABEL, STAGE_LABEL,
  type IncentiveProgram, type IncentiveAccrual, type ProgramStatus,
} from "@/services/erp/incentiveEngine";
import { useIncentivePermissions } from "@/lib/incentivePermissions";
import { cn } from "@/lib/utils";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US") + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_TONE: Record<ProgramStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  closed: "bg-muted text-muted-foreground border border-border",
  achieved: "bg-success/10 text-success border border-success/40",
};
const STATUS_LABEL: Record<ProgramStatus, string> = { active: "نشط", closed: "مغلق", achieved: "محقق" };

const STAGE_TONE: Record<string, string> = {
  expected: "bg-muted text-muted-foreground",
  earned: "bg-primary/10 text-primary",
  approved: "bg-sky-500/10 text-sky-700",
  received: "bg-success/10 text-success",
  utilized: "bg-violet-500/10 text-violet-700",
  rejected: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function IncentivePrograms({ supplierId }: { supplierId: string }) {
  const perms = useIncentivePermissions();
  const [programs, setPrograms] = useState<IncentiveProgram[]>([]);
  const [accruals, setAccruals] = useState<IncentiveAccrual[]>([]);
  const [balance, setBalance] = useState({ earned: 0, received: 0, utilized: 0, outstanding: 0 });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [progs, accs, bal] = await Promise.all([
      incentiveEngine.listPrograms(supplierId),
      incentiveEngine.listAccruals({ supplierId }),
      incentiveEngine.supplierBalance(supplierId),
    ]);
    setPrograms(progs);
    setAccruals(accs);
    setBalance(bal);
    setLoading(false);
  }, [supplierId]);

  useEffect(() => { refresh(); }, [refresh]);

  if (!perms.canView) {
    return (
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-warning" /> برامج الحوافز</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="text-[12.5px] text-muted-foreground text-center py-4">لا تملك صلاحية عرض برامج الحوافز.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
        <CardTitle className="text-xs flex items-center gap-1"><Trophy className="h-3.5 w-3.5 text-warning" /> برامج الحوافز</CardTitle>
        <Link to="/incentives" className="text-[12.5px] text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" /> إدارة الحوافز
        </Link>
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-3">
        {/* ملخص رصيد الحوافز */}
        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="مستحق" value={fmtSAR(balance.earned)} tone="primary" />
          <Stat label="مستلم" value={fmtSAR(balance.received)} tone="success" />
          <Stat label="مستخدَم" value={fmtSAR(balance.utilized)} />
          <Stat label="المتبقي" value={fmtSAR(balance.outstanding)} tone={balance.outstanding > 0 ? "warning" : "default"} />
        </div>

        {loading ? (
          <div className="text-[12.5px] text-muted-foreground text-center py-4">جاري التحميل...</div>
        ) : programs.length === 0 ? (
          <div className="text-[12.5px] text-muted-foreground text-center py-4">
            لا توجد برامج حوافز لهذا المورد. أنشئ برنامجًا من <Link to="/incentives" className="text-primary hover:underline">إدارة الحوافز</Link>.
          </div>
        ) : (
          <div className="space-y-2">
            {programs.map(p => (
              <div key={p.id} className="border border-border rounded-md p-2.5 bg-card/60">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold flex items-center gap-1.5 flex-wrap">
                      {p.name}
                      <Badge className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    </div>
                    <div className="text-[12px] text-muted-foreground mt-0.5">
                      {p.type_name} · {PERIOD_LABEL[p.period_kind]} · {CALC_LABEL[p.calc_method]}
                      {(p.brand || p.model) && <> · {[p.brand, p.model].filter(Boolean).join(" ")}</>}
                    </div>
                    <div className="text-[12px] text-muted-foreground">
                      {fmtDate(p.start_date)} ← {fmtDate(p.end_date)} · السداد: {PAYOUT_LABEL[p.payout_method]}
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-[12px] text-muted-foreground">الهدف</div>
                    <div className="text-sm font-bold num">{p.target_qty || "—"}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* الاستحقاقات الأخيرة */}
        {accruals.length > 0 && (
          <div className="border-t border-border pt-2">
            <div className="text-[12.5px] font-semibold flex items-center gap-1 mb-1.5">
              <BookOpen className="h-3 w-3" /> آخر الاستحقاقات
            </div>
            <div className="space-y-1">
              {accruals.slice(0, 5).map(a => (
                <div key={a.id} className="flex items-center justify-between text-[12.5px] bg-muted/30 rounded px-2 py-1">
                  <span className="font-mono">{a.code}</span>
                  <span className="text-muted-foreground">{fmtDate(a.period_from)} → {fmtDate(a.period_to)}</span>
                  <span className="num font-semibold">{fmtSAR(a.earned_amount)}</span>
                  <Badge className={cn("text-[12px]", STAGE_TONE[a.stage])}>{STAGE_LABEL[a.stage]}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, tone = "default" }: {
  label: string; value: string;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "primary" ? "text-primary" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded p-1.5">
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold num tabular-nums", c)}>{value}</div>
    </div>
  );
}
