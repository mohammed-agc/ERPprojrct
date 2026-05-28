/**
 * Provider contracts — backend-agnostic interfaces.
 *
 * Today: implemented by `mock/*` using local data.
 * Tomorrow: a `rest/*` or `supabase/*` implementation can swap in with
 * zero changes to hooks or UI.
 */

import type {
  OrgDepartment, OrgUnit, OrgPosition, OrgAssignment,
  PermissionDef, RoleDef, PermissionMatrix,
} from "./types";
import type {
  SalesAction, SalesOrderState, ErpRole, PermissionResult,
} from "@/lib/erpPermissions";

export interface OrgProvider {
  listDepartments(): Promise<OrgDepartment[]>;
  listUnits(): Promise<OrgUnit[]>;
  listPositions(): Promise<OrgPosition[]>;
  listAssignments(): Promise<OrgAssignment[]>;
  saveDepartment(d: OrgDepartment): Promise<OrgDepartment>;
}

export interface PermissionsProvider {
  listPermissions(): Promise<PermissionDef[]>;
  listRoles(): Promise<RoleDef[]>;
  getMatrix(): Promise<PermissionMatrix>;
  saveMatrix(matrix: PermissionMatrix): Promise<void>;
}

export interface WorkflowProvider {
  /**
   * Authority decision for a single (action, state, actor).
   * Mock returns frontend simulation. Backend will replace this verbatim.
   */
  canPerform(
    action: SalesAction,
    state: SalesOrderState,
    role: ErpRole,
  ): Promise<PermissionResult>;
}

export interface ErpServices {
  org: OrgProvider;
  permissions: PermissionsProvider;
  workflow: WorkflowProvider;
}
