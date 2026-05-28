/**
 * Cost Centers & Financial Dimensions — frontend operational contract.
 *
 * Persisted to localStorage today; the same shapes will map to backend
 * tables (cost_centers, financial_dimensions, dim_values, allocations,
 * journal_line_dimensions) without UI changes.
 *
 * Profitability synthesis is computed client-side from seeded mock
 * monthly figures so the executive dashboards have realistic shapes.
 */

const KEY = "erp.costing.v1";

export type CenterStatus = "active" | "inactive";
export type CenterKind = "revenue" | "cost" | "support" | "branch";

export interface CostCenter {
  id: string;
  code: string;
  name_ar: string;
  name_en?: string;
  parent_id: string | null;
  kind: CenterKind;
  manager?: string | null;
  status: CenterStatus;
  budget_monthly?: number;
  /** Synthetic monthly figures for analytics (12 months YTD). */
  revenue?: number[];
  cogs?: number[];
  opex?: number[];
}

export type DimensionType = "branch" | "department" | "activity" | "project" | "channel" | "unit";

export interface FinancialDimension {
  id: string;
  code: string;
  name_ar: string;
  type: DimensionType;
  is_required: boolean;
  is_active: boolean;
}

export interface DimensionValue {
  id: string;
  dimension_id: string;
  code: string;
  name_ar: string;
  is_active: boolean;
}

export interface AllocationRule {
  id: string;
  name_ar: string;
  source_center_id: string;
  method: "equal" | "headcount" | "revenue" | "manual";
  targets: { center_id: string; weight: number }[];
  is_active: boolean;
}

