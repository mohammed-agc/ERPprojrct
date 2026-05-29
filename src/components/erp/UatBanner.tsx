import { useEffect, useState } from "react";
import { FlaskConical, X } from "lucide-react";
import { isUatMode, setUatMode } from "@/lib/uatEnv";

export function UatBanner() {
  const [on, setOn] = useState(isUatMode());

  useEffect(() => {
    const h = (e: Event) => setOn(Boolean((e as CustomEvent).detail));
    window.addEventListener("uat-mode-change", h);
    return () => window.removeEventListener("uat-mode-change", h);
  }, []);

  if (!on) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-30 w-full bg-amber-500/95 text-amber-950 border-b border-amber-700/40 backdrop-blur"
    >
      <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-semibold">
        <FlaskConical className="h-3.5 w-3.5" />
        <span>بيئة اختبار UAT — البيانات المعروضة تجريبية وقابلة للتهيئة في أي وقت</span>
        <button
          onClick={() => setUatMode(false)}
          className="mr-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-amber-600/40 transition"
          aria-label="إخفاء الشعار"
          title="إخفاء الشعار"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
