/**
 * ERP frontend visibility layer.
 * Pure UI logic — NOT a backend authorization mechanism.
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
  | "admin"
  | "general_manager"
  | "purchasing_officer"
  | "purchasing_manager"
  | "sales_officer"
  | "sales_manager"
  | "sales_employee"
  | "accountant"
  | "treasury_officer"
  | "cashier"
  | "inventory_officer"
  | "receiving_officer"
  | "inspection_officer"
  | "delivery_officer"
  | "workshop_manager"
  | "spare_parts_manager"
  | "employee";

export const ROLE_LABELS: Record<ErpRole, string> = {
  admin: "مدير النظام",
  general_manager: "مدير عام",
  purchasing_officer: "مسؤول مشتريات",
  purchasing_manager: "مدير مشتريات",
  sales_officer: "مسؤول مبيعات",
  sales_manager: "مدير مبيعات",
  sales_employee: "موظف مبيعات",
  accountant: "محاسب",
  treasury_officer: "أمين خزينة",
  cashier: "أمين صندوق",
  inventory_officer: "مسؤول مخزون",
  receiving_officer: "مسؤول استلام",
  inspection_officer: "مسؤول فحص",
  delivery_officer: "مسؤول تسليم",
  workshop_manager: "مدير ورشة",
  spare_parts_manager: "مدير قطع غيار",
  employee: "موظف",
};

export const ROLE_DESCRIPTIONS: Record<ErpRole, string> = {
  admin: "صلاحية كاملة على النظام والإعدادات وإدارة المستخدمين",
  general_manager: "إشراف شامل على كل الوحدات التشغيلية مع اعتمادات عليا",
  purchasing_officer: "إنشاء طلبات وأوامر الشراء والمتابعة مع الموردين",
  purchasing_manager: "اعتماد أوامر الشراء والعقود والتخصيصات",
  sales_officer: "إصدار عروض الأسعار وأوامر البيع وخدمة العملاء",
  sales_manager: "اعتماد الخصومات وأوامر البيع وإدارة فريق المبيعات",
  sales_employee: "إدخال أوامر البيع الأساسية",
  accountant: "قيود اليومية والفواتير والتقارير المالية",
  treasury_officer: "إدارة المقبوضات والمدفوعات والتحويلات والتسوية البنكية",
  cashier: "تحصيل المدفوعات النقدية من العملاء",
  inventory_officer: "حركات المخزون والتحويلات وإدارة المستودعات",
  receiving_officer: "استلام البضائع وإصدار إشعارات الاستلام (GRN)",
  inspection_officer: "فحص واعتماد المركبات والبضائع الواردة",
  delivery_officer: "تنسيق وتنفيذ تسليمات العملاء",
  workshop_manager: "إدارة الورشة وأوامر العمل والصيانة",
  spare_parts_manager: "إدارة مخزون قطع الغيار ومبيعاتها",
  employee: "صلاحية أساسية محدودة",
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
  admin: new Set([
    "save", "edit_header", "edit_lines", "edit_pricing",
    "confirm", "cancel", "approve_discount",
    "invoice", "receive_payment", "deliver", "print",
  ]),
  general_manager: new Set([
    "save", "edit_header", "edit_lines", "edit_pricing",
    "confirm", "cancel", "approve_discount",
    "invoice", "receive_payment", "deliver", "print",
  ]),
  sales_employee: new Set(["save", "edit_header", "edit_lines", "edit_pricing", "print"]),
  sales_officer: new Set(["save", "edit_header", "edit_lines", "edit_pricing", "confirm", "print"]),
  sales_manager: new Set([
    "save", "edit_header", "edit_lines", "edit_pricing",
    "confirm", "cancel", "approve_discount", "print",
  ]),
  accountant: new Set(["invoice", "print"]),
  treasury_officer: new Set(["receive_payment", "print"]),
  cashier: new Set(["receive_payment", "print"]),
  delivery_officer: new Set(["deliver", "print"]),
  purchasing_officer: new Set(["print"]),
  purchasing_manager: new Set(["print"]),
  inventory_officer: new Set(["print"]),
  receiving_officer: new Set(["print"]),
  inspection_officer: new Set(["print"]),
  workshop_manager: new Set(["print"]),
  spare_parts_manager: new Set(["print"]),
  employee: new Set(["print"]),
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
  const roleSet = ROLE_ACTIONS[role] ?? new Set<SalesAction>();
  if (!roleSet.has(action)) {
    return {
      allowed: false,
      reason: "role",
      message: `هذا الإجراء خارج صلاحيات: ${ROLE_LABELS[role] ?? role}`,
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
