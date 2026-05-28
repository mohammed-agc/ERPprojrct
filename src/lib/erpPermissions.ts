/**
 * ERP frontend visibility layer.
 * Pure UI logic — NOT a backend authorization mechanism.
 *
 * Future backend integration:
 *   canPerform(action, state, permissionSet)
 * where permissionSet comes from the server.
 */

export type SalesOrderState =
  | "draft"
  | "confirmed"
  | "invoiced"
  | "paid"
  | "delivered"
  | "cancelled";

export type SalesAction =
  | "save"
  | "edit_header"
  | "edit_lines"
  | "edit_pricing"
  | "confirm"
  | "cancel"
  | "approve_discount"
  | "invoice"
  | "receive_payment"
  | "deliver"
  | "print";

export type ErpRole =
  | "sales_employee"
  | "sales_manager"
  | "accountant"
  | "cashier"
  | "delivery_officer"
  | "admin";

export const ROLE_LABELS: Record<ErpRole, string> = {
  sales_employee: "موظف مبيعات",
  sales_manager: "مدير مبيعات",
  accountant: "محاسب",
  cashier: "أمين صندوق",
  delivery_officer: "مسؤول تسليم",
  admin: "مدير النظام",
};

export const STATE_LABELS: Record<SalesOrderState, string> = {
  draft: "مسودة",
  confirmed: "مؤكَّد",
  invoiced: "مفوتر",
  paid: "مسدَّد",
  delivered: "مُسلَّم",
  cancelled: "ملغى",
};

export const ACTION_LABELS: Record<SalesAction, string> = {
  save: "حفظ",
  edit_header: "تعديل الترويسة",
  edit_lines: "تعديل البنود",
  edit_pricing: "تعديل الأسعار",
  confirm: "تأكيد",
  cancel: "إلغاء",
  approve_discount: "اعتماد الخصم",
  invoice: "إصدار فاتورة",
  receive_payment: "استلام دفعة",
  deliver: "تسليم",
  print: "طباعة",
};

/** role -> set of actions allowed (regardless of state) */
const ROLE_ACTIONS: Record<ErpRole, Set<SalesAction>> = {
  sales_employee: new Set(["save", "edit_header", "edit_lines", "edit_pricing", "print"]),
  sales_manager: new Set([
    "save", "edit_header", "edit_lines", "edit_pricing",
    "confirm", "cancel", "approve_discount", "print",
  ]),
  accountant: new Set(["invoice", "print"]),
  cashier: new Set(["receive_payment", "print"]),
  delivery_officer: new Set(["deliver", "print"]),
  admin: new Set([
    "save", "edit_header", "edit_lines", "edit_pricing",
    "confirm", "cancel", "approve_discount",
    "invoice", "receive_payment", "deliver", "print",
  ]),
};

/** action -> set of states where the action is operationally valid */
const ACTION_STATES: Record<SalesAction, Set<SalesOrderState>> = {
  save:              new Set(["draft"]),
  edit_header:       new Set(["draft"]),
  edit_lines:        new Set(["draft"]),
  edit_pricing:      new Set(["draft"]),
  confirm:           new Set(["draft"]),
  cancel:            new Set(["draft", "confirmed"]),
  approve_discount:  new Set(["draft"]),
  invoice:           new Set(["confirmed"]),
  receive_payment:   new Set(["invoiced"]),
  deliver:           new Set(["paid", "invoiced"]),
  print:             new Set(["draft", "confirmed", "invoiced", "paid", "delivered"]),
};

export type DenyReason = "state" | "role" | "cancelled";

export interface PermissionResult {
  allowed: boolean;
  reason?: DenyReason;
  message?: string;
}

export function canPerform(
  action: SalesAction,
  state: SalesOrderState,
  role: ErpRole,
): PermissionResult {
  if (state === "cancelled") {
    return { allowed: false, reason: "cancelled", message: "الأمر ملغى — لا تتوفر إجراءات تشغيلية" };
  }
  const roleSet = ROLE_ACTIONS[role];
  if (!roleSet.has(action)) {
    return {
      allowed: false,
      reason: "role",
      message: `هذا الإجراء خارج صلاحيات: ${ROLE_LABELS[role]}`,
    };
  }
  const stateSet = ACTION_STATES[action];
  if (!stateSet.has(state)) {
    return {
      allowed: false,
      reason: "state",
      message: `لا يمكن تنفيذ "${ACTION_LABELS[action]}" في حالة: ${STATE_LABELS[state]}`,
    };
  }
  return { allowed: true };
}
