import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  useCompany,
  displayCompanyName,
  displayVatNumber,
  displayShortAddress,
  displayPrintFooter,
} from "@/lib/company/useCompany";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export default function QuotationPrint() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const [quote, setQuote] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: q } = await supabase
        .from("quotations")
        .select("*, contact:contacts(name, vat_number, phone, phone2, city, national_id)")
        .eq("id", id)
        .maybeSingle();
      const { data: ls } = await supabase
        .from("quotation_lines")
        .select("*")
        .eq("quote_id", id)
        .order("line_no");
      setQuote(q);
      setLines(ls ?? []);
    })();
  }, [id]);

  /** يبني مستند HTML كامل ومستقل للطباعة/الحفظ PDF */
  const buildHTML = (): string => {
    const totalDiscount = Number(quote.discount_amount ?? 0);
    const custName = quote.contact?.name ?? quote.customer_name ?? "—";

    const linesHTML = lines.length
      ? lines.map((l, i) => `
        <tr style="background:${i % 2 === 0 ? "#ffffff" : "#f9fafb"}">
          <td style="text-align:center;color:#6b7280">${l.line_no}</td>
          <td>
            <div style="font-weight:600">${esc([l.brand, l.model, l.trim].filter(Boolean).join(" ") || l.description)}</div>
            ${l.description && l.description !== [l.brand, l.model, l.trim].filter(Boolean).join(" ") ? `<div style="font-size:11px;color:#6b7280">${esc(l.description)}</div>` : ""}
          </td>
          <td style="text-align:center">${esc(l.year || "—")}</td>
          <td>${esc(l.color || "—")}</td>
          <td style="text-align:center">${l.quantity ?? 1}</td>
          <td style="text-align:left;font-family:monospace">${fmtSAR(Number(l.unit_price))} ر.س</td>
          <td style="text-align:left;font-family:monospace;color:${Number(l.discount) > 0 ? "#dc2626" : "#9ca3af"}">${Number(l.discount) > 0 ? "- " + fmtSAR(Number(l.discount)) + " ر.س" : "—"}</td>
          <td style="text-align:center">${l.vat_pct}%</td>
          <td style="text-align:left;font-family:monospace;font-weight:600">${fmtSAR(Number(l.total))} ر.س</td>
        </tr>`).join("")
      : `<tr><td colspan="9" style="text-align:center;color:#9ca3af;padding:20px">لا توجد بنود</td></tr>`;

    const discountRows = totalDiscount > 0 ? `
      <div class="trow"><span class="tlabel">قبل الخصم</span><span class="tval">${fmtSAR(Number(quote.subtotal) + totalDiscount)} ر.س</span></div>
      <div class="trow" style="color:#dc2626"><span>الخصم</span><span class="tval">- ${fmtSAR(totalDiscount)} ر.س</span></div>` : "";

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>${esc(quote.quote_no)}</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; padding: 30px 35px; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 10px; text-align: right; font-size: 12px; }
  th { background: #0f766e; color: #fff; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 18px; margin-bottom: 22px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 22px; }
  .box { padding: 14px; border-radius: 8px; }
  .totals { width: 290px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-right: auto; }
  .trow { display: flex; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid #e5e7eb; font-size: 13px; color: #6b7280; }
  .tval { font-family: monospace; }
  .grand { display: flex; justify-content: space-between; padding: 12px 14px; background: #0f766e; color: #fff; font-weight: bold; font-size: 15px; }
  .signs { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 36px; }
  .sign { text-align: center; }
  .signline { border-top: 1px solid #9ca3af; padding-top: 8px; margin-top: 44px; font-size: 12px; color: #6b7280; }
  .footer { border-top: 2px solid #e5e7eb; padding-top: 14px; text-align: center; color: #9ca3af; font-size: 11px; margin-top: 22px; }
  @page { size: A4 portrait; margin: 12mm 14mm; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div style="font-size:26px;font-weight:bold;color:#0f766e">عرض سعر</div>
      <div style="color:#6b7280;font-size:13px;margin-top:2px">Quotation</div>
    </div>
    <div style="text-align:left">
      <div style="font-size:20px;font-weight:bold">${esc(quote.quote_no)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">التاريخ: ${fmtDate(quote.created_at)}</div>
      <div style="font-size:12px;color:#6b7280">صالح حتى: ${fmtDate(quote.valid_until)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="box" style="background:#f0fdfa;border:1px solid #99f6e4">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">من / FROM</div>
      <div style="font-weight:bold;font-size:15px">${esc(displayCompanyName(company))}</div>
      <div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: ${esc(displayVatNumber(company))}</div>
      <div style="font-size:12px;color:#374151">${esc(displayShortAddress(company))}</div>
      <div style="font-size:12px;color:#374151">info@ard-almbarak.com</div>
    </div>
    <div class="box" style="background:#f9fafb;border:1px solid #e5e7eb">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">إلى / TO</div>
      <div style="font-weight:bold;font-size:15px">${esc(custName)}</div>
      ${quote.contact?.vat_number ? `<div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: ${esc(quote.contact.vat_number)}</div>` : ""}
      ${quote.contact?.national_id ? `<div style="font-size:12px;color:#374151">الهوية: ${esc(quote.contact.national_id)}</div>` : ""}
      ${quote.contact?.phone ? `<div style="font-size:12px;color:#374151">${esc(quote.contact.phone)}</div>` : ""}
      ${quote.contact?.city ? `<div style="font-size:12px;color:#374151">${esc(quote.contact.city)}</div>` : ""}
    </div>
  </div>

  <table style="margin-bottom:20px">
    <thead>
      <tr>
        <th style="width:30px;text-align:center">#</th>
        <th>الوصف</th>
        <th style="width:50px;text-align:center">السنة</th>
        <th style="width:60px">اللون</th>
        <th style="width:42px;text-align:center">الكمية</th>
        <th style="width:100px;text-align:left">سعر الوحدة</th>
        <th style="width:90px;text-align:left">الخصم</th>
        <th style="width:42px;text-align:center">VAT%</th>
        <th style="width:105px;text-align:left">الإجمالي</th>
      </tr>
    </thead>
    <tbody>${linesHTML}</tbody>
  </table>

  <div style="display:flex">
    <div class="totals">
      ${discountRows}
      <div class="trow"><span>قبل الضريبة</span><span class="tval">${fmtSAR(Number(quote.subtotal))} ر.س</span></div>
      <div class="trow"><span>ضريبة القيمة المضافة (15%)</span><span class="tval">${fmtSAR(Number(quote.vat_amount))} ر.س</span></div>
      <div class="grand"><span>الإجمالي</span><span style="font-family:monospace">${fmtSAR(Number(quote.total))} ر.س</span></div>
    </div>
  </div>

  ${quote.notes ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:12px 14px;margin-top:20px"><div style="font-weight:600;margin-bottom:4px;font-size:13px">ملاحظات:</div><div style="font-size:12px;color:#374151">${esc(quote.notes)}</div></div>` : ""}

  <div class="signs">
    <div class="sign"><div class="signline">توقيع المندوب</div>${quote.sales_rep_name ? `<div style="font-size:12px;margin-top:4px">${esc(quote.sales_rep_name)}</div>` : ""}</div>
    <div class="sign"><div class="signline">توقيع واعتماد العميل</div></div>
  </div>

  <div class="footer">
    <p style="margin:0 0 4px">هذا العرض صالح حتى تاريخ ${fmtDate(quote.valid_until)} · شكراً لتعاملكم معنا</p>
    <p style="margin:0">${esc(displayPrintFooter(company))}</p>
  </div>
</body>
</html>`;
  };

  /** يفتح نافذة نظيفة ويطبع منها (يصلح الطباعة + يتيح حفظ PDF) */
  const printOrPDF = () => {
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("الرجاء السماح بالنوافذ المنبثقة (Popups) لهذا الموقع ثم إعادة المحاولة."); return; }
    w.document.open();
    w.document.write(buildHTML());
    w.document.close();
    w.focus();
    // ننتظر اكتمال الرسم ثم نفتح حوار الطباعة
    setTimeout(() => { w.print(); }, 500);
  };

  if (!quote) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial" }}>
      جاري تحميل العرض...
    </div>
  );

  const totalDiscount = Number(quote.discount_amount ?? 0);
  const custName = quote.contact?.name ?? quote.customer_name ?? "—";

  return (
    <div dir="rtl" style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#f1f5f9", minHeight: "100vh", paddingBottom: "40px" }}>

      {/* شريط الأدوات */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: "#1e293b",
        padding: "12px 24px", display: "flex", gap: "10px", alignItems: "center"
      }}>
        <span style={{ color: "#94a3b8", fontSize: "14px", marginLeft: "auto" }}>{quote.quote_no}</span>
        <button onClick={printOrPDF} style={btnStyle("#0f766e")}>🖨️ طباعة</button>
        <button onClick={printOrPDF} style={btnStyle("#1d4ed8")}>📄 حفظ PDF</button>
        <button onClick={() => window.close()} style={btnStyle("#475569")}>✕ إغلاق</button>
      </div>

      <div style={{ maxWidth: "820px", margin: "20px auto", color: "#64748b", fontSize: "12px", textAlign: "center" }}>
        💡 لحفظ PDF: اضغط "حفظ PDF" ثم اختر وجهة الطباعة "حفظ كـ PDF / Save as PDF"
      </div>

      {/* معاينة على الشاشة */}
      <div style={{ background: "white", maxWidth: "820px", margin: "0 auto", padding: "30px 35px", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #0f766e", paddingBottom: "18px", marginBottom: "22px" }}>
          <div>
            <div style={{ fontSize: "26px", fontWeight: "bold", color: "#0f766e" }}>عرض سعر</div>
            <div style={{ color: "#6b7280", fontSize: "13px" }}>Quotation</div>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "20px", fontWeight: "bold" }}>{quote.quote_no}</div>
            <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "4px" }}>التاريخ: {fmtDate(quote.created_at)}</div>
            <div style={{ fontSize: "12px", color: "#6b7280" }}>صالح حتى: {fmtDate(quote.valid_until)}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "22px" }}>
          <div style={{ background: "#f0fdfa", padding: "14px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, marginBottom: "8px" }}>من / FROM</div>
            <div style={{ fontWeight: "bold", fontSize: "15px" }}>{displayCompanyName(company)}</div>
            <div style={{ fontSize: "12px", color: "#374151", marginTop: "5px" }}>الرقم الضريبي: {displayVatNumber(company)}</div>
            <div style={{ fontSize: "12px", color: "#374151" }}>{displayShortAddress(company)}</div>
          </div>
          <div style={{ background: "#f9fafb", padding: "14px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "10px", color: "#6b7280", fontWeight: 700, marginBottom: "8px" }}>إلى / TO</div>
            <div style={{ fontWeight: "bold", fontSize: "15px" }}>{custName}</div>
            {quote.contact?.vat_number && <div style={{ fontSize: "12px", color: "#374151", marginTop: "5px" }}>الرقم الضريبي: {quote.contact.vat_number}</div>}
            {quote.contact?.phone && <div style={{ fontSize: "12px", color: "#374151" }}>{quote.contact.phone}</div>}
            {quote.contact?.city && <div style={{ fontSize: "12px", color: "#374151" }}>{quote.contact.city}</div>}
          </div>
        </div>

        <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: "20px" }}>
          <thead>
            <tr>
              {["#", "الوصف", "السنة", "اللون", "الكمية", "سعر الوحدة", "الخصم", "VAT%", "الإجمالي"].map((h, idx) => (
                <th key={idx} style={{ background: "#0f766e", color: "white", border: "1px solid #e5e7eb", padding: "7px 10px", fontSize: "12px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: "center", color: "#9ca3af", padding: "20px", border: "1px solid #e5e7eb" }}>لا توجد بنود</td></tr>
            )}
            {lines.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                <td style={td("center", "#6b7280")}>{l.line_no}</td>
                <td style={td()}><b>{[l.brand, l.model, l.trim].filter(Boolean).join(" ") || l.description}</b></td>
                <td style={td("center")}>{l.year || "—"}</td>
                <td style={td()}>{l.color || "—"}</td>
                <td style={td("center")}>{l.quantity ?? 1}</td>
                <td style={td("left")}>{fmtSAR(Number(l.unit_price))} ر.س</td>
                <td style={td("left", Number(l.discount) > 0 ? "#dc2626" : "#9ca3af")}>{Number(l.discount) > 0 ? `- ${fmtSAR(Number(l.discount))} ر.س` : "—"}</td>
                <td style={td("center")}>{l.vat_pct}%</td>
                <td style={{ ...td("left"), fontWeight: 600 }}>{fmtSAR(Number(l.total))} ر.س</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: "flex" }}>
          <div style={{ width: "290px", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", marginRight: "auto" }}>
            {totalDiscount > 0 && (
              <>
                <div style={totalRow()}><span>قبل الخصم</span><span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(quote.subtotal) + totalDiscount)} ر.س</span></div>
                <div style={{ ...totalRow(), color: "#dc2626" }}><span>الخصم</span><span style={{ fontFamily: "monospace" }}>- {fmtSAR(totalDiscount)} ر.س</span></div>
              </>
            )}
            <div style={totalRow()}><span>قبل الضريبة</span><span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(quote.subtotal))} ر.س</span></div>
            <div style={totalRow()}><span>ضريبة القيمة المضافة (15%)</span><span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(quote.vat_amount))} ر.س</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#0f766e", color: "white", fontWeight: "bold", fontSize: "15px" }}>
              <span>الإجمالي</span><span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(quote.total))} ر.س</span>
            </div>
          </div>
        </div>

        {quote.notes && (
          <div style={{ background: "#fefce8", border: "1px solid #fde047", borderRadius: "8px", padding: "12px 14px", marginTop: "20px" }}>
            <div style={{ fontWeight: 600, marginBottom: "4px", fontSize: "13px" }}>ملاحظات:</div>
            <div style={{ fontSize: "12px", color: "#374151" }}>{quote.notes}</div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnStyle = (bg: string): React.CSSProperties => ({
  background: bg, color: "white", border: "none",
  padding: "8px 18px", borderRadius: "6px", cursor: "pointer", fontSize: "14px"
});
const td = (align: "right" | "left" | "center" = "right", color?: string): React.CSSProperties => ({
  border: "1px solid #e5e7eb", padding: "7px 10px", fontSize: "12px", textAlign: align,
  fontFamily: align === "left" ? "monospace" : undefined, color
});
const totalRow = (): React.CSSProperties => ({
  display: "flex", justifyContent: "space-between", padding: "8px 14px",
  borderBottom: "1px solid #e5e7eb", fontSize: "13px", color: "#6b7280"
});
