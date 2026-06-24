// ============================================================
// ComplianceTab.tsx — S1.4.4
// ============================================================
// أداة تشخيصية لحالة الربط مع ZATCA بعد اكتمال Onboarding.
//
// ليست نسخة من خطوة 4 في Wizard:
//   - تعمل بعد اكتمال Onboarding (Wizard خاص بمرحلة الإعداد فقط)
//   - تقيس response_time_ms لكل اختبار
//   - تحتفظ بـ "آخر تشغيل" لكل اختبار (سيصبح زمنياً في DB كـ
//     zatca_compliance_test_log في S1.4.4.1)
//   - تحدّث Last Successful Submission و Last Error على Health Check
//   - تستخدم Templates ثابتة (لا فواتير حقيقية من invoices)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ZatcaApi,
  type ZatcaHealthCheck,
  type DiagnosticTestRow,
  type ComplianceTestType,
  type ZatcaErrorShape,
  type ZatcaEnvironment,
} from "@/lib/zatca/zatcaApi";

// ---------- ثوابت العرض ----------

const TEST_LABELS: Record<ComplianceTestType, string> = {
  standard_invoice: "فاتورة ضريبية (Standard Invoice)",
  standard_credit_note: "إشعار دائن (Standard Credit Note)",
  standard_debit_note: "إشعار مدين (Standard Debit Note)",
  simplified_invoice: "فاتورة مبسّطة (Simplified Invoice)",
  simplified_credit_note: "إشعار دائن مبسّط (Simplified Credit Note)",
  simplified_debit_note: "إشعار مدين مبسّط (Simplified Debit Note)",
};

const ENV_LABELS: Record<ZatcaEnvironment, string> = {
  sandbox: "تجريبية",
  simulation: "محاكاة",
  production: "إنتاج",
};

const ALL_TEST_TYPES: ComplianceTestType[] = [
  "standard_invoice",
  "standard_credit_note",
  "standard_debit_note",
  "simplified_invoice",
  "simplified_credit_note",
  "simplified_debit_note",
];

// ---------- مساعدات ----------

function formatRelativeTime(iso?: string): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `قبل ${diffHr} ساعة`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `قبل ${diffDay} يوماً`;
  return new Date(iso).toLocaleDateString("ar-SA");
}

