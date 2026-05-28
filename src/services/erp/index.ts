/**
 * Single resolution point for ERP services.
 *
 * Swap providers here when the backend lands — UI/hooks stay untouched.
 *
 * Example future shape:
 *   const useApi = import.meta.env.VITE_ERP_BACKEND === "api";
 *   export const erpServices: ErpServices = useApi ? apiServices : mockServices;
 */

import type { ErpServices } from "./providers";
import { mockOrgProvider } from "./mock/org";
import { mockPermissionsProvider } from "./mock/permissions";
import { mockWorkflowProvider } from "./mock/workflow";

export const erpServices: ErpServices = {
  org: mockOrgProvider,
  permissions: mockPermissionsProvider,
  workflow: mockWorkflowProvider,
};

export type { ErpServices } from "./providers";
export * from "./types";
