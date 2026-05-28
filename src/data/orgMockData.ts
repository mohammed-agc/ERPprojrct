// L1.4 — Organizational UI Foundation — MOCK DATA ONLY
// No backend integration. Used purely for visual UI scaffolding.

export type DeptStatus = "active" | "inactive";

export interface OrgDepartment {
  id: string;
  code: string;
  name_ar: string;
  name_en: string;
  manager: string | null;
  status: DeptStatus;
}

export interface OrgUnit {
  id: string;
  department_id: string;
  name_ar: string;
  name_en: string;
  manager: string | null;
}

export interface OrgPosition {
  id: string;
  department_id: string;
  unit_id: string | null;
  title_ar: string;
  title_en: string;
  level: "manager" | "supervisor" | "officer" | "staff";
}

export interface OrgAssignment {
  id: string;
  employee_no: string;
  employee_name: string;
  department_id: string;
  unit_id: string | null;
  position_id: string;
  start_date: string;
  status: "active" | "on_leave" | "ended";
}

export const mockDepartments: OrgDepartment[] = [
  { id: "d-veh",  code: "vehicles",     name_ar: "إدارة المركبات",     name_en: "Vehicle Department",     manager: "أحمد العتيبي",  status: "active" },
  { id: "d-prt",  code: "spare_parts",  name_ar: "إدارة قطع الغيار",   name_en: "Spare Parts Department", manager: "خالد الزهراني", status: "active" },
  { id: "d-wsh",  code: "workshop",     name_ar: "إدارة الورشة",       name_en: "Workshop Department",    manager: "فهد الشمري",    status: "active" },
  { id: "d-acc",  code: "accounting",   name_ar: "الإدارة المالية",    name_en: "Accounting Department",  manager: "سعد القحطاني",  status: "active" },
  { id: "d-hr",   code: "hr",           name_ar: "الموارد البشرية",    name_en: "HR Department",          manager: "نورة الدوسري",  status: "active" },
];

export const mockUnits: OrgUnit[] = [
  // Vehicles
  { id: "u-veh-sales",  department_id: "d-veh", name_ar: "المبيعات",    name_en: "Sales",       manager: "محمد الحربي" },
  { id: "u-veh-purch",  department_id: "d-veh", name_ar: "المشتريات",   name_en: "Purchasing",  manager: "بدر القرني" },
  { id: "u-veh-del",    department_id: "d-veh", name_ar: "التسليم",     name_en: "Delivery",    manager: "ماجد السبيعي" },
  // Workshop
  { id: "u-wsh-rec",    department_id: "d-wsh", name_ar: "الاستقبال",   name_en: "Reception",   manager: "علي الغامدي" },
  { id: "u-wsh-ctrl",   department_id: "d-wsh", name_ar: "الفحص والمراقبة", name_en: "Control", manager: "زياد العنزي" },
  { id: "u-wsh-work",   department_id: "d-wsh", name_ar: "الورشة الفنية", name_en: "Workshop",  manager: "حسن السلمي" },
  { id: "u-wsh-wash",   department_id: "d-wsh", name_ar: "الغسيل",      name_en: "Car Wash",    manager: "يوسف المالكي" },
  // Spare parts
  { id: "u-prt-sales",  department_id: "d-prt", name_ar: "مبيعات القطع", name_en: "Parts Sales", manager: "تركي الرشيدي" },
  { id: "u-prt-stock",  department_id: "d-prt", name_ar: "المخزون",     name_en: "Inventory",   manager: "وليد الشهري" },
  // Accounting
  { id: "u-acc-fin",    department_id: "d-acc", name_ar: "الإدارة المالية", name_en: "Financial Management", manager: "سليمان الخالدي" },
  { id: "u-acc-trs",    department_id: "d-acc", name_ar: "الخزينة",     name_en: "Treasury",    manager: "عبدالله الفهد" },
  { id: "u-acc-ar",     department_id: "d-acc", name_ar: "المدينون",    name_en: "Receivables", manager: "هيثم القرني" },
];