function formatLatency(ms?: number): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} مللي ثانية`;
  return `${(ms / 1000).toFixed(2)} ثانية`;
}

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function ComplianceTab() {
  const [health, setHealth] = useState<ZatcaHealthCheck | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [tests, setTests] = useState<DiagnosticTestRow[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [runningTest, setRunningTest] = useState<ComplianceTestType | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [progress, setProgress] = useState(0);
  const [detailsFor, setDetailsFor] = useState<DiagnosticTestRow | null>(null);

  async function loadHealth() {
    setHealthLoading(true);
    const h = await ZatcaApi.getZatcaHealthCheck();
    setHealth(h);
    setHealthLoading(false);
  }

  async function loadTests() {
    setTestsLoading(true);
    const t = await ZatcaApi.getDiagnosticResults();
    setTests(t);
    setTestsLoading(false);
  }

  useEffect(() => {
    loadHealth();
    loadTests();
  }, []);

  async function handleRunSingle(testType: ComplianceTestType) {
    setRunningTest(testType);
    const result = await ZatcaApi.runDiagnosticTest(testType);
    setRunningTest(null);

    setTests((prev) => prev.map((r) => (r.test_type === testType ? result : r)));

    if (result.status === "passed") {
      toast.success(`اجتاز الاختبار: ${TEST_LABELS[testType]}`);
    } else {
      toast.error(result.error?.arabic_message ?? "فشل الاختبار");
    }

    // إعادة قراءة Health Check لتحديث آخر إرسال ناجح / آخر خطأ
    loadHealth();
  }

  async function handleRunAll() {
    setRunningAll(true);
    setProgress(0);
    const { results } = await ZatcaApi.runAllDiagnosticTests((p) => setProgress(p));
    setTests(results);
    setRunningAll(false);

    const passed = results.filter((r) => r.status === "passed").length;
    const failed = results.filter((r) => r.status === "failed").length;
    if (failed === 0) {
      toast.success(`اجتازت جميع الاختبارات (${passed}/${results.length})`);
    } else {
      toast.error(`فشل ${failed} من أصل ${results.length} اختبارات`);
    }
    loadHealth();
  }

  // إحصاءات مختصرة فوق الجدول
  const stats = useMemo(() => {
    const passed = tests.filter((t) => t.status === "passed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    const notRun = tests.filter((t) => t.status === "not_run").length;
    return { passed, failed, notRun };
  }, [tests]);

  return (
    <div className="space-y-6">
      {/* ===== القسم 1: Health Check ===== */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">حالة الربط مع هيئة الزكاة والضريبة والجمارك</h3>
          <button
            onClick={loadHealth}
            disabled={healthLoading}
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline disabled:opacity-40"
          >
            ↻ تحديث الفحص
          </button>
        </div>

        {healthLoading || !health ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg border border-gray-200 bg-gray-50" />
            ))}
          </div>
        ) : (
          <HealthCheckCards health={health} />
        )}
      </section>

      {/* ===== القسم 2: Diagnostic Tests ===== */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-700">
            الاختبارات التشخيصية
            <span className="mr-2 text-xs font-normal text-gray-400">
              ({stats.passed} ناجحة · {stats.failed} فاشلة · {stats.notRun} لم تُشغَّل)
            </span>
          </h3>
          <button
            onClick={handleRunAll}
            disabled={runningAll || runningTest !== null}
            className="rounded-md bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {runningAll ? `جارٍ التنفيذ… ${progress}%` : "تشغيل جميع الاختبارات"}
          </button>
        </div>

        {runningAll && (
          <div className="mb-3 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full bg-[#0f766e] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm" dir="rtl">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
                <th className="px-4 py-3">الاختبار</th>
                <th className="px-4 py-3">الحالة</th>
                <th className="px-4 py-3">آخر تشغيل</th>
                <th className="px-4 py-3">زمن الاستجابة</th>
                <th className="px-4 py-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {testsLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                    جارٍ تحميل سجل الاختبارات…
                  </td>
                </tr>
              )}

              {!testsLoading &&
                tests.map((row) => {
                  const isRunning = runningTest === row.test_type || runningAll;
                  return (
                    <tr
                      key={row.test_type}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60"
                    >
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {TEST_LABELS[row.test_type]}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.status} running={isRunning} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatRelativeTime(row.last_executed_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {formatLatency(row.response_time_ms)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            onClick={() => handleRunSingle(row.test_type)}
                            disabled={isRunning}
                            className="text-xs font-medium text-[#0f766e] hover:underline disabled:text-gray-300"
                          >
                            {isRunning && runningTest === row.test_type ? "جارٍ…" : row.status === "not_run" ? "تشغيل" : "إعادة"}
                          </button>
                          {row.status !== "not_run" && (
                            <button
                              onClick={() => setDetailsFor(row)}
                              className="text-xs font-medium text-gray-500 hover:text-[#0f766e] hover:underline"
                            >
                              التفاصيل
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== ملاحظة قانونية / معلوماتية ===== */}
      <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
        <span className="font-semibold">ملاحظة:</span> الاختبارات التشخيصية تستخدم بيانات نموذجية ثابتة
        (Templates) ولا تمس فواتير العملاء الحقيقية. الغرض من هذه الاختبارات هو التحقق من سلامة الربط
        والتوقيع والإرسال مع هيئة الزكاة والضريبة والجمارك.
      </div>

      {/* Modal تفاصيل الاختبار */}
      {detailsFor && (
        <TestDetailsModal row={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </div>
  );
}

// ============================================================
// HealthCheckCards — البطاقات الخمس
// ============================================================

function HealthCheckCards({ health }: { health: ZatcaHealthCheck }) {
  // البطاقة 1: الشهادة الحالية
  const credCard = health.active_credential.present
    ? {
        label: "الشهادة الحالية",
        value: health.active_credential.credential_type ?? "—",
        sub: ENV_LABELS[health.active_credential.environment ?? "sandbox"],
        ok: true,
      }
    : {
        label: "الشهادة الحالية",
        value: "غير موجودة",
        sub: "أكمل الإعداد الأولي",
        ok: false,
      };

  // البطاقة 2: صلاحية الشهادة
  const expiryCard = (() => {
    const days = health.certificate_expiry.days_remaining;
    if (days == null) {
      return { label: "صلاحية الشهادة", value: "—", sub: "لا توجد شهادة", ok: false };
    }
    const cat = health.certificate_expiry.category;
    const ok = cat === "valid";
    return {
      label: "صلاحية الشهادة",
      value: days <= 0 ? "منتهية" : `${days} يوماً`,
      sub:
        cat === "expired"
          ? "تدوير فوري"
          : cat === "expires_7_days"
          ? "إنذار حرج"
          : cat === "expires_15_days"
          ? "تحذير"
          : cat === "expires_30_days"
          ? "تنبيه استباقي"
          : "آمنة",
      ok,
    };
  })();

  // البطاقة 3: اتصال الخدمة
  const connCard = {
    label: "الاتصال بالخدمة",
    value: health.service_connection.connected ? "متصل" : "غير متصل",
    sub: health.service_connection.latency_ms
      ? `${health.service_connection.latency_ms} مللي ثانية`
      : "تعذّر الاتصال",
    ok: health.service_connection.connected,
  };

  // البطاقة 4: آخر إرسال ناجح
  const lastSubCard = {
    label: "آخر إرسال ناجح",
    value: formatRelativeTime(health.last_successful_submission.occurred_at),
    sub: health.last_successful_submission.document_type
      ? "ZATCA Compliance"
      : "لا يوجد سجل",
    ok: !!health.last_successful_submission.occurred_at,
    neutral: !health.last_successful_submission.occurred_at,
  };

  // البطاقة 5: آخر خطأ
  const lastErrCard = {
    label: "آخر خطأ",
    value: health.last_error.occurred_at ? formatRelativeTime(health.last_error.occurred_at) : "لا يوجد",
    sub: health.last_error.error?.code ?? "نظام سليم",
    ok: !health.last_error.occurred_at,
    danger: !!health.last_error.occurred_at,
  };

  const cards = [credCard, expiryCard, connCard, lastSubCard, lastErrCard];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((c, i) => (
        <HealthCard key={i} {...c} />
      ))}
    </div>
  );
}

function HealthCard({
  label,
  value,
  sub,
  ok,
  neutral,
  danger,
}: {
  label: string;
  value: string;
  sub: string;
  ok: boolean;
  neutral?: boolean;
  danger?: boolean;
}) {
  const colorClass = neutral
    ? "border-gray-200 bg-gray-50 text-gray-600"
    : danger
    ? "border-red-200 bg-red-50 text-red-800"
    : ok
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-amber-200 bg-amber-50 text-amber-800";

  const icon = neutral ? "○" : danger ? "✕" : ok ? "✓" : "!";
  const iconColor = neutral
    ? "text-gray-400"
    : danger
    ? "text-red-600"
    : ok
    ? "text-emerald-600"
    : "text-amber-600";

  return (
    <div className={["rounded-lg border p-4", colorClass].join(" ")}>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium opacity-80">{label}</span>
        <span className={["text-base font-bold leading-none", iconColor].join(" ")}>{icon}</span>
      </div>
      <div className="text-base font-bold">{value}</div>
      <div className="mt-1 text-[10px] opacity-70">{sub}</div>
    </div>
  );
}

// ============================================================
// StatusBadge — شارة حالة الاختبار
// ============================================================

function StatusBadge({
  status,
  running,
}: {
  status: DiagnosticTestRow["status"];
  running: boolean;
}) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
        قيد التنفيذ
      </span>
    );
  }
  switch (status) {
    case "passed":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          ناجح
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          فشل
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
          <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
          لم يُشغَّل
        </span>
      );
  }
}

// ============================================================
// TestDetailsModal — تفاصيل آخر تشغيل لاختبار
// ============================================================

function TestDetailsModal({
  row,
  onClose,
}: {
  row: DiagnosticTestRow;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-bold text-gray-900">تفاصيل الاختبار</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <DetailRow label="الاختبار" value={TEST_LABELS[row.test_type]} />
          <DetailRow
            label="الحالة"
            value={
              row.status === "passed" ? "ناجح" : row.status === "failed" ? "فشل" : "لم يُشغَّل"
            }
            valueClass={
              row.status === "passed"
                ? "text-emerald-700"
                : row.status === "failed"
                ? "text-red-700"
                : "text-gray-500"
            }
          />
          <DetailRow label="آخر تشغيل" value={formatRelativeTime(row.last_executed_at)} />
          <DetailRow label="زمن الاستجابة" value={formatLatency(row.response_time_ms)} />

          {row.error && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">رسالة الخطأ</div>
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {row.error.arabic_message}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-mono text-red-500">{row.error.code}</span>
                <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">
                  {row.error.category}
                </span>
                {row.error.retryable && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">
                    يمكن إعادة المحاولة
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end border-t border-gray-200 px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <div className={["text-sm text-gray-800", valueClass || ""].join(" ")}>{value}</div>
    </div>
  );
}
