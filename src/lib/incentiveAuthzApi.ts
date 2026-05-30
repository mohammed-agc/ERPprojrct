/**
 * Backend authorization gate for Supplier Incentive operations.
 *
 * Calls the `incentive-authz` edge function, which validates the user's JWT
 * server-side and consults the database (profile.department + user_roles) to
 * decide if the action is allowed. The frontend `useIncentivePermissions`
 * hook is a UX hint; this is the authoritative check.
 *
 * Results are cached per session+action for ~60s to avoid round-tripping
 * the function on every interaction.
 */
import { supabase } from "@/integrations/supabase/client";

export type IncentiveAction = "view" | "manage" | "approve";

export interface IncentiveAuthzResult {
  allowed: boolean;
  reason?: string;
  permissions: { canView: boolean; canManage: boolean; canApprove: boolean };
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { at: number; result: IncentiveAuthzResult }>();

function cacheKey(uid: string, action: IncentiveAction) {
  return `${uid}::${action}`;
}

/** Clear the in-memory cache (call on sign-in/out). */
export function clearIncentiveAuthzCache() { cache.clear(); }

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED") {
    clearIncentiveAuthzCache();
  }
});

export async function checkIncentiveAccess(action: IncentiveAction): Promise<IncentiveAuthzResult> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return {
      allowed: false,
      reason: "غير مسجّل الدخول",
      permissions: { canView: false, canManage: false, canApprove: false },
    };
  }
  const key = cacheKey(session.user.id, action);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const { data, error } = await supabase.functions.invoke<IncentiveAuthzResult>("incentive-authz", {
    body: { action },
  });
  if (error || !data) {
    // Fail closed.
    return {
      allowed: false,
      reason: error?.message ?? "تعذّر التحقق من الصلاحية",
      permissions: { canView: false, canManage: false, canApprove: false },
    };
  }
  cache.set(key, { at: Date.now(), result: data });
  return data;
}

/**
 * Throw-style guard for mutation handlers. Surfaces a toast-friendly Error
 * when the backend denies the action.
 */
export async function ensureIncentiveAccess(action: IncentiveAction): Promise<void> {
  const r = await checkIncentiveAccess(action);
  if (!r.allowed) {
    throw new Error(r.reason ?? "غير مصرّح");
  }
}
