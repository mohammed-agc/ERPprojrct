import { PrintLayout } from "@/components/erp/PrintLayout";
import { fmtSAR } from "@/lib/erpFormat";
import {
  AGING_LABEL, AGING_TONE, SETTLEMENT_LABEL, computeAging,
  type CustomerCreditRow, type CustomerStatementRow,
} from "@/services/erp/customerSettlement";

const KIND_LABEL: Record<CustomerStatementRow["kind"], string> = {
  invoice: "فاتورة مبيعات",
  payment: "دفعة عميل",
  credit_note: "إشعار دائن",
  adjustment: "تسوية محاسبية",
};

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

export interface CustomerStatementCompany {
  name: string;
  cr_number?: string;
  vat_number?: string;
  address?: string;
  contact?: string;
}

export interface PrintableCustomerStatementDocProps {
  company: CustomerStatementCompany;
  customer: CustomerCreditRow;
  rows: CustomerStatementRow[];
  period_from?: string;
  period_to?: string;
  totals: {
    opening_balance: number;
    debit: number;
    credit: number;
    closing_balance: number;
    credit_limit: number;
    credit_used: number;
    credit_remaining: number;
    due_balance: number;
    overdue_balance: number;
  };
}

/**
 * Customer Statement — printable / PDF-exportable accounting document.
 * Mirrors PrintableSupplierStatementDoc.
 */
