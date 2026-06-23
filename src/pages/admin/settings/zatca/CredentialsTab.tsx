// ============================================================
// CredentialsTab.tsx — S1.4.3
// ============================================================
// تبويب إدارة شهادات ZATCA (CCSID / PCSID)
// يعرض كل الشهادات المسجَّلة مع حالاتها وإمكانية التدوير والإلغاء.
//
// المصدر: ZatcaApi.listCredentials() / rotateCredential() / revokeCredential()
// (Mock حالياً، Service Layer لاحقاً بنفس التوقيعات)
// ============================================================

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ZatcaApi,
  type ZatcaCredential,
  type ZatcaCredentialStatus,
  type ZatcaEnvironment,
  type ZatcaErrorShape,
} from "@/lib/zatca/zatcaApi";

// ---------- ثوابت العرض ----------

const STATUS_LABELS: Record<ZatcaCredentialStatus, string> = {
  active: "نشطة",
  rotating: "قيد التدوير",
  pending: "في الانتظار",
  revoked: "ملغاة",
  expired: "منتهية",
};

const STATUS_BADGE_CLASSES: Record<ZatcaCredentialStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rotating: "bg-amber-50 text-amber-700 border-amber-200",
  pending: "bg-gray-50 text-gray-600 border-gray-200",
  revoked: "bg-red-50 text-red-700 border-red-200",
  expired: "bg-red-100 text-red-900 border-red-300",
};

const ENV_LABELS: Record<ZatcaEnvironment, string> = {
  sandbox: "تجريبية",
  simulation: "محاكاة",
  production: "إنتاج",
};

const FILTER_OPTIONS: { value: "all" | ZatcaCredentialStatus; label: string }[] = [
  { value: "all", label: "الكل" },
  { value: "active", label: "نشطة" },
  { value: "rotating", label: "قيد التدوير" },
  { value: "pending", label: "في الانتظار" },
  { value: "expired", label: "منتهية" },
  { value: "revoked", label: "ملغاة" },
];

// مدة "قريب من الانتهاء" التي يظهر فيها زر Rotate
const ROTATE_THRESHOLD_DAYS = 30;

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

