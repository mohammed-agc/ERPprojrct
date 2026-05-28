/**
 * ERP domain types — normalized, provider-agnostic.
 *
 * UI and hooks consume ONLY these types. Providers (mock today, REST/Supabase
 * tomorrow) map their wire formats into these shapes. This is the integration
 * contract between the frontend and the future backend.
 */

import type {
  OrgDepartment, OrgUnit, OrgPosition, OrgAssignment,
} from "@/data/orgMockData";
import type {
  PermissionDef, RoleDef, WorkflowGroup, PermType,
} from "@/data/permissionsMockData";

export type {
  OrgDepartment, OrgUnit, OrgPosition, OrgAssignment,
  PermissionDef, RoleDef, WorkflowGroup, PermType,
};

/** role_id -> permission codes granted to that role. */
export type PermissionMatrix = Record<string, string[]>;

/** Generic adapter error surface — predictable for the UI layer. */
export class ErpServiceError extends Error {
  constructor(
    message: string,
    public code: "network" | "auth" | "forbidden" | "not_found" | "validation" | "unknown" = "unknown",
    public cause?: unknown,
  ) {
    super(message);
    this.name = "ErpServiceError";
  }
}