interface Envelope {
  centers: CostCenter[];
  dimensions: FinancialDimension[];
  values: DimensionValue[];
  rules: AllocationRule[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- seed ---------------- */

const m = (base: number, vol = 0.18) =>
  Array.from({ length: 12 }, (_, i) =>
    Math.round(base * (1 + Math.sin((i + 1) / 2) * vol + (Math.random() - 0.5) * vol)),
  );

const seed = (): Envelope => {
  const centers: CostCenter[] = [
    { id: "cc-root-rev", code: "1000", name_ar: "مراكز الإيراد", parent_id: null, kind: "revenue", status: "active" },
    { id: "cc-veh", code: "1100", name_ar: "مبيعات المركبات", parent_id: "cc-root-rev", kind: "revenue", manager: "أحمد العتيبي", status: "active",
      budget_monthly: 850000, revenue: m(1200000), cogs: m(900000), opex: m(60000) },
    { id: "cc-prt", code: "1200", name_ar: "مبيعات قطع الغيار", parent_id: "cc-root-rev", kind: "revenue", manager: "خالد الزهراني", status: "active",
      budget_monthly: 220000, revenue: m(310000), cogs: m(210000), opex: m(22000) },
    { id: "cc-wsh", code: "1300", name_ar: "خدمات الورشة", parent_id: "cc-root-rev", kind: "revenue", manager: "فهد الشمري", status: "active",
      budget_monthly: 180000, revenue: m(240000), cogs: m(120000), opex: m(40000) },

    { id: "cc-root-supp", code: "2000", name_ar: "مراكز الدعم", parent_id: null, kind: "support", status: "active" },
    { id: "cc-adm", code: "2100", name_ar: "الإدارة العامة", parent_id: "cc-root-supp", kind: "support", manager: "سعد القحطاني", status: "active",
      budget_monthly: 90000, opex: m(95000, 0.08) },
    { id: "cc-mkt", code: "2200", name_ar: "التسويق", parent_id: "cc-root-supp", kind: "cost", manager: "نورة الدوسري", status: "active",
      budget_monthly: 55000, opex: m(60000, 0.25) },
    { id: "cc-hr",  code: "2300", name_ar: "الموارد البشرية", parent_id: "cc-root-supp", kind: "support", manager: "نورة الدوسري", status: "active",
      budget_monthly: 45000, opex: m(48000, 0.06) },
    { id: "cc-it",  code: "2400", name_ar: "تقنية المعلومات", parent_id: "cc-root-supp", kind: "cost", manager: "—", status: "active",
      budget_monthly: 35000, opex: m(38000, 0.12) },

    { id: "cc-root-br", code: "3000", name_ar: "الفروع", parent_id: null, kind: "branch", status: "active" },
    { id: "cc-br-ruh", code: "3100", name_ar: "فرع الرياض", parent_id: "cc-root-br", kind: "branch", manager: "ماجد السبيعي", status: "active",
      budget_monthly: 950000, revenue: m(1450000), cogs: m(980000), opex: m(180000) },
    { id: "cc-br-jed", code: "3200", name_ar: "فرع جدة", parent_id: "cc-root-br", kind: "branch", manager: "بدر القرني", status: "active",
      budget_monthly: 700000, revenue: m(980000), cogs: m(680000), opex: m(140000) },
    { id: "cc-br-dmm", code: "3300", name_ar: "فرع الدمام", parent_id: "cc-root-br", kind: "branch", manager: "تركي الرشيدي", status: "active",
      budget_monthly: 520000, revenue: m(720000), cogs: m(510000), opex: m(110000) },
  ];

  const dimensions: FinancialDimension[] = [
    { id: "d-branch", code: "BRANCH", name_ar: "الفرع", type: "branch", is_required: true, is_active: true },
    { id: "d-dept",   code: "DEPT",   name_ar: "القسم", type: "department", is_required: true, is_active: true },
    { id: "d-act",    code: "ACT",    name_ar: "النشاط", type: "activity", is_required: false, is_active: true },
    { id: "d-prj",    code: "PRJ",    name_ar: "المشروع", type: "project", is_required: false, is_active: true },
    { id: "d-chn",    code: "CHN",    name_ar: "قناة البيع", type: "channel", is_required: false, is_active: true },
    { id: "d-unit",   code: "UNIT",   name_ar: "الوحدة التشغيلية", type: "unit", is_required: false, is_active: false },
  ];

  const values: DimensionValue[] = [
    { id: uid(), dimension_id: "d-branch", code: "RUH", name_ar: "الرياض", is_active: true },
    { id: uid(), dimension_id: "d-branch", code: "JED", name_ar: "جدة", is_active: true },
    { id: uid(), dimension_id: "d-branch", code: "DMM", name_ar: "الدمام", is_active: true },
    { id: uid(), dimension_id: "d-dept", code: "VEH", name_ar: "مبيعات المركبات", is_active: true },
    { id: uid(), dimension_id: "d-dept", code: "PRT", name_ar: "قطع الغيار", is_active: true },
    { id: uid(), dimension_id: "d-dept", code: "WSH", name_ar: "الورشة", is_active: true },
    { id: uid(), dimension_id: "d-dept", code: "ADM", name_ar: "الإدارة", is_active: true },
    { id: uid(), dimension_id: "d-chn", code: "RETAIL", name_ar: "بيع مباشر", is_active: true },
    { id: uid(), dimension_id: "d-chn", code: "FLEET",  name_ar: "أساطيل", is_active: true },
    { id: uid(), dimension_id: "d-chn", code: "ONLINE", name_ar: "إلكتروني", is_active: true },
    { id: uid(), dimension_id: "d-act", code: "NEW",    name_ar: "جديد", is_active: true },
    { id: uid(), dimension_id: "d-act", code: "USED",   name_ar: "مستعمل", is_active: true },
    { id: uid(), dimension_id: "d-act", code: "SVC",    name_ar: "خدمات", is_active: true },
  ];

  const rules: AllocationRule[] = [
    {
      id: uid(), name_ar: "توزيع الإدارة العامة على الفروع",
      source_center_id: "cc-adm", method: "revenue", is_active: true,
      targets: [
        { center_id: "cc-br-ruh", weight: 45 },
        { center_id: "cc-br-jed", weight: 32 },
        { center_id: "cc-br-dmm", weight: 23 },
      ],
    },
    {
      id: uid(), name_ar: "توزيع التسويق على الأقسام التشغيلية",
      source_center_id: "cc-mkt", method: "equal", is_active: true,
      targets: [
        { center_id: "cc-veh", weight: 50 },
        { center_id: "cc-prt", weight: 25 },
        { center_id: "cc-wsh", weight: 25 },
      ],
    },
    {
      id: uid(), name_ar: "توزيع تقنية المعلومات",
      source_center_id: "cc-it", method: "headcount", is_active: false,
      targets: [
        { center_id: "cc-veh", weight: 40 },
        { center_id: "cc-prt", weight: 20 },
        { center_id: "cc-wsh", weight: 20 },
        { center_id: "cc-adm", weight: 20 },
      ],
    },
  ];

  return { centers, dimensions, values, rules };
};

const load = (): Envelope => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const env = seed();
  try { localStorage.setItem(KEY, JSON.stringify(env)); } catch {}
  return env;
};
const save = (e: Envelope) => { try { localStorage.setItem(KEY, JSON.stringify(e)); } catch {} };

/* ---------------- analytics shapes ---------------- */

export interface CenterAnalytics {
  center: CostCenter;
  revenue: number;
  cogs: number;
  opex: number;
  gross: number;
  net: number;
  gross_margin: number; // %
  net_margin: number; // %
  budget_var: number; // % vs budget
}

export type PeriodMode = "mtd" | "ytd" | "q";

const slice = (arr: number[] | undefined, period: PeriodMode, quarter = 1) => {
  const now = new Date();
  const month = now.getMonth(); // 0..11
  const a = arr ?? Array(12).fill(0);
  if (period === "mtd") return [a[month] || 0];
  if (period === "ytd") return a.slice(0, month + 1);
  // quarter
  const start = (quarter - 1) * 3;
  return a.slice(start, start + 3);
};

const sum = (a: number[]) => a.reduce((s, x) => s + (x || 0), 0);

const aggregate = (c: CostCenter, period: PeriodMode, quarter = 1): CenterAnalytics => {
  const revenue = sum(slice(c.revenue, period, quarter));
  const cogs = sum(slice(c.cogs, period, quarter));
  const opex = sum(slice(c.opex, period, quarter));
  const gross = revenue - cogs;
  const net = gross - opex;
  const months = slice(c.revenue ?? c.opex, period, quarter).length || 1;
  const budget = (c.budget_monthly || 0) * months;
  return {
    center: c, revenue, cogs, opex, gross, net,
    gross_margin: revenue > 0 ? (gross / revenue) * 100 : 0,
    net_margin: revenue > 0 ? (net / revenue) * 100 : 0,
    budget_var: budget > 0 ? ((opex + cogs - budget) / budget) * 100 : 0,
  };
};

/* ---------------- api ---------------- */

export const costing = {
  /* centers */
  async listCenters(): Promise<CostCenter[]> { return load().centers; },
  async saveCenter(c: CostCenter): Promise<CostCenter> {
    const env = load();
    const i = env.centers.findIndex(x => x.id === c.id);
    if (i >= 0) env.centers[i] = c; else env.centers.push({ ...c, id: c.id || uid() });
    save(env); return c;
  },
  async deleteCenter(id: string): Promise<void> {
    const env = load();
    env.centers = env.centers.filter(c => c.id !== id && c.parent_id !== id);
    save(env);
  },

  /* dimensions */
  async listDimensions(): Promise<FinancialDimension[]> { return load().dimensions; },
  async saveDimension(d: FinancialDimension): Promise<FinancialDimension> {
    const env = load();
    const i = env.dimensions.findIndex(x => x.id === d.id);
    if (i >= 0) env.dimensions[i] = d; else env.dimensions.push({ ...d, id: d.id || uid() });
    save(env); return d;
  },
  async listValues(dimensionId?: string): Promise<DimensionValue[]> {
    const all = load().values;
    return dimensionId ? all.filter(v => v.dimension_id === dimensionId) : all;
  },
  async saveValue(v: DimensionValue): Promise<DimensionValue> {
    const env = load();
    const i = env.values.findIndex(x => x.id === v.id);
    if (i >= 0) env.values[i] = v; else env.values.push({ ...v, id: v.id || uid() });
    save(env); return v;
  },

  /* allocation */
  async listRules(): Promise<AllocationRule[]> { return load().rules; },

  /* analytics */
  async analytics(period: PeriodMode = "ytd", quarter = 1): Promise<CenterAnalytics[]> {
    const env = load();
    return env.centers
      .filter(c => c.status === "active" && c.parent_id !== null) // leaves
      .map(c => aggregate(c, period, quarter));
  },
  async branchAnalytics(period: PeriodMode = "ytd", quarter = 1) {
    return (await this.analytics(period, quarter)).filter(a => a.center.kind === "branch");
  },
  async departmentAnalytics(period: PeriodMode = "ytd", quarter = 1) {
    return (await this.analytics(period, quarter))
      .filter(a => a.center.kind === "revenue" || a.center.kind === "support" || a.center.kind === "cost");
  },
  /** Monthly trend across all leaves: [{ month: "01", revenue, cost, net }] */
  async monthlyTrend(): Promise<{ month: string; revenue: number; cost: number; net: number }[]> {
    const env = load();
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: String(i + 1).padStart(2, "0"), revenue: 0, cost: 0, net: 0,
    }));
    for (const c of env.centers) {
      for (let i = 0; i < 12; i++) {
        const r = c.revenue?.[i] || 0;
        const cg = c.cogs?.[i] || 0;
        const op = c.opex?.[i] || 0;
        months[i].revenue += r;
        months[i].cost += cg + op;
        months[i].net += r - cg - op;
      }
    }
    return months;
  },

  resetSeed() { try { localStorage.removeItem(KEY); } catch {} load(); },
};

export const dimensionTypeLabel: Record<DimensionType, string> = {
  branch: "فرع", department: "قسم", activity: "نشاط", project: "مشروع", channel: "قناة بيع", unit: "وحدة تشغيلية",
};
export const centerKindLabel: Record<CenterKind, string> = {
  revenue: "إيراد", cost: "تكلفة", support: "دعم", branch: "فرع",
};
export const centerKindColor: Record<CenterKind, string> = {
  revenue: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  cost: "bg-rose-500/10 text-rose-700 border-rose-300",
  support: "bg-amber-500/10 text-amber-700 border-amber-300",
  branch: "bg-blue-500/10 text-blue-700 border-blue-300",
};
export const periodLabel: Record<PeriodMode, string> = {
  mtd: "الشهر الحالي", ytd: "منذ بداية السنة", q: "ربع سنوي",
};
