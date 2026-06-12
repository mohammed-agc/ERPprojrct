import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, Database, ShieldAlert, CheckCircle2 } from "lucide-react";
import { UatResetDialog } from "@/components/erp/UatResetDialog";
import { toast } from "sonner";
import { purchasingService } from "@/services/erp/purchasing";
import { salesService } from "@/services/erp/sales";

interface ValidationResult {
  label: string;
  passed: boolean;
  detail: string;
}

export default function UatTools() {
  const [resetOpen, setResetOpen] = useState(false);
  const [validations, setValidations] = useState<ValidationResult[] | null>(null);

  const runValidations = () => {
    const out: ValidationResult[] = [];
    try {
      const pur = purchasingService.dashboard();
      out.push({
        label: "وجود طلبات شراء",
        passed: typeof pur.pending_prs === "number",
        detail: `${pur.pending_prs} طلب معلّق`,
      });
      out.push({
        label: "شحنات في الطريق",
        passed: typeof pur.in_transit === "number",
        detail: `${pur.in_transit} شحنة في الطريق`,
      });
    } catch (e: any) {
      out.push({ label: "وحدة المشتريات", passed: false, detail: e?.message ?? "خطأ" });
    }
    try {
      const sal = salesService.dashboard();
      out.push({
        label: "حجوزات مبيعات",
        passed: typeof sal.reserved === "number",
        detail: `${sal.reserved} حجز`,
      });
    } catch (e: any) {
      out.push({ label: "وحدة المبيعات", passed: false, detail: e?.message ?? "خطأ" });
    }
    setValidations(out);
    toast.success("تم تنفيذ فحص سلامة البيانات");
  };

  const seedDemo = () => {
    try {
      purchasingService.dashboard();
      salesService.dashboard();
      toast.success("تم تأكيد توفّر البيانات التجريبية الافتراضية");
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر زرع البيانات");
    }
  };

  return (
    <div>
      <PageHeader title="أدوات UAT" subtitle="أدوات إدارية لاختبار قبول المستخدم" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="h-5 w-5 text-amber-600" />
            <div className="font-bold text-sm">تهيئة بيئة الاختبار</div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            مسح كل البيانات التشغيلية مع الحفاظ على البيانات الرئيسية والمستخدمين.
          </p>
          <Button onClick={() => setResetOpen(true)} className="w-full bg-amber-600 hover:bg-amber-700 text-white">
            بدء التهيئة
          </Button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="h-5 w-5 text-primary" />
            <div className="font-bold text-sm">زرع بيانات تجريبية</div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            توليد مجموعة بيانات افتراضية للاختبار (موردون، عملاء، مركبات).
          </p>
          <Button onClick={seedDemo} variant="outline" className="w-full">
            زرع البيانات
          </Button>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" />
            <div className="font-bold text-sm">فحص سلامة البيانات</div>
          </div>
          <p className="text-xs text-muted-foreground mb-3">
            تحقّق سريع من تكامل البيانات عبر الوحدات.
          </p>
          <Button onClick={runValidations} variant="outline" className="w-full">
            تشغيل الفحص
          </Button>
        </Card>
      </div>

      {validations && (
        <Card className="p-3">
          <div className="font-bold text-sm mb-2">نتائج الفحص</div>
          <div className="space-y-1">
            {validations.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-xs py-1 border-b border-border/40 last:border-0">
                {v.passed
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  : <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />}
                <span className="font-medium flex-1">{v.label}</span>
                <Badge variant="secondary" className="text-[11.5px]">{v.detail}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <UatResetDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
