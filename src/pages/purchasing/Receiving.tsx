import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, PackageCheck, AlertTriangle } from "lucide-react";
import {
  purchasingService, RECV_LABEL, RECV_TONE, INSP_LABEL, INSP_TONE, fmtDate,
} from "@/services/erp/purchasing";

export default function Receiving() {
  const [q, setQ] = useState("");
  const grns = useMemo(() => purchasingService.listGRNs(), []);
  const pos = useMemo(() => purchasingService.listPOs(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return grns.filter(g => {
      if (!qv) return true;
      const po = pos.find(p => p.id === g.po_id);
      return `${g.code} ${g.warehouse} ${g.receiver} ${po?.code ?? ""}`.toLowerCase().includes(qv);
    });
  }, [grns, q, pos]);

  const totals = {
    pending: grns.filter(g => g.status === "pending").length,
    partial: grns.filter(g => g.status === "partial").length,
    received: grns.filter(g => g.status === "received").length,
    discrepancy: grns.filter(g => g.status === "with_discrepancy").length,
  };

  return (
    <div>
      <PageHeader title="استلام البضائع" subtitle={`${grns.length} مذكرة استلام`} />

      <div className="grid grid-cols-4 gap-2 mb-4">
        <Kpi label="بانتظار" value={totals.pending} tone="muted" />
        <Kpi label="جزئي" value={totals.partial} tone="warning" />
        <Kpi label="مكتمل" value={totals.received} tone="success" />
        <Kpi label="بفروقات" value={totals.discrepancy} tone="destructive" />
      </div>

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>مذكرة الاستلام</th>
              <th>أمر الشراء</th>
              <th>المستودع</th>
              <th>المستلم</th>
              <th>التاريخ</th>
              <th>الكميات</th>
              <th>حالة الاستلام</th>
              <th>حالة الفحص</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد مذكرات</td></tr>
            )}
            {filtered.map(g => {
              const po = pos.find(p => p.id === g.po_id);
              const totalQty = g.items.reduce((s, i) => s + i.qty, 0);
              const hasDamage = g.items.some(i => i.condition !== "ok");
              return (
                <tr key={g.id}>
                  <td className="font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <PackageCheck className="h-3 w-3 text-muted-foreground" />{g.code}
                    </div>
                  </td>
                  <td className="font-mono text-[11px]">{po?.code ?? "—"}</td>
                  <td className="text-xs">{g.warehouse}</td>
                  <td className="text-xs">{g.receiver}</td>
                  <td className="text-xs">{fmtDate(g.received_at)}</td>
                  <td className="text-xs">
                    <span className="num font-semibold">{totalQty}</span> وحدة
                    {hasDamage && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-destructive text-[10px]">
                        <AlertTriangle className="h-3 w-3" /> فروقات
                      </span>
                    )}
                  </td>
                  <td><Badge className={RECV_TONE[g.status]}>{RECV_LABEL[g.status]}</Badge></td>
                  <td><Badge className={INSP_TONE[g.inspection_status]}>{INSP_LABEL[g.inspection_status]}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "muted" | "warning" | "success" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
