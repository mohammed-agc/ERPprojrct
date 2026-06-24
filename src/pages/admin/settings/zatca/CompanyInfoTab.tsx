// ============================================================
// CompanyInfoTab.tsx — S1.4.1
// ============================================================
// تبويب "معلومات الشركة" داخل /admin/settings/zatca.
//
// الغرض: تمكين مدير النظام من إدخال/تعديل بيانات الشركة (التي تظهر
// في كل الفواتير والقوالب والتوقيع الإلكتروني)، بدلاً من اعتمادها
// hardcoded في الكود.
//
// تنبيه حساس: تعديل vat_number أو commercial_registration بعد إصدار
// شهادة ZATCA active يتطلب إعادة Onboarding كاملة، لذلك نُظهِر تحذيراً
// واضحاً قبل الحفظ.
// ============================================================

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useCompany, isValidSaudiVat, type CompanyUpdate, type Company } from "@/lib/company/useCompany";
import { ZatcaApi, type ZatcaCredential } from "@/lib/zatca/zatcaApi";

// ---------- ثوابت الواجهة ----------

const ENV_OPTIONS = [
  { value: "sandbox", label: "بيئة تجريبية (Sandbox)" },
  { value: "simulation", label: "بيئة محاكاة (Simulation)" },
  { value: "production", label: "بيئة الإنتاج (Production)" },
] as const;

const CURRENCY_OPTIONS = [
  { value: "SAR", label: "ريال سعودي (SAR)" },
  { value: "USD", label: "دولار أمريكي (USD)" },
  { value: "AED", label: "درهم إماراتي (AED)" },
  { value: "EUR", label: "يورو (EUR)" },
];

// ============================================================

