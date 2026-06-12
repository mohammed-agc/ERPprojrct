import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  governanceService, type AccountingPeriod, type ClosingChecklistItem,
  periodStatusLabel, periodStatusTone,
} from "@/services/erp/governance";
import { AlertTriangle, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function MonthlyClosing() {
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [periodId, setPeriodId] = useState<string>("");
  const [items, setItems] = useState<ClosingChecklistItem[]>([]);

  const loadAll = async () => {
    const ps = await governanceService.listPeriods();
    setPeriods(ps);
    const cur = ps.find(p => p.status === "pending_close") ?? ps.find(p => p.status === "open");
    if (cur && !periodId) setPeriodId(cur.id);
  };
  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (!periodId) return;
    governanceService.getChecklist(periodId).then(setItems);
  }, [periodId]);

  const current = periods.find(p => p.id === periodId);
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const blockers = items.filter(i => i.blocker && !i.done);
  const warnings = items.filter(i => !i.blocker && !i.done);

  const toggle = async (key: ClosingChecklistItem["key"]) => {
    await governanceService.toggleChecklistItem(periodId, key);
    setItems(await governanceService.getChecklist(periodId));
  };

  const close = async () => {
    if (blockers.length) return toast.error("لا يمكن الإقفال — توجد عوائق");
    await governanceService.setPeriodStatus(periodId, "closed");
    toast.success("تم إقفال الفترة الشهرية");
    loadAll();
  };

  const monthsLabel = useMemo(() =>
    ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"], []);

  return (
    <div>
      <PageHeader
        title="الإقفال الشهري"
        subtitle="قائمة المراجعة التشغيلية لإقفال الفترة المحاسبية"
        sticky
        actions={
          <div className="flex gap-2">
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger className="h-8 w-56"><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                {periods.filter(p => p.status !== "locked").map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {monthsLabel[p.month - 1]} {p.year} — {periodStatusLabel[p.status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={close} disabled={!current || blockers.length > 0 || current.status === "closed"}>
              <Lock className="h-3.5 w-3.5 ml-1" /> إقفال الفترة
            </Button>
          </div>
        }
      />

      {current && (
        <>
          {/* Status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">الفترة</div>
              <div className="font-bold text-lg">{monthsLabel[current.month - 1]} {current.year}</div>
              <Badge variant="outline" className={cn("text-[11.5px] mt-1", periodStatusTone[current.status])}>
                {periodStatusLabel[current.status]}
              </Badge>
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">نسبة الإنجاز</div>
              <div className="font-bold text-2xl text-emerald-600">{pct}%</div>
              <Progress value={pct} className="h-1.5 mt-2" />
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">العوائق</div>
              <div className="font-bold text-2xl text-rose-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" /> {blockers.length}
              </div>
              <div className="text-[11.5px] text-muted-foreground mt-1">تمنع الإقفال</div>
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">تحذيرات</div>
              <div className="font-bold text-2xl text-amber-600">{warnings.length}</div>
              <div className="text-[11.5px] text-muted-foreground mt-1">يُنصح بمعالجتها</div>
            </div>
          </div>

          {/* Checklist */}
          <div className="border rounded-lg bg-card overflow-hidden">
            <div className="px-4 py-2 border-b bg-muted/40 text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> قائمة مراجعة الإقفال الشهري
            </div>
            <ul className="divide-y">
              {items.map(it => (
                <li key={it.key} className={cn(
                  "flex items-start gap-3 px-4 py-3 hover:bg-muted/30",
                  !it.done && it.blocker && "bg-rose-50/40 dark:bg-rose-950/10",
                )}>
                  <Checkbox checked={it.done} onCheckedChange={() => toggle(it.key)} className="mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-sm font-medium", it.done && "line-through text-muted-foreground")}>
                        {it.label}
                      </span>
                      {it.blocker && !it.done && (
                        <Badge variant="outline" className="text-[12px] bg-rose-500/10 text-rose-700 border-rose-300">عائق</Badge>
                      )}
                      {it.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                    </div>
                    {it.detail && <div className="text-xs text-muted-foreground mt-0.5">{it.detail}</div>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