export function PrintableCustomerStatementDoc(p: PrintableCustomerStatementDocProps) {
  const printedAt = new Date().toISOString().slice(0, 10);
  const from = p.period_from ?? (p.rows[0]?.at ?? printedAt);
  const to = p.period_to ?? (p.rows[p.rows.length - 1]?.at ?? printedAt);
  const grace = p.customer.grace_days ?? 0;
  const policyLabel = SETTLEMENT_LABEL[p.customer.settlement_policy ?? "net_30"];

  return (
    <PrintLayout
      title="كشف حساب عميل · CUSTOMER STATEMENT"
      subtitle="ساراط ERP — مستند محاسبي رسمي"
      orgName={p.company.name}
      vatNumber={p.company.vat_number}
      documentNo={p.customer.code}
      documentDate={printedAt}
      showSignatures={false}
    >
      {/* Header band */}
      <div className="bg-primary text-primary-foreground rounded-t -mx-1 px-4 py-3 mb-3 flex items-center justify-between">
        <div className="w-16 h-16 bg-white/10 border border-white/30 rounded flex items-center justify-center text-[9px] opacity-80">LOGO</div>
        <div className="text-center">
          <div className="text-lg font-black tracking-wide">كشف حساب عميل</div>
          <div className="text-[10px] tracking-[0.2em] opacity-80 mt-0.5">CUSTOMER STATEMENT</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{p.company.name}</div>
          {p.company.cr_number && <div className="text-[9px] opacity-80">س.ت: <span className="font-mono">{p.company.cr_number}</span></div>}
          {p.company.vat_number && <div className="text-[9px] opacity-80">ر.ض: <span className="font-mono">{p.company.vat_number}</span></div>}
          {p.company.address && <div className="text-[9px] opacity-70">{p.company.address}</div>}
          {p.company.contact && <div className="text-[9px] opacity-70">{p.company.contact}</div>}
        </div>
      </div>

      {/* Customer + period */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="border border-border rounded p-2.5 text-[10.5px]">
          <div className="text-[10px] text-muted-foreground font-semibold mb-1">بيانات العميل</div>
          <div className="font-bold text-[12px] mb-1.5 text-primary">{p.customer.name}</div>
          <Row label="كود العميل" value={p.customer.code} mono />
          {p.customer.vat_number && <Row label="الرقم الضريبي" value={p.customer.vat_number} mono />}
          <Row label="حالة الحساب" value={p.customer.is_active ? "نشِط" : "موقوف"} />
          <Row label="سياسة السداد" value={`${policyLabel}${grace ? ` · سماح ${grace} يوم` : ""}`} />
        </div>
        <div className="border border-border rounded p-2.5 text-[10.5px]">
          <div className="text-[10px] text-muted-foreground font-semibold mb-1">فترة الكشف</div>
          <Row label="من تاريخ" value={fmtDate(from)} mono />
          <Row label="إلى تاريخ" value={fmtDate(to)} mono />
          <Row label="تاريخ الطباعة" value={fmtDate(printedAt)} mono />
          <Row label="عدد الحركات" value={String(p.rows.length)} mono />
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="avoid-break border border-border rounded mb-3 overflow-hidden">
        <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-bold">ملخص الحساب</div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-0 text-[10.5px]">
          <Kpi label="الرصيد الافتتاحي" value={fmtSAR(p.totals.opening_balance)} />
          <Kpi label="إجمالي المدين" value={fmtSAR(p.totals.debit)} />
          <Kpi label="إجمالي الدائن" value={fmtSAR(p.totals.credit)} />
          <Kpi label="الرصيد الختامي" value={fmtSAR(p.totals.closing_balance)} highlight />
          <Kpi label="الحد الائتماني" value={fmtSAR(p.totals.credit_limit)} />
          <Kpi label="المستخدم من الائتمان" value={fmtSAR(p.totals.credit_used)} />
          <Kpi label="المتبقي من الائتمان" value={fmtSAR(p.totals.credit_remaining)} />
          <Kpi label="رصيد مستحق" value={fmtSAR(p.totals.due_balance)} />
          <Kpi label="رصيد متأخر" value={fmtSAR(p.totals.overdue_balance)}
            tone={p.totals.overdue_balance > 0 ? "destructive" : "default"} />
        </div>
      </div>

      {/* Ledger */}
      <table className="erp-table text-[10.5px] w-full my-3">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="w-[34px]">م</th>
            <th className="w-[90px]">التاريخ</th>
            <th className="w-[110px]">المرجع</th>
            <th>البيان</th>
            <th className="w-[90px]">تاريخ الاستحقاق</th>
            <th className="w-[88px]">حالة العمر</th>
            <th className="num w-[88px]">مدين</th>
            <th className="num w-[88px]">دائن</th>
            <th className="num w-[96px]">الرصيد الجاري</th>
          </tr>
        </thead>
        <tbody>
          {p.rows.length === 0 && (
            <tr><td colSpan={9} className="text-center text-muted-foreground py-6">لا توجد حركات خلال الفترة</td></tr>
          )}
          {p.rows.map((r, idx) => {
            const isInvoice = r.kind === "invoice" && r.due_date;
            const showAging = isInvoice && (r.outstanding ?? 0) > 0.001;
            const aging = showAging ? computeAging(r.due_date!, { grace_days: grace }) : null;
            return (
              <tr key={r.id}>
                <td className="num text-muted-foreground">{idx + 1}</td>
                <td className="font-mono">{fmtDate(r.at)}</td>
                <td className="font-mono text-[10px]">{r.reference ?? "—"}</td>
                <td>
                  <div className="font-medium">{KIND_LABEL[r.kind]}</div>
                  <div className="text-[9.5px] text-muted-foreground">{r.description}</div>
                </td>
                <td className="font-mono">{isInvoice ? fmtDate(r.due_date!) : "—"}</td>
                <td>
                  {aging ? (
                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[9.5px] font-semibold ${AGING_TONE[aging.status]}`}>
                      {AGING_LABEL[aging.status]}{aging.status === "overdue" ? ` ${aging.days_overdue} يوم` : ""}
                    </span>
                  ) : (isInvoice ? <span className="text-muted-foreground text-[9.5px]">مسددة</span> : "—")}
                </td>
                <td className="num">{r.debit ? fmtSAR(r.debit) : "—"}</td>
                <td className="num">{r.credit ? fmtSAR(r.credit) : "—"}</td>
                <td className="num font-bold">{fmtSAR(r.running_balance)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/60 font-semibold">
            <td colSpan={6} className="text-left">الإجماليات</td>
            <td className="num">{fmtSAR(p.totals.debit)}</td>
            <td className="num">{fmtSAR(p.totals.credit)}</td>
            <td className="num font-black">{fmtSAR(p.totals.closing_balance)}</td>
          </tr>
        </tfoot>
      </table>

      {/* Closing summary */}
      <div className="avoid-break grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="border border-border rounded text-[10.5px] overflow-hidden">
          <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-bold">ملاحظات</div>
          <div className="p-3 text-[10px] leading-relaxed text-muted-foreground">
            هذا الكشف يعكس جميع الحركات المرحّلة على حساب العميل حتى تاريخ الطباعة،
            ويشمل احتساب التقادم وفقًا لسياسة السداد وأيام السماح المعتمدة.
            يرجى مراجعة الكشف وإخطارنا بأي اعتراض خلال 7 أيام عمل.
          </div>
        </div>
        <div className="avoid-break border border-border rounded text-[10.5px] overflow-hidden">
          <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-bold">الرصيد المستحق على العميل</div>
          <div className="p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">الرصيد الافتتاحي</span><span className="font-mono">{fmtSAR(p.totals.opening_balance)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي المدين</span><span className="font-mono">{fmtSAR(p.totals.debit)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الدائن</span><span className="font-mono">{fmtSAR(p.totals.credit)}</span></div>
            <div className="flex justify-between items-center mt-2 -mx-3 -mb-3 px-3 py-2 bg-primary text-primary-foreground">
              <span className="font-bold text-sm">الرصيد الختامي</span>
              <span className="font-mono font-black text-base">{fmtSAR(p.totals.closing_balance)}</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="avoid-break grid grid-cols-3 gap-6 mt-6 pt-4 print:mt-4 print:pt-3 border-t-2 border-primary text-[10px]">
        {["أعدّ بواسطة", "المحاسب", "مدير المالية"].map(role => (
          <div key={role} className="text-center">
            <div className="h-12 border-b border-dashed border-muted-foreground/40 mb-1" />
            <div className="text-muted-foreground font-semibold">{role}</div>
          </div>
        ))}
      </footer>
    </PrintLayout>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
function Kpi({ label, value, tone = "default", highlight }: {
  label: string; value: string; tone?: "default" | "destructive"; highlight?: boolean;
}) {
  const tint = tone === "destructive" ? "text-destructive" : highlight ? "text-primary" : "text-foreground";
  return (
    <div className="border-l border-b border-border last:border-l-0 p-2">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className={`text-[11.5px] font-bold font-mono tabular-nums ${tint}`}>{value}</div>
    </div>
  );
}
