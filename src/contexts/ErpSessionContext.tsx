import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import type { ErpRole } from "@/lib/erpPermissions";

/**
 * ERP session — current actor's role and (future) effective permission set.
 *
 * Today: role is selectable via the RoleSwitcher (mock).
 * Tomorrow: hydrated from AuthContext + backend permission set; setRole
 * becomes a no-op for non-admins. Component contracts do not change.
 */
interface ErpSession {
  role: ErpRole;
  setRole: (r: ErpRole) => void;
  /** Reserved for backend-provided permission codes. */
  permissionCodes: ReadonlySet<string>;
}

const Ctx = createContext<ErpSession | undefined>(undefined);

export function ErpSessionProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<ErpRole>("sales_manager");
  const value = useMemo<ErpSession>(
    () => ({ role, setRole, permissionCodes: new Set<string>() }),
    [role],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useErpSession(): ErpSession {
  const v = useContext(Ctx);
  if (!v) throw new Error("useErpSession must be used within ErpSessionProvider");
  return v;
}