export default function CompanyInfoTab() {
  const { company, loading, error, save } = useCompany();
  const [form, setForm] = useState<CompanyUpdate>({});
  const [saving, setSaving] = useState(false);
  const [hasActiveCredential, setHasActiveCredential] = useState(false);
  const [showCriticalConfirm, setShowCriticalConfirm] = useState(false);
  const [touched, setTouched] = useState(false);

  // ملء النموذج من بيانات الشركة عند الجلب
  useEffect(() => {
    
    if (company) {
      setForm({
        name: company.name,
        commercial_registration: company.commercial_registration,
        vat_number: company.vat_number,
        country: company.country,
        currency_code: company.currency_code,
        is_active: company.is_active,
        street_address: company.street_address,
        building_number: company.building_number,
        district: company.district,
        city: company.city,
        postal_code: company.postal_code,
        additional_number: company.additional_number,
        country_code: company.country_code,
        zatca_environment: company.zatca_environment,
      });
      setTouched(false);
    }
  }, [company]);

  // فحص وجود شهادة نشطة (للتنبيه قبل التعديل الحساس)
  useEffect(() => {
    (async () => {
      const creds = await ZatcaApi.listCredentials();
      setHasActiveCredential(creds.some((c: ZatcaCredential) => c.is_active));
    })();
  }, [company?.id]);

  function setField<K extends keyof CompanyUpdate>(field: K, value: CompanyUpdate[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setTouched(true);
  }

  // ---------- تحقق ----------
  const vatError =
    form.vat_number && form.vat_number.trim().length > 0 && !isValidSaudiVat(form.vat_number.trim())
      ? "الرقم الضريبي يجب أن يكون 15 رقماً ويبدأ وينتهي بـ 3"
      : null;

  const nameError = !form.name || form.name.trim().length < 2 ? "اسم الشركة مطلوب" : null;

  const hasErrors = !!vatError || !!nameError;

  // هل يوجد تعديل على حقل حساس؟
  const vatChanged =
    company && form.vat_number !== company.vat_number;
  const crChanged =
    company && form.commercial_registration !== company.commercial_registration;
  const criticalChange = (vatChanged || crChanged) && hasActiveCredential;

  // ---------- حفظ ----------
  async function handleSave() {
    if (hasErrors) {
      toast.error("يرجى تصحيح الأخطاء قبل الحفظ");
      return;
    }
    if (criticalChange) {
      setShowCriticalConfirm(true);
      return;
    }
    await performSave();
  }

  async function performSave() {
    setSaving(true);
    setShowCriticalConfirm(false);
    const result = await save(form);
    setSaving(false);

    if (!result.success) {
      toast.error(`تعذّر الحفظ: ${result.error || "خطأ غير معروف"}`);
      return;
    }
    toast.success("تم حفظ بيانات الشركة بنجاح");
    setTouched(false);
  }

  function handleReset() {
    if (!company) return;
    setForm({
      name: company.name,
      commercial_registration: company.commercial_registration,
      vat_number: company.vat_number,
      country: company.country,
      currency_code: company.currency_code,
      is_active: company.is_active,
      street_address: company.street_address,
      building_number: company.building_number,
      district: company.district,
      city: company.city,
      postal_code: company.postal_code,
      additional_number: company.additional_number,
      country_code: company.country_code,
      zatca_environment: company.zatca_environment,
    });
    setTouched(false);
  }

  // ---------- العرض ----------

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
        جارٍ تحميل بيانات الشركة…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        تعذّر تحميل بيانات الشركة: {error}
      </div>
    );
  }

  if (!company) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        لا توجد شركة معرّفة في قاعدة البيانات. تواصل مع مدير النظام لإنشاء سجل الشركة الأول.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* تنبيه إن كانت هناك شهادة نشطة */}
      {hasActiveCredential && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
          <span className="font-semibold">تنبيه:</span> توجد شهادة ZATCA نشطة لهذه الشركة. تعديل
          الرقم الضريبي أو السجل التجاري سيتطلب إعادة Onboarding كاملة لإصدار شهادة جديدة بالبيانات
          المحدّثة.
        </div>
      )}

      {/* قسم 1: المعلومات الأساسية */}
      <Section title="المعلومات الأساسية">
        <Field label="اسم الشركة" required error={nameError}>
          <input
            className={inputClass(!!nameError)}
            value={form.name ?? ""}
            onChange={(e) => setField("name", e.target.value)}
          />
        </Field>

        <Field
          label="الرقم الضريبي (15 رقماً، يبدأ وينتهي بـ 3)"
          required
          error={vatError}
          hint={hasActiveCredential && vatChanged ? "تعديل حساس — يتطلب إعادة Onboarding" : undefined}
        >
          <input
            className={inputClass(!!vatError)}
            value={form.vat_number ?? ""}
            onChange={(e) => setField("vat_number", e.target.value)}
            maxLength={15}
            placeholder="300000000000003"
            dir="ltr"
          />
        </Field>

        <Field
          label="السجل التجاري"
          hint={
            hasActiveCredential && crChanged
              ? "تعديل حساس — يتطلب إعادة Onboarding"
              : "اختياري الآن، مطلوب قبل الترقية لبيئة الإنتاج"
          }
        >
          <input
            className={inputClass(false)}
            value={form.commercial_registration ?? ""}
            onChange={(e) => setField("commercial_registration", e.target.value || null)}
            placeholder="1010000000"
            dir="ltr"
          />
        </Field>
      </Section>

      {/* قسم 2: العنوان الكامل (مطلوب لـ ZATCA) */}
      <Section
        title="العنوان الوطني"
        subtitle="مطلوب من هيئة الزكاة والضريبة والجمارك للفواتير الإلكترونية"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="اسم الشارع">
            <input
              className={inputClass(false)}
              value={form.street_address ?? ""}
              onChange={(e) => setField("street_address", e.target.value || null)}
            />
          </Field>
          <Field label="رقم المبنى">
            <input
              className={inputClass(false)}
              value={form.building_number ?? ""}
              onChange={(e) => setField("building_number", e.target.value || null)}
              dir="ltr"
            />
          </Field>
          <Field label="الحي">
            <input
              className={inputClass(false)}
              value={form.district ?? ""}
              onChange={(e) => setField("district", e.target.value || null)}
            />
          </Field>
          <Field label="المدينة">
            <input
              className={inputClass(false)}
              value={form.city ?? ""}
              onChange={(e) => setField("city", e.target.value || null)}
            />
          </Field>
          <Field label="الرمز البريدي">
            <input
              className={inputClass(false)}
              value={form.postal_code ?? ""}
              onChange={(e) => setField("postal_code", e.target.value || null)}
              dir="ltr"
            />
          </Field>
          <Field label="الرقم الإضافي">
            <input
              className={inputClass(false)}
              value={form.additional_number ?? ""}
              onChange={(e) => setField("additional_number", e.target.value || null)}
              dir="ltr"
            />
          </Field>
        </div>
      </Section>

      {/* قسم 3: الإعدادات الإقليمية */}
      <Section title="الإعدادات الإقليمية والمالية">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="الدولة">
            <input
              className={inputClass(false)}
              value={form.country ?? ""}
              onChange={(e) => setField("country", e.target.value)}
              placeholder="SA"
              maxLength={2}
              dir="ltr"
            />
          </Field>
          <Field label="رمز الدولة (للعنوان)">
            <input
              className={inputClass(false)}
              value={form.country_code ?? ""}
              onChange={(e) => setField("country_code", e.target.value || null)}
              placeholder="SA"
              maxLength={2}
              dir="ltr"
            />
          </Field>
          <Field label="العملة">
            <select
              className={inputClass(false)}
              value={form.currency_code ?? ""}
              onChange={(e) => setField("currency_code", e.target.value)}
            >
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* قسم 4: ZATCA */}
      <Section title="إعدادات هيئة الزكاة والضريبة والجمارك">
        <Field
          label="بيئة العمل"
          hint="غيّر إلى Production عند جاهزية الشركة للإصدار الفعلي"
        >
          <select
            className={inputClass(false)}
            value={form.zatca_environment ?? "sandbox"}
            onChange={(e) =>
              setField("zatca_environment", e.target.value as Company["zatca_environment"])
            }
          >
            {ENV_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      {/* أزرار الحفظ */}
      <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
        <button
          onClick={handleReset}
          disabled={saving || !touched}
          className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          إلغاء التغييرات
        </button>
        <button
          onClick={handleSave}
          disabled={saving || hasErrors || !touched}
          className="rounded-md bg-[#0f766e] px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "جارٍ الحفظ…" : "حفظ التغييرات"}
        </button>
      </div>

      {/* Modal تأكيد التعديل الحساس */}
      {showCriticalConfirm && (
        <CriticalChangeModal
          vatChanged={!!vatChanged}
          crChanged={!!crChanged}
          onConfirm={performSave}
          onCancel={() => setShowCriticalConfirm(false)}
          loading={saving}
        />
      )}
    </div>
  );
}

