import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  posted: { label: "مرحّلة", variant: "default" },
  paid: { label: "مدفوعة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

export default function Invoices() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("invoices").select("*, customers(name)").order("invoice_date", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  }, []);

  return (
    <div>
      <PageHeader title="الفواتير الضريبية" subtitle="فواتير متوافقة مع هيئة الزكاة (ZATCA Phase 1)" />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th className="text-left">قبل الضريبة</th>
              <th className="text-left">VAT 15%</th>
              <th className="text-left">الإجمالي</th>
              <th>QR</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد فواتير</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono">{r.invoice_no}</td>
                <td className="num">{r.invoice_date}</td>
                <td>{r.customers?.name ?? "—"}</td>
                <td className="num text-left">{Number(r.subtotal).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                <td className="num text-left">{Number(r.vat_amount).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                <td className="num text-left font-bold">{Number(r.total).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                <td>{r.qr_code ? <span className="text-xs text-success">✓ متوفر</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
