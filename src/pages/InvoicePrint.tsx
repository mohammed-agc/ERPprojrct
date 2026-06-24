import { useEffect, useState } from "react";
import { exportPageToPDF } from "@/utils/pdfExport";
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

export default function InvoicePrint() {
  const { id } = useParams<{ id: string }>();
  const { company } = useCompany();
  const [inv, setInv] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: i } = await supabase.from("invoices")
        .select("*, contact:contacts(name, vat_number, phone, city, address), order:sales_orders(order_no)")
        .eq("id", id).maybeSingle();
      const { data: ls } = await supabase.from("invoice_lines")
        .select("*").eq("invoice_id", id).order("line_no");
      const { data: pays } = await supabase.from("payments")
        .select("*").eq("invoice_id", id).order("created_at");
      setInv(i);
      setLines(ls ?? []);
      setPayments(pays ?? []);
      setTimeout(() => window.print(), 800);
    })();
  }, [id]);

  if (!inv) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "Arial" }}>
      جاري التحميل...
    </div>
  );

  const STATUS_LABEL: Record<string, string> = {
    draft: "مسودة", issued: "صادرة", partially_paid: "مدفوعة جزئياً",
    paid: "مدفوعة", cancelled: "ملغية"
  };

  return (
    <html lang="ar" dir="rtl">
      <head>
        <meta charSet="UTF-8" />
        <title>فاتورة {inv.invoice_no}</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: Arial, sans-serif; color: #1a1a1a; background: white; }
          @media print {
            @page { size: A4; margin: 15mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
          }
          table { border-collapse: collapse; width: 100%; table-layout: auto; }
          th, td { white-space: nowrap; }
          th:nth-child(2), td:nth-child(2) { white-space: normal; word-break: break-word; }
          th, td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: right; font-size: 13px; }
          th { background: #f9fafb; font-weight: 600; }
        `}</style>
      </head>
      <body id="print-content" style={{ padding: "20mm" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", borderBottom: "3px solid #0f766e", paddingBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: "bold", color: "#0f766e", margin: 0 }}>فاتورة ضريبية</h1>
            <p style={{ color: "#6b7280", margin: "4px 0 0", fontSize: "13px" }}>Tax Invoice</p>
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "20px", fontWeight: "bold" }}>{inv.invoice_no}</div>
            <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "4px" }}>التاريخ: {fmtDate(inv.invoice_date || inv.created_at)}</div>
            {inv.order?.order_no && <div style={{ fontSize: "13px", color: "#6b7280" }}>أمر البيع: {inv.order.order_no}</div>}
            <div style={{ marginTop: "6px", padding: "4px 10px", background: inv.status === "paid" ? "#dcfce7" : "#fef9c3", borderRadius: "4px", fontSize: "12px", fontWeight: "600", color: inv.status === "paid" ? "#166534" : "#854d0e", display: "inline-block" }}>
              {STATUS_LABEL[inv.status] ?? inv.status}
            </div>
          </div>
        </div>

        {/* Company & Customer */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          <div style={{ background: "#f0fdfa", padding: "16px", borderRadius: "8px", border: "1px solid #99f6e4" }}>
            <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase" }}>من / From</div>
            <div style={{ fontWeight: "bold", fontSize: "16px" }}>{displayCompanyName(company)}</div>
            <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>الرقم الضريبي: {displayVatNumber(company)}</div>
            <div style={{ fontSize: "13px", color: "#374151" }}>{displayShortAddress(company)}</div>
            <div style={{ fontSize: "13px", color: "#374151" }}>info@ard-almbarak.com</div>
          </div>
          <div style={{ background: "#f9fafb", padding: "16px", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <div style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px", fontWeight: "600", textTransform: "uppercase" }}>إلى / To</div>
            <div style={{ fontWeight: "bold", fontSize: "16px" }}>{inv.contact?.name ?? inv.customer_name ?? "—"}</div>
            {inv.contact?.vat_number && <div style={{ fontSize: "13px", color: "#374151", marginTop: "4px" }}>الرقم الضريبي: {inv.contact.vat_number}</div>}
            {inv.contact?.phone && <div style={{ fontSize: "13px", color: "#374151" }}>{inv.contact.phone}</div>}
            {inv.contact?.city && <div style={{ fontSize: "13px", color: "#374151" }}>{inv.contact.city}</div>}
          </div>
        </div>

        {/* Lines */}
        <table style={{ marginBottom: "24px" }}>
          <thead>
            <tr>
              <th style={{ background: "#0f766e", color: "white", width: "40px" }}>#</th>
              <th style={{ background: "#0f766e", color: "white" }}>الوصف</th>
              <th style={{ background: "#0f766e", color: "white", width: "80px" }}>VIN</th>
              <th style={{ background: "#0f766e", color: "white", width: "60px" }}>الكمية</th>
              <th style={{ background: "#0f766e", color: "white", width: "120px" }}>سعر الوحدة</th>
              <th style={{ background: "#0f766e", color: "white", width: "60px" }}>VAT%</th>
              <th style={{ background: "#0f766e", color: "white", width: "120px" }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} style={{ background: i % 2 === 0 ? "white" : "#f9fafb" }}>
                <td style={{ textAlign: "center", color: "#6b7280" }}>{l.line_no}</td>
                <td>
                  <div style={{ fontWeight: "600" }}>{l.brand} {l.model} {l.trim} {l.year}</div>
                  {l.color && <div style={{ fontSize: "12px", color: "#6b7280" }}>اللون: {l.color}</div>}
                  {l.description && <div style={{ fontSize: "12px", color: "#6b7280" }}>{l.description}</div>}
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "11px", textAlign: "center" }}>{l.vin || "—"}</td>
                <td style={{ textAlign: "center" }}>{l.quantity ?? 1}</td>
                <td style={{ textAlign: "left", fontFamily: "monospace" }}>{fmtSAR(Number(l.unit_price))} ر.س</td>
                <td style={{ textAlign: "center" }}>{l.vat_pct}%</td>
                <td style={{ textAlign: "left", fontFamily: "monospace", fontWeight: "600" }}>{fmtSAR(Number(l.total))} ر.س</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals & Payments */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px", marginBottom: "24px" }}>
          {/* Payments */}
          {payments.length > 0 && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: "600", marginBottom: "8px" }}>الدفعات المستلمة</div>
              <table>
                <thead>
                  <tr>
                    <th>الرقم</th>
                    <th>التاريخ</th>
                    <th>المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td style={{ fontFamily: "monospace", fontSize: "11px" }}>{p.payment_no}</td>
                      <td>{fmtDate(p.payment_date || p.created_at)}</td>
                      <td style={{ fontFamily: "monospace" }}>{fmtSAR(Number(p.amount))} ر.س</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div style={{ marginRight: "auto" }}>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", minWidth: "280px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>قبل الضريبة</span>
                <span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(inv.subtotal))} ر.س</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #e5e7eb" }}>
                <span style={{ color: "#6b7280" }}>ضريبة القيمة المضافة (15%)</span>
                <span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(inv.vat_amount))} ر.س</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: "#0f766e", color: "white", fontWeight: "bold", fontSize: "16px" }}>
                <span>الإجمالي</span>
                <span style={{ fontFamily: "monospace" }}>{fmtSAR(Number(inv.total))} ر.س</span>
              </div>
              {Number(inv.paid_amount) > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderTop: "1px solid #e5e7eb", background: "#f0fdf4" }}>
                    <span style={{ color: "#166534" }}>المدفوع</span>
                    <span style={{ fontFamily: "monospace", color: "#166534" }}>{fmtSAR(Number(inv.paid_amount))} ر.س</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", background: Number(inv.total) - Number(inv.paid_amount) > 0 ? "#fef2f2" : "#f0fdf4" }}>
                    <span style={{ fontWeight: "600" }}>المتبقي</span>
                    <span style={{ fontFamily: "monospace", fontWeight: "600" }}>{fmtSAR(Number(inv.total) - Number(inv.paid_amount))} ر.س</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* QR Code placeholder */}
        {inv.qr_code && (
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px", padding: "12px", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
            <img src={`data:image/png;base64,${inv.qr_code}`} alt="QR" style={{ width: "80px", height: "80px" }} onError={e => (e.currentTarget.style.display = "none")} />
            <div style={{ fontSize: "12px", color: "#6b7280" }}>
              <div>فاتورة ضريبية متوافقة مع ZATCA Phase 1</div>
              <div>امسح رمز QR للتحقق من الفاتورة</div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ borderTop: "2px solid #e5e7eb", paddingTop: "16px", textAlign: "center", color: "#9ca3af", fontSize: "12px" }}>
          <p>شكراً لتعاملكم معنا · {displayPrintFooter(company)}</p>
        </div>

        {/* Print Button */}
        <div className="no-print" style={{ position: "fixed", bottom: "20px", left: "20px", display: "flex", gap: "8px" }}>
          <button onClick={() => window.print()}
            style={{ background: "#0f766e", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>
            🖨️ طباعة</button>
          <button onClick={() => exportPageToPDF(`${inv?.invoice_no ?? "invoice"}.pdf`)}
            style={{ background: "#1d4ed8", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>
            📄 تحميل PDF
          </button>
          <button onClick={() => window.close()}
            style={{ background: "#6b7280", color: "white", border: "none", padding: "10px 20px", borderRadius: "8px", cursor: "pointer", fontSize: "14px" }}>
            إغلاق
          </button>
        </div>
      </body>
    </html>
  );
}

