// ============================================================
// CertificateStatusTab.tsx — S1.4.5
// ============================================================
// لوحة مراقبة الشهادات القريبة من الانتهاء والمنتهية فعلياً.
// تعكس مباشرةً vw_zatca_expiring_credentials في DB (ZATCA4):
//   - 4 فئات إنذار: expired / 7 / 15 / 30 يوماً
//   - يعرض active + rotating فقط (revoked/expired لا تعرض في الـ view أصلاً
//     لأنها سُجِّلت بالفعل في governance log عبر transition_credential_status)
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ZatcaApi,
  type ExpiringCredentialRow,
  type ExpiryCategory,
  type ZatcaEnvironment,
  type ZatcaErrorShape,
} from "@/lib/zatca/zatcaApi";

// ---------- تعريف البطاقات الأربع ----------

interface KpiCardDef {
  key: ExpiryCategory;
  label: string;
  helperLabel: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  numberClass: string;
}

const KPI_CARDS: KpiCardDef[] = [
  {
    key: "expired",
    label: "منتهية",
    helperLabel: "تحتاج تدويراً فورياً",
    bgClass: "bg-red-50",
    borderClass: "border-red-200",
    textClass: "text-red-700",
    numberClass: "text-red-700",
  },
  {
    key: "expires_7_days",
    label: "خلال 7 أيام",
    helperLabel: "إنذار حرج",
    bgClass: "bg-red-50/60",
    borderClass: "border-red-200",
    textClass: "text-red-600",
    numberClass: "text-red-600",
  },
  {
    key: "expires_15_days",
    label: "خلال 15 يوماً",
    helperLabel: "تحذير",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
    textClass: "text-amber-700",
    numberClass: "text-amber-700",
  },
  {
    key: "expires_30_days",
    label: "خلال 30 يوماً",
    helperLabel: "تنبيه استباقي",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-200",
    textClass: "text-orange-700",
    numberClass: "text-orange-700",
  },
];

const ENV_LABELS: Record<ZatcaEnvironment, string> = {
  sandbox: "تجريبية",
  simulation: "محاكاة",
  production: "إنتاج",
};

const STATUS_LABELS_AR: Record<string, string> = {
  active: "نشطة",
  rotating: "قيد التدوير",
};

