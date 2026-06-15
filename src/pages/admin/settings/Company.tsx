import { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { settingsService } from "@/services/erp/settingsService";
import { toast } from "sonner";

// شكل بيانات الشركة (مطابق لمفاتيح company.* في system_settings)
interface CompanyForm {
  name_ar: string; name_en: string; logo_url: string;
  vat_number: string; cr_number: string; momrah_license: string; mhrsd_license: string;
  building_no: string; street: string; secondary_no: string; district: string;
  city: string; postal_code: string; country_code: string;
  phone: string; email: string; website: string;
  bank_name: string; iban: string;
}

const EMPTY: CompanyForm = {
  name_ar: "", name_en: "", logo_url: "",
  vat_number: "", cr_number: "", momrah_license: "", mhrsd_license: "",
  building_no: "", street: "", secondary_no: "", district: "",
  city: "", postal_code: "", country_code: "SA",
  phone: "", email: "", website: "",
  bank_name: "", iban: "",
};

// ── تحقّق وفق متطلّبات ZATCA ──
const onlyDigits = (s: string) => /^\d*$/.test(s);
const validators = {
  vat_number: (v: string) => !v || (/^\d{15}$/.test(v) && v.startsWith("3")),
  building_no: (v: string) => !v || /^\d{4}$/.test(v),
  secondary_no: (v: string) => !v || /^\d{4}$/.test(v),
  postal_code: (v: string) => !v || /^\d{5}$/.test(v),
};

export default function SettingsCompany() {
  const [c, setC] = useState<CompanyForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // تحميل من DB
  useEffect(() => {
    settingsService.getCategory("company")
      .then(data => setC({ ...EMPTY, ...data }))
      .catch(err => { console.error(err); toast.error("تعذّر تحميل بيانات الشركة"); })
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof CompanyForm>(k: K, v: CompanyForm[K]) => setC(p => ({ ...p, [k]: v }));

  const errors = useMemo(() => ({
    vat_number: !validators.vat_number(c.vat_number),
    building_no: !validators.building_no(c.building_no),
    secondary_no: !validators.secondary_no(c.secondary_no),
    postal_code: !validators.postal_code(c.postal_code),
  }), [c]);

  const hasErrors = Object.values(errors).some(Boolean);

  const zatcaComplete = useMemo(() =>
    !!(c.name_ar && c.vat_number && c.cr_number && c.building_no && c.street && c.district && c.city && c.postal_code),
    [c]
  );

  const save = async () => {
    if (hasErrors) { toast.error("يرجى تصحيح الحقول غير الصالحة قبل الحفظ"); return; }
    setSaving(true);
    try {
      await settingsService.saveCategory("company", c);
      toast.success("تم حفظ بيانات الشركة");
    } catch (err) {
      console.error(err);
      toast.error("تعذّر حفظ بيانات الشركة");
    } finally {
      setSaving(false);
    }
  };

  const errCls = (bad: boolean) => bad ? "border-destructive focus-visible:ring-destructive" : "";

  if (loading) {
    return (
      <div>
        <PageHeader title="بيانات الشركة" subtitle="جارٍ التحميل…" />
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="بيانات الشركة" subtitle="المعلومات الأساسية المستخدمة في المستندات والفاتورة الضريبية (متوافقة مع هيئة الزكاة والضريبة والجمارك)" />

      <Card className="p-4 max-w-3xl space-y-6">

        <div className={`flex items-center gap-2 text-xs rounded-md px-3 py-2 ${zatcaComplete ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {zatcaComplete
            ? <><CheckCircle2 className="h-4 w-4" /> الحقول الإلزامية لـ ZATCA مكتملة</>
            : <><AlertTriangle className="h-4 w-4" /> بعض الحقول الإلزامية للفاتورة الضريبية غير مكتملة</>}
        </div>

        {/* ── الهوية ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">هوية المنشأة</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الاسم بالعربية <span className="text-destructive">*</span></Label>
              <Input value={c.name_ar} onChange={e => set("name_ar", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الاسم بالإنجليزية</Label>
              <Input value={c.name_en} onChange={e => set("name_en", e.target.value)} className="h-9" dir="ltr" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">رابط الشعار</Label>
              <Input value={c.logo_url} onChange={e => set("logo_url", e.target.value)} className="h-9" dir="ltr" placeholder="https://..." />
            </div>
          </div>
        </section>

        {/* ── التسجيل الضريبي والتجاري ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">التسجيل الضريبي والتجاري</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الرقم الضريبي (VAT) <span className="text-destructive">*</span></Label>
              <Input
                value={c.vat_number}
                onChange={e => onlyDigits(e.target.value) && set("vat_number", e.target.value)}
                className={`h-9 font-mono ${errCls(errors.vat_number)}`}
                dir="ltr" maxLength={15} placeholder="3XXXXXXXXXXXXXX"
              />
              {errors.vat_number && <p className="text-[11px] text-destructive">يجب أن يكون 15 رقماً ويبدأ بـ 3</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">السجل التجاري (CRN) <span className="text-destructive">*</span></Label>
              <Input value={c.cr_number} onChange={e => set("cr_number", e.target.value)} className="h-9 font-mono" dir="ltr" placeholder="4030XXXXXX" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ترخيص الشؤون البلدية (MOMRAH)</Label>
              <Input value={c.momrah_license} onChange={e => set("momrah_license", e.target.value)} className="h-9 font-mono" dir="ltr" placeholder="اختياري" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ترخيص الموارد البشرية (MHRSD)</Label>
              <Input value={c.mhrsd_license} onChange={e => set("mhrsd_license", e.target.value)} className="h-9 font-mono" dir="ltr" placeholder="اختياري" />
            </div>
          </div>
        </section>

        {/* ── العنوان الوطني ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">العنوان الوطني السعودي</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">رقم المبنى <span className="text-destructive">*</span></Label>
              <Input
                value={c.building_no}
                onChange={e => onlyDigits(e.target.value) && set("building_no", e.target.value)}
                className={`h-9 font-mono ${errCls(errors.building_no)}`}
                dir="ltr" maxLength={4} placeholder="4 أرقام"
              />
              {errors.building_no && <p className="text-[11px] text-destructive">يجب أن يكون 4 أرقام بالضبط</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الرقم الإضافي</Label>
              <Input
                value={c.secondary_no}
                onChange={e => onlyDigits(e.target.value) && set("secondary_no", e.target.value)}
                className={`h-9 font-mono ${errCls(errors.secondary_no)}`}
                dir="ltr" maxLength={4} placeholder="4 أرقام"
              />
              {errors.secondary_no && <p className="text-[11px] text-destructive">يجب أن يكون 4 أرقام بالضبط</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">اسم الشارع <span className="text-destructive">*</span></Label>
              <Input value={c.street} onChange={e => set("street", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الحي <span className="text-destructive">*</span></Label>
              <Input value={c.district} onChange={e => set("district", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">المدينة <span className="text-destructive">*</span></Label>
              <Input value={c.city} onChange={e => set("city", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الرمز البريدي <span className="text-destructive">*</span></Label>
              <Input
                value={c.postal_code}
                onChange={e => onlyDigits(e.target.value) && set("postal_code", e.target.value)}
                className={`h-9 font-mono ${errCls(errors.postal_code)}`}
                dir="ltr" maxLength={5} placeholder="5 أرقام"
              />
              {errors.postal_code && <p className="text-[11px] text-destructive">يجب أن يكون 5 أرقام بالضبط</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">رمز الدولة</Label>
              <Input value={c.country_code} onChange={e => set("country_code", e.target.value.toUpperCase())} className="h-9 font-mono" dir="ltr" maxLength={2} placeholder="SA" />
            </div>
          </div>
        </section>

        {/* ── التواصل ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">معلومات التواصل</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الهاتف</Label>
              <Input value={c.phone} onChange={e => set("phone", e.target.value)} className="h-9" dir="ltr" placeholder="+966 12 XXX XXXX" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input value={c.email} onChange={e => set("email", e.target.value)} className="h-9" dir="ltr" type="email" />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label className="text-xs">الموقع الإلكتروني</Label>
              <Input value={c.website} onChange={e => set("website", e.target.value)} className="h-9" dir="ltr" placeholder="https://..." />
            </div>
          </div>
        </section>

        {/* ── المعلومات المصرفية ── */}
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground border-b pb-1">المعلومات المصرفية <span className="text-muted-foreground font-normal">(اختياري)</span></h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">اسم البنك</Label>
              <Input value={c.bank_name} onChange={e => set("bank_name", e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">رقم الآيبان (IBAN)</Label>
              <Input value={c.iban} onChange={e => set("iban", e.target.value.toUpperCase())} className="h-9 font-mono" dir="ltr" placeholder="SA00 0000 0000 0000 0000 0000" />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-[11px] text-muted-foreground">الحقول المعلّمة بـ <span className="text-destructive">*</span> إلزامية للفاتورة الضريبية وفق ZATCA</p>
          <Button onClick={save} disabled={hasErrors || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
            حفظ التغييرات
          </Button>
        </div>
      </Card>
    </div>
  );
}
