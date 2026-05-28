import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ErpRole } from "@/lib/erpPermissions";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

/**
 * ERP session — the authoritative actor context for UI permission decisions.
 *
 *  - `role` is hydrated from AuthContext.roles (backend = source of truth).
 *  - Admins may override locally via `setRole` for testing (RoleSwitcher);
 *    non-admins cannot escape their assigned role.
 *  - `permissionCodes` is reserved for backend-issued permission codes once
 *    the authorization API ships; today it stays empty.
 *  - On any auth change (sign in / out / token refresh) we invalidate all
 *    `erp/*` React Query caches so stale data tied to a previous token is
 *    dropped — this is the fix for stale 401s after refresh/reload.
 */
interface ErpSession {
  role: ErpRole;
  setRole: (r: ErpRole) => void;
  permissionCodes: ReadonlySet<string>;
  /** True once the underlying auth session has resolved. */
  ready: boolean;
  /** True if there is no authenticated user. */
  unauthenticated: boolean;
}

const Ctx = createContext<ErpSession | undefined>(undefined);

/** Map AuthContext roles → primary ErpRole used by the UI permission layer. */
function deriveErpRole(roles: string[]): ErpRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("sales_manager") || roles.includes("manager")) return "sales_manager";
  if (roles.includes("accountant")) return "accountant";
  if (roles.includes("cashier")) return "cashier";
  if (roles.includes("delivery_officer")) return "delivery_officer";
  if (roles.includes("sales_employee")) return "sales_employee";
  return "sales_employee";
}

export function ErpSessionProvider({ children }: { children: ReactNode }) {
  const { user, roles, loading, isAdmin } = useAuth();
  const qc = useQueryClient();

  const derived = useMemo(() => deriveErpRole(roles), [roles]);
  const [role, setRoleState] = useState<ErpRole>(derived);

  // Keep ERP role in sync with backend-assigned roles.
  useEffect(() => { setRoleState(derived); }, [derived]);

  // Invalidate ERP caches whenever the auth session changes — covers
  // sign-in, sign-out, and silent TOKEN_REFRESHED events.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["erp"] });
      }
      if (event === "SIGNED_OUT") qc.clear();
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  const value = useMemo<ErpSession>(() => ({
    role,
    setRole: (r) => {
      // Only admins may simulate other roles in the UI; backend remains authoritative.
      if (isAdmin) setRoleState(r);
    },
    permissionCodes: new Set<string>(),
    ready: !loading,
    unauthenticated: !loading && !user,
  }), [role, isAdmin, loading, user]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useErpSession(): ErpSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useErpSession must be used within ErpSessionProvider");
  return v;
}
