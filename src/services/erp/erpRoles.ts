/**
 * ERP Governance v1.3 — Role layer for Purchasing & Sales workflows.
 * Frontend operational contract only.
 *
 * Provides:
 *  - Role enum + labels
 *  - Audit / Approval entry shapes appended to every governed doc
 *  - useRole() hook (currently reads from localStorage; backend role mapping
 *    is reserved for the existing ErpSessionContext).
 *  - Helpers: recordAudit, recordApproval, gating utilities.
 */
import { useEffect, useState } from "react";

export type ErpGovRole =
  | "purchasing_officer"
  | "purchasing_manager"
  | "accounting"
  | "receiving"
  | "inspection"
  | "inventory"
  | "sales_officer"
  | "sales_manager"
  | "delivery";

export const ROLE_LABEL: Record<ErpGovRole, string> = {
  purchasing_officer: "موظف مشتريات",
  purchasing_manager: "مدير مشتريات",
  accounting:         "المحاسبة",
  receiving:          "الاستلام",
  inspection:         "الفحص",
  inventory:          "المخزون",
  sales_officer:      "موظف مبيعات",
  sales_manager:      "مدير مبيعات",
  delivery:           "التسليم",
};

export const ROLE_OPTIONS: ErpGovRole[] = [
  "purchasing_officer","purchasing_manager","accounting","receiving","inspection",
  "inventory","sales_officer","sales_manager","delivery",
];

export interface AuditEntry {
  at: string;
  actor: string;
  role: ErpGovRole;
  action: string;
  from_status?: string;
  to_status?: string;
  note?: string;
}

export interface ApprovalEntry {
  at: string;
  actor: string;
  role: ErpGovRole;
  decision: "approved" | "rejected" | "returned";
  note?: string;
}

export interface DocLink {
  kind: string;       // 'pr' | 'po' | 'allocation' | 'allocation_confirmation' | 'p_invoice' | 'grn' | 'inspection' | 'sales_request' | 'sales_order' | 's_invoice' | 'delivery'
  id: string;
  code: string;
  label?: string;
}

export interface GovernedDoc {
  audit?: AuditEntry[];
  approvals?: ApprovalEntry[];
  previous?: DocLink;
}

const LS_KEY = "sarat.erprole.v1";

export function getActiveRole(): ErpGovRole {
  if (typeof window === "undefined") return "purchasing_officer";
  return (localStorage.getItem(LS_KEY) as ErpGovRole) || "purchasing_officer";
}
export function setActiveRole(r: ErpGovRole) {
  if (typeof window !== "undefined") {
    localStorage.setItem(LS_KEY, r);
    window.dispatchEvent(new CustomEvent("erp-role-change", { detail: r }));
  }
}

export function useRole(): [ErpGovRole, (r: ErpGovRole) => void] {
  const [role, setRole] = useState<ErpGovRole>(() => getActiveRole());
  useEffect(() => {
    const onChange = (e: Event) => setRole((e as CustomEvent).detail as ErpGovRole);
    window.addEventListener("erp-role-change", onChange);
    return () => window.removeEventListener("erp-role-change", onChange);
  }, []);
  return [role, (r) => { setActiveRole(r); setRole(r); }];
}

/** Default actor label per role (used for audit when actor name unknown). */
export const ROLE_ACTOR_DEFAULT: Record<ErpGovRole, string> = {
  purchasing_officer: "موظف المشتريات",
  purchasing_manager: "مدير المشتريات",
  accounting:         "المحاسب",
  receiving:          "موظف الاستلام",
  inspection:         "الفاحص",
  inventory:          "أمين المخزون",
  sales_officer:      "موظف المبيعات",
  sales_manager:      "مدير المبيعات",
  delivery:           "موظف التسليم",
};

export function makeAudit(input: {
  role: ErpGovRole;
  action: string;
  actor?: string;
  from_status?: string;
  to_status?: string;
  note?: string;
}): AuditEntry {
  return {
    at: new Date().toISOString(),
    actor: input.actor ?? ROLE_ACTOR_DEFAULT[input.role],
    role: input.role,
    action: input.action,
    from_status: input.from_status,
    to_status: input.to_status,
    note: input.note,
  };
}

export function makeApproval(input: {
  role: ErpGovRole;
  decision: ApprovalEntry["decision"];
  actor?: string;
  note?: string;
}): ApprovalEntry {
  return {
    at: new Date().toISOString(),
    actor: input.actor ?? ROLE_ACTOR_DEFAULT[input.role],
    role: input.role,
    decision: input.decision,
    note: input.note,
  };
}

/** Format ISO timestamp for audit display. */
export function fmtAuditTime(iso: string): string {
  return new Date(iso).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
}
