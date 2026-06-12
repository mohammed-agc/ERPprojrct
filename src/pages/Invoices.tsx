import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/erp/ActionButton";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { canPerform } from "@/lib/erpPermissions";
import { Banknote, FileMinus, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { PaymentDialog, PaymentSubmitPayload, PaymentInvoiceContext } from "@/components/erp/PaymentDialog";

import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  issued: { label: "مُصدرة", variant: "default" },
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
  const [q, setQ] = useState("");
  const { role } = useErpSession();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<PaymentInvoiceContext | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    const { data: invs } = await supabase
      .from("invoices")
      .select("*, contact:contacts(name, vat_number)")
      .order("invoice_date", { ascending: false });
    const list = invs ?? [];

    // إثراء المركبات عبر sales_order_lines → inventory_items (وليس vehicles)
    const soIds = Array.from(new Set(list.map(i => i.sales_order_id).filter(Boolean)));
    const vehiclesByInvoice: Record<string, any[]> = {};
    if (soIds.length > 0) {
      const { data: soLines } = await supabase
        .from("sales_order_lines")
        .select("order_id, vehicle_id")
        .in("order_id", soIds);
      const vehIds = Array.from(new Set((soLines ?? []).map((l: any) => l.vehicle_id).filter(Boolean)));
      const itemsById: Record<string, any> = {};
      if (vehIds.length) {
        const { data: items } = await supabase
          .from("inventory_items")
          .select("id, vin, brand, model, year, color, name")
          .in("id", vehIds);
        (items ?? []).forEach((it: any) => { itemsById[it.id] = it; });
      }
      const linesBySo: Record<string, any[]> = {};
      (soLines ?? []).forEach((l: any) => {
        const it = l.vehicle_id ? itemsById[l.vehicle_id] : null;
        if (it) (linesBySo[l.order_id] ??= []).push(it);
      });
      list.forEach(i => {
        if (i.sales_order_id) vehiclesByInvoice[i.id] = linesBySo[i.sales_order_id] ?? [];
      });
    }
    // بنود الفاتورة الحقيقية (سعر + خصم) لكل فاتورة — للطباعة الدقيقة
    const invIds = list.map(i => i.id);
    const linesByInvoice: Record<string, any[]> = {};
    if (invIds.length) {
      const { data: invLines } = await supabase
        .from("invoice_lines")
        .select("invoice_id, line_no, description, quantity, unit_price, discount, vat_pct, total, vin, brand, model, year, color")
        .in("invoice_id", invIds)
        .order("line_no");
      (invLines ?? []).forEach((l: any) => { (linesByInvoice[l.invoice_id] ??= []).push(l); });
    }

    // التخصيصات النشطة (Open Items) — المتبقّي الصحيح لكل فاتورة (يشمل المقاصّة)
    const allocByInv: Record<string, number> = {};
    if (invIds.length) {
      const { data: allocs } = await supabase
        .from("open_item_allocations")
        .select("target_document_id, allocated_amount")
        .eq("target_document_type", "sales_invoice")
        .eq("status", "active")
        .in("target_document_id", invIds);
      (allocs ?? []).forEach((a: any) => {
        allocByInv[a.target_document_id] = (allocByInv[a.target_document_id] ?? 0) + Number(a.allocated_amount || 0);
      });
    }
    setRows(list.map(i => ({
      ...i,
      _vehicles: vehiclesByInvoice[i.id] ?? [],
      _lines: linesByInvoice[i.id] ?? [],
      _remaining: Math.max(0, Number(i.total ?? 0) - (allocByInv[i.id] ?? 0)),
    })));
  };
  useEffect(() => { load(); }, []);

  const openPayment = (r: any) => {
    setActiveInvoice({
      id: r.id,
      invoice_no: r.invoice_no,
      customer_name: (r as any).contact?.name ?? (r as any).customer_name,
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

      const { data: payRow, error } = await supabase.from("payments").insert({
        payment_no: paymentNo,
        customer_id: row.customer_id,
        invoice_id: p.invoiceId,
        amount: p.amount,
        payment_date: p.paymentDate,
        method: p.method,
        reference: p.reference || null,
        notes: p.notes || null,
        created_by: userId,
      }).select("id").single();
      if (error) throw error;

      // إنشاء سجلّ التخصيص (Open Item Allocation) — نوع PAYMENT
      const { error: eAlloc } = await supabase.rpc("create_allocation" as any, {
        p_allocation_type: "PAYMENT",
        p_partner_id: row.customer_id,
        p_source_document_type: "sales_payment",
        p_source_document_id: payRow.id,
        p_target_document_type: "sales_invoice",
        p_target_document_id: p.invoiceId,
        p_amount: p.amount,
        p_allocation_date: p.paymentDate,
        p_remarks: `دفعة ${paymentNo}`,
        p_created_by: userId,
      });
      if (eAlloc) throw eAlloc;

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

  // ───────── طباعة فاتورة واحدة بنافذة مستقلة نظيفة (عربية سليمة، بلا علامة مائية) ─────────
  const printInvoice = (r: any) => {
    const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const fmt = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const lines: any[] = r._lines ?? [];
    const buyerName = r.contact?.name ?? r.customer_name ?? "—";
    const buyerVat = r.contact?.vat_number ?? "";
    const total = Number(r.total ?? 0);
    const paid = Number(r.paid_amount ?? 0);
    const remaining = r._remaining ?? Math.max(0, total - paid);   // Open Items (يشمل المقاصّة)
    const totalDisc = lines.reduce((s, l) => s + Number(l.discount ?? 0), 0);
    const totalBeforeDisc = lines.reduce((s, l) => s + Number(l.unit_price) * Number(l.quantity ?? 1), 0);

    const rowsHTML = lines.length
      ? lines.map((l, i) => {
          const qty = Number(l.quantity ?? 1);
          const up = Number(l.unit_price);
          const disc = Number(l.discount ?? 0);
          const base = up * qty - disc;
          const vat = base * (Number(l.vat_pct ?? 15) / 100);
          const incl = base + vat;
          const partNo = l.vin || l.part_no || "—";          // الرقم: هيكل للمركبات / قطعة للقطع
          const prodName = [l.brand, l.model].filter(Boolean).join(" ") || l.description || "—";
          return `<tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
            <td style="text-align:center;color:#6b7280">${i + 1}</td>
            <td style="font-weight:600">${esc(prodName)}</td>
            <td style="font-size:11px">${esc(l.description || "")}${[l.year, l.color].filter(Boolean).length ? `<div style="color:#6b7280;font-size:10px">${esc([l.year, l.color].filter(Boolean).join(" · "))}</div>` : ""}</td>
            <td style="font-family:monospace;font-size:11px" dir="ltr">${esc(partNo)}</td>
            <td style="text-align:left;font-family:monospace">${fmt(up)}</td>
            <td style="text-align:left;font-family:monospace;color:${disc > 0 ? "#dc2626" : "#9ca3af"}">${disc > 0 ? "- " + fmt(disc) : "—"}</td>
            <td style="text-align:left;font-family:monospace">${fmt(vat)}</td>
            <td style="text-align:left;font-family:monospace;font-weight:700">${fmt(incl)}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="8" style="text-align:center;color:#9ca3af;padding:20px">لا توجد بنود</td></tr>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(r.invoice_no)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:24px 28px;color:#1a1a1a;font-size:12px}
  .topbar{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f766e;padding-bottom:12px;margin-bottom:14px}
  .topbar .ttl{text-align:center;flex:1}
  .topbar .ttl .ar{font-size:20px;font-weight:bold;color:#0f766e}
  .topbar .ttl .en{font-size:12px;color:#6b7280;letter-spacing:1px}
  .seller-ar{font-size:16px;font-weight:bold;color:#0f766e;text-align:left}
  .meta{font-size:11px;text-align:left;color:#374151;line-height:1.7}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
  .box{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px}
  .box .lbl{color:#6b7280;font-size:10px}
  .box .row{display:flex;justify-content:space-between;gap:8px;padding:2px 0;font-size:11px}
  table.items{border-collapse:collapse;width:100%;margin-bottom:14px}
  table.items th,table.items td{border:1px solid #e5e7eb;padding:6px 8px;text-align:right;vertical-align:top}
  table.items th{background:#0f766e;color:#fff;font-size:10.5px;line-height:1.4}
  table.items th .en{display:block;font-weight:normal;font-size:9px;opacity:.85}
  .bottom{display:grid;grid-template-columns:200px 1fr;gap:14px;margin-bottom:14px}
  .qrbox{border:1px solid #e5e7eb;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:8px;background:#fafafa;min-height:150px}
  .summary{border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}
  .summary .r{display:flex;justify-content:space-between;padding:6px 12px;font-size:12px;border-bottom:1px solid #f3f4f6}
  .summary .r .en{color:#9ca3af;font-size:10px}
  .summary .grand{background:#0f766e;color:#fff;font-weight:bold;font-size:14px}
  .terms{font-size:9.5px;color:#4b5563;line-height:1.9;border-top:1px solid #e5e7eb;padding-top:8px;margin-bottom:18px}
  .signs{display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px;margin-top:20px}
  .signs .s{text-align:center;font-size:11px;color:#6b7280}
  .signs .s .line{border-bottom:1px solid #9ca3af;height:48px;margin-bottom:4px}
  .foot{text-align:center;color:#9ca3af;font-size:10px;border-top:1px solid #e5e7eb;padding-top:8px;margin-top:14px}
  @page{size:A4 landscape;margin:10mm}
</style></head><body>
  <div class="topbar">
    <div>
      <div class="seller-ar">أرض المبارك للسيارات</div>
      <div class="meta">المملكة العربية السعودية — جدة</div>
    </div>
    <div class="ttl">
      <div class="ar">فاتورة ضريبية — مركبات</div>
      <div class="en">TAX INVOICE — VEHICLES</div>
    </div>
    <div class="meta">
      <div><b>الرقم الضريبي / VAT No.:</b> 300000000000003</div>
      <div><b>السجل التجاري / CR:</b> 1010000000</div>
      <div><b>تاريخ الطباعة:</b> ${new Date().toLocaleString("ar-SA")}</div>
    </div>
  </div>

  <div class="parties">
    <div class="box">
      <div class="lbl">بيانات البائع / Seller</div>
      <div class="row"><span>اسم الشركة / Company</span><b>أرض المبارك للسيارات</b></div>
      <div class="row"><span>الرقم الضريبي / VAT</span><b dir="ltr">300000000000003</b></div>
      <div class="row"><span>الفرع / Branch</span><b>${esc(r.branch || "جدة")}</b></div>
      <div class="row"><span>التواصل / Contact</span><b dir="ltr">+966 12 000 0000</b></div>
    </div>
    <div class="box">
      <div class="lbl">بيانات المشتري / Customer</div>
      <div class="row"><span>الاسم / Name</span><b>${esc(buyerName)}</b></div>
      <div class="row"><span>الرقم الضريبي / VAT</span><b dir="ltr">${esc(buyerVat || "—")}</b></div>
      <div class="row"><span>رقم الفاتورة / Invoice No.</span><b dir="ltr">${esc(r.invoice_no)}</b></div>
      <div class="row"><span>تاريخ الفاتورة / Date</span><b dir="ltr">${esc(r.invoice_date)}</b></div>
    </div>
  </div>

  <table class="items">
    <thead><tr>
      <th style="width:30px">#<span class="en">No.</span></th>
      <th>اسم المنتج / الخدمة<span class="en">Product / Service</span></th>
      <th>الوصف<span class="en">Description</span></th>
      <th style="width:135px">الرقم (هيكل/قطعة)<span class="en">Chassis / Part No.</span></th>
      <th style="width:90px;text-align:left">السعر الأساسي<span class="en">Base Price</span></th>
      <th style="width:80px;text-align:left">الخصم<span class="en">Discount</span></th>
      <th style="width:85px;text-align:left">الضريبة<span class="en">VAT</span></th>
      <th style="width:100px;text-align:left">شامل الضريبة<span class="en">Incl. VAT</span></th>
    </tr></thead>
    <tbody>${rowsHTML}</tbody>
  </table>

  <div class="bottom">
    <div class="qrbox">${r.qr_code ? `<img src="${r.qr_code}" style="width:140px;height:140px"/>` : `<span style="color:#9ca3af;font-size:10px">QR</span>`}</div>
    <div class="summary">
      <div class="r"><span>المجموع قبل الخصم <span class="en">Total Before Discount</span></span><b dir="ltr">${fmt(totalBeforeDisc)}</b></div>
      <div class="r"><span>إجمالي الخصم <span class="en">Total Discount</span></span><b dir="ltr">${totalDisc > 0 ? "(" + fmt(totalDisc) + ")" : "0.00"}</b></div>
      <div class="r"><span>الإجمالي بعد الخصم (الخاضع للضريبة) <span class="en">Total After Discount</span></span><b dir="ltr">${fmt(Number(r.subtotal))}</b></div>
      <div class="r"><span>ضريبة القيمة المضافة (15%) <span class="en">VAT Amount</span></span><b dir="ltr">${fmt(Number(r.vat_amount))}</b></div>
      <div class="r"><span>المدفوع <span class="en">Paid</span></span><b dir="ltr">${paid > 0 ? fmt(paid) : "0.00"}</b></div>
      <div class="r"><span>المتبقي <span class="en">Remaining</span></span><b dir="ltr">${fmt(remaining)}</b></div>
      <div class="r grand"><span>الإجمالي بالريال السعودي <span class="en" style="color:#bfe3df">Total (SAR)</span></span><span dir="ltr">${fmt(total)} SAR</span></div>
    </div>
  </div>

  <div class="terms">
    * لقد استلمنا السيارة / السيارات المذكورة أعلاه سليمة وتعمل في حالة جيدة وكاملة اللوازم غير منقوصة ولا يوجد بها عيب من العيوب بتاتاً.<br>
    * لقد فهمنا ووافقنا على تحمّل المسؤولية كاملة عن السيارة / السيارات المشتراة وعن المخاطر المحتملة بخصوصها.<br>
    * هذه الفاتورة ليست سند سداد لقيمة السيارات، والشركة غير ملزمة بتسليم السيارات ما لم يتم سداد المبلغ بموجب سند قبض موقّع ومختوم يوضّح قيمة سداد السيارات.
  </div>

  <div class="signs">
    <div class="s"><div class="line"></div>مندوب المبيعات</div>
    <div class="s"><div class="line"></div>المحاسب</div>
    <div class="s"><div class="line"></div>مدير المبيعات</div>
  </div>

  <div class="foot">أرض المبارك للسيارات · جدة · المملكة العربية السعودية</div>
</body></html>`;

    const w = window.open("", "_blank", "width=1100,height=750");
    if (!w) { toast.error("الرجاء السماح بالنوافذ المنبثقة"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  };

  const filtered = rows.filter(r => {
    if (!q) return true;
    const vehs = (r._vehicles ?? r._lines ?? []).map((v: any) => `${v.vin ?? ""} ${v.brand ?? ""} ${v.model ?? ""}`).join(" ");
    const hay = `${r.invoice_no ?? ""} ${r.contact?.name ?? r.customer_name ?? ""} ${vehs}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return (
    <div>
      <PageHeader title="الفواتير الضريبية" subtitle="فواتير متوافقة مع هيئة الزكاة (ZATCA Phase 1) — تسجيل الدفعات متاح للمحاسبة فقط" />
      <div className="relative mb-3 max-w-md">
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9 h-9" placeholder="بحث: رقم الفاتورة، عميل، VIN..." value={q} onChange={e => setQ(e.target.value)} />
      </div>
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
            {filtered.map(r => {
              const total = Number(r.total);
              const paidSoFar = Number(r.paid_amount ?? 0);
              const remainingOI = r._remaining ?? Math.max(0, total - paidSoFar);   // Open Items
              const payStatus: "unpaid" | "partial" | "paid" =
                remainingOI <= 0.01 ? "paid" : remainingOI >= total - 0.01 ? "unpaid" : "partial";
              const woState = payStatus === "paid" ? "paid" : "invoiced";
              const payPerm = canPerform("receive_payment", woState as any, role);
              const vehs: any[] = r._vehicles ?? [];
              return (
                <tr key={r.id}>
                  <td className="font-mono"><Link to={`/invoices/${r.id}`} className="text-primary hover:underline">{r.invoice_no}</Link></td>
                  <td className="num">{r.invoice_date}</td>
                  <td>{(r as any).contact?.name ?? (r as any).customer_name ?? "—"}</td>
                  <td className="text-xs">
                    {vehs.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : vehs.length === 1 ? (
                      <div>
                        <div className="font-medium">{vehs[0].brand} {vehs[0].model} <span className="num text-muted-foreground">{vehs[0].year}</span></div>
                        <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                          <span className="font-mono" dir="ltr">VIN: {vehs[0].vin || "—"}</span>
                          {vehs[0].color && <span>· {vehs[0].color}</span>}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="font-medium">{vehs.length} مركبات</div>
                        <div className="text-[11.5px] text-muted-foreground truncate max-w-[180px]" title={vehs.map(v => v.vin).join(", ")}>
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
                      <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => printInvoice(r)}>
                        <Printer className="h-3.5 w-3.5 ml-1" /> طباعة / PDF
                      </Button>
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