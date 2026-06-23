// ============================================================
// ZatcaApi — Mock Implementation (S1.4.0)
// ============================================================
// الغرض: محاكاة كاملة لعقد API الزكاة والضريبة لاختبار الواجهة
// (Onboarding Wizard / Credentials / Compliance / Certificate Status)
// بصرياً وسلوكياً، دون انتظار بناء Service Layer الحقيقي (S2-S5).
//
// عند جاهزية الـ Service Layer الحقيقي:
//   - يُستبدل محتوى هذا الملف فقط بنداءات fetch() حقيقية على
//     /api/zatca/onboarding/* (راجع عقد S1.4.0)
//   - لا حاجة لتعديل أي React component يستخدم ZatcaApi، لأن
//     التوقيعات (الإدخال/الإخراج) ثابتة.
//
// طريقة الاستخدام: import { ZatcaApi } from "@/lib/zatca/zatcaApi";
// (المسار النهائي يُحدَّد حسب بنية مجلدات المشروع الفعلية)
// ============================================================

// ---------- الأنواع (Types) — مطابقة للعقد المعتمد ----------

export type OnboardingStatus =
  | "not_started"
  | "otp_requested"
  | "csr_generated"
  | "ccsid_received"
  | "compliance_in_progress"
  | "compliance_passed"
  | "pcsid_received"
  | "completed"
  | "failed"
  | "cancelled";

export type ZatcaEnvironment = "sandbox" | "simulation" | "production";

export type ZatcaErrorCategory =
  | "validation"
  | "hashing"
  | "signature"
  | "authentication"
  | "business"
  | "network"
  | "server";

export interface ZatcaErrorShape {
  code: string;
  category: ZatcaErrorCategory;
  severity: "error" | "warning" | "info";
  retryable: boolean;
  arabic_message: string;
}

export type CsrSubStatus = "not_started" | "csr_generated" | "request_submitted" | "ccsid_received";

export interface ZatcaOnboardingStatusResponse {
  session_id: string;
  onboarding_status: OnboardingStatus;
  environment: ZatcaEnvironment;
  common_name?: string;
  egs_serial_number?: string;
  otp_requested_at?: string;
  csr_generated_at?: string;
  ccsid_received_at?: string;
  pcsid_received_at?: string;
  csr_sub_status?: CsrSubStatus;
  compliance_progress?: number; // 0..100
  error?: ZatcaErrorShape;
}

// سجل الجلسات append-only — لا تُحذف أي جلسة، فقط تُضاف جلسات جديدة
export interface ZatcaOnboardingSessionSummary {
  session_id: string;
  onboarding_status: OnboardingStatus;
  environment: ZatcaEnvironment;
  created_at: string;
  common_name?: string;
}

export type ComplianceTestType =
  | "standard_invoice"
  | "standard_credit_note"
  | "standard_debit_note"
  | "simplified_invoice"
  | "simplified_credit_note"
  | "simplified_debit_note";

export interface ComplianceTestResult {
  test_type: ComplianceTestType;
  passed: boolean;
  error?: ZatcaErrorShape;
}

// ZatcaCredential — العقد النهائي للحقول، مطابق لأسماء الأعمدة في
// zatca_credentials (ZATCA3/ZATCA4) ليكون استبدال الـ Mock بـ Service Layer
// شبه مباشر بلا تحويل أسماء.
export type ZatcaCredentialStatus = "pending" | "active" | "rotating" | "revoked" | "expired";

export interface ZatcaCredential {
  id: string;                         // كان credential_id — موحَّد مع PK في DB
  credential_type: "CCSID" | "PCSID";
  environment: ZatcaEnvironment;
  status: ZatcaCredentialStatus;
  serial_number: string;              // EGS Serial Number أو رقم الشهادة من ZATCA
  credential_fingerprint: string;     // مطابق fp:* في DB، يُعرض مقتصراً مع زر نسخ
  issued_at: string;                  // تاريخ الإصدار من ZATCA
  certificate_expiry_at: string;
  last_used_at?: string;              // آخر مرة استُخدمت في توقيع (للحالة active فقط)
  last_rotated_at?: string;
  is_active: boolean;                 // مرآة منطقية لـ status=active (موجودة في DB)
}

