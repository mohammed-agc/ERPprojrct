/**
 * Supplier Incentive permissions.
 * Frontend visibility layer — backend authorization remains source of truth.
 *
 *  canView    : may see incentive programs, performance, and claims.
 *  canManage  : may create/edit/delete programs and submit claims for approval.
 *  canApprove : may approve or reject pending incentive claims
 *               (manager-only — posts ledger adjustment + credit release).
 */
import { useAuth } from "@/contexts/AuthContext";

const PURCHASING_DEPTS = ["purchasing", "accounting"] as const;
const MANAGER_ROLES = [
  "admin", "manager", "general_manager",
  "purchasing_manager", "accounting_manager",
];

export interface IncentivePermissions {
  canView: boolean;
  canManage: boolean;
  canApprove: boolean;
}

export function useIncentivePermissions(): IncentivePermissions {
  const { isAdmin, isManager, department, roles } = useAuth();

  const inDept = !!department && (PURCHASING_DEPTS as readonly string[]).includes(department.code);
  const hasManagerRole = roles.some(r => MANAGER_ROLES.includes(r));

  const canView = isAdmin || isManager || inDept;
  const canManage = canView;
  const canApprove = isAdmin || isManager || hasManagerRole;

  return { canView, canManage, canApprove };
}
