import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle2, AlertTriangle, Circle, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listChecklistItems, getLineChecks, setLineCheckResult, finalizeLineInspection,
  type ChecklistItem, type LineCheck,
} from "@/services/erp/receivingDb";
import { supabase } from "@/integrations/supabase/client";

/**
 * لوحة الفحص التفصيلي (PDI) لمركبة واحدة — تصميم سريع وواضح.
 * صفوف مدمجة ملوّنة حسب الحالة، أزرار واضحة، وأزرار جماعية لكل قسم.
 */
export function LineChecklistPanel({ inspectionLineId, readOnly, onFinalized }: { inspectionLineId: string; readOnly?: boolean; onFinalized?: () => void }) {
  const qc = useQueryClient();
  const itemsQ = useQuery({ queryKey: ["checklist-items"], queryFn: listChecklistItems });
  const checksQ = useQuery({
    queryKey: ["line-checks", inspectionLineId],
    queryFn: () => getLineChecks(inspectionLineId),
  });

  const items = itemsQ.data ?? [];
  const checks = checksQ.data ?? [];

  const checkByItem = useMemo(() => {
    const m = new Map<string, LineCheck>();
    for (const c of checks) m.set(c.checklist_item_id, c);
    return m;
  }, [checks]);

  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, ChecklistItem[]>();
    for (const it of items) {
      if (!map.has(it.section)) { map.set(it.section, []); order.push(it.section); }
      map.get(it.section)!.push(it);
    }
    return order.map(s => ({ section: s, items: map.get(s)! }));
  }, [items]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["line-checks", inspectionLineId] });

  const mut = useMutation({
    mutationFn: ({ checkId, result, remarks, value }: { checkId: string; result: "passed" | "rejected" | "pending"; remarks?: string; value?: string }) =>
      setLineCheckResult(checkId, result, remarks, value),
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkMut = useMutation({
    mutationFn: async ({ checkIds, result }: { checkIds: string[]; result: "passed" | "rejected" }) => {
      const { error } = await supabase.from("inspection_line_checks")
        .update({ result, checked_at: new Date().toISOString() })
        .in("id", checkIds);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e) => toast.error((e as Error).message),
  });

  const finalizeMut = useMutation({
    mutationFn: () => finalizeLineInspection(inspectionLineId),
    onSuccess: ({ result, reason }) => {
      if (result === "passed") toast.success("تم اعتماد فحص المركبة — ناجحة ✅");
      else toast.error(reason || "المركبة مرفوضة — فشل بنود حرجة");
      onFinalized?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (itemsQ.isLoading || checksQ.isLoading) {
    return <div className="text-xs text-muted-foreground py-3 px-3">جارٍ تحميل قائمة الفحص…</div>;
  }

  const total = items.length;
  const done = checks.filter(c => c.result !== "pending").length;
  const passed = checks.filter(c => c.result === "passed").length;
  const failed = checks.filter(c => c.result === "rejected").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const allIds = checks.map(c => c.id);

  return (
    <div className="bg-muted/30 border-t-2 border-primary/20 px-4 py-4 space-y-4">
      {/* رأس: التقدّم + زر الكل سليم */}
      <div className="flex flex-wrap items-center gap-3 bg-background rounded-lg border border-border p-3">
        <div className="flex-1 min-w-[200px]">
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <span className="font-bold">تقدّم الفحص</span>
            <span className="text-muted-foreground">{done} / {total} بند ({pct}%)</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${failed > 0 ? "bg-destructive" : done === total ? "bg-success" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex gap-3 mt-1.5 text-[12px]">
            <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-3 w-3" /> {passed} سليم</span>
            {failed > 0 && <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" /> {failed} ملاحظة</span>}
            {total - done > 0 && <span className="inline-flex items-center gap-1 text-muted-foreground"><Circle className="h-3 w-3" /> {total - done} بانتظار</span>}
          </div>
        </div>
        {!readOnly && (
          <Button
            size="sm"
            className="bg-success hover:bg-success/90 text-white gap-1.5"
            onClick={() => bulkMut.mutate({ checkIds: allIds, result: "passed" })}
            disabled={bulkMut.isPending}
          >
            <CheckCheck className="h-4 w-4" /> تعليم الكل سليم
          </Button>
        )}
      </div>

      {sections.map(sec => {
        const secChecks = sec.items.map(it => checkByItem.get(it.id)).filter(Boolean) as LineCheck[];
        const secIds = secChecks.map(c => c.id);
        const secDone = secChecks.filter(c => c.result !== "pending").length;
        return (
          <div key={sec.section} className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="flex items-center justify-between bg-muted/50 px-3 py-2 border-b border-border">
              <span className="text-xs font-bold text-primary">
                {sec.section} <span className="text-muted-foreground font-normal">({secDone}/{sec.items.length})</span>
              </span>
              {!readOnly && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 px-2 text-[11.5px] text-success hover:bg-success/10 gap-1"
                  onClick={() => bulkMut.mutate({ checkIds: secIds, result: "passed" })}
                >
                  <CheckCheck className="h-3 w-3" /> القسم سليم
                </Button>
              )}
            </div>
            <div className="divide-y divide-border/50">
              {sec.items.map(it => {
                const chk = checkByItem.get(it.id);
                if (!chk) return null;
                return (
                  <ChecklistRow
                    key={it.id}
                    item={it}
                    check={chk}
                    readOnly={readOnly}
                    onResult={(result) => mut.mutate({ checkId: chk.id, result })}
                    onRemarks={(remarks) => mut.mutate({ checkId: chk.id, result: chk.result, remarks, value: chk.value_text ?? undefined })}
                    onValue={(value) => mut.mutate({ checkId: chk.id, result: chk.result, remarks: chk.remarks ?? undefined, value })}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      {/* زر إنهاء فحص المركبة — يحسب النتيجة من البنود ويطبّقها */}
      {!readOnly && (
        <div className="flex items-center justify-between bg-background rounded-lg border border-border p-3">
          <div className="text-[12px] text-muted-foreground">
            {done < total
              ? `أكمل فحص كل البنود (${total - done} متبقٍّ) لإنهاء فحص المركبة`
              : failed > 0
                ? "توجد ملاحظات — إن كانت على بنود حرجة سترفض المركبة"
                : "كل البنود سليمة — جاهزة للاعتماد"}
          </div>
          <Button
            onClick={() => finalizeMut.mutate()}
            disabled={done < total || finalizeMut.isPending}
            className="gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" /> إنهاء فحص هذه المركبة
          </Button>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({
  item, check, readOnly, onResult, onRemarks, onValue,
}: {
  item: ChecklistItem;
  check: LineCheck;
  readOnly?: boolean;
  onResult: (r: "passed" | "rejected") => void;
  onRemarks: (s: string) => void;
  onValue: (s: string) => void;
}) {
  const [remarks, setRemarks] = useState(check.remarks ?? "");
  const [value, setValue] = useState(check.value_text ?? "");

  const rowBg =
    check.result === "passed" ? "bg-success/5"
    : check.result === "rejected" ? "bg-destructive/5"
    : "";

  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${rowBg}`}>
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-xs">{item.label}</span>
        {item.is_critical && (
          <span className="text-[12px] bg-destructive/10 text-destructive px-1 py-0.5 rounded shrink-0">حرج</span>
        )}
      </div>

      {item.input_type === "number" && (
        <Input
          type="number"
          value={value}
          disabled={readOnly}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value !== (check.value_text ?? "") && onValue(value)}
          className="h-8 w-14 text-xs text-center shrink-0"
          placeholder="عدد"
        />
      )}

      <Input
        value={remarks}
        disabled={readOnly}
        onChange={(e) => setRemarks(e.target.value)}
        onBlur={() => remarks !== (check.remarks ?? "") && onRemarks(remarks)}
        className={`h-8 text-xs shrink-0 transition-all ${check.result === "rejected" ? "w-44 border-destructive/40" : "w-28"}`}
        placeholder="ملاحظة…"
      />

      {!readOnly && (
        <div className="flex gap-1 shrink-0">
          <Button
            size="sm"
            variant={check.result === "passed" ? "default" : "outline"}
            className={`h-8 px-2.5 gap-1 text-[12px] ${check.result === "passed" ? "bg-success hover:bg-success/90 text-white" : "text-success border-success/30 hover:bg-success/10"}`}
            onClick={() => onResult("passed")}
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> سليم
          </Button>
          <Button
            size="sm"
            variant={check.result === "rejected" ? "default" : "outline"}
            className={`h-8 px-2.5 gap-1 text-[12px] ${check.result === "rejected" ? "bg-destructive hover:bg-destructive/90 text-white" : "text-destructive border-destructive/30 hover:bg-destructive/10"}`}
            onClick={() => onResult("rejected")}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> ملاحظة
          </Button>
        </div>
      )}

      {readOnly && (
        <span className="shrink-0">
          {check.result === "passed" && <CheckCircle2 className="h-4 w-4 text-success" />}
          {check.result === "rejected" && <AlertTriangle className="h-4 w-4 text-destructive" />}
          {check.result === "pending" && <Circle className="h-4 w-4 text-muted-foreground/40" />}
        </span>
      )}
    </div>
  );
}