export interface ExpiringCredentialRow {
  id: string;
  credential_type: "CCSID" | "PCSID";
  days_until_expiry: number;
  status: string;
}

export interface StartOnboardingInput {
  common_name: string;
  organization_unit_name: string;
  organization_name: string;
  organization_identifier: string; // = vat_number
  invoice_type: string; // مثلاً "1000"
  location: string;
  industry: string;
  environment: ZatcaEnvironment;
}

type ApiResult<T> = T | { error: ZatcaErrorShape };

// ---------- أدوات محاكاة داخلية ----------

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(minMs = 600, maxMs = 1600) {
  return delay(minMs + Math.random() * (maxMs - minMs));
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// مولِّد بصمة وهمية بصيغة "AB:CD:EF:..." (40 رمز سداسي، 20 زوجاً)
// في الواقع تأتي البصمة من SHA-1/SHA-256 للشهادة الفعلية في Service Layer
function makeFingerprint(): string {
  const hex = "0123456789ABCDEF";
  const pairs: string[] = [];
  for (let i = 0; i < 20; i++) {
    pairs.push(hex[Math.floor(Math.random() * 16)] + hex[Math.floor(Math.random() * 16)]);
  }
  return pairs.join(":");
}

// ============================================================
// جدول zatca_error_codes الكامل (نسخة Mock مطابقة لـ 20 رمزاً في DB — ZATCA6.0)
// مرجعي فقط، بدون منطق تلقائي — التصنيف/الربط يبقى في Service Layer
// كما هو القرار المعماري الفعلي (لا RPC، لا trigger هنا أيضاً في الـ Mock).
// ============================================================

export const ZATCA_ERROR_CODES: Record<string, ZatcaErrorShape> = {
  // ---- validation (6) — جميعها غير قابلة لإعادة المحاولة ----
  "validation-invalid-vat-number": {
    code: "validation-invalid-vat-number", category: "validation", severity: "error",
    retryable: false, arabic_message: "الرقم الضريبي غير صحيح. يجب أن يكون 15 رقماً ويبدأ وينتهي بـ 3.",
  },
  "validation-missing-required-field": {
    code: "validation-missing-required-field", category: "validation", severity: "error",
    retryable: false, arabic_message: "حقل مطلوب غير موجود في بيانات الفاتورة.",
  },
  "validation-invalid-document-type": {
    code: "validation-invalid-document-type", category: "validation", severity: "error",
    retryable: false, arabic_message: "نوع المستند غير صالح أو غير مدعوم.",
  },
  "validation-currency-mismatch": {
    code: "validation-currency-mismatch", category: "validation", severity: "error",
    retryable: false, arabic_message: "عملة الفاتورة لا تطابق العملة المعتمدة للمنشأة.",
  },
  "validation-invalid-date-range": {
    code: "validation-invalid-date-range", category: "validation", severity: "error",
    retryable: false, arabic_message: "تاريخ الفاتورة خارج النطاق المسموح به.",
  },
  "validation-schema-mismatch": {
    code: "validation-schema-mismatch", category: "validation", severity: "error",
    retryable: false, arabic_message: "بنية ملف XML لا تطابق مخطط UBL 2.1 المطلوب.",
  },

  // ---- hashing (2) — غير قابلة لإعادة المحاولة ----
  "hashing-invalid-invoice-hash": {
    code: "hashing-invalid-invoice-hash", category: "hashing", severity: "error",
    retryable: false, arabic_message: "تجزئة الفاتورة (Invoice Hash) غير صحيحة.",
  },
  "hashing-invalid-pih": {
    code: "hashing-invalid-pih", category: "hashing", severity: "error",
    retryable: false, arabic_message: "تجزئة الفاتورة السابقة (PIH) غير متطابقة مع رأس السلسلة الحالي.",
  },

  // ---- signature (3) — غير قابلة لإعادة المحاولة ----
  "signature-invalid-signature": {
    code: "signature-invalid-signature", category: "signature", severity: "error",
    retryable: false, arabic_message: "توقيع XAdES غير صالح أو لا يطابق الشهادة المسجّلة.",
  },
  "signature-certificate-expired": {
    code: "signature-certificate-expired", category: "signature", severity: "error",
    retryable: false, arabic_message: "شهادة التوقيع منتهية الصلاحية. يلزم تجديد الشهادة أولاً.",
  },
  "signature-certificate-revoked": {
    code: "signature-certificate-revoked", category: "signature", severity: "error",
    retryable: false, arabic_message: "شهادة التوقيع مُلغاة. يلزم استخراج شهادة جديدة.",
  },

  // ---- business (1) — غير قابل لإعادة المحاولة ----
  "business-duplicate-invoice": {
    code: "business-duplicate-invoice", category: "business", severity: "error",
    retryable: false, arabic_message: "هذه الفاتورة مُسجَّلة مسبقاً لدى الهيئة (تكرار).",
  },
  "business-compliance-rejected": {
    code: "business-compliance-rejected", category: "business", severity: "error",
    retryable: true, arabic_message: "فشل اختبار الامتثال. راجع تفاصيل الفاتورة الاختبارية وحاول مرة أخرى.",
  },
  "business-onboarding-prerequisite-missing": {
    code: "business-onboarding-prerequisite-missing", category: "business", severity: "error",
    retryable: false, arabic_message: "يجب إكمال جميع اختبارات الامتثال أولاً قبل الترقية للإنتاج.",
  },

  // ---- authentication (1 retryable + 2 non-retryable) ----
  "authentication-unauthorized": {
    code: "authentication-unauthorized", category: "authentication", severity: "error",
    retryable: true, arabic_message: "فشل التحقق من الهوية. يرجى إعادة المحاولة.",
  },
  "authentication-invalid-otp": {
    code: "authentication-invalid-otp", category: "authentication", severity: "error",
    retryable: true, arabic_message: "رمز التحقق (OTP) غير صحيح أو منتهي الصلاحية. يرجى المحاولة مرة أخرى.",
  },
  "authentication-invalid-security-token": {
    code: "authentication-invalid-security-token", category: "authentication", severity: "error",
    retryable: false, arabic_message: "رمز الأمان غير صالح.",
  },
  "authentication-expired-csid": {
    code: "authentication-expired-csid", category: "authentication", severity: "error",
    retryable: false, arabic_message: "شهادة الجهاز (CSID) منتهية الصلاحية.",
  },

  // ---- network (3) — جميعها قابلة لإعادة المحاولة ----
  "network-request-timeout": {
    code: "network-request-timeout", category: "network", severity: "warning",
    retryable: true, arabic_message: "انتهت مهلة الاتصال بخوادم هيئة الزكاة والضريبة والجمارك. يرجى إعادة المحاولة.",
  },
  "network-gateway-timeout": {
    code: "network-gateway-timeout", category: "network", severity: "warning",
    retryable: true, arabic_message: "انتهت مهلة بوابة الاتصال. يرجى إعادة المحاولة بعد قليل.",
  },
  "network-connection-error": {
    code: "network-connection-error", category: "network", severity: "warning",
    retryable: true, arabic_message: "تعذّر الاتصال بخوادم الهيئة. تحقق من الاتصال بالإنترنت.",
  },

  // ---- server (2) — قابلة لإعادة المحاولة ----
  "server-internal-server-error": {
    code: "server-internal-server-error", category: "server", severity: "warning",
    retryable: true, arabic_message: "حدث خطأ داخلي في خوادم الهيئة. يرجى المحاولة لاحقاً.",
  },
  "server-service-unavailable": {
    code: "server-service-unavailable", category: "server", severity: "warning",
    retryable: true, arabic_message: "خدمة هيئة الزكاة والضريبة والجمارك غير متاحة حالياً. يرجى المحاولة بعد قليل.",
  },
};

// إبقاء الاسم القديم MOCK_ERRORS كمرجع مختصر متوافق مع الإصدار السابق من هذا الملف
const MOCK_ERRORS = {
  invalid_vat: ZATCA_ERROR_CODES["validation-invalid-vat-number"],
  otp_invalid: ZATCA_ERROR_CODES["authentication-invalid-otp"],
  network_timeout: ZATCA_ERROR_CODES["network-request-timeout"],
  compliance_failed: ZATCA_ERROR_CODES["business-compliance-rejected"],
  server_unavailable: ZATCA_ERROR_CODES["server-service-unavailable"],
};

// ---- مفتاحا محاكاة مستقلان ----

// 1) أخطاء عشوائية عامة (شبكة/خادم) — لاختبار الصمود والـ Retry
const SIMULATE_RANDOM_FAILURES = false;
const FAILURE_PROBABILITY = 0.15;

// 2) أخطاء تحقق ZATCA محددة (validation/hashing/signature/business) — لاختبار
//    Compliance Tests و Submission Monitor بنفس شكل الأخطاء الحقيقية المتوقعة من Fatoora
export const SIMULATE_ZATCA_VALIDATION_ERRORS = false;

// قائمة دورية لمحاكاة أخطاء تحقق متنوعة عند تفعيل SIMULATE_ZATCA_VALIDATION_ERRORS
const VALIDATION_ERROR_CYCLE: (keyof typeof ZATCA_ERROR_CODES)[] = [
  "hashing-invalid-invoice-hash",
  "signature-invalid-signature",
  "validation-schema-mismatch",
  "business-compliance-rejected",
];
let validationErrorCycleIndex = 0;

function maybeFail(errorKey: keyof typeof MOCK_ERRORS): ZatcaErrorShape | null {
  if (SIMULATE_RANDOM_FAILURES && Math.random() < FAILURE_PROBABILITY) {
    return MOCK_ERRORS[errorKey];
  }
  return null;
}

// تُستخدَم خصيصاً داخل اختبارات الامتثال لمحاكاة فشل بأنواع أخطاء ZATCA الحقيقية
function maybeFailValidation(): ZatcaErrorShape | null {
  if (!SIMULATE_ZATCA_VALIDATION_ERRORS) return null;
  const key = VALIDATION_ERROR_CYCLE[validationErrorCycleIndex % VALIDATION_ERROR_CYCLE.length];
  validationErrorCycleIndex++;
  return ZATCA_ERROR_CODES[key];
}

// ---------- حالة داخلية في الذاكرة (تحاكي zatca_onboarding_sessions) ----------
// ملاحظة: هذه ذاكرة مؤقتة فقط (in-memory)، تُفقد عند إعادة تحميل الصفحة.
// هذا متعمَّد — المحاكاة لا تستخدم أي browser storage (localStorage/sessionStorage)
// التزاماً بقيود الـ artifacts، والـ Service Layer الحقيقي سيستخدم قاعدة البيانات فعلياً.

interface InternalSessionState extends ZatcaOnboardingStatusResponse {
  vat_number?: string;
  created_at: string;
}

let currentSession: InternalSessionState | null = null;

// سجل append-only لكل الجلسات (محاكاة zatca_onboarding_sessions) — لا يُحذف منه أبداً
let sessionHistory: InternalSessionState[] = [];

// تحاكي companies.zatca_environment — تُقرأ مرة واحدة عند فتح الصفحة لعرض البيئة الحالية
let companyZatcaEnvironment: ZatcaEnvironment = "sandbox";

let mockCredentials: ZatcaCredential[] = [
  // ابدأ بلا شهادات — يحاكي عميلاً جديداً لم يُكمل Onboarding بعد
];

let complianceResults: Partial<Record<ComplianceTestType, ComplianceTestResult>> = {};

// نمط الرقم الضريبي السعودي: 15 رقماً، يبدأ وينتهي بـ 3
function isValidSaudiVat(vat: string): boolean {
  return /^3\d{13}3$/.test(vat);
}

// ============================================================
// ZatcaApi
// ============================================================

export class ZatcaApi {
  // ----- الخطوة 1: بدء الجلسة -----
  static async startOnboarding(
    input: StartOnboardingInput
  ): Promise<ApiResult<{ session_id: string }>> {
    await randomDelay();

    if (!isValidSaudiVat(input.organization_identifier)) {
      return { error: MOCK_ERRORS.invalid_vat };
    }

    const failure = maybeFail("network_timeout");
    if (failure) return { error: failure };

    const session_id = makeId("session");
    companyZatcaEnvironment = input.environment;
    currentSession = {
      session_id,
      onboarding_status: "not_started",
      environment: input.environment,
      common_name: input.common_name,
      vat_number: input.organization_identifier,
      csr_sub_status: "not_started",
      created_at: nowIso(),
    };
    sessionHistory.push(currentSession);

    return { session_id };
  }

  // ----- الخطوة 2أ: طلب OTP -----
  static async requestOtp(
    session_id: string
  ): Promise<ApiResult<{ otp_requested_at: string }>> {
    await randomDelay(800, 2000);

    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }

    const failure = maybeFail("network_timeout");
    if (failure) return { error: failure };

    const otp_requested_at = nowIso();
    currentSession.onboarding_status = "otp_requested";
    currentSession.otp_requested_at = otp_requested_at;

    // في الواقع: ZATCA ترسل OTP عبر بوابة Fatoora نفسها (خارج تحكّمنا).
    // هنا فقط نطبع تنبيهاً للمطوّر للمحاكاة.
    console.info("[ZatcaApi MOCK] OTP وهمي للاختبار: 123456");

    return { otp_requested_at };
  }

  // ----- الخطوة 2ب: تأكيد OTP -----
  static async verifyOtp(
    session_id: string,
    otp: string
  ): Promise<ApiResult<{ success: true }>> {
    await randomDelay();

    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }

    // المحاكاة: الرمز الصحيح دائماً 123456
    if (otp !== "123456") {
      return { error: MOCK_ERRORS.otp_invalid };
    }

    return { success: true };
  }

  // ----- الخطوة 3أ: توليد CSR (محلي، سريع) -----
  static async generateCsrRequest(
    session_id: string
  ): Promise<ApiResult<{ csr_generated_at: string }>> {
    await randomDelay(800, 1500);
    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }
    const csr_generated_at = nowIso();
    currentSession.csr_sub_status = "csr_generated";
    currentSession.csr_generated_at = csr_generated_at;
    return { csr_generated_at };
  }

  // ----- الخطوة 3ب: إرسال طلب الشهادة لـ ZATCA -----
  static async submitCertificateRequest(
    session_id: string
  ): Promise<ApiResult<{ submitted_at: string }>> {
    await randomDelay(1200, 2200);
    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }
    const failure = maybeFail("network_timeout");
    if (failure) return { error: failure };

    currentSession.csr_sub_status = "request_submitted";
    return { submitted_at: nowIso() };
  }

  // ----- الخطوة 3ج: استلام CCSID -----
  static async receiveCcsid(
    session_id: string
  ): Promise<ApiResult<{ ccsid_received_at: string }>> {
    await randomDelay(1000, 2000);
    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }
    const failure = maybeFail("server_unavailable");
    if (failure) return { error: failure };

    const ccsid_received_at = nowIso();
    currentSession.onboarding_status = "ccsid_received";
    currentSession.csr_sub_status = "ccsid_received";
    currentSession.ccsid_received_at = ccsid_received_at;
    const egs_serial = makeId("EGS");
    currentSession.egs_serial_number = egs_serial;

    mockCredentials.push({
      id: makeId("cred"),
      credential_type: "CCSID",
      environment: currentSession.environment,
      status: "active",
      serial_number: egs_serial,
      credential_fingerprint: makeFingerprint(),
      issued_at: ccsid_received_at,
      certificate_expiry_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      last_used_at: undefined, // لم تُستخدم بعد
      is_active: true,
    });

    return { ccsid_received_at };
  }

  // ----- (محفوظة للتوافق الخلفي) تشغّل الثلاث خطوات تتابعياً -----
  static async generateCsr(
    session_id: string
  ): Promise<ApiResult<{ ccsid_received_at: string }>> {
    const r1 = await ZatcaApi.generateCsrRequest(session_id);
    if ("error" in r1) return r1;
    const r2 = await ZatcaApi.submitCertificateRequest(session_id);
    if ("error" in r2) return r2;
    return ZatcaApi.receiveCcsid(session_id);
  }

  // ----- الخطوة 4: اختبار امتثال واحد -----
  static async runComplianceTest(
    session_id: string,
    test_type: ComplianceTestType
  ): Promise<ApiResult<ComplianceTestResult>> {
    await randomDelay(1000, 2500);

    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }

    currentSession.onboarding_status = "compliance_in_progress";

    // أولاً: أخطاء تحقق ZATCA المحددة (إن كانت مفعّلة)، ثم الأخطاء العشوائية العامة
    const failure = maybeFailValidation() ?? maybeFail("compliance_failed");
    if (failure) {
      const result: ComplianceTestResult = { test_type, passed: false, error: failure };
      complianceResults[test_type] = result;
      return result;
    }

    const result: ComplianceTestResult = { test_type, passed: true };
    complianceResults[test_type] = result;

    // إذا نجحت كل الاختبارات الستة، حدّث حالة الجلسة
    const allTypes: ComplianceTestType[] = [
      "standard_invoice",
      "standard_credit_note",
      "standard_debit_note",
      "simplified_invoice",
      "simplified_credit_note",
      "simplified_debit_note",
    ];
    const allPassed = allTypes.every((t) => complianceResults[t]?.passed);
    if (allPassed) {
      currentSession.onboarding_status = "compliance_passed";
    }

    return result;
  }

  // ----- تشغيل كل اختبارات الامتثال دفعة واحدة، مع تقدّم حقيقي 0..100 -----
  // onProgress: استدعاء اختياري يُبلِّغ الواجهة بنسبة التقدّم بعد كل اختبار
  static async runAllComplianceTests(
    session_id: string,
    onProgress?: (progress: number, completedTest: ComplianceTestType) => void
  ): Promise<{ results: ComplianceTestResult[] }> {
    const allTypes: ComplianceTestType[] = [
      "standard_invoice",
      "standard_credit_note",
      "standard_debit_note",
      "simplified_invoice",
      "simplified_credit_note",
      "simplified_debit_note",
    ];

    if (currentSession) currentSession.compliance_progress = 0;

    const results: ComplianceTestResult[] = [];
    for (let i = 0; i < allTypes.length; i++) {
      const t = allTypes[i];
      const r = await ZatcaApi.runComplianceTest(session_id, t);
      const result = "error" in r ? { test_type: t, passed: false, error: r.error } : r;
      results.push(result);

      const progress = Math.round(((i + 1) / allTypes.length) * 100);
      if (currentSession) currentSession.compliance_progress = progress;
      onProgress?.(progress, t);
    }
    return { results };
  }

  // ----- قراءة نسبة التقدّم الحالية (للاستخدام عند polling من الواجهة) -----
  static async getComplianceProgress(): Promise<number> {
    return currentSession?.compliance_progress ?? 0;
  }

  // ----- الخطوة 5: الترقية للإنتاج (PCSID) -----
  static async activateProduction(
    session_id: string
  ): Promise<ApiResult<{ id: string }>> {
    await randomDelay(1500, 3000);

    if (!currentSession || currentSession.session_id !== session_id) {
      return { error: MOCK_ERRORS.server_unavailable };
    }

    if (currentSession.onboarding_status !== "compliance_passed") {
      return {
        error: {
          code: "business-onboarding-prerequisite-missing",
          category: "business",
          severity: "error",
          retryable: false,
          arabic_message: "يجب إكمال جميع اختبارات الامتثال أولاً قبل الترقية للإنتاج.",
        },
      };
    }

    const failure = maybeFail("server_unavailable");
    if (failure) return { error: failure };

    const pcsid_received_at = nowIso();
    currentSession.onboarding_status = "pcsid_received";
    currentSession.pcsid_received_at = pcsid_received_at;

    const id = makeId("cred");
    mockCredentials.push({
      id,
      credential_type: "PCSID",
      environment: "production",
      status: "active",
      serial_number: makeId("EGS-PROD"),
      credential_fingerprint: makeFingerprint(),
      issued_at: pcsid_received_at,
      certificate_expiry_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      last_used_at: undefined,
      is_active: true,
    });

    // اكتمال الرحلة بالكامل
    currentSession.onboarding_status = "completed";

    return { id };
  }

  // ----- حالة الجلسة الحالية -----
  static async getOnboardingStatus(): Promise<ZatcaOnboardingStatusResponse> {
    await delay(300);
    if (!currentSession) {
      return {
        session_id: "",
        onboarding_status: "not_started",
        environment: companyZatcaEnvironment,
      };
    }
    return { ...currentSession };
  }

  // ----- سجل كل الجلسات (append-only، يحاكي zatca_onboarding_sessions كاملاً) -----
  static async getOnboardingSessions(): Promise<ZatcaOnboardingSessionSummary[]> {
    await delay(300);
    return sessionHistory.map((s) => ({
      session_id: s.session_id,
      onboarding_status: s.onboarding_status,
      environment: s.environment,
      created_at: s.created_at,
      common_name: s.common_name,
    }));
  }

  // ----- بيئة الشركة الحالية (تحاكي companies.zatca_environment) -----
  static async getCompanyEnvironment(): Promise<ZatcaEnvironment> {
    await delay(150);
    return companyZatcaEnvironment;
  }

  // ===== Credentials Tab =====
  static async listCredentials(): Promise<ZatcaCredential[]> {
    await randomDelay(300, 800);
    // ترتيب: active أولاً، ثم rotating، pending، expired، revoked
    const order: Record<ZatcaCredentialStatus, number> = {
      active: 0, rotating: 1, pending: 2, expired: 3, revoked: 4,
    };
    return [...mockCredentials].sort((a, b) => order[a.status] - order[b.status]);
  }

  static async getCredentialDetails(id: string): Promise<ZatcaCredential | null> {
    await delay(200);
    return mockCredentials.find((c) => c.id === id) ?? null;
  }

  static async rotateCredential(
    id: string
  ): Promise<ApiResult<{ new_session_id: string }>> {
    await randomDelay();
    const cred = mockCredentials.find((c) => c.id === id);
    if (!cred) {
      return { error: MOCK_ERRORS.server_unavailable };
    }
    // ZATCA4 الخيار A: active → rotating (is_active يبقى true حتى تفعيل البديلة)
    cred.status = "rotating";
    cred.last_rotated_at = nowIso();
    const new_session_id = makeId("session");
    return { new_session_id };
  }

  static async revokeCredential(
    id: string,
    _reason: string
  ): Promise<ApiResult<{ success: true }>> {
    await randomDelay();
    const cred = mockCredentials.find((c) => c.id === id);
    if (!cred) {
      return { error: MOCK_ERRORS.server_unavailable };
    }
    cred.status = "revoked";
    cred.is_active = false; // ZATCA4: revoked/expired/pending/rotating لا تكون is_active=true
    return { success: true };
  }

  // ===== Certificate Status Tab =====
  static async getExpiringCredentials(): Promise<ExpiringCredentialRow[]> {
    await randomDelay(300, 800);
    const now = Date.now();
    return mockCredentials
      .filter((c) => c.status === "active" || c.status === "rotating")
      .map((c) => ({
        id: c.id,
        credential_type: c.credential_type,
        days_until_expiry: Math.ceil(
          (new Date(c.certificate_expiry_at).getTime() - now) / (1000 * 60 * 60 * 24)
        ),
        status: c.status,
      }));
  }

  // ----- أداة مساعدة للاختبار: إعادة ضبط كامل الحالة -----
  static __resetMockState() {
    currentSession = null;
    sessionHistory = [];
    mockCredentials = [];
    complianceResults = {};
    companyZatcaEnvironment = "sandbox";
  }
}
