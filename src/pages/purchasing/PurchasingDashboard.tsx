import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import {
  ClipboardList, FileText, Ship, PackageCheck, ShieldCheck,
  AlertTriangle, TrendingUp, CalendarClock, ArrowLeft,
} from "lucide-react";
import {
  purchasingService, fmtSAR, fmtDate,
  PO_LABEL, PO_TONE, SHIPMENT_LABEL, SHIPMENT_TONE,
} from "@/services/erp/purchasing";

function Kpi({ icon: Icon, label, value, tone = "default", sub, to }: {
  icon: any; label: string; value: string | number; sub?: string; to?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const c = tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    tone === "primary" ? "text-primary" : "text-foreground";
  const inner = (
    <div className="border border-border bg-card rounded-lg p-3 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground mb-1">
        <Icon className={`h-3.5 w-3.5 ${c}`} />
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-bold num ${c}`}>{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}

export default function PurchasingDashboard() {
  const d = useMemo(() => purchasingService.dashboard(), []);
  const suppliers = purchasingService.listSuppliers();
  const pos = purchasingService.listPOs().slice(0, 5);
  const shipments = purchasingService.listShipments().slice(0, 5);

  return (
    <div>
      <PageHeader
        title="لوحة المشتريات"
        subtitle="نظرة تنفيذية على دورة الشراء، شحنات الموردين، والائتمان"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        <Kpi icon={ClipboardList} label="طلبات بانتظار اعتماد" value={d.pending_prs} tone="warning" to="/purchasing/requests" />
        <Kpi icon={FileText} label="أوامر شراء مفتوحة" value={d.open_pos} tone="primary" to="/purchasing/orders" />
        <Kpi icon={Ship} label="شحنات في الطريق" value={d.in_transit} tone="primary" to="/purchasing/shipments" />
        <Kpi icon={PackageCheck} label="بانتظار الفحص" value={d.awaiting_inspection} tone="warning" to="/purchasing/inspection" />
        <Kpi icon={AlertTriangle} label="موردون تجاوزوا الحد" value={d.over_limit} tone={d.over_limit > 0 ? "destructive" : "default"} to="/purchasing/credit" />
        <Kpi icon={CalendarClock} label="اتفاقيات قاربت الانتهاء" value={d.expiring_agreements} tone="warning" to="/purchasing/credit" />
        <Kpi icon={TrendingUp} label="قيمة الأوامر المفتوحة" value={fmtSAR(d.open_po_value)} tone="primary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Supplier credit health */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" /> الصحة الائتمانية للموردين
            </div>
            <Link to="/purchasing/credit" className="text-xs text-primary hover:underline flex items-center gap-1">
              التفاصيل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>المورد</th><th>الحد</th><th>المستخدم</th><th>الاستخدام</th></tr></thead>
            <tbody>
              {suppliers.map(s => {
                const c = purchasingService.creditSummary(s);
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="font-medium text-sm">{s.name}</div>
                      <div className="text-[11.5px] text-muted-foreground">{s.country} · {s.code}</div>
                    </td>
                    <td className="num text-xs">{fmtSAR(s.credit_limit)}</td>
                    <td className="num text-xs">{fmtSAR(s.utilized)}</td>
                    <td className="w-[140px]">
                      <div className="h-1.5 bg-muted rounded overflow-hidden">
                        <div className={`h-full ${c.over ? "bg-destructive" : c.usage > 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, c.usage)}%` }} />
                      </div>
                      <div className={`text-[11.5px] mt-0.5 ${c.over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                        {c.usage.toFixed(0)}% {c.over && "· تجاوز"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent POs */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-primary" /> أحدث أوامر الشراء
            </div>
            <Link to="/purchasing/orders" className="text-xs text-primary hover:underline flex items-center gap-1">
              عرض الكل <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>المورد</th><th>الفرع</th><th>القيمة</th><th>الحالة</th></tr></thead>
            <tbody>
              {pos.map(p => {
                const s = purchasingService.getSupplier(p.supplier_id);
                return (
                  <tr key={p.id}>
                    <td className="font-mono text-[12px]">{p.code}</td>
                    <td className="text-xs">{s?.name ?? "—"}</td>
                    <td className="text-xs">{p.branch_destination}</td>
                    <td className="num text-xs">{fmtSAR(p.total)}</td>
                    <td><Badge className={PO_TONE[p.status]}>{PO_LABEL[p.status]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Shipments */}
        <div className="bg-card border border-border rounded-lg overflow-hidden lg:col-span-2">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Ship className="h-4 w-4 text-primary" /> الشحنات النشطة
            </div>
            <Link to="/purchasing/shipments" className="text-xs text-primary hover:underline flex items-center gap-1">
              تتبع الشحنات <ArrowLeft className="h-3 w-3" />
            </Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الشحنة</th><th>الناقل</th><th>المرجع</th><th>المصدر</th><th>الوجهة</th><th>الوصول</th><th>الحالة</th></tr></thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id}>
                  <td className="font-mono text-[12px]">{s.code}</td>
                  <td className="text-xs">{s.carrier}</td>
                  <td className="font-mono text-[12px]" dir="ltr">{s.reference}</td>
                  <td className="text-xs">{s.origin}</td>
                  <td className="text-xs">{s.destination}</td>
                  <td className="text-xs">{fmtDate(s.eta)}</td>
                  <td><Badge className={SHIPMENT_TONE[s.status]}>{SHIPMENT_LABEL[s.status]}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
