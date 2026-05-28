import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/erp/EmptyState";
import { Info } from "lucide-react";
import { accounting, type APVendorBalance } from "@/services/erp/accounting";

export default function AccountsPayable() {
  const [rows, setRows] = useState<APVendorBalance[]>([]);
  useEffect(() => { accounting.listPayables().then(setRows); }, []);

  return (
    <div>
      <PageHeader
        title="الذمم الدائنة"
        subtitle="أرصدة الموردين والفواتير المستحقة"
        sticky
      />

      {rows.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8">
          <div className="flex flex-col items-center justify-center gap-3 text-center">
            <Info className="h-10 w-10 text-muted-foreground" />
            <div className="text-base font-semibold">وحدة الموردين قيد التهيئة</div>
            <div className="text-sm text-muted-foreground max-w-md">
              الواجهة جاهزة لاستهلاك بيانات الموردين والفواتير الواردة. سيظهر المحتوى تلقائياً
              بمجرد تفعيل وحدة المشتريات والموردين في الباك-إند.
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              الحقول الجاهزة: المورد، عدد الفواتير، إجمالي دائن، مدفوع، المتبقي، المتأخر، تقادم الأعمار.
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
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.vendor_id}>
                  <td className="font-mono text-xs">{r.vendor_code}</td>
                  <td className="font-medium">{r.vendor_name}</td>
                  <td className="text-center">{r.bill_count}</td>
                  <td className="num text-left">{r.total_payable.toFixed(2)}</td>
                  <td className="num text-left text-success">{r.paid_amount.toFixed(2)}</td>
                  <td className="num text-left font-semibold">{r.remaining_balance.toFixed(2)}</td>
                  <td className="num text-left text-destructive">{r.overdue_amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