function shortFingerprint(fp: string): string {
  // عرض أول 6 وآخر 4 رموز
  if (fp.length <= 14) return fp;
  return `${fp.slice(0, 8)}…${fp.slice(-5)}`;
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

// ============================================================
// المكوّن الرئيسي
// ============================================================

export default function CredentialsTab() {
  const [credentials, setCredentials] = useState<ZatcaCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | ZatcaCredentialStatus>("all");

  // Drawer
  const [drawerCred, setDrawerCred] = useState<ZatcaCredential | null>(null);

  // Revoke modal
  const [revokeTarget, setRevokeTarget] = useState<ZatcaCredential | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeConfirmText, setRevokeConfirmText] = useState("");
  const [revoking, setRevoking] = useState(false);

  async function loadCredentials() {
    setLoading(true);
    const list = await ZatcaApi.listCredentials();
    setCredentials(list);
    setLoading(false);
  }

  useEffect(() => {
    loadCredentials();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return credentials;
    return credentials.filter((c) => c.status === filter);
  }, [credentials, filter]);

  async function handleRotate(cred: ZatcaCredential) {
    if (cred.status !== "active") return;
    toast.info("جارٍ بدء عملية تدوير الشهادة…");
    const result = await ZatcaApi.rotateCredential(cred.id);
    if ("error" in result) {
      toast.error((result.error as ZatcaErrorShape).arabic_message);
      return;
    }
    toast.success("تم بدء جلسة Onboarding جديدة لتدوير الشهادة");
    await loadCredentials();
  }

  async function handleRevokeSubmit() {
    if (!revokeTarget) return;
    if (revokeConfirmText !== "REVOKE") {
      toast.error("يجب كتابة كلمة REVOKE بالضبط للتأكيد");
      return;
    }
    if (revokeReason.trim().length < 5) {
      toast.error("يرجى كتابة سبب واضح للإلغاء (5 أحرف على الأقل)");
      return;
    }

    setRevoking(true);
    const result = await ZatcaApi.revokeCredential(revokeTarget.id, revokeReason);
    setRevoking(false);

    if ("error" in result) {
      toast.error((result.error as ZatcaErrorShape).arabic_message);
      return;
    }
    toast.success("تم إلغاء الشهادة وتسجيل ذلك في سجل الحوكمة");
    setRevokeTarget(null);
    setRevokeReason("");
    setRevokeConfirmText("");
    await loadCredentials();
  }

  async function handleCopyFingerprint(fp: string) {
    try {
      await navigator.clipboard.writeText(fp);
      toast.success("تم نسخ البصمة");
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  // ---------- Empty state ----------

  if (!loading && credentials.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
        <div className="mb-2 text-base font-semibold text-gray-700">
          لم يتم إكمال إعداد الزكاة والضريبة بعد
        </div>
        <p className="mb-4 text-sm text-gray-500">
          أكمل خطوات الإعداد أولاً ليتم استخراج الشهادات وعرضها هنا.
        </p>
        <a
          href="#"
          className="text-sm font-medium text-[#0f766e] hover:underline"
          onClick={(e) => {
            e.preventDefault();
            // الانتقال لتبويب الإعداد عبر URL hash يلتقطه الأب
            window.dispatchEvent(new CustomEvent("zatca:switch-tab", { detail: "onboarding" }));
          }}
        >
          ← الانتقال إلى صفحة الإعداد
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* شريط الفلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500">تصفية:</span>
        {FILTER_OPTIONS.map((opt) => {
          const count =
            opt.value === "all"
              ? credentials.length
              : credentials.filter((c) => c.status === opt.value).length;
          return (
            <button
              key={opt.value}
              onClick={() => setFilter(opt.value)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === opt.value
                  ? "border-[#0f766e] bg-[#0f766e] text-white"
                  : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
              ].join(" ")}
            >
              {opt.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
        <button
          onClick={loadCredentials}
          className="mr-auto text-xs text-gray-500 hover:text-gray-700 hover:underline"
        >
          ↻ تحديث
        </button>
      </div>

      {/* الجدول */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm" dir="rtl">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold text-gray-600">
              <th className="px-4 py-3">النوع</th>
              <th className="px-4 py-3">البيئة</th>
              <th className="px-4 py-3">الحالة</th>
              <th className="px-4 py-3">البصمة</th>
              <th className="px-4 py-3">تاريخ الإصدار</th>
              <th className="px-4 py-3">تاريخ الانتهاء</th>
              <th className="px-4 py-3">آخر استخدام</th>
              <th className="px-4 py-3">آخر تدوير</th>
              <th className="px-4 py-3 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                  جارٍ تحميل الشهادات…
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                  لا توجد شهادات مطابقة للتصفية المحددة
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((c) => {
                const days = daysUntil(c.certificate_expiry_at);
                const canRotate = c.status === "active" && days <= ROTATE_THRESHOLD_DAYS;
                const canRevoke = c.status === "active" || c.status === "rotating" || c.status === "pending";
                return (
                  <tr key={c.id} className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">
                      {c.credential_type}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{ENV_LABELS[c.environment]}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                          STATUS_BADGE_CLASSES[c.status],
                        ].join(" ")}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleCopyFingerprint(c.credential_fingerprint)}
                        className="font-mono text-[11px] text-gray-600 hover:text-[#0f766e] hover:underline"
                        title="انقر للنسخ"
                      >
                        {shortFingerprint(c.credential_fingerprint)}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{formatDate(c.issued_at)}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className={days < 0 ? "text-red-600 font-medium" : days <= 30 ? "text-amber-600 font-medium" : "text-gray-600"}>
                        {formatDate(c.certificate_expiry_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.last_used_at)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{formatDate(c.last_rotated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setDrawerCred(c)}
                          className="text-xs font-medium text-[#0f766e] hover:underline"
                        >
                          عرض
                        </button>
                        {canRotate && (
                          <button
                            onClick={() => handleRotate(c)}
                            className="text-xs font-medium text-amber-600 hover:underline"
                          >
                            تدوير
                          </button>
                        )}
                        {canRevoke && (
                          <button
                            onClick={() => setRevokeTarget(c)}
                            className="text-xs font-medium text-red-600 hover:underline"
                          >
                            إلغاء
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

      {/* Drawer التفاصيل */}
      {drawerCred && <CredentialDrawer credential={drawerCred} onClose={() => setDrawerCred(null)} />}

      {/* Revoke modal */}
      {revokeTarget && (
        <RevokeModal
          credential={revokeTarget}
          reason={revokeReason}
          setReason={setRevokeReason}
          confirmText={revokeConfirmText}
          setConfirmText={setRevokeConfirmText}
          loading={revoking}
          onCancel={() => {
            setRevokeTarget(null);
            setRevokeReason("");
            setRevokeConfirmText("");
          }}
          onConfirm={handleRevokeSubmit}
        />
      )}
    </div>
  );
}

// ============================================================
// CredentialDrawer — تفاصيل الشهادة الكاملة
// ============================================================

function CredentialDrawer({
  credential,
  onClose,
}: {
  credential: ZatcaCredential;
  onClose: () => void;
}) {
  async function handleCopy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`تم نسخ ${label}`);
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl" onClick={onClose}>
      <div className="flex-1 bg-black/30" />
      <div
        className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-900">تفاصيل الشهادة</h3>
            <button
              onClick={onClose}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="إغلاق"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-5 px-6 py-5">
          <DetailRow label="النوع" value={credential.credential_type} mono />
          <DetailRow label="البيئة" value={ENV_LABELS[credential.environment]} />
          <DetailRow
            label="الحالة"
            value={
              <span
                className={[
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  STATUS_BADGE_CLASSES[credential.status],
                ].join(" ")}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {STATUS_LABELS[credential.status]}
              </span>
            }
          />
          <DetailRow
            label="نشطة فعلياً (is_active)"
            value={credential.is_active ? "نعم" : "لا"}
            valueClass={credential.is_active ? "text-emerald-700" : "text-gray-500"}
          />
          <DetailRow label="الرقم التسلسلي" value={credential.serial_number} mono />

          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">البصمة (Fingerprint)</div>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded bg-gray-50 px-3 py-2 font-mono text-[11px] text-gray-700">
                {credential.credential_fingerprint}
              </code>
              <button
                onClick={() => handleCopy(credential.credential_fingerprint, "البصمة")}
                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-[#0f766e] hover:text-[#0f766e]"
              >
                نسخ
              </button>
            </div>
          </div>

          <DetailRow label="تاريخ الإصدار" value={formatDate(credential.issued_at)} />
          <DetailRow
            label="تاريخ الانتهاء"
            value={formatDate(credential.certificate_expiry_at)}
            valueClass={
              daysUntil(credential.certificate_expiry_at) < 0
                ? "text-red-600 font-medium"
                : daysUntil(credential.certificate_expiry_at) <= 30
                ? "text-amber-600 font-medium"
                : ""
            }
          />
          <DetailRow label="آخر استخدام" value={formatDate(credential.last_used_at)} />
          <DetailRow label="آخر تدوير" value={formatDate(credential.last_rotated_at)} />
          <DetailRow label="معرّف الشهادة" value={credential.id} mono />
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <div className={[mono ? "font-mono text-[12px]" : "text-sm", "text-gray-800", valueClass || ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

// ============================================================
// RevokeModal — تأكيد مزدوج لإلغاء الشهادة
// ============================================================

function RevokeModal({
  credential,
  reason,
  setReason,
  confirmText,
  setConfirmText,
  loading,
  onCancel,
  onConfirm,
}: {
  credential: ZatcaCredential;
  reason: string;
  setReason: (v: string) => void;
  confirmText: string;
  setConfirmText: (v: string) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-lg bg-white shadow-2xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h3 className="text-base font-bold text-red-700">إلغاء الشهادة</h3>
          <p className="mt-1 text-xs text-gray-500">
            هذا الإجراء نهائي ولا يمكن التراجع عنه. سيُسجَّل في سجل الحوكمة (governance log) ويتطلب
            استخراج شهادة جديدة عبر Onboarding من جديد.
          </p>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            <span className="font-semibold">{credential.credential_type}</span>
            {" • "}
            {ENV_LABELS[credential.environment]}
            {" • "}
            <span className="font-mono">{shortFingerprint(credential.credential_fingerprint)}</span>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">سبب الإلغاء (إلزامي)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder="مثال: انتهاء صلاحية الشهادة قبل الموعد بسبب تغيير بيانات المنشأة"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              للتأكيد، اكتب <span className="font-mono font-bold text-red-700">REVOKE</span>
            </label>
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm uppercase outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              placeholder="REVOKE"
            />
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
            disabled={loading || confirmText !== "REVOKE" || reason.trim().length < 5}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? "جارٍ الإلغاء…" : "تأكيد إلغاء الشهادة"}
          </button>
        </div>
      </div>
    </div>
  );
}
