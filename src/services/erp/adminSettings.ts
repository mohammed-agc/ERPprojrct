/**
 * Admin settings persistence layer.
 * Stored in localStorage to align with the rest of the ERP modules.
 *
 * ملاحظة: بيانات الشركة (CompanyInfo) تظهر في الفاتورة الضريبية وتخضع لمتطلّبات
 * هيئة الزكاة والضريبة والجمارك (ZATCA). الحقول الإلزامية للبائع تشمل:
 *  - الرقم الضريبي (15 خانة)
 *  - السجل التجاري CRN
 *  - العنوان الوطني السعودي: رقم المبنى (4)، الشارع، الحي، المدينة، الرمز البريدي (5)
 */

const KEY = "sarat.admin.settings.v1";

export interface CompanyInfo {
  // ── الهوية ──
  name_ar: string;
  name_en: string;
  logo_url: string;
  // ── التسجيل الضريبي والتجاري (ZATCA) ──
  vat_number: string;        // الرقم الضريبي — 15 خانة، يبدأ بـ 3
  cr_number: string;         // السجل التجاري (CRN)
  momrah_license: string;    // ترخيص الشؤون البلدية (MOMRAH) — اختياري
  mhrsd_license: string;     // ترخيص الموارد البشرية (MHRSD) — اختياري
  // ── العنوان الوطني السعودي (National Address) ──
  building_no: string;       // رقم المبنى — 4 خانات
  street: string;            // اسم الشارع
  secondary_no: string;      // الرقم الإضافي/الفرعي — 4 خانات
  district: string;          // الحي
  city: string;              // المدينة
  postal_code: string;       // الرمز البريدي — 5 خانات
  country_code: string;      // رمز الدولة — SA
  // ── التواصل ──
  phone: string;
  email: string;
  website: string;
  // ── المعلومات المصرفية (اختياري — تُطبع أحياناً على الفاتورة) ──
  bank_name: string;
  iban: string;
  // ── حقل قديم محتفظ به للتوافق العكسي (سطر عنوان حر) ──
  address: string;
}

export interface Branch {
  id: string;
  code: string;
  name_ar: string;
  city: string;
  phone: string;
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name_ar: string;
  branch_id: string | null;
  type: "vehicles" | "parts" | "mixed";
  is_active: boolean;
}

export interface TaxSettings {
  default_vat_pct: number;
  vat_registration_no: string;
  inclusive_default: boolean;
}

export interface NumberSequence {
  doc_type: string;
  prefix: string;
  start: number;
  length: number;
}

export interface PrintTemplate {
  doc_type: string;
  header_text: string;
  footer_text: string;
  show_logo: boolean;
  show_vat: boolean;
}

export interface AdminSettings {
  company: CompanyInfo;
  branches: Branch[];
  warehouses: Warehouse[];
  tax: TaxSettings;
  sequences: NumberSequence[];
  templates: PrintTemplate[];
}

const DEFAULTS: AdminSettings = {
  company: {
    name_ar: "مؤسسة أرض المبارك للسيارات",
    name_en: "Ard Al-Mubarak Motors",
    logo_url: "",
    vat_number: "",
    cr_number: "",
    momrah_license: "",
    mhrsd_license: "",
    building_no: "",
    street: "",
    secondary_no: "",
    district: "",
    city: "",
    postal_code: "",
    country_code: "SA",
    phone: "",
    email: "",
    website: "",
    bank_name: "",
    iban: "",
    address: "",
  },
  branches: [
    { id: "br-main", code: "BR-01", name_ar: "الفرع الرئيسي", city: "جدة", phone: "", is_active: true },
  ],
  warehouses: [
    { id: "wh-vehicles", code: "WH-VEH", name_ar: "مستودع المركبات", branch_id: "br-main", type: "vehicles", is_active: true },
    { id: "wh-parts", code: "WH-PRT", name_ar: "مستودع قطع الغيار", branch_id: "br-main", type: "parts", is_active: true },
  ],
  tax: {
    default_vat_pct: 15,
    vat_registration_no: "",
    inclusive_default: false,
  },
  sequences: [
    { doc_type: "PR", prefix: "PR-", start: 1001, length: 4 },
    { doc_type: "PO", prefix: "PO-", start: 1001, length: 4 },
    { doc_type: "GRN", prefix: "GRN-", start: 1001, length: 4 },
    { doc_type: "PI", prefix: "PI-", start: 1001, length: 4 },
    { doc_type: "SO", prefix: "SO-", start: 1001, length: 4 },
    { doc_type: "SI", prefix: "SI-", start: 1001, length: 4 },
    { doc_type: "RC", prefix: "RC-", start: 1001, length: 4 },
    { doc_type: "PY", prefix: "PY-", start: 1001, length: 4 },
  ],
  templates: [
    { doc_type: "SI", header_text: "فاتورة ضريبية", footer_text: "شكراً لتعاملكم معنا", show_logo: true, show_vat: true },
    { doc_type: "PO", header_text: "أمر شراء", footer_text: "", show_logo: true, show_vat: true },
    { doc_type: "GRN", header_text: "إشعار استلام بضاعة", footer_text: "", show_logo: true, show_vat: false },
  ],
};

function read(): AdminSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    // الدمج العميق لـ company يضمن وجود الحقول الجديدة حتى لو كان المخزّن قديماً
    return {
      ...DEFAULTS,
      ...parsed,
      company: { ...DEFAULTS.company, ...(parsed.company || {}) },
      tax: { ...DEFAULTS.tax, ...(parsed.tax || {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function write(s: AdminSettings) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(s));
}

export const adminSettings = {
  get: () => read(),
  saveCompany: (c: CompanyInfo) => { const s = read(); s.company = c; write(s); },
  saveBranches: (b: Branch[]) => { const s = read(); s.branches = b; write(s); },
  saveWarehouses: (w: Warehouse[]) => { const s = read(); s.warehouses = w; write(s); },
  saveTax: (t: TaxSettings) => { const s = read(); s.tax = t; write(s); },
  saveSequences: (q: NumberSequence[]) => { const s = read(); s.sequences = q; write(s); },
  saveTemplates: (t: PrintTemplate[]) => { const s = read(); s.templates = t; write(s); },
};