// ============================================================
// مكوّنات مساعدة
// ============================================================

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-100 bg-white p-5">
      <div className="mb-4 border-b border-gray-100 pb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700">
        {label}
        {required && <span className="mr-1 text-red-500">*</span>}
      </label>
      {children}
      {error && <div className="mt-1 text-[11px] text-red-600">{error}</div>}
      {hint && !error && <div className="mt-1 text-[11px] text-gray-500">{hint}</div>}
    </div>
  );
}

function inputClass(hasError: boolean): string {
  return [
    "w-full rounded-md border px-3 py-2 text-sm outline-none transition-colors",
    hasError
      ? "border-red-300 bg-red-50/30 focus:border-red-400 focus:ring-2 focus:ring-red-100"
      : "border-gray-200 focus:border-[#0f766e] focus:ring-2 focus:ring-[#0f766e]/15",
  ].join(" ");
}

function CriticalChangeModal({
  vatChanged,
  crChanged,
  onConfirm,
  onCancel,
  loading,
}: {
  vatChanged: boolean;
  crChanged: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-bold text-amber-700">تأكيد تعديل حساس</h3>
        </div>
        <div className="px-6 py-5 text-sm text-gray-700">
          <p className="mb-3">
            أنت تقوم بتعديل
            {vatChanged && " الرقم الضريبي"}
            {vatChanged && crChanged && " و"}
            {crChanged && " السجل التجاري"}
            ، وتوجد شهادة ZATCA نشطة مرتبطة بالبيانات الحالية.
          </p>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            بعد الحفظ، يجب إعادة Onboarding كاملة لإصدار شهادة جديدة تطابق البيانات المحدّثة. لن
            يعمل التوقيع الإلكتروني للفواتير حتى تكتمل العملية.
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
          >
            إلغاء
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
          >
            {loading ? "جارٍ الحفظ…" : "أوافق وأحفظ"}
          </button>
        </div>
      </div>
    </div>
  );
}