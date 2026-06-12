import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileMinus, Printer } from "lucide-react";
import { CreditNoteDialog } from "@/components/erp/CreditNoteDialog";
import { CreditGateBanner } from "@/components/erp/CreditGateBanner";
import { AllocationInquiry } from "@/components/erp/AllocationInquiry";

const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  posted: { label: "مرحّلة", variant: "default" },
  partially_paid: { label: "مدفوعة جزئياً", variant: "secondary" },
  paid: { label: "مدفوعة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [openRemaining, setOpenRemaining] = useState<number | null>(null);
  const [vehicleByLineNo, setVehicleByLineNo] = useState<Record<number, { id: string; label: string }>>({});
  const [dlgOpen, setDlgOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: head }, { data: lns }, { data: cns }, { data: pmts }] = await Promise.all([
      supabase.from("invoices").select("*, contact:contacts(name, vat_number, phone, city, national_id)").eq("id", id).maybeSingle(),
      supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("line_no"),
      supabase.from("credit_notes").select("*").eq("invoice_id", id).order("cn_date", { ascending: false }),
      supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false }),
    ]);
    setInv(head);
    setLines(lns ?? []);
    setCreditNotes(cns ?? []);
    setPayments(pmts ?? []);

    // المتبقّي الحقيقي من Open Items (يشمل المقاصّة) — المصدر الموحّد SAP
    if (head?.id) {
      const { data: rem } = await supabase.rpc("document_remaining" as any, {
        p_doc_type: "sales_invoice", p_doc_id: head.id, p_total: Number(head.total),
      });
      setOpenRemaining(rem != null ? Number(rem) : null);
    }

    // ربط المركبة من أمر البيع — عبر inventory_items (وليس vehicles)
    if (head?.sales_order_id) {
      const { data: soLines } = await supabase
        .from("sales_order_lines")
        .select("line_no, vehicle_id")
        .eq("order_id", head.sales_order_id);
      const vehIds = (soLines ?? []).map((r: any) => r.vehicle_id).filter(Boolean);
      let invItems: Record<string, any> = {};
      if (vehIds.length) {
        const { data: items } = await supabase
          .from("inventory_items").select("id, vin, sku, name").in("id", vehIds);
        (items ?? []).forEach((it: any) => { invItems[it.id] = it; });
      }
      const map: Record<number, { id: string; label: string }> = {};
      (soLines ?? []).forEach((r: any) => {
        if (r.vehicle_id) {
          const it = invItems[r.vehicle_id];
          map[r.line_no] = { id: r.vehicle_id, label: it?.vin || it?.sku || it?.name || r.vehicle_id.slice(0, 6) };
        }
      });
      setVehicleByLineNo(map);
    } else {
      setVehicleByLineNo({});
    }
  };
  useEffect(() => { load(); }, [id]);

  if (!inv) return <div className="text-muted-foreground p-4">جارٍ التحميل…</div>;

  const total = Number(inv.total);
  const subtotal = Number(inv.subtotal ?? 0);
  const vatAmount = Number(inv.vat_amount ?? 0);
  const credited = Number(inv.credited_amount ?? 0);
  const paid = Number(inv.paid_amount ?? 0);
  const outstanding = Math.max(0, total - credited);
  const fullyCredited = outstanding <= 0;
  const custName = inv.contact?.name ?? inv.customer_name ?? "—";

  const printInvoice = () => {
    const linesHTML = lines.length
      ? lines.map((l, i) => {
          const qty = Number(l.quantity ?? 1);
          const up = Number(l.unit_price);
          const disc = Number(l.discount ?? 0);
          const beforeVat = up * qty - disc;
          const lt = Number(l.total ?? l.line_total ?? beforeVat * (1 + Number(l.vat_pct) / 100));
          return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
            <td style="text-align:center;color:#6b7280">${l.line_no}</td>
            <td>${esc(l.description)}${l.vin ? `<div style="font-size:11px;color:#6b7280" dir="ltr">VIN: ${esc(l.vin)}</div>` : ""}</td>
            <td style="text-align:center">${qty}</td>
            <td style="text-align:left;font-family:monospace">${fmt(up)} ر.س</td>
            <td style="text-align:left;font-family:monospace;color:${disc > 0 ? "#dc2626" : "#9ca3af"}">${disc > 0 ? "- " + fmt(disc) + " ر.س" : "—"}</td>
            <td style="text-align:left;font-family:monospace">${fmt(beforeVat)} ر.س</td>
            <td style="text-align:center">${Number(l.vat_pct)}%</td>
            <td style="text-align:left;font-family:monospace;font-weight:600">${fmt(lt)} ر.س</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:20px">لا توجد بنود</td></tr>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(inv.invoice_no)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:30px 35px;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #e5e7eb;padding:7px 10px;text-align:right;font-size:12px}
  th{background:#0f766e;color:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:18px;margin-bottom:22px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
  .box{padding:14px;border-radius:8px}
  .totals{width:300px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-right:auto}
  .trow{display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280}
  .grand{display:flex;justify-content:space-between;padding:12px 14px;background:#0f766e;color:#fff;font-weight:bold;font-size:15px}
  @page{size:A4 portrait;margin:12mm 14mm}
</style></head><body>
  <div class="header">
    <div><div style="font-size:25px;font-weight:bold;color:#0f766e">فاتورة ضريبية</div><div style="color:#6b7280;font-size:13px">Tax Invoice · ZATCA</div></div>
    <div style="text-align:left">
      <div style="font-size:20px;font-weight:bold">${esc(inv.invoice_no)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">التاريخ: ${fmtDate(inv.invoice_date || inv.created_at)}</div>
      <div style="font-size:12px;color:#6b7280">الحالة: ${esc(statusMap[inv.status]?.label ?? inv.status)}</div>
    </div>
  </div>
  <div class="parties">
    <div class="box" style="background:#f0fdfa;border:1px solid #99f6e4">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">البائع / SELLER</div>
      <div style="font-weight:bold;font-size:15px">أرض المبارك للسيارات</div>
      <div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: 300000000000003</div>
      <div style="font-size:12px;color:#374151">جدة، المملكة العربية السعودية</div>
    </div>
    <div class="box" style="background:#f9fafb;border:1px solid #e5e7eb">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">المشتري / BUYER</div>
      <div style="font-weight:bold;font-size:15px">${esc(custName)}</div>
      ${inv.contact?.vat_number ? `<div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: ${esc(inv.contact.vat_number)}</div>` : ""}
      ${inv.contact?.national_id ? `<div style="font-size:12px;color:#374151">الهوية: ${esc(inv.contact.national_id)}</div>` : ""}
      ${inv.contact?.phone ? `<div style="font-size:12px;color:#374151">${esc(inv.contact.phone)}</div>` : ""}
    </div>
  </div>
  <table style="margin-bottom:20px">
    <thead><tr>
      <th style="width:30px;text-align:center">#</th>
      <th>الوصف</th>
      <th style="width:45px;text-align:center">الكمية</th>
      <th style="width:95px;text-align:left">سعر الوحدة</th>
      <th style="width:85px;text-align:left">الخصم</th>
      <th style="width:95px;text-align:left">قبل الضريبة</th>
      <th style="width:45px;text-align:center">VAT%</th>
      <th style="width:105px;text-align:left">الإجمالي</th>
    </tr></thead>
    <tbody>${linesHTML}</tbody>
  </table>
  <div style="display:flex">
    <div class="totals">
      <div class="trow"><span>المجموع قبل الضريبة</span><span style="font-family:monospace">${fmt(subtotal)} ر.س</span></div>
      <div class="trow"><span>ضريبة القيمة المضافة (15%)</span><span style="font-family:monospace">${fmt(vatAmount)} ر.س</span></div>
      <div class="grand"><span>الإجمالي شامل الضريبة</span><span style="font-family:monospace">${fmt(total)} ر.س</span></div>
    </div>
  </div>
  ${inv.qr_code ? `<div style="margin-top:20px;text-align:center"><div style="font-size:11px;color:#6b7280;margin-bottom:6px">رمز الاستجابة السريعة (ZATCA)</div><div style="font-family:monospace;font-size:9px;word-break:break-all;max-width:300px;margin:0 auto;color:#9ca3af">${esc(inv.qr_code)}</div></div>` : ""}
  <div style="border-top:2px solid #e5e7eb;padding-top:14px;text-align:center;color:#9ca3af;font-size:11px;margin-top:24px">
    أرض المبارك للسيارات · جدة · المملكة العربية السعودية · فاتورة متوافقة مع هيئة الزكاة والضريبة والجمارك
  </div>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("الرجاء السماح بالنوافذ المنبثقة"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  };

  return (
    <div>
      <PageHeader
        sticky
        title={`فاتورة ${inv.invoice_no}`}
        subtitle={
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Badge variant={statusMap[inv.status]?.variant}>{statusMap[inv.status]?.label ?? inv.status}</Badge>
            <span className="text-xs text-muted-foreground">التاريخ: {fmtDate(inv.invoice_date)}</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => nav("/invoices")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
            <Button size="sm" variant="outline" onClick={printInvoice}>
              <Printer className="h-4 w-4 ml-1" /> طباعة / PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDlgOpen(true)}
              disabled={fullyCredited || inv.status === "draft"}
              title={inv.status === "draft" ? "لا يمكن إصدار إشعار دائن على فاتورة مسودة" : fullyCredited ? "تم عكس قيمة الفاتورة بالكامل" : "إنشاء إشعار دائن"}
            >
              <FileMinus className="h-4 w-4 ml-1" /> إنشاء إشعار دائن
            </Button>
          </div>
        }
      />

      <CreditGateBanner customerId={inv.customer_id} documentType="invoice" documentId={inv.id} documentCode={inv.invoice_no} />

      {/* بطاقات: العميل + التفصيل المالي */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3 col-span-2 md:col-span-1">
          <div className="text-xs text-muted-foreground mb-1">العميل</div>
          <div className="font-medium">{custName}</div>
          {inv.contact?.vat_number && <div className="text-xs text-muted-foreground mt-1">VAT: {inv.contact.vat_number}</div>}
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">قبل الضريبة</div>
          <div className="num font-semibold">{fmt(subtotal)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">ضريبة (15%)</div>
          <div className="num font-semibold">{fmt(vatAmount)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">الإجمالي</div>
          <div className="num font-bold text-primary">{fmt(total)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-2">حالة التسوية (Open Item)</div>
          {(() => {
            const originalAmount = total;
            const openAmount = openRemaining ?? Math.max(0, total - paid - credited);
            const clearedAmount = Math.max(0, originalAmount - openAmount);
            const cashPaid = paid;
            const settled = Math.max(0, clearedAmount - cashPaid - credited);
            const docStatus = openAmount <= 0.01 ? "CLEARED" : clearedAmount > 0.01 ? "PARTIALLY_CLEARED" : "OPEN";
            const statusLabel = docStatus === "CLEARED" ? "مسوّاة بالكامل" : docStatus === "PARTIALLY_CLEARED" ? "مسوّاة جزئياً" : "مفتوحة";
            const statusCls = docStatus === "CLEARED" ? "bg-success/15 text-success" : docStatus === "PARTIALLY_CLEARED" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground";
            return (
              <div className="space-y-1">
                <div className="flex justify-between items-center mb-1"><span className="text-muted-foreground text-[12.5px]">الحالة</span><span className={`text-[12.5px] font-semibold px-2 py-0.5 rounded ${statusCls}`}>{statusLabel}</span></div>
                <div className="flex justify-between text-[12.5px]"><span className="text-muted-foreground">المبلغ الأصلي</span><span className="num font-semibold">{fmt(originalAmount)}</span></div>
                <div className="flex justify-between text-[12.5px]"><span className="text-muted-foreground">المبلغ المسوّى</span><span className="num text-primary">{clearedAmount > 0.01 ? fmt(clearedAmount) : "—"}</span></div>
                {(cashPaid > 0.01 || settled > 0.01 || credited > 0.01) && (
                  <div className="pr-3 text-[11.5px] text-muted-foreground space-y-0.5">
                    {cashPaid > 0.01 && <div className="flex justify-between"><span>• دفعات نقدية</span><span className="num">{fmt(cashPaid)}</span></div>}
                    {settled > 0.01 && <div className="flex justify-between"><span>• مقاصة</span><span className="num">{fmt(settled)}</span></div>}
                    {credited > 0.01 && <div className="flex justify-between"><span>• إشعارات</span><span className="num">{fmt(credited)}</span></div>}
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold border-t border-border pt-1 mt-1"><span>المبلغ المفتوح</span><span className="num text-primary">{fmt(openAmount)}</span></div>
              </div>
            );
          })()}
          </div>
      </div>

      {/* بنود الفاتورة مع تفصيل قبل/بعد الضريبة */}
      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-border text-sm font-semibold">بنود الفاتورة</div>
        <table className="erp-table">
          <thead>
            <tr>
              <th>#</th><th>الوصف</th>
              <th className="text-right">الكمية</th>
              <th className="text-right">سعر الوحدة</th>
              <th className="text-right">الخصم</th>
              <th className="text-right">قبل الضريبة</th>
              <th className="text-right">VAT%</th>
              <th className="text-right">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-4">لا توجد بنود</td></tr>}
            {lines.map(l => {
              const qty = Number(l.quantity ?? 1);
              const up = Number(l.unit_price);
              const disc = Number(l.discount ?? 0);
              const beforeVat = up * qty - disc;
              const lt = Number(l.total ?? l.line_total ?? beforeVat * (1 + Number(l.vat_pct) / 100));
              return (
                <tr key={l.id}>
                  <td>{l.line_no}</td>
                  <td>
                    <div>{l.description}</div>
                    {l.vin && <div className="text-[12px] text-muted-foreground font-mono" dir="ltr">VIN: {l.vin}</div>}
                  </td>
                  <td className="num text-right">{qty}</td>
                  <td className="num text-right">{fmt(up)}</td>
                  <td className="num text-right text-red-600">{disc > 0 ? `- ${fmt(disc)}` : "—"}</td>
                  <td className="num text-right">{fmt(beforeVat)}</td>
                  <td className="num text-right">{Number(l.vat_pct)}%</td>
                  <td className="num text-right font-semibold">{fmt(lt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold flex items-center justify-between">
            <span>الإشعارات الدائنة</span>
            <Link to={`/sales/credit-notes?invoice_id=${inv.id}`} className="text-xs text-primary hover:underline">عرض الكل ←</Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>السبب</th><th className="text-right">الإجمالي</th></tr></thead>
            <tbody>
              {creditNotes.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-4">لا توجد إشعارات</td></tr>}
              {creditNotes.map(c => (
                <tr key={c.id}>
                  <td className="font-mono"><Link to={`/sales/credit-notes/${c.id}`} className="text-primary hover:underline">{c.credit_note_no}</Link></td>
                  <td className="num">{fmtDate(c.cn_date)}</td>
                  <td className="text-xs text-muted-foreground">{c.reason}</td>
                  <td className="num text-right font-semibold">{fmt(Number(c.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {inv.id && <AllocationInquiry docType="sales_invoice" docId={inv.id} total={Number(inv.total)} />}

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold">الدفعات</div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>طريقة الدفع</th><th className="text-right">المبلغ</th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-4">لا توجد دفعات</td></tr>}
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="font-mono">{p.payment_no}</td>
                  <td className="num">{fmtDate(p.payment_date)}</td>
                  <td className="text-xs">{p.method}</td>
                  <td className="num text-right font-semibold">{fmt(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreditNoteDialog
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        invoice={{ id: inv.id, invoice_no: inv.invoice_no, customer_id: inv.customer_id, total, credited_amount: credited, paid_amount: paid }}
        invoiceLines={lines.map(l => {
          const v = vehicleByLineNo[Number(l.line_no)];
          return {
            description: l.description, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
            vat_pct: Number(l.vat_pct), vehicle_id: v?.id ?? null, vehicle_label: v?.label ?? null,
          };
        })}
        onCreated={(cnId) => { load(); nav(`/sales/credit-notes/${cnId}`); }}
      />
    </div>
  );
}