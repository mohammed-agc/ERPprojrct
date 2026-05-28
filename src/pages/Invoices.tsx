import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/erp/ActionButton";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { canPerform } from "@/lib/erpPermissions";
import { Banknote } from "lucide-react";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  posted: { label: "مرحّلة", variant: "default" },
  paid: { label: "مدفوعة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

export default function Invoices() {
  const [rows, setRows] = useState<any[]>([]);
  const { role } = useErpSession();

  const load = () => {
    supabase.from("invoices").select("*, customers(name)").order("invoice_date", { ascending: false })
      .then(({ data }) => setRows(data ?? []));
  };
  useEffect(() => { load(); }, []);

  const registerPayment = async (invoiceId: string, salesOrderId: string | null) => {
    const { error } = await supabase.from("invoices").update({ status: "paid" }).eq("id", invoiceId);
    if (error) { toast.error(error.message); return; }
    if (salesOrderId) {
      await supabase.from("sales_orders").update({ status: "paid" }).eq("id", salesOrderId);
    }
    toast.success("تم تسجيل الدفعة");
    load();
  };

  return (
    <div>
      <PageHeader title="الفواتير الضريبية" subtitle="فواتير متوافقة مع هيئة الزكاة (ZATCA Phase 1) — تسجيل الدفعات يتم من قسم المحاسبة" />
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
              <th className="text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد فواتير</td></tr>
            )}
            {rows.map(r => {
              // Map invoice status → sales-order state for permission decision.
              // 'posted' or 'draft' invoice = awaiting payment (invoiced state).
              const woState = r.status === "paid" ? "paid" : "invoiced";
              const payPerm = canPerform("receive_payment", woState as any, role);
              return (
                <tr key={r.id}>
                  <td className="font-mono">{r.invoice_no}</td>
                  <td className="num">{r.invoice_date}</td>
                  <td>{r.customers?.name ?? "—"}</td>
                  <td className="num text-left">{Number(r.subtotal).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left">{Number(r.vat_amount).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left font-bold">{Number(r.total).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td>{r.qr_code ? <span className="text-xs text-success">✓ متوفر</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></td>
                  <td className="text-left">
                    <ActionButton
                      size="sm"
                      variant="outline"
                      permission={payPerm}
                      hideIfDenied
                      onClick={() => registerPayment(r.id, r.sales_order_id ?? null)}
                    >
                      <Banknote className="h-3.5 w-3.5 ml-1" /> تسجيل دفعة
                    </ActionButton>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
