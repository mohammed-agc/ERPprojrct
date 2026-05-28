import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, AlertTriangle, CalendarClock, Trophy, Target, TrendingUp,
  Truck, ClipboardCheck, Wallet, Activity, Link2, Info, CheckCircle2,
} from "lucide-react";
import { purchasingService, fmtSAR, fmtDate } from "@/services/erp/purchasing";
import { ContactMeta } from "@/lib/contactMeta";
import { cn } from "@/lib/utils";

export function SupplierIntelligence({
  meta, onChange,
}: {
  meta: ContactMeta;
  onChange: (m: ContactMeta) => void;
}) {
  const suppliers = useMemo(() => purchasingService.listSuppliers(), []);
  const linked = suppliers.find(s => s.id === meta.supplier_link_id);

  if (!linked) {
    return (
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <Link2 className="h-3.5 w-3.5" /> ربط بسجل مورد
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-3">
          <div className="bg-primary/5 border border-primary/30 rounded p-3 text-xs flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5" />
            <div>
              لعرض <b>ذكاء المورد</b> الكامل (الائتمان، الحوافز، الانكشاف المالي، الأداء التشغيلي، السجل الموحّد)،
              اختر سجل المورد المرتبط من قائمة الموردين في وحدة المشتريات.
            </div>
          </div>
          <div className="max-w-md">
            <Label className="text-xs">سجل المورد</Label>
            <Select
              value={meta.supplier_link_id ?? ""}
              onValueChange={v => onChange({ ...meta, supplier_link_id: v || undefined })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— غير مرتبط —" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.code} · {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              لا يتطلب ذلك أي تغيير في النظام الخلفي — مجرد ربط تشغيلي للملف.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const credit = purchasingService.creditSummary(linked);
  const incentive = purchasingService.expectedIncentive(linked);
  const exposure = purchasingService.supplierExposure(linked.id);
  const perf = purchasingService.supplierPerformance(linked.id);
  const timeline = purchasingService.supplierTimeline(linked.id);
  const expiringSoon = credit.daysToExpiry <= 60 && credit.daysToExpiry >= 0;
  const incentivePct = linked.monthly_target > 0 ? (linked.achieved / linked.monthly_target) * 100 : 0;
  const agreementLabel =
    linked.agreement_type === "framework" ? "ائتمان + حوافز (إطارية)" :
    linked.agreement_type === "spot" ? "فورية (دفع)" : "أمانة (Consignment)";

  return (
    <div className="space-y-3">
      {/* Header / link control */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-200">سجل مورد مرتبط</Badge>
          <span className="font-mono text-muted-foreground">{linked.code}</span>
          <span>·</span>
          <span className="font-semibold">{linked.name}</span>
          <span className="text-muted-foreground">· {linked.country}</span>
          <span className="text-muted-foreground">· {agreementLabel}</span>
        </div>
        <Select
          value={meta.supplier_link_id ?? "__none__"}
          onValueChange={v => onChange({ ...meta, supplier_link_id: v === "__none__" ? undefined : v })}
        >
          <SelectTrigger className="h-7 text-[11px] w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— إلغاء الربط —</SelectItem>
            {suppliers.map(s => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.code} · {s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

      </div>

      {/* Credit agreement */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> اتفاقية الائتمان
            {credit.over && (
              <Badge className="bg-destructive/10 text-destructive border border-destructive/40 gap-1 mr-2">
                <AlertTriangle className="h-3 w-3" /> تجاوز الحد
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Cell label="الحد الائتماني" value={fmtSAR(linked.credit_limit)} tone="primary" />
            <Cell label="المستخدم" value={fmtSAR(linked.utilized)} tone="warning" />
            <Cell label="المتبقي" value={fmtSAR(credit.remaining)} tone={credit.remaining < 0 ? "destructive" : "success"} />
            <Cell label="دورة التجديد" value={`${linked.renewal_period_months} شهر`} />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>نسبة الاستخدام</span>
              <span className={cn("num font-semibold",
                credit.over ? "text-destructive" : credit.usage > 80 ? "text-warning" : "text-success")}>
                {credit.usage.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div
                className={cn("h-full",
                  credit.over ? "bg-destructive" : credit.usage > 80 ? "bg-warning" : "bg-success")}
                style={{ width: `${Math.min(100, credit.usage)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] border-t border-border pt-2">
            <div className="flex items-center gap-1 text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              تنتهي الاتفاقية: {fmtDate(linked.agreement_expiry)}
            </div>
            <div className={expiringSoon ? "text-warning font-semibold" : "text-muted-foreground"}>
              {credit.daysToExpiry >= 0 ? `${credit.daysToExpiry} يوم متبقي` : `منتهية منذ ${Math.abs(credit.daysToExpiry)} يوم`}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Incentives */}
      {linked.monthly_target > 0 && (
        <Card>
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs flex items-center gap-1">
              <Trophy className="h-3.5 w-3.5 text-warning" /> الحوافز الشهرية
              {linked.campaign && (
                <span className="text-[10px] font-normal text-muted-foreground mr-2">· {linked.campaign}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Cell label="الهدف الشهري" value={`${linked.monthly_target} مركبة`} icon={Target} />
              <Cell label="المُحقق" value={`${linked.achieved} مركبة`} tone={incentivePct >= 100 ? "success" : "warning"} icon={TrendingUp} />
              <Cell label="حافز/مركبة" value={fmtSAR(linked.incentive_per_vehicle)} />
              <Cell label="الحافز المتوقع" value={fmtSAR(incentive.total)} tone="success" icon={Trophy} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                <span>التقدم نحو الهدف</span>
                <span className={cn("num font-semibold", incentivePct >= 100 ? "text-success" : "text-warning")}>
                  {incentivePct.toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded overflow-hidden">
                <div className={cn("h-full", incentivePct >= 100 ? "bg-success" : "bg-primary")}
                  style={{ width: `${Math.min(100, incentivePct)}%` }} />
              </div>
            </div>
            <div className="text-[11px] bg-primary/5 border border-primary/30 rounded p-2 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
              الحوافز <b>تُخصم من ذمم المورد الدائنة</b> ولا تُسدد مباشرة.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Financial exposure */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <Wallet className="h-3.5 w-3.5" /> الانكشاف المالي والتشغيلي
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Cell label="الذمم الدائنة" value={fmtSAR(exposure.payable)} tone="warning" />
            <Cell label="متأخرة" value={fmtSAR(exposure.overdue_payable)} tone={exposure.overdue_payable > 0 ? "destructive" : "default"} />
            <Cell label="أوامر شراء مفتوحة" value={String(exposure.pending_pos)} icon={Truck} />
            <Cell label="شحنات قيد الطريق" value={String(exposure.pending_shipments)} icon={Truck} />
            <Cell label="بانتظار الفحص" value={String(exposure.pending_inspections)} icon={ClipboardCheck} tone={exposure.pending_inspections > 0 ? "warning" : "default"} />
          </div>
        </CardContent>
      </Card>

      {/* Performance */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <Activity className="h-3.5 w-3.5" /> أداء المورد
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <Cell label="متوسط زمن التسليم" value={`${perf.avgDeliveryDays} يوم`} />
            <Cell label="تأخيرات حالية" value={String(perf.delayed)} tone={perf.delayed > 0 ? "warning" : "default"} />
            <Cell label="نسبة الرفض بالفحص" value={`${perf.rejectionRate.toFixed(1)}%`} tone={perf.rejectionRate > 5 ? "destructive" : "success"} />
            <Cell label="نسبة الإرجاع" value={`${perf.returnRate.toFixed(1)}%`} tone={perf.returnRate > 5 ? "warning" : "default"} />
            <Cell label="موثوقية المورد" value={`${perf.reliability}/100`} tone={perf.reliability >= 80 ? "success" : perf.reliability >= 60 ? "warning" : "destructive"} icon={CheckCircle2} />
          </div>
          <div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>مؤشر الموثوقية</span>
              <span className="num font-semibold">{perf.reliability}%</span>
            </div>
            <div className="h-2 bg-muted rounded overflow-hidden">
              <div className={cn("h-full",
                perf.reliability >= 80 ? "bg-success" : perf.reliability >= 60 ? "bg-warning" : "bg-destructive")}
                style={{ width: `${perf.reliability}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Unified ERP timeline */}
      <Card>
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
          <CardTitle className="text-xs">السجل الموحّد للمورد</CardTitle>
          <Link to="/purchasing/dashboard" className="text-[11px] text-primary hover:underline">
            فتح لوحة المشتريات ←
          </Link>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          {timeline.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-6">لا يوجد نشاط مسجل بعد</div>
          )}
          <div className="divide-y divide-border">
            {timeline.slice(0, 30).map((t, i) => (
              <div key={i} className="py-1.5 flex items-center gap-3 text-xs">
                <span className="font-mono text-[10px] text-muted-foreground w-28">
                  {new Date(t.date).toLocaleDateString("ar-SA", { dateStyle: "medium" })}
                </span>
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded border",
                  t.tone === "success" ? "bg-success/10 text-success border-success/40" :
                  t.tone === "destructive" ? "bg-destructive/10 text-destructive border-destructive/40" :
                  "bg-accent text-accent-foreground border-border",
                )}>
                  {t.kind}
                </span>
                <span className="flex-1">{t.title}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({ label, value, sub, tone = "default", icon: Icon }: {
  label: string; value: string; sub?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
  icon?: any;
}) {
  const c =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" :
    tone === "primary" ? "text-primary" : "text-foreground";
  return (
    <div className="bg-muted/40 border border-border rounded p-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {Icon && <Icon className={cn("h-3 w-3", c)} />}<span>{label}</span>
      </div>
      <div className={cn("text-sm font-semibold num", c)}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
