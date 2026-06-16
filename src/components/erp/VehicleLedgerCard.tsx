/**
 * VehicleLedgerCard — بطاقة دفتر المركبة V1 (قراءة فقط).
 * تعرض ملخّص المركبة المالي + الخطّ الزمني للأحداث.
 * المرجع: VEHICLE_LEDGER_DESIGN.md.
 */

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { vehicleLedgerService, type VehicleLedgerResult, type Severity } from "@/services/erp/vehicleLedgerService";

const fmt = (n: number) => new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const severityClass: Record<Severity, string> = {
  info: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-700",
};

export function VehicleLedgerCard({ vehicleId }: { vehicleId: string }) {
  const [data, setData] = useState<VehicleLedgerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    vehicleLedgerService.getLedger(vehicleId)
      .then(r => { if (active) { setData(r); setError(null); } })
      .catch(e => { if (active) setError(e.message ?? "تعذّر تحميل دفتر المركبة"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [vehicleId]);

  if (loading) return <Card className="p-4"><p className="text-sm text-muted-foreground">جارٍ تحميل دفتر المركبة…</p></Card>;
  if (error) return <Card className="p-4"><p className="text-sm text-red-600">{error}</p></Card>;
  if (!data) return null;

  const { events, summary } = data;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">دفتر المركبة</h3>
        <Badge variant="outline">{summary.event_count} حدث</Badge>
      </div>

      {/* بطاقة الملخّص المالي */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="قيمة المبيعات" value={fmt(summary.sales_value)} />
        <SummaryTile label="المحصّل" value={fmt(summary.collected_amount)} tone="success" />
        <SummaryTile label="المتبقّي" value={fmt(summary.outstanding_amount)} tone="warning" />
        <SummaryTile label="القيود المحاسبية" value={String(summary.journal_impact)} />
      </div>

      {/* الخطّ الزمني */}
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا توجد أحداث مسجّلة لهذه المركبة بعد.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-right">
                <th className="py-2 px-2 font-medium">التاريخ</th>
                <th className="py-2 px-2 font-medium">النوع</th>
                <th className="py-2 px-2 font-medium">المستند</th>
                <th className="py-2 px-2 font-medium num text-right">مدين</th>
                <th className="py-2 px-2 font-medium num text-right">دائن</th>
                <th className="py-2 px-2 font-medium">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {events.map(ev => (
                <tr key={ev.event_id} className="border-b last:border-0">
                  <td className="py-2 px-2 whitespace-nowrap">{(ev.event_date ?? "").slice(0, 10)}</td>
                  <td className="py-2 px-2">
                    <span className={`inline-block rounded px-2 py-0.5 text-xs ${severityClass[ev.severity]}`}>
                      {ev.description}
                    </span>
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap">{ev.document_no}</td>
                  <td className="py-2 px-2 num text-right">{ev.debit ? fmt(ev.debit) : "—"}</td>
                  <td className="py-2 px-2 num text-right">{ev.credit ? fmt(ev.credit) : "—"}</td>
                  <td className="py-2 px-2 whitespace-nowrap text-muted-foreground">{ev.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: "success" | "warning" }) {
  const toneClass = tone === "success" ? "text-green-700" : tone === "warning" ? "text-amber-700" : "text-foreground";
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-semibold num text-right ${toneClass}`}>{value}</p>
    </div>
  );
}
