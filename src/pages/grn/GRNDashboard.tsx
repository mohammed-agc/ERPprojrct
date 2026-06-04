import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, PackageCheck, FileSearch, CheckCircle2 } from "lucide-react";
import { listGRNs, GRN_LABEL, GRN_TONE, fmtDate } from "@/services/erp/receivingDb";
import { GRNDbCreateDialog } from "@/components/erp/GRNDbCreateDialog";

export default function GRNDashboard() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: grns = [] } = useQuery({ queryKey: ["grns"], queryFn: listGRNs });

  const today = new Date().toISOString().slice(0, 10);
  const k = {
    total: grns.length,
    received: grns.filter(g => g.status === "received").length,
    inspected: grns.filter(g => g.status === "inspected").length,
    closed: grns.filter(g => g.status === "closed").length,
    today: grns.filter(g => g.received_at === today).length,
  };
  const recent = grns.slice(0, 8);

  return (
    <div>
      <PageHeader
        title="إشعارات الاستلام — GRN"
        subtitle={`${k.total} إشعار · ${k.today} اليوم`}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 ml-1" /> مذكرة جديدة</Button>}
      />
      <GRNDbCreateDialog open={open} onOpenChange={setOpen}
        onCreated={() => qc.invalidateQueries({ queryKey: ["grns"] })} />

      <div className="grid grid-cols-5 gap-2 mb-4">
        <Kpi label="إجمالي" value={k.total} icon={PackageCheck} tone="muted" />
        <Kpi label="مستلم" value={k.received} icon={PackageCheck} tone="primary" />
        <Kpi label="مفحوص" value={k.inspected} icon={FileSearch} tone="info" />
        <Kpi label="مغلق" value={k.closed} icon={CheckCircle2} tone="success" />
        <Kpi label="اليوم" value={k.today} icon={PackageCheck} tone="primary" />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <div className="text-sm font-semibold">أحدث الإشعارات</div>
          <Link to="/grn/list" className="text-xs text-primary hover:underline">عرض الكل</Link>
        </div>
        <table className="erp-table">
          <thead>
            <tr><th>الرقم</th><th>تاريخ الاستلام</th><th>المستودع</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {recent.length === 0 && (
              <tr><td colSpan={4} className="text-center text-muted-foreground py-6">لا توجد إشعارات</td></tr>
            )}
            {recent.map(g => (
              <tr key={g.id}>
                <td className="font-mono text-[11px]">
                  <Link to={`/grn/${g.id}`} className="hover:underline">{g.grn_no}</Link>
                </td>
                <td className="text-xs">{fmtDate(g.received_at)}</td>
                <td className="text-xs">{g.warehouse ?? "—"}</td>
                <td><Badge className={GRN_TONE[g.status]}>{GRN_LABEL[g.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }: { label: string; value: number; icon: any; tone: string }) {
  const c = tone === "success" ? "text-success" : tone === "info" ? "text-info"
    : tone === "primary" ? "text-primary" : "text-muted-foreground";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <Icon className={`h-3.5 w-3.5 ${c}`} />
      </div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
