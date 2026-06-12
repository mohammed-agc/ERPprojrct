import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { accounting, type FinancialKpis } from "@/services/erp/accounting";
import { fmtSAR, fmtCompact } from "@/lib/erpFormat";
import { TrendingUp, TrendingDown, Wallet, Landmark, HandCoins, Receipt, Scale, BookText, FileBarChart, BarChart3, ArrowLeftRight, ArrowRight } from "lucide-react";

interface ReportCard { to: string; title: string; desc: string; icon: any; }

const reports: ReportCard[] = [
  { to: "/income-statement", title: "قائمة الدخل", desc: "الإيرادات والمصروفات وصافي الربح", icon: TrendingUp },
  { to: "/balance-sheet", title: "الميزانية العمومية", desc: "الأصول والالتزامات وحقوق الملكية", icon: Scale },
  { to: "/cash-flow", title: "التدفقات النقدية", desc: "حركة النقد التشغيلي", icon: ArrowLeftRight },
  { to: "/trial-balance", title: "ميزان المراجعة", desc: "أرصدة الحسابات المُرحَّلة", icon: BarChart3 },
  { to: "/general-ledger", title: "دفتر الأستاذ", desc: "حركات الحسابات التفصيلية", icon: BookText },
  { to: "/journals", title: "قيود اليومية", desc: "إدارة وتصفح القيود", icon: FileBarChart },
  { to: "/accounts", title: "دليل الحسابات", desc: "الهيكل الهرمي للحسابات", icon: BookText },
  { to: "/ar", title: "الذمم المدينة", desc: "أرصدة العملاء والتقادم", icon: HandCoins },
  { to: "/ap", title: "الذمم الدائنة", desc: "أرصدة الموردين والمستحقات", icon: Wallet },
];

function Kpi({ label, value, sub, icon: Icon, tone = "default" }: {
  label: string; value: string; sub?: string; icon: any; tone?: "default" | "good" | "bad" | "warn";
}) {
  const toneCls = {
    default: "border-border",
    good: "border-success/40 bg-success/5",
    bad: "border-destructive/40 bg-destructive/5",
    warn: "border-warning/40 bg-warning/5",
  }[tone];
  return (
    <div className={`bg-card border rounded-md p-3 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground font-medium">{label}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

export default function FinanceCenter() {
  const [kpis, setKpis] = useState<FinancialKpis | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    accounting.financialKpis().then(setKpis).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="مركز التقارير المالية" subtitle="لوحة التحكم التنفيذية — مؤشرات الأداء المالي والتقارير" sticky />

      {loading ? (
        <div className="text-center text-muted-foreground py-8">جارٍ تحميل المؤشرات…</div>
      ) : kpis && (
        <>
          {/* Liquidity */}
          <div className="text-xs font-semibold text-muted-foreground mb-2">السيولة</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Kpi label="إجمالي السيولة" value={fmtSAR(kpis.liquidity)} sub="النقد + البنوك" icon={Wallet} tone={kpis.liquidity >= 0 ? "good" : "bad"} />
            <Kpi label="الصندوق" value={fmtSAR(kpis.cash)} icon={Wallet} />
            <Kpi label="البنوك" value={fmtSAR(kpis.bank)} icon={Landmark} />
            <Kpi label="ضريبة القيمة المضافة المستحقة" value={fmtSAR(kpis.vat_payable)} sub="جاهز لـ ZATCA" icon={Receipt} tone={kpis.vat_payable > 0 ? "warn" : "default"} />
          </div>

          {/* Receivables / Payables */}
          <div className="text-xs font-semibold text-muted-foreground mb-2">الذمم</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <Kpi label="ذمم مدينة" value={fmtSAR(kpis.receivables)} sub="مستحقة على العملاء" icon={HandCoins} />
            <Kpi label="ذمم دائنة" value={fmtSAR(kpis.payables)} sub="مستحقة للموردين" icon={Wallet} />
            <Kpi label="صافي المركز" value={fmtSAR(kpis.receivables - kpis.payables)} icon={Scale}
                 tone={kpis.receivables - kpis.payables >= 0 ? "good" : "bad"} />
            <Kpi label="حقوق الملكية المتراكمة" value={fmtCompact(kpis.net_income_ytd)} sub="الأرباح المحتجزة منذ بداية السنة" icon={TrendingUp} />
          </div>

          {/* Profitability */}
          <div className="text-xs font-semibold text-muted-foreground mb-2">الربحية</div>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6">
            <Kpi label="إيرادات الشهر" value={fmtSAR(kpis.revenue_mtd)} icon={TrendingUp} tone="good" />
            <Kpi label="مصروفات الشهر" value={fmtSAR(kpis.expense_mtd)} icon={TrendingDown} tone="bad" />
            <Kpi label="صافي الشهر" value={fmtSAR(kpis.net_income_mtd)} icon={Scale}
                 tone={kpis.net_income_mtd >= 0 ? "good" : "bad"} />
            <Kpi label="إيرادات السنة" value={fmtSAR(kpis.revenue_ytd)} icon={TrendingUp} tone="good" />
            <Kpi label="مصروفات السنة" value={fmtSAR(kpis.expense_ytd)} icon={TrendingDown} tone="bad" />
            <Kpi label="صافي السنة" value={fmtSAR(kpis.net_income_ytd)} icon={Scale}
                 tone={kpis.net_income_ytd >= 0 ? "good" : "bad"} />
          </div>
        </>
      )}

      {/* Report cards */}
      <div className="text-xs font-semibold text-muted-foreground mb-2">التقارير المالية</div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {reports.map(r => (
          <Link key={r.to} to={r.to} className="group bg-card border rounded-md p-4 hover:border-primary hover:shadow-sm transition-all">
            <div className="flex items-start justify-between mb-2">
              <div className="h-9 w-9 rounded bg-accent text-accent-foreground flex items-center justify-center">
                <r.icon className="h-4 w-4" />
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
            </div>
            <div className="font-semibold text-sm">{r.title}</div>
            <div className="text-xs text-muted-foreground mt-1">{r.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
