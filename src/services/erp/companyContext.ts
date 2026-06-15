/**
 * CompanyContextService — السياق الحالي للشركة.
 *
 * مبدأ معماري: النظام single-company الآن، لكن company-aware.
 * الشركة تُجلب ديناميكياً دائماً (code='DEFAULT' AND is_active=true).
 * لا UUID مكتوب بالكود، لا افتراض company_id=1.
 *
 * مستقبلاً (multi-company): تُعاد كتابة getCurrent() لتُرجع شركة المستخدم/المستأجر
 * الحالي — دون الحاجة لتعديل الخدمات التي تستهلك هذا السياق.
 */

import { supabase } from "@/integrations/supabase/client";

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
}

// كاش بسيط داخل الجلسة لتفادي استعلام متكرّر (الشركة لا تتغيّر أثناء الجلسة)
let _cache: Company | null = null;
let _inflight: Promise<Company> | null = null;

export const companyContext = {
  /**
   * الشركة الحالية (الافتراضية حالياً).
   * يُجلب ديناميكياً: code='DEFAULT' AND is_active=true.
   */
  async getCurrent(): Promise<Company> {
    if (_cache) return _cache;
    if (_inflight) return _inflight;

    _inflight = (async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("code", "DEFAULT")
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("لا توجد شركة افتراضية نشطة (code='DEFAULT'). شغّل migration الشركة.");
      _cache = data as Company;
      return _cache;
    })();

    try {
      return await _inflight;
    } finally {
      _inflight = null;
    }
  },

  /** معرّف الشركة الحالية (ديناميكي) */
  async getCompanyId(): Promise<string> {
    const c = await this.getCurrent();
    return c.id;
  },

  /** إعدادات/افتراضيات الشركة (العملة، الدولة، الضريبي...) */
  async getDefaults(): Promise<Pick<Company, "currency_code" | "country" | "vat_number">> {
    const c = await this.getCurrent();
    return { currency_code: c.currency_code, country: c.country, vat_number: c.vat_number };
  },

  /** إبطال الكاش (يُستدعى عند تعديل بيانات الشركة) */
  clearCache(): void {
    _cache = null;
  },
};