export const mockPositions: OrgPosition[] = [
  { id: "p-1",  department_id: "d-veh", unit_id: "u-veh-sales", title_ar: "مدير المبيعات",     title_en: "Sales Manager",     level: "manager" },
  { id: "p-2",  department_id: "d-veh", unit_id: "u-veh-sales", title_ar: "موظف مبيعات",       title_en: "Sales Employee",    level: "staff" },
  { id: "p-3",  department_id: "d-veh", unit_id: "u-veh-del",   title_ar: "موظف تسليم",        title_en: "Delivery Officer",  level: "officer" },
  { id: "p-4",  department_id: "d-wsh", unit_id: "u-wsh-work",  title_ar: "مدير الورشة",       title_en: "Workshop Manager",  level: "manager" },
  { id: "p-5",  department_id: "d-wsh", unit_id: "u-wsh-rec",   title_ar: "موظف استقبال",      title_en: "Reception Officer", level: "officer" },
  { id: "p-6",  department_id: "d-acc", unit_id: "u-acc-fin",   title_ar: "محاسب",             title_en: "Accountant",        level: "staff" },
  { id: "p-7",  department_id: "d-acc", unit_id: "u-acc-trs",   title_ar: "أمين صندوق",        title_en: "Cashier",           level: "officer" },
  { id: "p-8",  department_id: "d-prt", unit_id: "u-prt-sales", title_ar: "موظف بيع قطع",      title_en: "Parts Sales Staff", level: "staff" },
  { id: "p-9",  department_id: "d-hr",  unit_id: null,          title_ar: "مدير الموارد البشرية", title_en: "HR Manager",     level: "manager" },
];

export const mockAssignments: OrgAssignment[] = [
  { id: "a-1", employee_no: "EMP-1001", employee_name: "أحمد العتيبي",   department_id: "d-veh", unit_id: "u-veh-sales", position_id: "p-1", start_date: "2023-01-15", status: "active" },
  { id: "a-2", employee_no: "EMP-1002", employee_name: "محمد الحربي",    department_id: "d-veh", unit_id: "u-veh-sales", position_id: "p-2", start_date: "2023-04-02", status: "active" },
  { id: "a-3", employee_no: "EMP-1003", employee_name: "ماجد السبيعي",   department_id: "d-veh", unit_id: "u-veh-del",   position_id: "p-3", start_date: "2024-02-10", status: "active" },
  { id: "a-4", employee_no: "EMP-1010", employee_name: "فهد الشمري",     department_id: "d-wsh", unit_id: "u-wsh-work",  position_id: "p-4", start_date: "2022-08-21", status: "active" },
  { id: "a-5", employee_no: "EMP-1011", employee_name: "علي الغامدي",    department_id: "d-wsh", unit_id: "u-wsh-rec",   position_id: "p-5", start_date: "2024-06-01", status: "active" },
  { id: "a-6", employee_no: "EMP-1020", employee_name: "سعد القحطاني",   department_id: "d-acc", unit_id: "u-acc-fin",   position_id: "p-6", start_date: "2021-11-03", status: "active" },
  { id: "a-7", employee_no: "EMP-1021", employee_name: "عبدالله الفهد",  department_id: "d-acc", unit_id: "u-acc-trs",   position_id: "p-7", start_date: "2023-09-12", status: "on_leave" },
  { id: "a-8", employee_no: "EMP-1030", employee_name: "تركي الرشيدي",   department_id: "d-prt", unit_id: "u-prt-sales", position_id: "p-8", start_date: "2024-03-18", status: "active" },
  { id: "a-9", employee_no: "EMP-1040", employee_name: "نورة الدوسري",   department_id: "d-hr",  unit_id: null,          position_id: "p-9", start_date: "2020-05-04", status: "active" },
];

export const levelLabel: Record<OrgPosition["level"], string> = {
  manager: "مدير",
  supervisor: "مشرف",
  officer: "موظف تنفيذي",
  staff: "موظف",
};

export const assignmentStatusLabel: Record<OrgAssignment["status"], string> = {
  active: "نشط",
  on_leave: "في إجازة",
  ended: "منتهٍ",
};
