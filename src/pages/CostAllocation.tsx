import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { costing, type AllocationRule, type CostCenter } from "@/services/erp/costing";
import { ArrowLeft, Info } from "lucide-react";

const methodLabel: Record<AllocationRule["method"], string> = {
  equal: "تقسيم متساوٍ", headcount: "حسب عدد الموظفين", revenue: "حسب الإيراد", manual: "يدوي",
};

export default function CostAllocation() {
  const [rules, setRules] = useState<AllocationRule[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);

  useEffect(() => {
    costing.listRules().then(setRules);
    costing.listCenters().then(setCenters);
  }, []);

  const nameOf = (id: string) => centers.find(c => c.id === id)?.name_ar ?? id;
  const codeOf = (id: string) => centers.find(c => c.id === id)?.code ?? "";

  return (
    <div>
      <PageHeader title="توزيع التكاليف غير المباشرة" subtitle="قواعد توزيع المصروفات المشتركة على مراكز التكلفة (مرحلة العرض فقط)" sticky />

      <div className="bg-warning/10 border border-warning/30 rounded-md p-3 mb-4 flex gap-2 text-xs">
        <Info className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <div>
          هذه الواجهة تعرض القواعد التحضيرية لتوزيع التكاليف المشتركة (الإدارة، التسويق، تقنية المعلومات…) على المراكز التشغيلية والفروع.
          سيتم تفعيل محرك التوزيع التلقائي مع التكامل المحاسبي الخلفي لاحقاً.
        </div>
      </div>

      <div className="space-y-3">
        {rules.map(r => {
          const totalWeight = r.targets.reduce((s, t) => s + t.weight, 0);
          return (
            <div key={r.id} className="bg-card border rounded-md p-3">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{r.name_ar}</div>
                    <Badge variant={r.is_active ? "default" : "secondary"} className="text-[11.5px]">
                      {r.is_active ? "نشط" : "غير مفعّل"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    طريقة التوزيع: <span className="font-medium">{methodLabel[r.method]}</span>
                  </div>
                </div>
                <Badge variant="outline" className="text-[11.5px]">
                  {r.targets.length} مركز مستهدف
                </Badge>
              </div>

              <div className="flex items-center gap-3 mb-3 text-sm">
                <div className="bg-muted px-3 py-1.5 rounded font-medium">
                  <span className="font-mono text-xs text-muted-foreground ml-2">{codeOf(r.source_center_id)}</span>
                  {nameOf(r.source_center_id)}
                </div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                <div className="text-xs text-muted-foreground">يُوزَّع على المراكز التالية</div>
              </div>

              <div className="space-y-1.5">
                {r.targets.map(t => {
                  const pct = totalWeight > 0 ? (t.weight / totalWeight) * 100 : 0;
                  return (
                    <div key={t.center_id} className="flex items-center gap-3">
                      <div className="w-44 text-sm truncate">
                        <span className="font-mono text-[11.5px] text-muted-foreground ml-1">{codeOf(t.center_id)}</span>
                        {nameOf(t.center_id)}
                      </div>
                      <div className="flex-1 h-3 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-primary/70" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="w-16 text-left text-xs tabular-nums">{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!rules.length && (
          <div className="text-center text-muted-foreground py-8 text-sm">لا توجد قواعد توزيع معرّفة</div>
        )}
      </div>
    </div>
  );
}
