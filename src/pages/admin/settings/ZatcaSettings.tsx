// ============================================================
// ZatcaSettings.tsx — S1.4.3 (الصفحة الأم)
// ============================================================
// إعدادات هيئة الزكاة والضريبة والجمارك — تجمع 4 تبويبات في صفحة واحدة:
//   1. الإعداد الأولي (Onboarding)        — S1.4.2 ✓
//   2. الشهادات (Credentials)             — S1.4.3 ✓ (هذا الإصدار)
//   3. اختبارات الامتثال (Compliance)     — S1.4.4 (placeholder حالياً)
//   4. حالة الشهادات (Certificate Status) — S1.4.5 (placeholder حالياً)
//
// شريط البيئة وسجل الجلسات مشتركان فوق كل التبويبات.
// ============================================================

import { useEffect, useState } from "react";
import {
  ZatcaApi,
  type ZatcaEnvironment,
  type ZatcaOnboardingSessionSummary,
} from "@/lib/zatca/zatcaApi";
import OnboardingTab from "./zatca/OnboardingTab";
import CredentialsTab from "./zatca/CredentialsTab";
import CertificateStatusTab from "./zatca/CertificateStatusTab";
import ComplianceTab from "./zatca/ComplianceTab";

type ZatcaTab = "onboarding" | "credentials" | "compliance" | "certificate-status";

const TAB_LABELS: Record<ZatcaTab, string> = {
  onboarding: "الإعداد الأولي",
  credentials: "الشهادات",
  compliance: "اختبارات الامتثال",
  "certificate-status": "حالة الشهادات",
};

const TAB_GROUPS: { label: string; tabs: ZatcaTab[] }[] = [
  { label: "الإعداد", tabs: ["onboarding"] },
  { label: "التشغيل", tabs: ["credentials"] },
  { label: "الاختبارات", tabs: ["compliance"] },
  { label: "المراقبة", tabs: ["certificate-status"] },
];

const ENV_LABELS: Record<ZatcaEnvironment, string> = {
  sandbox: "بيئة تجريبية (Sandbox)",
  simulation: "بيئة محاكاة (Simulation)",
  production: "بيئة الإنتاج (Production)",
};

const ENV_COLORS: Record<ZatcaEnvironment, string> = {
  sandbox: "bg-blue-50 text-blue-700 border-blue-200",
  simulation: "bg-amber-50 text-amber-700 border-amber-200",
  production: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export default function ZatcaSettings() {
  const [activeTab, setActiveTab] = useState<ZatcaTab>("onboarding");
  const [environment, setEnvironment] = useState<ZatcaEnvironment>("sandbox");
  const [sessions, setSessions] = useState<ZatcaOnboardingSessionSummary[]>([]);
  const [showSessionHistory, setShowSessionHistory] = useState(false);

  async function loadGlobalState() {
    const [env, hist] = await Promise.all([
      ZatcaApi.getCompanyEnvironment(),
      ZatcaApi.getOnboardingSessions(),
    ]);
    setEnvironment(env);
    setSessions(hist);
  }

  useEffect(() => {
    loadGlobalState();

    // تحديث تلقائي عند بدء جلسة جديدة من تبويب Onboarding
    const refreshHandler = () => loadGlobalState();
    window.addEventListener("zatca:session-created", refreshHandler);

    // الانتقال بين التبويبات عبر حدث مخصّص (مثلاً Empty State في Credentials)
    const switchHandler = (e: Event) => {
      const detail = (e as CustomEvent<ZatcaTab>).detail;
      if (detail && detail in TAB_LABELS) setActiveTab(detail);
    };
    window.addEventListener("zatca:switch-tab", switchHandler);

    return () => {
      window.removeEventListener("zatca:session-created", refreshHandler);
      window.removeEventListener("zatca:switch-tab", switchHandler);
    };
  }, []);

  // التبويب الافتراضي الذكي: إن وُجدت جلسة مكتملة → افتح Credentials بدل Onboarding
  useEffect(() => {
    if (sessions.length > 0 && sessions.some((s) => s.onboarding_status === "completed")) {
      setActiveTab((prev) => (prev === "onboarding" ? "credentials" : prev));
    }
    // نفّذ مرة واحدة بعد تحميل sessions أول مرة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length === 0]);

  return (
    <div className="mx-auto max-w-5xl p-6" dir="rtl">
      {/* رأس الصفحة */}
      <div className="mb-1 text-2xl font-bold text-gray-900">
        إعداد الربط مع هيئة الزكاة والضريبة والجمارك
      </div>
      <p className="mb-4 text-sm text-gray-500">
        إدارة الإعداد الأولي والشهادات والامتثال للفوترة الإلكترونية (ZATCA).
      </p>

      {/* شريط البيئة + سجل الجلسات */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div
          className={[
            "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
            ENV_COLORS[environment],
          ].join(" ")}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {ENV_LABELS[environment]}
        </div>

        {sessions.length > 0 && (
          <button
            className="text-xs text-gray-400 hover:text-gray-600 hover:underline"
            onClick={() => setShowSessionHistory((v) => !v)}
          >
            {showSessionHistory ? "إخفاء سجل الجلسات" : `عرض سجل الجلسات (${sessions.length})`}
          </button>
        )}
      </div>

      {showSessionHistory && (
        <div className="mb-6 space-y-1 rounded-md border border-gray-100 bg-gray-50 p-3">
          {sessions.map((s) => (
            <div key={s.session_id} className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {ENV_LABELS[s.environment]} — {s.common_name || "—"}
              </span>
              <span className="font-mono">{s.onboarding_status}</span>
            </div>
          ))}
        </div>
      )}

      {/* شريط التبويبات */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex flex-wrap gap-x-1">
          {TAB_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center">
              <span className="px-2 text-[11px] font-medium text-gray-400">{group.label}</span>
              {group.tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={[
                    "relative -mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                    activeTab === tab
                      ? "border-[#0f766e] text-[#0f766e]"
                      : "border-transparent text-gray-500 hover:text-gray-700",
                  ].join(" ")}
                >
                  {TAB_LABELS[tab]}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* محتوى التبويب */}
      <div className="rounded-lg bg-white p-6 shadow-sm">
        {activeTab === "onboarding" && <OnboardingTab />}
        {activeTab === "credentials" && <CredentialsTab />}
        {activeTab === "compliance" && <ComplianceTab />}
        {activeTab === "certificate-status" && <CertificateStatusTab />}
      </div>
    </div>
  );
}

// ---------- لم يعد هناك placeholders — كل التبويبات الأربعة منفّذة فعلياً ----------
