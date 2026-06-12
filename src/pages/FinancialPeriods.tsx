import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import {
  governanceService, type FiscalYear, type AccountingPeriod,
  periodStatusLabel, periodStatusTone, type PeriodStatus,
} from "@/services/erp/governance";
import { Lock, LockOpen, ShieldCheck, CalendarRange, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function FinancialPeriods() {
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [yearFilter, setYearFilter] = useState<string>("all");

  const load = async () => {
    const [y, p] = await Promise.all([governanceService.listFiscalYears(), governanceService.listPeriods()]);
    setYears(y); setPeriods(p);
  };
  useEffect(() => { load(); }, []);

  const filtered = periods.filter(p => yearFilter === "all" || String(p.year) === yearFilter);
  const monthLabel = (m: number) =>
    ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"][m - 1];

  const change = async (id: string, status: PeriodStatus) => {
    await governanceService.setPeriodStatus(id, status);
    toast.success("تم تحديث حالة الفترة");
    load();
  };

  return (
    <div>
      <PageHeader
        title="الفترات المحاسبية"
        subtitle="إدارة السنوات المالية والفترات الشهرية وحالات الإقفال"
        sticky
        actions={<Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>}
      />

      {/* Fiscal years */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {years.map(fy => (
          <div key={fy.id} className="border rounded-lg p-3 bg-card">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                <span className="font-bold">السنة المالية {fy.year}</span>
              </div>
              <Badge variant="outline" className={cn("text-[11.5px]", periodStatusTone[fy.status])}>
                {periodStatusLabel[fy.status]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">{fy.start} ← {fy.end}</div>
            {fy.closed_at && (
              <div className="text-[11.5px] text-muted-foreground mt-1">
                أُقفلت {fy.closed_at.slice(0, 10)} بواسطة {fy.closed_by}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">السنة</label>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">جميع السنوات</SelectItem>
              {years.map(y => <SelectItem key={y.id} value={String(y.year)}>{y.year}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-xs text-muted-foreground mr-auto">
          {filtered.length} فترة — {filtered.filter(p => p.status === "open").length} مفتوحة ·{" "}
          {filtered.filter(p => p.status === "closed").length} مُقفلة ·{" "}
          {filtered.filter(p => p.status === "locked").length} مغلقة نهائياً
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>السنة</th><th>الشهر</th><th>من</th><th>إلى</th><th>الحالة</th>
              <th>تاريخ الإقفال</th><th>المسؤول</th><th className="text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <EmptyState inTable colSpan={8} title="لا توجد فترات" />}
            {filtered.map(p => (
              <tr key={p.id}>
                <td className="font-mono text-xs">{p.year}</td>
                <td className="font-medium">{monthLabel(p.month)}</td>
                <td className="num text-xs">{p.start}</td>
                <td className="num text-xs">{p.end}</td>
                <td>
                  <Badge variant="outline" className={cn("text-[11.5px]", periodStatusTone[p.status])}>
                    {p.status === "locked" && <Lock className="h-3 w-3 ml-1 inline" />}
                    {periodStatusLabel[p.status]}
                  </Badge>
                </td>
                <td className="text-xs text-muted-foreground">{p.closed_at?.slice(0, 10) ?? "—"}</td>
                <td className="text-xs">{p.closed_by ?? "—"}</td>
                <td className="text-left">
                  <div className="flex justify-end gap-1">
                    {p.status === "open" && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => change(p.id, "pending_close")}>
                        <ShieldCheck className="h-3 w-3 ml-1" /> بدء الإقفال
                      </Button>
                    )}
                    {p.status === "pending_close" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => change(p.id, "closed")}>
                          <Lock className="h-3 w-3 ml-1" /> إقفال
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => change(p.id, "open")}>
                          إلغاء
                        </Button>
                      </>
                    )}
                    {p.status === "closed" && (
                      <>
                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                          onClick={() => change(p.id, "open")}>
                          <LockOpen className="h-3 w-3 ml-1" /> إعادة فتح
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs"
                          onClick={() => change(p.id, "locked")}>
                          <Lock className="h-3 w-3 ml-1" /> غلق نهائي
                        </Button>
                      </>
                    )}
                    {p.status === "locked" && (
                      <span className="text-[11.5px] text-muted-foreground">لا يمكن التعديل</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
