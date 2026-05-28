/**
 * Single resolution point for ERP services.
 *
 * Backend swap is controlled by VITE_ERP_BACKEND:
 *   - "api"  → use HTTP providers (real backend, authenticated via erpFetch)
 *   - other  → mock providers (frontend-only simulation)
 *
 * UI / hooks never import providers directly — they go through `erpServices`.
 */
import type { ErpServices } from "./providers";
import { mockOrgProvider } from "./mock/org";
import { mockPermissionsProvider } from "./mock/permissions";
import { mockWorkflowProvider } from "./mock/workflow";
import { httpWorkflowProvider } from "./http/workflow";

const USE_API = (import.meta.env.VITE_ERP_BACKEND as string | undefined) === "api";

export const erpServices: ErpServices = {
  org: mockOrgProvider,
  permissions: mockPermissionsProvider,
  workflow: USE_API ? httpWorkflowProvider : mockWorkflowProvider,
};

export { erpFetch, ErpAuthError, ErpHttpError, ERP_API_BASE } from "./http";
export type { ErpServices } from "./providers";
export * from "./types";
