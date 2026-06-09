import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ShieldCheck, AlertTriangle, Link2, Info, Wallet, Activity, Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ContactMeta } from "@/lib/contactMeta";
import { cn } from "@/lib/utils";
import { IncentivePrograms } from "@/components/erp/IncentivePrograms";

const fmtSAR = (n: number | null | undefined) =>
  n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US") + " ر.س";

export function SupplierIntelligence({ meta, onChange }: {
  meta: ContactMeta;
  onChange: (m: ContactMeta) => void;
}) {
  // قائمة الموردين للربط
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts").select("id,code,name")
        .eq("is_supplier", true).eq("active", true).order("name");
      return (data ?? []).map(s => ({ id: s.id, code: s.code, name: s.name }));
    },
  });

  const linkedRef = suppliers.find(s => s.id === meta.supplier_link_id);

  // بيانات المورد المرتبط الحقيقية من contacts
  const { data: linked } = useQuery({
    queryKey: ["supplier-credit", meta.supplier_link_id],
    enabled: !!meta.supplier_link_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, code, name, credit_limit, credit_used, current_balance, payment_term, settlement_policy")
        .eq("id", meta.supplier_link_id!).maybeSingle();
      return data;
    },
  });

  if (!linkedRef) {
    return (
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> ربط بسجل مورد</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-3">
          <div className="bg-primary/5 border border-primary/30 rounded p-3 text-xs flex items-start gap-2">
            <Info className="h-4 w-4 text-primary mt-0.5" />
            <div>لعرض <b>ذكاء المورد</b> الكامل (الائتمان، الحوافز، الانكشاف المالي، الأداء)، اختر سجل المورد المرتبط.</div>
          </div>
          <div className="max-w-md">
            <Label className="text-xs">سجل المورد</Label>
            <Select value={meta.supplier_link_id ?? ""} onValueChange={v => onChange({ ...meta, supplier_link_id: v || undefined })}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="— غير مرتبط —" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.code} · {s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-[12px] text-muted-foreground mt-1">مجرد ربط تشغيلي للملف.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // حسابات الائتمان من البيانات الحقيقية
  const creditLimit = linked?.credit_limit != null ? Number(linked.credit_limit) : null;
  const creditUsed = linked?.credit_used != null ? Number(linked.credit_used) : null;
  const remaining = creditLimit != null ? creditLimit - (creditUsed ?? 0) : null;
  const usage = creditLimit && creditLimit > 0 ? ((creditUsed ?? 0) / creditLimit) * 100 : 0;
  const over = remaining != null && remaining < 0;
  const hasCredit = creditLimit != null && creditLimit > 0;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between bg-card border border-border rounded-lg p-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground">{linkedRef.code}</span>
          <span className="text-muted-foreground">·</span>
          <span className="font-semibold">{linkedRef.name}</span>
        </div>
        <Select value={meta.supplier_link_id ?? ""} onValueChange={v => onChange({ ...meta, supplier_link_id: v || undefined })}>
          <SelectTrigger className="h-7 text-[12.5px] w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            {suppliers.map(s => <SelectItem key={s.id} value={s.id} className="text-xs">{s.code} · {s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* اتفاقية الائتمان — بيانات حقيقية */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" /> اتفاقية الائتمان
            {over && (
              <Badge className="bg-destructive/10 text-destructive border border-destructive/40 gap-1 mr-2">
                <AlertTriangle className="h-3 w-3" /> تجاوز الحد
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1 space-y-3">
          {!hasCredit ? (
            <div className="text-[12.5px] text-muted-foreground bg-muted/30 rounded p-2 text-center">
              لا يوجد حد ائتماني مُعرّف لهذا المورد. يمكن تعريفه من تبويب "المالي والائتمان".
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Cell label="الحد الائتماني" value={fmtSAR(creditLimit)} tone="primary" />
                <Cell label="المستخدم" value={fmtSAR(creditUsed ?? 0)} tone="warning" />
                <Cell label="المتبقي" value={fmtSAR(remaining)} tone={over ? "destructive" : "success"} />
                <Cell label="مهلة السداد" value={linked?.payment_term ? String(linked.payment_term) : "—"} />
              </div>
              <div>
                <div className="flex items-center justify-between text-[12.5px] text-muted-foreground mb-1">
                  <span>نسبة الاستخدام</span>
                  <span className={cn("num font-semibold", over ? "text-destructive" : usage > 80 ? "text-warning" : "text-success")}>
                    {usage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div className={cn("h-full", over ? "bg-destructive" : usage > 80 ? "bg-warning" : "bg-success")}
                    style={{ width: `${Math.min(100, Math.max(0, usage))}%` }} />
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* برامج الحوافز — المحرّك الحقيقي */}
      <IncentivePrograms supplierId={linkedRef.id} />

      {/* الانكشاف والأداء — قيد التفعيل مع المشتريات */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1"><Activity className="h-3.5 w-3.5" /> الانكشاف المالي وأداء المورد</CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground bg-muted/30 rounded p-3">
            <Clock className="h-4 w-4 shrink-0" />
            <div>
              الانكشاف المالي (الذمم الدائنة، أوامر الشراء المفتوحة، الشحنات) وأداء المورد (التسليم، الفحص، الموثوقية)
              يُفعّل تلقائياً عند تطوير وحدة المشتريات الحقيقية. <Wallet className="inline h-3 w-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Cell({ label, value, tone = "default" }: {
  label: string; value: string;
  tone?: "default" | "primary" | "success" | "warning" | "destructive";
}) {
  const c = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded p-2">
      <div className="text-[12px] text-muted-foreground">{label}</div>
      <div className={cn("text-sm font-bold num tabular-nums", c)}>{value}</div>
    </div>
  );
}
