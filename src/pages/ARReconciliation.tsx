import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RotateCw, AlertTriangle, CheckCircle2, ChevronDown, FileText } from "lucide-react";
import { accounting, type ReconciliationRow } from "@/services/erp/accounting";

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ARReconciliation() {
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = () => {
    setLoading(true);
    accounting.reconcileCustomerLedger().then(setRows).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter(
      r =>
        (!onlyMismatch || Math.abs(r.mismatch) > 0.01) &&
        (!t ||
          r.customer_name.toLowerCase().includes(t) ||
          r.customer_code.toLowerCase().includes(t)),
    );
  }, [rows, q, onlyMismatch]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (a, r) => ({
          derived: a.derived + r.derived_remaining,
          cn: a.cn + r.cn_posted_total,
          ledger: a.ledger + r.ar_ledger_credit,
          mismatch: a.mismatch + r.mismatch,
        }),
        { derived: 0, cn: 0, ledger: 0, mismatch: 0 },
      ),
    [filtered],
  );

  const mismatchCount = filtered.filter(r => Math.abs(r.mismatch) > 0.01).length;

  return (
    <div>
      <PageHeader
        title="مطابقة الذمم المدينة مع دفتر الأستاذ"
        subtitle={
          loading
            ? "جارٍ التحميل…"
            : `${filtered.length} عميل — ${mismatchCount} مع فروقات | فرق إجمالي ${fmt(totals.mismatch)}`
        }
        sticky
        actions={
          <Button variant="outline" size="sm" onClick={load}>
            <RotateCw className="h-3.5 w-3.5 ml-1" /> تحديث
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Kpi label="الرصيد المُشتق" value={fmt(totals.derived)} />
        <Kpi label="إجمالي إشعارات دائنة مرحَّلة" value={fmt(totals.cn)} />
        <Kpi label="مرحَّل لدفتر الذمم 1200" value={fmt(totals.ledger)} tone="success" />
        <Kpi
          label="الفروقات"
          value={fmt(totals.mismatch)}
          tone={Math.abs(totals.mismatch) > 0.01 ? "destructive" : "success"}
        />
      </div>

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <Label className="text-xs">بحث</Label>
          <Input
            className="h-8"
            placeholder="اسم أو كود العميل"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-xs cursor-pointer pb-1">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={e => setOnlyMismatch(e.target.checked)}
          />
          عرض الفروقات فقط
        </label>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th></th>
              <th>الكود</th>
              <th>العميل</th>
              <th className="text-left">الرصيد المشتق</th>
              <th className="text-left">إشعارات دائنة</th>
              <th className="text-left">AR 1200 مرحَّل</th>
              <th className="text-left">الفرق</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="text-center text-muted-foreground py-8">
                  جارٍ التحميل…
                </td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState
                inTable
                colSpan={8}
                title="لا توجد بيانات للمطابقة"
                description="لا يوجد عملاء بإشعارات دائنة أو أرصدة قائمة."
              />
            )}
            {!loading &&
              filtered.map(r => {
                const bad = Math.abs(r.mismatch) > 0.01;
                const isOpen = !!open[r.customer_id];
                return (
                  <>
                    <tr key={r.customer_id} className={bad ? "bg-destructive/5" : ""}>
                      <td className="w-8">
                        <button
                          className="text-muted-foreground hover:text-foreground"
                          onClick={() =>
                            setOpen(o => ({ ...o, [r.customer_id]: !o[r.customer_id] }))
                          }
                          aria-label="تفاصيل"
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          />
                        </button>
                      </td>
                      <td className="font-mono text-xs">{r.customer_code}</td>
                      <td className="font-medium">
                        <Link to={`/ar/${r.customer_id}`} className="hover:underline">
                          {r.customer_name}
                        </Link>
                      </td>
                      <td className="num text-left">{fmt(r.derived_remaining)}</td>
                      <td className="num text-left">{fmt(r.cn_posted_total)}</td>
                      <td className="num text-left">{fmt(r.ar_ledger_credit)}</td>
                      <td
                        className={`num text-left font-semibold ${bad ? "text-destructive" : "text-success"}`}
                      >
                        {fmt(r.mismatch)}
                      </td>
                      <td>
                        {bad ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" /> فرق
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-success border-success/30">
                            <CheckCircle2 className="h-3 w-3" /> متطابق
                          </Badge>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={r.customer_id + "-d"}>
                        <td colSpan={8} className="bg-muted/30 p-0">
                          <div className="p-3">
                            <div className="text-xs font-semibold text-muted-foreground mb-2">
                              تفاصيل الإشعارات الدائنة وقيود اليومية المرتبطة
                            </div>
                            <table className="erp-table text-xs">
                              <thead>
                                <tr>
                                  <th>الإشعار</th>
                                  <th className="text-left">قيمة الإشعار</th>
                                  <th>قيد اليومية</th>
                                  <th className="text-left">دائن 1200</th>
                                  <th>الحالة</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.notes.length === 0 && (
                                  <tr>
                                    <td colSpan={5} className="text-muted-foreground py-3 text-center">
                                      لا توجد إشعارات دائنة لهذا العميل.
                                    </td>
                                  </tr>
                                )}
                                {r.notes.map(n => (
                                  <tr key={n.credit_note_id}>
                                    <td className="font-mono">
                                      <Link
                                        to={`/sales/credit-notes/${n.credit_note_id}`}
                                        className="text-primary hover:underline inline-flex items-center gap-1"
                                      >
                                        <FileText className="h-3 w-3" /> {n.credit_note_no}
                                      </Link>
                                    </td>
                                    <td className="num text-left">{fmt(n.total)}</td>
                                    <td className="font-mono">
                                      {n.journal_entry_id ? (
                                        <Link
                                          to={`/journals/${n.journal_entry_id}`}
                                          className="text-primary hover:underline"
                                        >
                                          {n.journal_entry_id.slice(0, 8)}…
                                        </Link>
                                      ) : (
                                        <span className="text-destructive">— لا يوجد قيد —</span>
                                      )}
                                    </td>
                                    <td className="num text-left">{fmt(n.ar_credit)}</td>
                                    <td>
                                      {n.ok ? (
                                        <Badge variant="outline" className="text-success border-success/30">
                                          متطابق
                                        </Badge>
                                      ) : (
                                        <Badge variant="destructive">
                                          {n.journal_entry_id ? "فرق في القيمة" : "قيد مفقود"}
                                        </Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={3} className="text-left">
                  الإجمالي
                </td>
                <td className="num text-left">{fmt(totals.derived)}</td>
                <td className="num text-left">{fmt(totals.cn)}</td>
                <td className="num text-left">{fmt(totals.ledger)}</td>
                <td
                  className={`num text-left ${Math.abs(totals.mismatch) > 0.01 ? "text-destructive" : "text-success"}`}
                >
                  {fmt(totals.mismatch)}
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "destructive";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="p-2.5 bg-card border border-border rounded">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-bold mt-0.5 num ${color}`}>{value}</div>
    </div>
  );
}