// ---------- مساعدات ----------

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function formatDaysRemaining(days: number): { text: string; cls: string } {
  if (days <= 0) {
    return { text: `منتهية منذ ${Math.abs(days)} يوماً`, cls: "text-red-700 font-semibold" };
  }
  if (days <= 7) {
    return { text: `${days} يوماً`, cls: "text-red-600 font-semibold" };
  }
  if (days <= 15) {
    return { text: `${days} يوماً`, cls: "text-amber-700 font-medium" };
  }
  if (days <= 30) {
    return { text: `${days} يوماً`, cls: "text-orange-700 font-medium" };
  }
  return { text: `${days} يوماً`, cls: "text-gray-600" };
}

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function CertificateStatusTab() {
  const [rows, setRows] = useState<ExpiringCredentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ExpiryCategory | "all">("all");

  async function loadStatus() {
    setLoading(true);
    const data = await ZatcaApi.getExpiringCredentials();
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
  }, []);

  // عدّاد لكل فئة
  const counts = useMemo(() => {
    const c: Record<ExpiryCategory, number> = {
      expired: 0,
      expires_7_days: 0,
      expires_15_days: 0,
      expires_30_days: 0,
      valid: 0,
    };
    rows.forEach((r) => {
      c[r.expiry_category]++;
    });
    return c;
  }, [rows]);

  // الجدول المُصفَّى
  const filtered = useMemo(() => {
    if (filter === "all") {
      // الترتيب: الأخطر أولاً
      const order: Record<ExpiryCategory, number> = {
        expired: 0,
        expires_7_days: 1,
        expires_15_days: 2,
        expires_30_days: 3,
        valid: 4,
      };
      return [...rows].sort((a, b) => order[a.expiry_category] - order[b.expiry_category]);
    }
    return rows.filter((r) => r.expiry_category === filter);
  }, [rows, filter]);

  async function handleRotate(row: ExpiringCredentialRow) {
    const confirmed = window.confirm(
      `سيتم بدء جلسة Onboarding جديدة لتدوير شهادة ${row.credential_type} (${ENV_LABELS[row.environment]}).\nهل تريد المتابعة؟`
    );
    if (!confirmed) return;

    const result = await ZatcaApi.rotateCredential(row.id);
    if ("error" in result) {
      toast.error((result.error as ZatcaErrorShape).arabic_message);
      return;
    }
    toast.success("تم بدء جلسة تدوير. انتقل إلى تبويب الإعداد الأولي لاستكمالها.");
    // إعلام الأم لتُحدِّث سجل الجلسات
    window.dispatchEvent(new CustomEvent("zatca:session-created"));
    await loadStatus();
  }

  // شريط الحالة العامة في الأسفل
  const overallStatus = useMemo(() => {
    if (counts.expired > 0) {
      return {
        text: `هناك ${counts.expired} شهادة منتهية — يلزم تدوير فوري`,
        cls: "bg-red-50 border-red-200 text-red-800",
        icon: "🔴",
      };
    }
    const warningCount = counts.expires_7_days + counts.expires_15_days + counts.expires_30_days;
    if (warningCount > 0) {
      return {
        text: `هناك ${warningCount} شهادة تقترب من الانتهاء`,
        cls: "bg-amber-50 border-amber-200 text-amber-800",
        icon: "🟡",
      };
    }
    if (rows.length === 0) {
      return null;
    }
    return {
      text: "كل الشهادات في وضع آمن (أكثر من 30 يوماً متبقياً)",
      cls: "bg-emerald-50 border-emerald-200 text-emerald-800",
      icon: "🟢",
    };
  }, [counts, rows.length]);

  // ---------- Empty state (لا توجد شهادات نشطة أصلاً) ----------

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
        <div className="mb-2 text-base font-semibold text-gray-700">
          لا توجد شهادات نشطة لمراقبتها
        </div>
        <p className="mb-4 text-sm text-gray-500">
          ستظهر هنا الشهادات النشطة (CCSID و PCSID) لمتابعة تواريخ انتهائها فور إصدارها.
        </p>
        <a
          href="#"
          className="text-sm font-medium text-[#0f766e] hover:underline"
          onClick={(e) => {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("zatca:switch-tab", { detail: "onboarding" }));
          }}
        >
          ← الانتقال إلى صفحة الإعداد
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ===== الطبقة 1: بطاقات KPI الأربعة ===== */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((card) => {
          const count = counts[card.key];
          const isActive = filter === card.key;
          return (
            <button
              key={card.key}
              onClick={() => setFilter(isActive ? "all" : card.key)}
              disabled={count === 0}
              className={[
                "rounded-lg border p-4 text-right transition-all",
                card.bgClass,
                isActive ? "border-2 ring-2 ring-offset-1 " + card.borderClass.replace("border-", "ring-") : card.borderClass,
                count === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:scale-[1.02]",
              ].join(" ")}
            >
              <div className={["text-xs font-medium", card.textClass].join(" ")}>{card.label}</div>
              <div className={["mt-2 text-3xl font-bold", card.numberClass].join(" ")}>{count}</div>
              <div className="mt-1 text-[10px] text-gray-500">{card.helperLabel}</div>
            </button>
          );
        })}
      </div>

      {/* تذكير التصفية النشطة */}
      {filter !== "all" && (
        <div className="flex items-center justify-between rounded-md bg-gray-50 px-4 py-2 text-xs text-gray-600">
          <span>
            تصفية نشطة: <span className="font-semibold">{KPI_CARDS.find((c) => c.key === filter)?.label}</span>
          </span>
          <button onClick={() => setFilter("all")} className="text-[#0f766e] hover:underline">
            إلغاء التصفية
          </button>
        </div>
      )}

      {/* ===== الطبقة 2: الجدول التفصيلي ===== */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
          <h4 className="text-sm font-semibold text-gray-700">
            الشهادات الخاضعة للمراقبة ({filtered.length})
          </h4>
          <button
            onClick={loadStatus}
            className="text-xs text-gray-500 hover:text-gray-700 hover:underline"
          >
            ↻ تحديث
          </button>
        </div>

        <table className="w-full text-right text-sm" dir="rtl">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">البيئة</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">تاريخ الانتهاء</th>
              <th className="px-4 py-3">المتبقي</th>
              <th className="px-4 py-3 text-center">الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  جارٍ تحميل بيانات المراقبة…
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                  {filter === "all"
                    ? "لا توجد شهادات لعرضها"
                    : "لا توجد شهادات في هذه الفئة"}
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((row) => {
                const remaining = formatDaysRemaining(row.days_until_expiry);
                const canRotate =
                  row.status === "active" &&
                  (row.expiry_category === "expired" ||
                    row.expiry_category === "expires_7_days" ||
                    row.expiry_category === "expires_15_days" ||
                    row.expiry_category === "expires_30_days");
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                      {row.credential_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {ENV_LABELS[row.environment]}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {STATUS_LABELS_AR[row.status] || row.status}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {formatDate(row.certificate_expiry_at)}
                    </td>
                    <td className={["px-4 py-3 text-xs", remaining.cls].join(" ")}>
                      {remaining.text}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        {canRotate && (
                          <button
                            onClick={() => handleRotate(row)}
                            className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700"
                          >
                            تدوير الآن
                          </button>
                        )}
                        <button
                          onClick={() => {
                            window.dispatchEvent(
                              new CustomEvent("zatca:switch-tab", { detail: "credentials" })
                            );
                          }}
                          className="text-xs font-medium text-[#0f766e] hover:underline"
                        >
                          عرض في الشهادات
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* ===== الطبقة 3: شريط الحالة العامة ===== */}
      {overallStatus && (
        <div
          className={[
            "flex items-center gap-3 rounded-lg border px-4 py-3 text-sm",
            overallStatus.cls,
          ].join(" ")}
        >
          <span className="text-base leading-none">{overallStatus.icon}</span>
          <span className="font-medium">{overallStatus.text}</span>
        </div>
      )}
    </div>
  );
}
