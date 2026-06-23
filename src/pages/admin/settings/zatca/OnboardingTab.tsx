// ============================================================
// OnboardingTab.tsx — S1.4.2 (نسخة مدمجة في ZatcaSettings)
// ============================================================
// نفس محتوى الـ Wizard، لكن بدون شريط البيئة وسجل الجلسات،
// لأنهما يُعرَضان في الصفحة الأم ZatcaSettings.tsx بين كل التبويبات.
// ============================================================

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  ZatcaApi,
  type OnboardingStatus,
  type ZatcaErrorShape,
  type ComplianceTestType,
  type ComplianceTestResult,
  type CsrSubStatus,
} from "@/lib/zatca/zatcaApi";

// ---------- خريطة الخطوات إلى onboarding_status ----------

type WizardStep = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<WizardStep, string> = {
  1: "معلومات الجهاز",
  2: "طلب رمز التحقق (OTP)",
  3: "توليد الشهادة (CSR)",
  4: "اختبارات الامتثال",
  5: "الترقية للإنتاج",
};

const COMPLIANCE_TEST_LABELS: Record<ComplianceTestType, string> = {
  standard_invoice: "فاتورة ضريبية (Standard Invoice)",
  standard_credit_note: "إشعار دائن (Standard Credit Note)",
  standard_debit_note: "إشعار مدين (Standard Debit Note)",
  simplified_invoice: "فاتورة مبسّطة (Simplified Invoice)",
  simplified_credit_note: "إشعار دائن مبسّط (Simplified Credit Note)",
  simplified_debit_note: "إشعار مدين مبسّط (Simplified Debit Note)",
};

const ALL_COMPLIANCE_TESTS: ComplianceTestType[] = [
  "standard_invoice",
  "standard_credit_note",
  "standard_debit_note",
  "simplified_invoice",
  "simplified_credit_note",
  "simplified_debit_note",
];

function statusToStep(status: OnboardingStatus): WizardStep {
  switch (status) {
    case "not_started":
      return 1;
    case "otp_requested":
      return 2;
    case "csr_generated":
    case "ccsid_received":
      return 3;
    case "compliance_in_progress":
    case "compliance_passed":
      return 4;
    case "pcsid_received":
    case "completed":
      return 5;
    default:
      return 1;
  }
}

// ---------- مكوّن عرض الخطأ (موحّد لكل الخطوات) ----------

