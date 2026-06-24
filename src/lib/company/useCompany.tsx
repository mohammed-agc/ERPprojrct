// ============================================================
// useCompany.ts — Single Source of Truth لبيانات الشركة
// ============================================================
// كل المكوّنات في المشروع تستخدم هذا الـ Hook لقراءة بيانات الشركة،
// بدلاً من الـ hardcoding في الواجهات. مطابق لبنية جدول `companies`
// في Supabase ليتطابق العقد بين UI و DB 1:1.
//
// الاستخدام:
//   const { company, loading, error, refetch, save } = useCompany();
//
// ملاحظات معمارية:
//   - يستخدم React Context لمشاركة البيانات بين كل المكوّنات دون
//     جلب مكرر من قاعدة البيانات.
//   - عند التعديل في تبويب "معلومات الشركة"، استدعاء save() يحدّث
//     DB ثم refetch تلقائياً ليُحدِّث كل المكوّنات الفرعية.
//   - يدعم انتقاء صف بـ code='DEFAULT' (الصف الافتراضي)؛ إن لم يوجد
//     يأخذ أول صف نشط (is_active=true).
// ============================================================

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

// ---------- العقد ----------

export interface Company {
  id: string;
  code: string;
  name: string;
  commercial_registration: string | null;
  vat_number: string | null;
  country: string;
  currency_code: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // العنوان (مطلوب لـ ZATCA)
  street_address: string | null;
  building_number: string | null;
  district: string | null;
  city: string | null;
  postal_code: string | null;
  additional_number: string | null;
  country_code: string | null;
  // ZATCA
  zatca_environment: "sandbox" | "simulation" | "production" | null;
}

// حقول قابلة للتعديل (الـ id/code/created_at/updated_at لا تُعدَّل من UI)
export type CompanyUpdate = Partial<
  Omit<Company, "id" | "code" | "created_at" | "updated_at">
>;

interface CompanyContextValue {
  company: Company | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  save: (updates: CompanyUpdate) => Promise<{ success: boolean; error?: string }>;
}

const CompanyContext = createContext<CompanyContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCompany = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1) جرّب صف DEFAULT أولاً
      let { data, error: err } = await supabase
        .from("companies")
        .select("*")
        .eq("code", "DEFAULT")
        .maybeSingle();

      // 2) إن لم يوجد، خذ أول صف نشط
      if (!data && !err) {
        const result = await supabase
          .from("companies")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        data = result.data;
        err = result.error;
      }
      
      if (err) {
        setError(err.message);
        setCompany(null);
      } else {
        setCompany((data as Company) ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تحميل بيانات الشركة");
      setCompany(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const save = useCallback<CompanyContextValue["save"]>(
    async (updates) => {
      if (!company) {
        return { success: false, error: "لا توجد شركة محملة للتعديل" };
      }
      const { error: err } = await supabase
        .from("companies")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", company.id);

      if (err) {
        return { success: false, error: err.message };
      }
      // إعادة قراءة لتحديث كل المشتركين
      await fetchCompany();
      return { success: true };
    },
    [company, fetchCompany]
  );

  useEffect(() => {
    fetchCompany();
  }, [fetchCompany]);

  return (
    <CompanyContext.Provider value={{ company, loading, error, refetch: fetchCompany, save }}>
      {children}
    </CompanyContext.Provider>
  );
}

// ============================================================
// Hook الاستهلاكي
// ============================================================

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) {
    throw new Error(
      "useCompany must be used within a CompanyProvider. " +
        "Wrap your app with <CompanyProvider> in App.tsx (after AuthProvider)."
    );
  }
  return ctx;
}

// ============================================================
// مساعدات عرض آمنة (تتحمّل غياب الحقول)
// ============================================================

/** اسم الشركة الجاهز للعرض، fallback إلى نص بسيط إن غاب */
export function displayCompanyName(company: Company | null): string {
  return company?.name?.trim() || "—";
}

/** الرقم الضريبي بصيغة جاهزة (15 رقماً) */
export function displayVatNumber(company: Company | null): string {
  return company?.vat_number?.trim() || "—";
}

/** عنوان مختصر للعرض: "المدينة، الدولة" أو "—" */
export function displayShortAddress(company: Company | null): string {
  if (!company) return "—";
  const parts = [company.city, company.country === "SA" ? "المملكة العربية السعودية" : company.country]
    .filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join("، ") : "—";
}

/** عنوان كامل للطباعة: "الشارع، الحي، المدينة، الرمز البريدي، الدولة" */
export function displayFullAddress(company: Company | null): string {
  if (!company) return "—";
  const parts = [
    company.street_address,
    company.district,
    company.city,
    company.postal_code,
    company.country === "SA" ? "المملكة العربية السعودية" : company.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.length ? parts.join("، ") : "—";
}

/** تذييل قياسي للطباعة "الاسم · المدينة · الدولة" */
export function displayPrintFooter(company: Company | null): string {
  if (!company) return "";
  const parts = [
    company.name,
    company.city,
    company.country === "SA" ? "المملكة العربية السعودية" : company.country,
  ].filter((p) => p && p.trim().length > 0);
  return parts.join(" · ");
}

/** تحقق نمط الرقم الضريبي السعودي: 15 رقماً، يبدأ وينتهي بـ 3 */
export function isValidSaudiVat(vat: string): boolean {
  return /^3\d{13}3$/.test(vat);
}
