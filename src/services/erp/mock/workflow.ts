import { canPerform as canPerformLocal } from "@/lib/erpPermissions";
import type { WorkflowProvider } from "../providers";

/**
 * Mock workflow authority — delegates to local frontend simulation.
 * When the backend ships, swap this with an HTTP-backed implementation.
 */
export const mockWorkflowProvider: WorkflowProvider = {
  async canPerform(action, state, role) {
    return canPerformLocal(action, state, role);
  },
};
