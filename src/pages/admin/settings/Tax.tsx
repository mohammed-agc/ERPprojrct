import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { adminSettings, type TaxSettings } from "@/services/erp/adminSettings";
import { toast } from "sonner";

export default function SettingsTax() {
  const [t, setT] = useState<TaxSettings>(() => adminSettings.get().tax);

  const save = () => { adminSettings.saveTax(t); toast.success("تم حفظ إعدادات الضريبة"); };

  return (
    <div>
      <PageHeader title="إعدادات الضريبة" subtitle="القيمة المضافة والتسجيل الضريبي" />
      <Card className="p-4 max-w-xl space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">نسبة ضريبة القيمة المضافة الافتراضية (%)</Label>
          <Input
            type="number"
            value={t.default_vat_pct}
            onChange={e => setT(p => ({ ...p, default_vat_pct: Number(e.target.value) }))}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">رقم التسجيل الضريبي</Label>
          <Input
            value={t.vat_registration_no}
            onChange={e => setT(p => ({ ...p, vat_registration_no: e.target.value }))}
            className="h-9 font-mono" dir="ltr"
          />
        </div>
        <div className="flex items-center gap-3 pt-1">
          <Switch
            checked={t.inclusive_default}
            onCheckedChange={v => setT(p => ({ ...p, inclusive_default: v }))}
          />
          <Label className="text-xs cursor-pointer">احتساب الضريبة شاملة في السعر افتراضياً</Label>
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={save}>حفظ التغييرات</Button>
        </div>
      </Card>
    </div>
  );
}
