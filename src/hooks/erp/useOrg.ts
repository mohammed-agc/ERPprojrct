import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { erpServices } from "@/services/erp";
import type { OrgDepartment } from "@/services/erp";

const KEYS = {
  departments: ["erp", "org", "departments"] as const,
  units:       ["erp", "org", "units"] as const,
  positions:   ["erp", "org", "positions"] as const,
  assignments: ["erp", "org", "assignments"] as const,
};

export function useDepartments() {
  return useQuery({ queryKey: KEYS.departments, queryFn: () => erpServices.org.listDepartments() });
}
export function useUnits() {
  return useQuery({ queryKey: KEYS.units, queryFn: () => erpServices.org.listUnits() });
}
export function usePositions() {
  return useQuery({ queryKey: KEYS.positions, queryFn: () => erpServices.org.listPositions() });
}
export function useAssignments() {
  return useQuery({ queryKey: KEYS.assignments, queryFn: () => erpServices.org.listAssignments() });
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: OrgDepartment) => erpServices.org.saveDepartment(d),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.departments }),
  });
}
