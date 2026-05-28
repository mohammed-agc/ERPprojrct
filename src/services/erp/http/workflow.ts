/**
 * HTTP-backed WorkflowProvider — calls the real backend authorization API.
 *
 * Activated by setting VITE_ERP_BACKEND=api. While inactive the mock provider
 * is used. The contract matches WorkflowProvider exactly, so swapping is a
 * one-line change in `src/services/erp/index.ts`.
 *
 * Endpoint contract (proposed):
 *   POST /erp/workflow/can-perform
 *   body: { action, state, role }
 *   200 → { allowed: boolean, reason?: "role" | "state" | "cancelled" }
 *   401 → handled by erpFetch (refresh + retry)
 */
import { erpFetch, ErpAuthError } from "../http";
import type { WorkflowProvider } from "../providers";
import type { PermissionResult } from "@/lib/erpPermissions";

export const httpWorkflowProvider: WorkflowProvider = {
  async canPerform(action, state, role): Promise<PermissionResult> {
    try {
      return await erpFetch<PermissionResult>("/erp/workflow/can-perform", {
        method: "POST",
        json: { action, state, role },
      });
    } catch (err) {
      // Auth failures bubble up so React Query / UI can surface a re-login CTA.
      if (err instanceof ErpAuthError) throw err;
      // Safe-by-default for non-auth backend failures: deny the action.
      return { allowed: false, reason: "state" };
    }
  },
};
