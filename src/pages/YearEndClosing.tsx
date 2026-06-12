import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  governanceService, type FiscalYear, type YearEndChecklistItem,
  periodStatusLabel, periodStatusTone,
} from "@/services/erp/governance";
import { CheckCircle2, Lock, Banknote, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtSAR } from "@/lib/erpFormat";
import { toast } from "sonner";

export default function YearEndClosing() {
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [yearId, setYearId] = useState("");
  const [items, setItems] = useState<YearEndChecklistItem[]>([]);

  useEffect(() => {
    governanceService.listFiscalYears().then(y => {
      setYears(y);
      const open = y.find(x => x.status === "open") ?? y[0];
      if (open) setYearId(open.id);
    });
  }, []);

  useEffect(() => {
    if (!yearId) return;
    governanceService.getYearEndChecklist(yearId).then(setItems);
  }, [yearId]);

  const fy = years.find(y => y.id === yearId);
  const done = items.filter(i => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  const toggle = async (k: string) => {
    await governanceService.toggleYearEndItem(yearId, k);
    setItems(await governanceService.getYearEndChecklist(yearId));
  };

  /* Synthetic comparative snapshot */
  const snapshot = fy ? {
    revenue: fy.year % 2 === 0 ? 8_420_000 : 7_120_000,
    cogs: fy.year % 2 === 0 ? 5_180_000 : 4_640_000,
    opex: fy.year % 2 === 0 ? 1_960_000 : 1_720_000,
    net: 0,
    retained: 1_248_500,
  } : null;
  if (snapshot) snapshot.net = snapshot.revenue - snapshot.cogs - snapshot.opex;

  return (
    <div>
      <PageHeader
        title="إقفال السنة المالية"
        subtitle="ترحيل الأرباح المحتجزة، مراجعة المدقق، وتأكيد إقفال السنة"
        sticky
        actions={
          <div className="flex gap-2">
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger className="h-8 w-44"><SelectValue placeholder="اختر السنة" /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y.id} value={y.id}>السنة {y.year}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" disabled={!fy || fy.status === "closed" || done < items.length}
              onClick={() => toast.success("سيتم إرسال تأكيد إقفال السنة للإدارة")}>
              <Lock className="h-3.5 w-3.5 ml-1" /> تأكيد الإقفال
            </Button>
          </div>
        }
      />

      {fy && snapshot && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">السنة المالية</div>
              <div className="font-bold text-xl">{fy.year}</div>
              <Badge variant="outline" className={cn("text-[11.5px] mt-1", periodStatusTone[fy.status])}>
                {periodStatusLabel[fy.status]}
              </Badge>
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">نسبة الإنجاز</div>
              <div className="font-bold text-2xl text-emerald-600">{pct}%</div>
              <Progress value={pct} className="h-1.5 mt-2" />
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">صافي الربح</div>
              <div className="font-bold text-xl text-emerald-600 num">{fmtSAR(snapshot.net)}</div>
            </div>
            <div className="border rounded-lg p-3 bg-card">
              <div className="text-xs text-muted-foreground">الأرباح المحتجزة المرحَّلة</div>
              <div className="font-bold text-xl text-blue-600 num flex items-center gap-2">
                <Banknote className="h-5 w-5" /> {fmtSAR(snapshot.retained)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Checklist */}
            <div className="lg:col-span-2 border rounded-lg bg-card overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/40 text-sm font-bold flex items-center gap-2">
                <FileCheck2 className="h-4 w-4" /> قائمة مراجعة إقفال السنة
              </div>
              <ul className="divide-y">
                {items.map(it => (
                  <li key={it.key} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30">
                    <Checkbox checked={it.done} onCheckedChange={() => toggle(it.key)} className="mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-sm font-medium", it.done && "line-through text-muted-foreground")}>
                          {it.label}
                        </span>
                        {it.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                      </div>
                      {it.detail && <div className="text-xs text-muted-foreground mt-0.5">{it.detail}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Comparative snapshot */}
            <div className="border rounded-lg bg-card overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/40 text-sm font-bold">صورة مالية مقارنة</div>
              <table className="erp-table">
                <thead><tr><th>البند</th><th className="text-right">{fy.year}</th><th className="text-right">{fy.year - 1}</th></tr></thead>
                <tbody>
                  <tr><td>الإيرادات</td><td className="num text-right">{fmtSAR(snapshot.revenue)}</td><td className="num text-right">{fmtSAR(snapshot.revenue * 0.88)}</td></tr>
                  <tr><td>تكلفة المبيعات</td><td className="num text-right">{fmtSAR(snapshot.cogs)}</td><td className="num text-right">{fmtSAR(snapshot.cogs * 0.9)}</td></tr>
                  <tr><td>المصاريف التشغيلية</td><td className="num text-right">{fmtSAR(snapshot.opex)}</td><td className="num text-right">{fmtSAR(snapshot.opex * 0.93)}</td></tr>
                  <tr className="bg-muted/40 font-bold"><td>صافي الربح</td><td className="num text-right text-emerald-700">{fmtSAR(snapshot.net)}</td><td className="num text-right">{fmtSAR(snapshot.net * 0.82)}</td></tr>
                </tbody>
              </table>
              <div className="p-3 border-t text-xs text-muted-foreground space-y-1">
                <div className="font-medium text-foreground">ملاحظات المراجع:</div>
                <div>• تم التحقق من جرد المخزون السنوي</div>
                <div>• مراجعة عقود الإيجار والإهلاك</div>
                <div>• مطابقة الأرصدة البنكية في 31/12</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}