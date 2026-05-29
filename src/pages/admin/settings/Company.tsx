import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { adminSettings, type CompanyInfo } from "@/services/erp/adminSettings";
import { toast } from "sonner";

export default function SettingsCompany() {
  const [c, setC] = useState<CompanyInfo>(() => adminSettings.get().company);

  const save = () => {
    adminSettings.saveCompany(c);
    toast.success("تم حفظ بيانات الشركة");
  };

  const set = <K extends keyof CompanyInfo>(k: K, v: CompanyInfo[K]) => setC(p => ({ ...p, [k]: v }));

  return (
    <div>
      <PageHeader title="بيانات الشركة" subtitle="المعلومات الأساسية المستخدمة في المستندات والطباعة" />
      <Card className="p-4 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالعربية</Label>
            <Input value={c.name_ar} onChange={e => set("name_ar", e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الاسم بالإنجليزية</Label>
            <Input value={c.name_en} onChange={e => set("name_en", e.target.value)} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الرقم الضريبي</Label>
            <Input value={c.vat_number} onChange={e => set("vat_number", e.target.value)} className="h-9 font-mono" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">السجل التجاري</Label>
            <Input value={c.cr_number} onChange={e => set("cr_number", e.target.value)} className="h-9 font-mono" dir="ltr" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">العنوان</Label>
            <Input value={c.address} onChange={e => set("address", e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">الهاتف</Label>
            <Input value={c.phone} onChange={e => set("phone", e.target.value)} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">البريد الإلكتروني</Label>
            <Input value={c.email} onChange={e => set("email", e.target.value)} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label className="text-xs">رابط الشعار</Label>
            <Input value={c.logo_url} onChange={e => set("logo_url", e.target.value)} className="h-9" dir="ltr" placeholder="https://..." />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button onClick={save}>حفظ التغييرات</Button>
        </div>
      </Card>
    </div>
  );
}
