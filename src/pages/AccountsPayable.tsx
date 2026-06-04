import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Info } from "lucide-react";
import { accounting, type APVendorBalance } from "@/services/erp/accounting";

const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n);

export default function AccountsPayable() {
  const [rows, setRows] = useState<APVendorBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    accounting.listPayables()
      .then(r => { if (alive) setRows(r); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const totals = useMemo(() => ({
    payable: rows.reduce((s, r) => s + r.total_payable, 0),
    paid: rows.reduce((s, r) => s + r.paid_amount, 0),
    remaining: rows.reduce((s, r) => s + r.remaining_balance, 0),
    overdue: rows.reduce((s, r) => s + r.overdue_amount, 0),
    current: rows.reduce((s, r) => s + r.aging.current, 0),
    b1: rows.reduce((s, r) => s + r.aging.d_0_30, 0),
    b2: rows.reduce((s, r) => s + r.aging.d_31_60, 0),
    b3: rows.reduce((s, r) => s + r.aging.d_61_90, 0),
    b4: rows.reduce((s, r) => s + r.aging.d_90_plus, 0),
  }), [rows]);

  return (
    <div dir="rtl">
      <PageHeader
        title="الذمم الدائنة"
        subtitle={loading
          ? "جاري التحميل..."
          : `${rows.length} مورد · إجمالي ${fmtSAR(totals.payable)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.remaining)} · متأخر ${fmtSAR(totals.overdue)}`}
        sticky
      />

      {!loading && rows.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <Info className="h-10 w-10 text-muted-foreground" />
            <div className="text-base font-semibold">لا توجد أرصدة موردين</div>
            <div className="text-sm text-muted-foreground max-w-md">
              سيظهر هنا كل مورد لديه فاتورة شراء غير ملغاة بمجرد إصدار فواتير الشراء وترحيلها.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>الكود</th>
                <th>المورد</th>
                <th className="text-center">الفواتير</th>
                <th className="text-left">إجمالي</th>
                <th className="text-left">مدفوع</th>
                <th className="text-left">المتبقي</th>
                <th className="text-left">المتأخر</th>
                <th className="text-left">جاري</th>
                <th className="text-left">0-30</th>
                <th className="text-left">31-60</th>
                <th className="text-left">61-90</th>
                <th className="text-left">+90</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.vendor_id}>
                  <td className="font-mono text-xs">{r.vendor_code}</td>
                  <td className="font-medium">{r.vendor_name}</td>
                  <td className="text-center">{r.bill_count}</td>
                  <td className="num text-left">{fmtSAR(r.total_payable)}</td>
                  <td className="num text-left text-success">{fmtSAR(r.paid_amount)}</td>
                  <td className="num text-left font-semibold">{fmtSAR(r.remaining_balance)}</td>
                  <td className="num text-left text-destructive">{fmtSAR(r.overdue_amount)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(r.aging.current)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(r.aging.d_0_30)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(r.aging.d_31_60)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(r.aging.d_61_90)}</td>
                  <td className="num text-left text-[11px] text-destructive">{fmtSAR(r.aging.d_90_plus)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <td colSpan={3} className="text-left text-xs">الإجمالي</td>
                  <td className="num text-left">{fmtSAR(totals.payable)}</td>
                  <td className="num text-left text-success">{fmtSAR(totals.paid)}</td>
                  <td className="num text-left">{fmtSAR(totals.remaining)}</td>
                  <td className="num text-left text-destructive">{fmtSAR(totals.overdue)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(totals.current)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(totals.b1)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(totals.b2)}</td>
                  <td className="num text-left text-[11px]">{fmtSAR(totals.b3)}</td>
                  <td className="num text-left text-[11px] text-destructive">{fmtSAR(totals.b4)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
