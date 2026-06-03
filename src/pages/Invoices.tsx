import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/erp/ActionButton";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { canPerform } from "@/lib/erpPermissions";
import { Banknote, FileMinus } from "lucide-react";
import { toast } from "sonner";
import { PaymentDialog, PaymentSubmitPayload, PaymentInvoiceContext } from "@/components/erp/PaymentDialog";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintableInvoiceDoc, type InvoiceLine } from "@/components/erp/PrintableInvoiceDoc";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  posted: { label: "مرحّلة", variant: "default" },
  partially_paid: { label: "مدفوعة جزئياً", variant: "secondary" },
  paid: { label: "مدفوعة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

function paymentBadge(status: "unpaid" | "partial" | "paid") {
  if (status === "paid")    return <Badge className="bg-success text-success-foreground hover:bg-success/90">مدفوعة</Badge>;
  if (status === "partial") return <Badge variant="secondary">جزئية</Badge>;
  return <Badge variant="destructive">غير مدفوعة</Badge>;
}

export default function Invoices() {
  const [rows, setRows] = useState<any[]>([]);
  const { role } = useErpSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<PaymentInvoiceContext | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data: invs } = await supabase
      .from("invoices")
      .select("*, customers(name)")
      .order("invoice_date", { ascending: false });
    const list = invs ?? [];
    // Vehicle enrichment via sales_order_lines
    const soIds = Array.from(new Set(list.map(i => i.sales_order_id).filter(Boolean)));
    let vehiclesByInvoice: Record<string, any[]> = {};
    if (soIds.length > 0) {
      const { data: lines } = await supabase
        .from("sales_order_lines")
        .select("order_id, vehicle_id, vehicles(id, vin, brand, model, year, color, name)")
        .in("order_id", soIds);
      const linesBySo: Record<string, any[]> = {};
      (lines ?? []).forEach((l: any) => {
        if (!l.vehicles) return;
        (linesBySo[l.order_id] ??= []).push(l.vehicles);
      });
      list.forEach(i => {
        if (i.sales_order_id) vehiclesByInvoice[i.id] = linesBySo[i.sales_order_id] ?? [];
      });
    }
    setRows(list.map(i => ({ ...i, _vehicles: vehiclesByInvoice[i.id] ?? [] })));
  };
  useEffect(() => { load(); }, []);

  const openPayment = (r: any) => {
    setActiveInvoice({
      id: r.id,
      invoice_no: r.invoice_no,
      customer_name: r.customers?.name,
      total: Number(r.total),
      paid_amount: Number(r.paid_amount ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmitPayment = async (p: PaymentSubmitPayload) => {
    setSubmitting(true);
    try {
      const row = rows.find(r => r.id === p.invoiceId);
      if (!row) throw new Error("الفاتورة غير موجودة");

      const userId = (await supabase.auth.getUser()).data.user?.id;
      const paymentNo = "PMT-" + Date.now().toString().slice(-10);

      // Insert into persistent payments table — DB trigger recalculates invoice paid_amount + status
      const { error } = await supabase.from("payments").insert({
        payment_no: paymentNo,
        customer_id: row.customer_id,
        invoice_id: p.invoiceId,
        amount: p.amount,
        payment_date: p.paymentDate,
        method: p.method,
        reference: p.reference || null,
        notes: p.notes || null,
        created_by: userId,
      });
      if (error) throw error;

      // If fully paid → mark linked vehicles as 'sold'
      const previouslyPaid = Number(row.paid_amount ?? 0);
      const totalAfter = previouslyPaid + p.amount;
      if (totalAfter >= Number(row.total)) {
        await salesVehicleStatus.markSoldForInvoice(p.invoiceId);
        toast.success("تم تسجيل الدفعة الكاملة — تم تحديث حالة المركبة إلى مباعة");
      } else {
        toast.success(`تم تسجيل دفعة جزئية بقيمة ${p.amount.toLocaleString("ar-SA")}`);
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "فشل تسجيل الدفعة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <PageHeader title="الفواتير الضريبية" subtitle="فواتير متوافقة مع هيئة الزكاة (ZATCA Phase 1) — الدفعات تُسجَّل في سجل ائتمان العميل" />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>المركبة / VIN</th>
              <th className="text-left">قبل الضريبة</th>
              <th className="text-left">VAT 15%</th>
              <th className="text-left">الإجمالي</th>
              <th className="text-left">المدفوع</th>
              <th>QR</th>
              <th>الحالة</th>
              <th>الدفع</th>
              <th className="text-left">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={12} className="text-center text-muted-foreground py-8">لا توجد فواتير</td></tr>
            )}
            {rows.map(r => {
              const total = Number(r.total);
              const paidSoFar = Number(r.paid_amount ?? 0);
              const payStatus: "unpaid" | "partial" | "paid" =
                paidSoFar <= 0 ? "unpaid" : paidSoFar >= total ? "paid" : "partial";
              const woState = payStatus === "paid" ? "paid" : "invoiced";
              const payPerm = canPerform("receive_payment", woState as any, role);
              const vehs: any[] = r._vehicles ?? [];
              return (
                <tr key={r.id}>
                  <td className="font-mono"><Link to={`/invoices/${r.id}`} className="text-primary hover:underline">{r.invoice_no}</Link></td>
                  <td className="num">{r.invoice_date}</td>
                  <td>{r.customers?.name ?? "—"}</td>
                  <td className="text-xs">
                    {vehs.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : vehs.length === 1 ? (
                      <div>
                        <div className="font-medium">{vehs[0].brand} {vehs[0].model} <span className="num text-muted-foreground">{vehs[0].year}</span></div>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="font-mono" dir="ltr">VIN: {vehs[0].vin || "—"}</span>
                          {vehs[0].color && <span>· {vehs[0].color}</span>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{vehs.length} مركبات</div>
                        <div className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={vehs.map(v => v.vin).join(", ")}>
                          {vehs.slice(0, 2).map(v => v.vin || v.brand).join(" · ")}{vehs.length > 2 && " ..."}
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="num text-left">{Number(r.subtotal).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left">{Number(r.vat_amount).toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left font-bold">{total.toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left">{paidSoFar.toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td>{r.qr_code ? <span className="text-xs text-success">✓ متوفر</span> : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label ?? r.status}</Badge></td>
                  <td>{paymentBadge(payStatus)}</td>
                  <td className="text-left">
                    <div className="flex items-center justify-end gap-1.5">
                      <DocPrintActions
                        size="sm"
                        doc={
                          <PrintableInvoiceDoc
                            variant="sales"
                            statusKind={payStatus === "paid" ? "paid" : r.status === "cancelled" ? "cancelled" : r.status === "draft" ? "draft" : "approved"}
                            statusLabel={statusMap[r.status]?.label ?? r.status}
                            invoice_no={r.invoice_no}
                            invoice_date={r.invoice_date}
                            supply_date={r.invoice_date}
                            branch={r.branch ?? undefined}
                            payment_method={r.payment_method ?? "—"}
                            payment_method_key={r.payment_method}
                            seller={{
                              name: "ساراط للسيارات",
                              cr_number: "1010000000",
                              vat_number: "300000000000003",
                              address: "المملكة العربية السعودية — الرياض",
                              contact: "+966 11 000 0000",
                            }}
                            buyer={{ name: r.customers?.name ?? "—" }}
                            items={
                              (vehs.length > 0 ? vehs : [null]).map((v): InvoiceLine => v ? {
                                vin: v.vin,
                                description: `${v.brand ?? ""} ${v.model ?? ""}`.trim() || v.name || "مركبة",
                                color: v.color,
                                model_year: v.year,
                                base_price: Number(r.subtotal) / Math.max(1, vehs.length),
                                discount: 0,
                                vat_pct: 15,
                              } : {
                                description: "بنود الفاتورة",
                                base_price: Number(r.subtotal),
                                vat_pct: 15,
                              })
                            }
                            totalVehicleValue={Number(r.subtotal)}
                            netBeforeVat={Number(r.subtotal)}
                            vatAmount={Number(r.vat_amount)}
                            finalTotal={total}
                            notes={r.notes ?? undefined}
                          />
                        }
                      />
                      <ActionButton
                        size="sm"
                        variant="outline"
                        permission={payPerm}
                        hideIfDenied
                        onClick={() => openPayment(r)}
                        disabled={payStatus === "paid"}
                      >
                        <Banknote className="h-3.5 w-3.5 ml-1" /> تسجيل دفعة
                      </ActionButton>
                      <Link
                        to={`/sales/credit-notes?invoice_id=${r.id}`}
                        className="inline-flex items-center text-xs text-muted-foreground hover:text-primary px-1.5"
                        title="عرض الإشعارات الدائنة"
                      >
                        <FileMinus className="h-3.5 w-3.5 ml-1" /> إشعارات دائنة
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>
      </div>

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        invoice={activeInvoice}
        submitting={submitting}
        onSubmit={handleSubmitPayment}
      />
    </div>
  );
}