function ErrorBanner({ error }: { error: ZatcaErrorShape }) {
  return (
    <div
      role="alert"
      className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      <div className="flex items-start justify-between gap-3">
        <span>{error.arabic_message}</span>
        {error.retryable && (
          <span className="whitespace-nowrap rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            يمكن إعادة المحاولة
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-[11px] text-red-400">{error.code}</div>
    </div>
  );
}

// ---------- مؤشر الخطوات (Stepper Header) — بلا إمكانية النقر للتجاوز ----------
// القفل هنا تمثيلي للواجهة فقط؛ التحقق الحقيقي والإلزامي يبقى من مسؤولية
// advance_onboarding() في قاعدة البيانات (لا يمكن لأي تلاعب في الواجهة تجاوزه).

function StepperHeader({
  current,
  maxReached,
}: {
  current: WizardStep;
  maxReached: WizardStep;
}) {
  const steps: WizardStep[] = [1, 2, 3, 4, 5];
  return (
    <div className="mb-8 flex items-center justify-between" dir="rtl">
      {steps.map((step, idx) => {
        const isDone = step < current;
        const isActive = step === current;
        const isLocked = step > maxReached;
        return (
          <div key={step} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-2">
              <div
                title={isLocked ? "أكمل الخطوة الحالية أولاً للوصول إلى هذه الخطوة" : undefined}
                className={[
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                  isDone
                    ? "bg-[#0f766e] text-white"
                    : isActive
                    ? "border-2 border-[#0f766e] text-[#0f766e]"
                    : isLocked
                    ? "border-2 border-gray-100 text-gray-300"
                    : "border-2 border-gray-200 text-gray-400",
                ].join(" ")}
              >
                {isDone ? "✓" : isLocked ? "🔒" : step}
              </div>
              <span
                className={[
                  "max-w-[90px] text-center text-[11px] leading-tight",
                  isActive ? "font-semibold text-[#0f766e]" : isLocked ? "text-gray-300" : "text-gray-500",
                ].join(" ")}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={[
                  "mx-2 h-0.5 flex-1",
                  step < current ? "bg-[#0f766e]" : "bg-gray-200",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function OnboardingTab() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<WizardStep>(1);
  const [maxReachedStep, setMaxReachedStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ZatcaErrorShape | null>(null);

  function goToStep(target: WizardStep) {
    setStep(target);
    setMaxReachedStep((prev) => (target > prev ? target : prev));
  }

  // الخطوة 3: حالة CSR الفرعية (3 مراحل فعلية)
  const [csrSubStatus, setCsrSubStatus] = useState<CsrSubStatus>("not_started");

  // الخطوة 4: تقدّم الامتثال 0..100
  const [complianceProgress, setComplianceProgress] = useState(0);

  // بيانات الخطوة 1
  const [form, setForm] = useState({
    common_name: "",
    organization_unit_name: "",
    organization_name: "",
    organization_identifier: "", // = vat_number
    invoice_type: "1000",
    location: "",
    industry: "",
    environment: "sandbox" as "sandbox" | "production",
  });

  // الخطوة 2: OTP
  const [otp, setOtp] = useState("");

  // الخطوة 4: نتائج الامتثال
  const [complianceResults, setComplianceResults] = useState<
    Partial<Record<ComplianceTestType, ComplianceTestResult>>
  >({});
  const [runningTest, setRunningTest] = useState<ComplianceTestType | null>(null);

  // عند تحميل التبويب: تحقق إن كانت هناك جلسة قائمة فعلاً (الأم تتولى البيئة والسجل)
  useEffect(() => {
    (async () => {
      const status = await ZatcaApi.getOnboardingStatus();
      if (status.session_id) {
        setSessionId(status.session_id);
        const resumedStep = statusToStep(status.onboarding_status);
        setStep(resumedStep);
        setMaxReachedStep(resumedStep);
        if (status.csr_sub_status) setCsrSubStatus(status.csr_sub_status);
      }
    })();
  }, []);

  // ---------- الخطوة 1: بدء الجلسة ----------
  async function handleStartOnboarding() {
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.startOnboarding(form);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setSessionId(result.session_id);
    // إعلام الأم لتُحدِّث البيئة + سجل الجلسات إن كانت تعرضهما
    window.dispatchEvent(new CustomEvent("zatca:session-created"));
    toast.success("تم بدء إعداد الربط مع هيئة الزكاة والضريبة والجمارك");
    goToStep(2);
  }

  // ---------- الخطوة 2أ: طلب OTP ----------
  async function handleRequestOtp() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.requestOtp(sessionId);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("تم إرسال طلب رمز التحقق. تحقق من بوابة فاتورة (Fatoora) لاستلامه.");
  }

  // ---------- الخطوة 2ب: تأكيد OTP ----------
  async function handleVerifyOtp() {
    if (!sessionId) return;
    if (!otp || otp.length < 4) {
      toast.error("يرجى إدخال رمز التحقق المُستلَم.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.verifyOtp(sessionId, otp);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("تم تأكيد رمز التحقق بنجاح");
    goToStep(3);
  }

  // ---------- الخطوة 3أ: توليد CSR ----------
  async function handleGenerateCsrRequest() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.generateCsrRequest(sessionId);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCsrSubStatus("csr_generated");
    toast.success("تم توليد طلب توقيع الشهادة (CSR)");
  }

  // ---------- الخطوة 3ب: إرسال طلب الشهادة ----------
  async function handleSubmitCertificateRequest() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.submitCertificateRequest(sessionId);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCsrSubStatus("request_submitted");
    toast.success("تم إرسال طلب الشهادة إلى هيئة الزكاة والضريبة والجمارك");
  }

  // ---------- الخطوة 3ج: استلام CCSID ----------
  async function handleReceiveCcsid() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.receiveCcsid(sessionId);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCsrSubStatus("ccsid_received");
    toast.success("تم استلام شهادة الجهاز (CCSID) بنجاح");
    goToStep(4);
  }

  // ---------- الخطوة 4: تشغيل اختبار امتثال واحد ----------
  async function handleRunSingleTest(testType: ComplianceTestType) {
    if (!sessionId) return;
    setError(null);
    setRunningTest(testType);
    const result = await ZatcaApi.runComplianceTest(sessionId, testType);
    setRunningTest(null);

    setComplianceResults((prev) => ({ ...prev, [testType]: result }));

    if (!result.passed && result.error) {
      setError(result.error);
    }
  }

  // ---------- الخطوة 4: تشغيل كل الاختبارات ----------
  async function handleRunAllTests() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    setComplianceProgress(0);

    const { results } = await ZatcaApi.runAllComplianceTests(sessionId, (progress) => {
      setComplianceProgress(progress);
    });
    setLoading(false);

    const resultsMap: Partial<Record<ComplianceTestType, ComplianceTestResult>> = {};
    let lastError: ZatcaErrorShape | undefined;
    for (const r of results) {
      resultsMap[r.test_type] = r;
      if (!r.passed && r.error) lastError = r.error;
    }
    setComplianceResults(resultsMap);

    const allPassed = results.every((r) => r.passed);
    if (allPassed) {
      toast.success("نجحت جميع اختبارات الامتثال");
      goToStep(5);
    } else if (lastError) {
      setError(lastError);
    }
  }

  const allTestsPassed =
    ALL_COMPLIANCE_TESTS.length > 0 &&
    ALL_COMPLIANCE_TESTS.every((t) => complianceResults[t]?.passed);

  // ---------- الخطوة 5: الترقية للإنتاج ----------
  async function handleActivateProduction() {
    if (!sessionId) return;
    setError(null);
    setLoading(true);
    const result = await ZatcaApi.activateProduction(sessionId);
    setLoading(false);

    if ("error" in result) {
      setError(result.error);
      return;
    }
    toast.success("تم تفعيل النظام للإصدار الفعلي مع هيئة الزكاة والضريبة والجمارك 🎉");
  }

  // ============================================================
  // العرض
  // ============================================================

  return (
    <div className="mx-auto max-w-2xl" dir="rtl">
      <StepperHeader current={step} maxReached={maxReachedStep} />

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        {/* ---------- الخطوة 1 ---------- */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">معلومات الجهاز (EGS Unit)</h3>

            <Field label="اسم الجهاز (Common Name)">
              <input
                className="zw-input"
                value={form.common_name}
                onChange={(e) => setForm({ ...form, common_name: e.target.value })}
                placeholder="مثال: EGS-Riyadh-01"
              />
            </Field>

            <Field label="اسم المنشأة">
              <input
                className="zw-input"
                value={form.organization_name}
                onChange={(e) => setForm({ ...form, organization_name: e.target.value })}
              />
            </Field>

            <Field label="الرقم الضريبي (15 رقماً)">
              <input
                className="zw-input"
                value={form.organization_identifier}
                onChange={(e) =>
                  setForm({ ...form, organization_identifier: e.target.value })
                }
                placeholder="300000000000003"
                maxLength={15}
              />
            </Field>

            <Field label="الوحدة التنظيمية">
              <input
                className="zw-input"
                value={form.organization_unit_name}
                onChange={(e) =>
                  setForm({ ...form, organization_unit_name: e.target.value })
                }
              />
            </Field>

            <Field label="الموقع">
              <input
                className="zw-input"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="الرياض، المملكة العربية السعودية"
              />
            </Field>

            <Field label="القطاع">
              <input
                className="zw-input"
                value={form.industry}
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                placeholder="بيع وشراء السيارات"
              />
            </Field>

            <Field label="البيئة">
              <select
                className="zw-input"
                value={form.environment}
                onChange={(e) =>
                  setForm({ ...form, environment: e.target.value as "sandbox" | "production" })
                }
              >
                <option value="sandbox">بيئة تجريبية (Sandbox)</option>
                <option value="production">بيئة الإنتاج (Production)</option>
              </select>
            </Field>

            {error && <ErrorBanner error={error} />}

            <PrimaryButton
              onClick={handleStartOnboarding}
              loading={loading}
              disabled={
                !form.common_name || !form.organization_name || !form.organization_identifier
              }
            >
              بدء الإعداد
            </PrimaryButton>
          </div>
        )}

        {/* ---------- الخطوة 2 ---------- */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">طلب رمز التحقق (OTP)</h3>
            <p className="text-sm text-gray-500">
              اضغط على الزر أدناه لطلب رمز التحقق من بوابة فاتورة (Fatoora)، ثم أدخل
              الرمز المُستلَم لتأكيده.
            </p>

            <SecondaryButton onClick={handleRequestOtp} loading={loading}>
              طلب رمز التحقق
            </SecondaryButton>

            <Field label="رمز التحقق (OTP)">
              <input
                className="zw-input"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                maxLength={6}
                inputMode="numeric"
              />
            </Field>

            {error && <ErrorBanner error={error} />}

            <PrimaryButton onClick={handleVerifyOtp} loading={loading} disabled={!otp}>
              تأكيد الرمز
            </PrimaryButton>
          </div>
        )}

        {/* ---------- الخطوة 3 ---------- */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">توليد شهادة الجهاز (CSR → CCSID)</h3>
            <p className="text-sm text-gray-500">
              تتم هذه العملية على ثلاث مراحل متتالية. لا حاجة لإدخال أي بيانات إضافية.
            </p>

            <CsrSubStepRow
              label="توليد طلب توقيع الشهادة (CSR)"
              done={csrSubStatus !== "not_started"}
              active={csrSubStatus === "not_started"}
            >
              {csrSubStatus === "not_started" && (
                <SecondaryButton onClick={handleGenerateCsrRequest} loading={loading}>
                  توليد CSR
                </SecondaryButton>
              )}
            </CsrSubStepRow>

            <CsrSubStepRow
              label="إرسال طلب الشهادة إلى الهيئة"
              done={csrSubStatus === "request_submitted" || csrSubStatus === "ccsid_received"}
              active={csrSubStatus === "csr_generated"}
            >
              {csrSubStatus === "csr_generated" && (
                <SecondaryButton onClick={handleSubmitCertificateRequest} loading={loading}>
                  إرسال الطلب
                </SecondaryButton>
              )}
            </CsrSubStepRow>

            <CsrSubStepRow
              label="استلام شهادة الجهاز (CCSID)"
              done={csrSubStatus === "ccsid_received"}
              active={csrSubStatus === "request_submitted"}
            >
              {csrSubStatus === "request_submitted" && (
                <PrimaryButton onClick={handleReceiveCcsid} loading={loading}>
                  استلام الشهادة والمتابعة
                </PrimaryButton>
              )}
            </CsrSubStepRow>

            {error && <ErrorBanner error={error} />}
          </div>
        )}

        {/* ---------- الخطوة 4 ---------- */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">اختبارات الامتثال (Compliance)</h3>
            <p className="text-sm text-gray-500">
              يجب إنجاز جميع الاختبارات التالية بنجاح قبل الترقية لبيئة الإنتاج.
            </p>

            <div className="space-y-2">
              {ALL_COMPLIANCE_TESTS.map((t) => {
                const result = complianceResults[t];
                return (
                  <div
                    key={t}
                    className="flex items-center justify-between rounded-md border border-gray-200 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <StatusDot result={result} running={runningTest === t} />
                      <span className="text-sm">{COMPLIANCE_TEST_LABELS[t]}</span>
                    </div>
                    <button
                      className="text-xs font-medium text-[#0f766e] hover:underline disabled:text-gray-300"
                      onClick={() => handleRunSingleTest(t)}
                      disabled={runningTest !== null || loading}
                    >
                      {result?.passed ? "إعادة الاختبار" : "تشغيل"}
                    </button>
                  </div>
                );
              })}
            </div>

            {error && <ErrorBanner error={error} />}

            {loading && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-gray-500">
                  <span>جارٍ تنفيذ الاختبارات…</span>
                  <span>{complianceProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full bg-[#0f766e] transition-all duration-300"
                    style={{ width: `${complianceProgress}%` }}
                  />
                </div>
              </div>
            )}

            <SecondaryButton onClick={handleRunAllTests} loading={loading}>
              تشغيل جميع الاختبارات
            </SecondaryButton>

            {allTestsPassed && (
              <PrimaryButton onClick={() => goToStep(5)} loading={false}>
                المتابعة إلى الترقية للإنتاج
              </PrimaryButton>
            )}
          </div>
        )}

        {/* ---------- الخطوة 5 ---------- */}
        {step === 5 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-900">الترقية إلى بيئة الإنتاج (PCSID)</h3>
            <p className="text-sm text-gray-500">
              هذه الخطوة النهائية تُفعِّل النظام لإصدار الفواتير الإلكترونية الفعلية
              ومشاركتها مع هيئة الزكاة والضريبة والجمارك. لا يمكن التراجع عن هذه الخطوة
              من هذه الشاشة، ويتطلب التراجع طلب إلغاء شهادة جديد.
            </p>

            {error && <ErrorBanner error={error} />}

            <PrimaryButton onClick={handleActivateProduction} loading={loading}>
              تفعيل بيئة الإنتاج
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// عناصر مساعدة صغيرة (بدون اعتماديات خارجية، لتعمل مهما كانت مكتبة
// المكوّنات النهائية لديك — استبدلها بـ shadcn/ui Input/Button مباشرة
// إن رغبت، نفس المنطق)
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  loading,
  disabled,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full rounded-md bg-[#0f766e] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? "جارٍ التنفيذ…" : children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  loading,
  children,
}: {
  onClick: () => void;
  loading: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="w-full rounded-md border border-[#0f766e] px-4 py-2.5 text-sm font-semibold text-[#0f766e] transition-colors hover:bg-[#0f766e]/5 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {loading ? "جارٍ التنفيذ…" : children}
    </button>
  );
}

function CsrSubStepRow({
  label,
  done,
  active,
  children,
}: {
  label: string;
  done: boolean;
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={[
        "flex items-center justify-between rounded-md border px-4 py-3",
        active ? "border-[#0f766e]/40 bg-[#0f766e]/5" : "border-gray-200",
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          className={[
            "flex h-6 w-6 items-center justify-center rounded-full text-xs",
            done ? "bg-[#0f766e] text-white" : active ? "border-2 border-[#0f766e]" : "border-2 border-gray-200 text-gray-300",
          ].join(" ")}
        >
          {done ? "✓" : ""}
        </span>
        <span className="text-sm text-gray-700">{label}</span>
      </div>
      {children}
    </div>
  );
}

function StatusDot({
  result,
  running,
}: {
  result?: ComplianceTestResult;
  running: boolean;
}) {
  if (running) {
    return <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-amber-400" />;
  }
  if (!result) {
    return <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />;
  }
  return (
    <span
      className={[
        "h-2.5 w-2.5 rounded-full",
        result.passed ? "bg-emerald-500" : "bg-red-500",
      ].join(" ")}
    />
  );
}

/*
  ملاحظة CSS مطلوبة (أضفها لملف الأنماط العام، مرة واحدة فقط):

  .zw-input {
    width: 100%;
    border: 1px solid #e5e7eb;
    border-radius: 0.375rem;
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
    outline: none;
  }
  .zw-input:focus {
    border-color: #0f766e;
    box-shadow: 0 0 0 2px rgba(15, 118, 110, 0.15);
  }
*/
