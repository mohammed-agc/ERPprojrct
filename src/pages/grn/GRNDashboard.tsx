import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, PackageCheck, AlertTriangle, FileSearch, CheckCircle2, Clock } from "lucide-react";
import { purchasingService, RECV_TONE, RECV_LABEL, fmtDate } from "@/services/erp/purchasing";
import { GRNCreateDialog } from "@/components/erp/GRNCreateDialog";

export default function GRNDashboard() {
  const [tick, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(() => purchasingService.grnDashboard());
  const [recent, setRecent] = useState(() => purchasingService.listGRNs().slice(0, 8));
  const pos = purchasingService.listPOs();
  const suppliers = purchasingService.listSuppliers();

  useEffect(() => {
    setD(purchasingService.grnDashboard());
    setRecent(purchasingService.listGRNs().slice(0, 8));
  }, [tick]);

  return (
    <div>
      <PageHeader
        title="إشعارات الاستلام — GRN"
        subtitle={`${d.total} إشعار · ${d.receivedToday} اليوم · ${d.discrepancy} بفروقات`}
        actions={
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 ml-1" /> إشعار استلام جديد
          </Button>
        }
      />
      <GRNCreateDialog open={open} onOpenChange={setOpen} onCreated={() => setTick(t => t + 1)} />

      <div className="grid grid-cols-6 gap-2 mb-4">
        <Kpi label="بانتظار الاستلام" value={d.draftOrReceiving} icon={Clock} tone="muted" />
        <Kpi label="استلام جزئي" value={d.partial} icon={PackageCheck} tone="warning" />
        <Kpi label="بانتظار الفحص" value={d.awaitingInspection} icon={FileSearch} tone="primary" />
        <Kpi label="فروقات" value={d.discrepancy} icon={AlertTriangle} tone="destructive" />
        <Kpi label="مستلم اليوم" value={d.receivedToday} icon={PackageCheck} tone="primary" />
        <Kpi label="مكتمل" value={d.completed} icon={CheckCircle2} tone="success" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="text-sm font-semibold">أحدث الإشعارات</div>
            <Link to="/grn/list" className="text-xs text-primary hover:underline">عرض الكل</Link>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>الرقم</th><th>أمر الشراء</th><th>المستودع</th><th>التاريخ</th><th>الحالة</th></tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-6">لا توجد إشعارات</td></tr>
              )}
              {recent.map(g => {
                const po = pos.find(p => p.id === g.po_id);
                return (
                  <tr key={g.id}>
                    <td className="font-mono text-[11px]">
                      <Link to={`/grn/${g.id}`} className="hover:underline">{g.code}</Link>
                    </td>
                    <td className="font-mono text-[11px]">{po?.code ?? "—"}</td>
                    <td className="text-xs">{g.warehouse}</td>
                    <td className="text-xs">{fmtDate(g.received_at)}</td>
                    <td><Badge className={RECV_TONE[g.status]}>{RECV_LABEL[g.status]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold">أداء الموردين في الاستلام</div>
          <table className="erp-table">
            <thead>
              <tr><th>المورد</th><th>إشعارات</th><th>نسبة بلا فروقات</th></tr>
            </thead>
            <tbody>
              {d.supplierPerf.length === 0 && (
                <tr><td colSpan={3} className="text-center text-muted-foreground py-6">لا بيانات</td></tr>
              )}
              {d.supplierPerf.map(s => (
                <tr key={s.supplier_id}>
                  <td className="text-xs">{s.name}</td>
                  <td className="num text-xs">{s.total}</td>
                  <td className="text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-muted rounded overflow-hidden">
                        <div className="h-full bg-success" style={{ width: `${s.clean_rate}%` }} />
                      </div>
                      <span className="num">{Math.round(s.clean_rate)}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: Icon, tone }:
  { label: string; value: number; icon: any; tone: "muted" | "warning" | "success" | "destructive" | "primary" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning"
    : tone === "destructive" ? "text-destructive" : tone === "primary" ? "text-primary"
    : "text-muted-foreground";
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
