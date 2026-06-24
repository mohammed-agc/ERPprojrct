// ============================================================
// useBranches.tsx — S1.4.1b — Branches SSOT
// ============================================================
// كل الـ dropdowns والقوائم التي تعرض الفروع تستخدم هذا Hook بدلاً
// من قائمة ثابتة. مطابق لـ branchesService و schema جدول branches.
//
// لا حاجة لـ Provider (Context) لأن الاستهلاك صغير ومحدود؛ كل مكوّن
// يستدعي Hook يحصل على نسخته مع Cache بسيط داخل الـ Hook (useEffect
// بمصفوفة فارغة + state). إن احتجنا cache عبر التطبيق لاحقاً نضيف
// React Query أو Context.
//
// الاستخدام:
//   const { branches, loading, error, refetch } = useBranches();
//
// السلوك في حالات الحافة:
//   - DB فارغة → branches = []
//   - فشل الشبكة → error مع رسالة عربية
// ============================================================

import { useEffect, useState, useCallback } from "react";
import { branchesService, type Branch } from "@/services/erp/branchesService";

interface UseBranchesResult {
  branches: Branch[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useBranches(options: { activeOnly?: boolean } = {}): UseBranchesResult {
  const { activeOnly = true } = options;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBranches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await branchesService.list();
      setBranches(activeOnly ? all.filter((b) => b.is_active) : all);
    } catch (e: any) {
      setError(e?.message ?? "تعذّر تحميل الفروع");
      setBranches([]);
    } finally {
      setLoading(false);
    }
  }, [activeOnly]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  return { branches, loading, error, refetch: fetchBranches };
}

// ============================================================
// مساعد عرض: اسم الفرع للعرض ("الفرع الرئيسي" / "فرع X / المدينة")
// ============================================================

export function displayBranchName(branch: Branch | null | undefined): string {
  if (!branch) return "—";
  if (branch.is_main) return branch.name_ar || "الفرع الرئيسي";
  const parts = [branch.name_ar, branch.city].filter((p) => p && p.trim().length > 0);
  return parts.join(" / ") || branch.code || "—";
}