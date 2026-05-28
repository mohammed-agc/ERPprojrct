import { useMemo } from "react";
import { canPerform, SalesAction, SalesOrderState, PermissionResult } from "@/lib/erpPermissions";
import { useErpSession } from "@/contexts/ErpSessionContext";

/**
 * Single source of truth for sales-order action visibility.
 *
 * Currently delegates to frontend `canPerform`. When the backend workflow
 * authority ships, swap the implementation to consume `erpServices.workflow`
 * (async, cached via React Query) — the call site `actions[a].allowed`
 * stays identical.
 */
export function useSalesActions(state: SalesOrderState) {
  const { role } = useErpSession();

  return useMemo(() => {
    const ACTIONS: SalesAction[] = [
      "save", "edit_header", "edit_lines", "edit_pricing",
      "confirm", "cancel", "approve_discount",
      "invoice", "receive_payment", "deliver", "print",
    ];
    const map = {} as Record<SalesAction, PermissionResult>;
    for (const a of ACTIONS) map[a] = canPerform(a, state, role);
    return {
      role,
      actions: map,
      can: (a: SalesAction) => map[a],
    };
  }, [state, role]);
}
