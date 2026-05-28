import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpServices } from "@/services/erp";
import type { PermissionMatrix } from "@/services/erp";

const KEYS = {
  perms:  ["erp", "permissions", "defs"] as const,
  roles:  ["erp", "permissions", "roles"] as const,
  matrix: ["erp", "permissions", "matrix"] as const,
};

export function usePermissionDefs() {
  return useQuery({ queryKey: KEYS.perms, queryFn: () => erpServices.permissions.listPermissions() });
}
export function usePermissionRoles() {
  return useQuery({ queryKey: KEYS.roles, queryFn: () => erpServices.permissions.listRoles() });
}
export function usePermissionMatrix() {
  return useQuery({ queryKey: KEYS.matrix, queryFn: () => erpServices.permissions.getMatrix() });
}
export function useSavePermissionMatrix() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (m: PermissionMatrix) => erpServices.permissions.saveMatrix(m),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.matrix }),
  });
}
