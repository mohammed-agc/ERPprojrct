// L1.5 — Permission Matrix mock data (UI only)
// Action-based, workflow-aware, department-aware. No backend wiring.

export type PermType = "manager" | "operational" | "approval" | "accounting";
export type WorkflowGroup = "sales" | "purchasing" | "accounting" | "workshop" | "inventory" | "hr";

export interface PermissionDef {
  code: string;
  label_ar: string;
  group: WorkflowGroup;
  type: PermType;
  /** department codes this permission belongs to (for dept-aware filtering) */
  departments: string[];
}

export interface RoleDef {
  id: string;
  title_ar: string;
  department_code: string;
  unit_code?: string;
}

export const workflowGroupLabel: Record<WorkflowGroup, string> = {
  sales: "المبيعات",
  purchasing: "المشتريات",
  accounting: "المحاسبة",
  workshop: "الورشة",
  inventory: "المخزون",
  hr: "الموارد البشرية",
};

export const permTypeLabel: Record<PermType, string> = {
  manager: "إدارية",
  operational: "تشغيلية",
  approval: "اعتماد",
  accounting: "محاسبية",
};

export const permTypeClass: Record<PermType, string> = {
  manager:     "bg-primary/10 text-primary border-primary/30",
  operational: "bg-muted text-foreground border-border",
  approval:    "bg-warning/15 text-warning-foreground border-warning/40",
  accounting:  "bg-success/10 text-success border-success/30",
};

export const mockPermissions: PermissionDef[] = [
  // Sales
  { code: "create_sales_order",   label_ar: "إنشاء أمر بيع",        group: "sales", type: "operational", departments: ["vehicles","spare_parts"] },
  { code: "edit_sales_order",     label_ar: "تعديل أمر بيع",        group: "sales", type: "operational", departments: ["vehicles","spare_parts"] },
  { code: "confirm_sales_order",  label_ar: "تأكيد أمر بيع",        group: "sales", type: "approval",    departments: ["vehicles","spare_parts"] },
  { code: "cancel_order",         label_ar: "إلغاء أمر بيع",        group: "sales", type: "approval",    departments: ["vehicles","spare_parts"] },
  { code: "approve_discount",     label_ar: "اعتماد خصم استثنائي",  group: "sales", type: "approval",    departments: ["vehicles","spare_parts"] },
  { code: "create_invoice",       label_ar: "إنشاء فاتورة",         group: "sales", type: "operational", departments: ["vehicles","spare_parts"] },
  { code: "confirm_delivery",     label_ar: "تأكيد تسليم المركبة",  group: "sales", type: "operational", departments: ["vehicles"] },

  // Purchasing
  { code: "create_purchase_order",  label_ar: "إنشاء أمر شراء",      group: "purchasing", type: "operational", departments: ["vehicles","spare_parts"] },
  { code: "approve_purchase_order", label_ar: "اعتماد أمر شراء",     group: "purchasing", type: "approval",    departments: ["vehicles","spare_parts"] },

  // Accounting
  { code: "post_invoice",         label_ar: "ترحيل الفاتورة محاسبياً", group: "accounting", type: "accounting", departments: ["accounting"] },
  { code: "post_journal_entry",   label_ar: "ترحيل قيد يومية",         group: "accounting", type: "accounting", departments: ["accounting"] },
  { code: "receive_payment",      label_ar: "استلام دفعة",             group: "accounting", type: "operational", departments: ["accounting"] },
  { code: "approve_journal",      label_ar: "اعتماد قيد",              group: "accounting", type: "approval",   departments: ["accounting"] },
  { code: "view_financial_reports", label_ar: "عرض التقارير المالية",  group: "accounting", type: "manager",    departments: ["accounting"] },

  // Workshop
  { code: "create_workshop_order",  label_ar: "إنشاء أمر ورشة",      group: "workshop", type: "operational", departments: ["workshop"] },
  { code: "close_workshop_order",   label_ar: "إغلاق أمر ورشة",      group: "workshop", type: "approval",    departments: ["workshop"] },
  { code: "assign_technician",      label_ar: "تعيين فني",           group: "workshop", type: "manager",     departments: ["workshop"] },

  // Inventory
  { code: "adjust_stock",         label_ar: "تسوية مخزون",          group: "inventory", type: "approval",    departments: ["spare_parts"] },
  { code: "receive_stock",        label_ar: "استلام بضاعة",         group: "inventory", type: "operational", departments: ["spare_parts"] },

  // HR
  { code: "manage_employees",     label_ar: "إدارة الموظفين",       group: "hr", type: "manager", departments: ["hr"] },
  { code: "manage_assignments",   label_ar: "إدارة التعيينات",      group: "hr", type: "manager", departments: ["hr"] },
];

export const mockRoles: RoleDef[] = [
  { id: "r-veh-mgr",   title_ar: "مدير المبيعات",       department_code: "vehicles",    unit_code: "sales" },
  { id: "r-veh-emp",   title_ar: "موظف مبيعات",         department_code: "vehicles",    unit_code: "sales" },
  { id: "r-veh-del",   title_ar: "موظف تسليم",          department_code: "vehicles",    unit_code: "delivery" },
  { id: "r-wsh-mgr",   title_ar: "مدير الورشة",         department_code: "workshop",    unit_code: "workshop" },
  { id: "r-wsh-rec",   title_ar: "موظف استقبال",        department_code: "workshop",    unit_code: "reception" },
  { id: "r-acc-mgr",   title_ar: "المدير المالي",       department_code: "accounting" },
  { id: "r-acc-acc",   title_ar: "محاسب",               department_code: "accounting" },
  { id: "r-acc-cas",   title_ar: "أمين صندوق",          department_code: "accounting" },
  { id: "r-prt-emp",   title_ar: "موظف قطع غيار",       department_code: "spare_parts" },
  { id: "r-hr-mgr",    title_ar: "مدير الموارد البشرية", department_code: "hr" },
];

/** Initial matrix: role_id -> Set(permission_code). Sensible defaults. */
export const mockInitialMatrix: Record<string, string[]> = {
  "r-veh-mgr": ["create_sales_order","edit_sales_order","confirm_sales_order","cancel_order","approve_discount","create_invoice","confirm_delivery","create_purchase_order","approve_purchase_order"],
  "r-veh-emp": ["create_sales_order","edit_sales_order","create_invoice"],
  "r-veh-del": ["confirm_delivery"],
  "r-wsh-mgr": ["create_workshop_order","close_workshop_order","assign_technician"],
  "r-wsh-rec": ["create_workshop_order"],
  "r-acc-mgr": ["post_invoice","post_journal_entry","approve_journal","view_financial_reports","receive_payment"],
  "r-acc-acc": ["post_invoice","post_journal_entry","receive_payment"],
  "r-acc-cas": ["receive_payment"],
  "r-prt-emp": ["create_sales_order","create_invoice","receive_stock","adjust_stock"],
  "r-hr-mgr":  ["manage_employees","manage_assignments"],
};
