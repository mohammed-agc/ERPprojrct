import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FlaskConical, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { resetTransactional } from "@/lib/uatEnv";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const REMOVED = [
  "طلبات الشراء", "أوامر الشراء", "تأكيدات الموردين",
  "تخصيصات المركبات", "تأكيدات التخصيص",
  "فواتير الشراء", "مدفوعات الشراء",
  "الشحنات", "إشعارات الاستلام (GRN)", "الفحوصات",
  "مخزون المركبات", "حركات المخزون",
  "طلبات البيع", "أوامر البيع", "فواتير البيع",
  "مقبوضات العملاء", "التسليمات", "الحجوزات",
  "حركات كشف الحساب", "القيود المحاسبية التشغيلية",
  "بيانات سير العمل المؤقتة",
];

const KEPT = [
  "جهات الاتصال", "العملاء", "الموردون",
  "كتالوج المنتجات", "الشركات المصنعة", "الموديلات", "الفئات",
  "كتالوج المركبات", "ألوان المركبات",
  "المستودعات", "الفروع", "المستخدمون", "الأدوار", "الصلاحيات",
  "إعدادات الشركة", "إعدادات المحاسبة", "إعدادات الضريبة", "إعدادات الخزينة",
];

export function UatResetDialog({ open, onOpenChange }: Props) {
  const [phrase, setPhrase] = useState("");
  const [running, setRunning] = useState(false);
  const canRun = phrase.trim() === "تأكيد" && !running;

  const handleRun = () => {
    setRunning(true);
    try {
      const removed = resetTransactional();
      toast.success(`تم تهيئة بيئة الاختبار · ${removed.length} مجموعة بيانات تشغيلية`);
      setTimeout(() => window.location.reload(), 400);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تنفيذ التهيئة");
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) { setPhrase(""); onOpenChange(v); } }}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-amber-600" />
            تهيئة بيئة الاختبار (UAT)
          </DialogTitle>
          <DialogDescription className="text-xs">
            إجراء إداري لإعادة ضبط البيانات التشغيلية فقط، مع الحفاظ على البيانات الرئيسية والإعدادات.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-2.5 text-[12px] flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 shrink-0" />
          <div className="text-amber-900 dark:text-amber-200">
            هذا الإجراء سيمسح كل المستندات التشغيلية (المشتريات، المبيعات، المخزون، المحاسبة التشغيلية، ...) لإتاحة بدء دورة اختبار نظيفة. لا يمكن التراجع عنه.
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-rose-500/30 bg-rose-50/40 dark:bg-rose-950/20 p-2">
            <div className="text-[12px] font-bold text-rose-700 dark:text-rose-300 mb-1.5 flex items-center gap-1">
              <Badge variant="destructive" className="h-4 text-[12px]">سيُمسح</Badge>
              <span>البيانات التشغيلية</span>
            </div>
            <ul className="text-[12px] leading-5 text-rose-900/80 dark:text-rose-200/80 list-disc pr-4 space-y-0.5 max-h-48 overflow-auto">
              {REMOVED.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="rounded-md border border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-950/20 p-2">
            <div className="text-[12px] font-bold text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              <span>سيُحتفظ به</span>
            </div>
            <ul className="text-[12px] leading-5 text-emerald-900/80 dark:text-emerald-200/80 list-disc pr-4 space-y-0.5 max-h-48 overflow-auto">
              {KEPT.map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">للتأكيد، اكتب كلمة <span className="font-mono text-primary">تأكيد</span></Label>
          <Input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="تأكيد"
            className="h-9"
            dir="rtl"
            disabled={running}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>إلغاء</Button>
          <Button
            onClick={handleRun}
            disabled={!canRun}
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            {running ? "جارٍ التهيئة…" : "تنفيذ التهيئة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
