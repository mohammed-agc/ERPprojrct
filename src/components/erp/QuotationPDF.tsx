import { Document, Page, Text, View, StyleSheet, Font, pdf } from "@react-pdf/renderer";

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    padding: "15mm 20mm",
    backgroundColor: "#ffffff",
    direction: "rtl",
  },
  // Header
  header: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, borderBottomWidth: 3, borderBottomColor: "#0f766e", paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#0f766e" },
  headerSub: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  headerRight: { alignItems: "flex-end" },
  headerNo: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  headerDate: { fontSize: 10, color: "#6b7280", marginTop: 3 },
  // Parties
  parties: { flexDirection: "row-reverse", gap: 16, marginBottom: 20 },
  partyBox: { flex: 1, padding: 12, borderRadius: 6, borderWidth: 1 },
  partyBoxFrom: { backgroundColor: "#f0fdfa", borderColor: "#99f6e4" },
  partyBoxTo: { backgroundColor: "#f9fafb", borderColor: "#e5e7eb" },
  partyLabel: { fontSize: 8, color: "#6b7280", fontFamily: "Helvetica-Bold", marginBottom: 6, textTransform: "uppercase" },
  partyName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  partyDetail: { fontSize: 9, color: "#374151", marginTop: 2 },
  // Table
  table: { marginBottom: 20 },
  tableHeader: { flexDirection: "row-reverse", backgroundColor: "#0f766e", padding: "6 10", borderRadius: "4 4 0 0" },
  tableHeaderCell: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 9, flex: 1, textAlign: "center" },
  tableHeaderDesc: { color: "white", fontFamily: "Helvetica-Bold", fontSize: 9, flex: 3, textAlign: "right" },
  tableRow: { flexDirection: "row-reverse", padding: "6 10", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  tableRowEven: { backgroundColor: "#f9fafb" },
  tableCell: { fontSize: 9, flex: 1, textAlign: "center", color: "#374151" },
  tableCellDesc: { fontSize: 9, flex: 3, textAlign: "right", color: "#374151" },
  tableCellBold: { fontSize: 9, flex: 1, textAlign: "center", fontFamily: "Helvetica-Bold" },
  // Totals
  totalsContainer: { flexDirection: "row-reverse", justifyContent: "flex-end", marginBottom: 20 },
  totalsBox: { width: 220, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6, overflow: "hidden" },
  totalsRow: { flexDirection: "row-reverse", justifyContent: "space-between", padding: "6 12", borderBottomWidth: 1, borderBottomColor: "#e5e7eb" },
  totalsLabel: { fontSize: 9, color: "#6b7280" },
  totalsValue: { fontSize: 9, fontFamily: "Helvetica-Bold" },
  totalsFinal: { flexDirection: "row-reverse", justifyContent: "space-between", padding: "10 12", backgroundColor: "#0f766e" },
  totalsFinalLabel: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "white" },
  totalsFinalValue: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "white" },
  // Footer
  footer: { borderTopWidth: 1, borderTopColor: "#e5e7eb", paddingTop: 12, textAlign: "center" },
  footerText: { fontSize: 9, color: "#9ca3af", textAlign: "center" },
  // Status badge
  badge: { padding: "3 8", borderRadius: 4, alignSelf: "flex-start" },
  badgeText: { fontSize: 8, fontFamily: "Helvetica-Bold" },
  // Notes
  notesBox: { backgroundColor: "#fefce8", borderWidth: 1, borderColor: "#fde047", borderRadius: 6, padding: 10, marginBottom: 16 },
  notesLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  notesText: { fontSize: 9, color: "#374151" },
});

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " SAR";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

// ─── PDF Document ─────────────────────────────────────────────
export function QuotationPDFDoc({ quote, lines }: { quote: any; lines: any[] }) {
  const custName = quote.contact?.name ?? quote.customer_name ?? "—";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>عرض سعر</Text>
            <Text style={styles.headerSub}>Quotation</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.headerNo}>{quote.quote_no}</Text>
            <Text style={styles.headerDate}>التاريخ: {fmtDate(quote.created_at)}</Text>
            <Text style={styles.headerDate}>صالح حتى: {fmtDate(quote.valid_until)}</Text>
          </View>
        </View>

        {/* Parties */}
        <View style={styles.parties}>
          <View style={[styles.partyBox, styles.partyBoxFrom]}>
            <Text style={styles.partyLabel}>من / From</Text>
            <Text style={styles.partyName}>أرض المبارك للسيارات</Text>
            <Text style={styles.partyDetail}>الرقم الضريبي: 300000000000003</Text>
            <Text style={styles.partyDetail}>جدة، المملكة العربية السعودية</Text>
            <Text style={styles.partyDetail}>info@ard-almbarak.com</Text>
          </View>
          <View style={[styles.partyBox, styles.partyBoxTo]}>
            <Text style={styles.partyLabel}>إلى / To</Text>
            <Text style={styles.partyName}>{custName}</Text>
            {quote.contact?.vat_number && <Text style={styles.partyDetail}>الرقم الضريبي: {quote.contact.vat_number}</Text>}
            {quote.contact?.phone && <Text style={styles.partyDetail}>{quote.contact.phone}</Text>}
            {quote.contact?.city && <Text style={styles.partyDetail}>{quote.contact.city}</Text>}
            {quote.sales_rep_name && <Text style={[styles.partyDetail, { marginTop: 6 }]}>المندوب: {quote.sales_rep_name}</Text>}
          </View>
        </View>

        {/* Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 0.5 }]}>#</Text>
            <Text style={styles.tableHeaderDesc}>الوصف</Text>
            <Text style={styles.tableHeaderCell}>السنة</Text>
            <Text style={styles.tableHeaderCell}>اللون</Text>
            <Text style={styles.tableHeaderCell}>الكمية</Text>
            <Text style={styles.tableHeaderCell}>سعر الوحدة</Text>
            <Text style={styles.tableHeaderCell}>VAT%</Text>
            <Text style={styles.tableHeaderCell}>الإجمالي</Text>
          </View>
          {lines.map((l, i) => (
            <View key={l.id} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowEven : {}]}>
              <Text style={[styles.tableCell, { flex: 0.5 }]}>{l.line_no}</Text>
              <View style={{ flex: 3 }}>
                <Text style={[styles.tableCellDesc, { fontFamily: "Helvetica-Bold" }]}>{l.brand} {l.model} {l.trim}</Text>
                {l.description && l.description !== `${l.brand} ${l.model} ${l.trim}` && (
                  <Text style={[styles.tableCellDesc, { fontSize: 8, color: "#6b7280" }]}>{l.description}</Text>
                )}
              </View>
              <Text style={styles.tableCell}>{l.year}</Text>
              <Text style={styles.tableCell}>{l.color}</Text>
              <Text style={styles.tableCell}>{l.quantity ?? 1}</Text>
              <Text style={styles.tableCell}>{fmtSAR(Number(l.unit_price))}</Text>
              <Text style={styles.tableCell}>{l.vat_pct}%</Text>
              <Text style={styles.tableCellBold}>{fmtSAR(Number(l.total))}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>قبل الضريبة</Text>
              <Text style={styles.totalsValue}>{fmtSAR(Number(quote.subtotal))}</Text>
            </View>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>ضريبة القيمة المضافة (15%)</Text>
              <Text style={styles.totalsValue}>{fmtSAR(Number(quote.vat_amount))}</Text>
            </View>
            <View style={styles.totalsFinal}>
              <Text style={styles.totalsFinalLabel}>الإجمالي</Text>
              <Text style={styles.totalsFinalValue}>{fmtSAR(Number(quote.total))}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>ملاحظات:</Text>
            <Text style={styles.notesText}>{quote.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            هذا العرض صالح حتى تاريخ {fmtDate(quote.valid_until)} · شكراً لتعاملكم معنا
          </Text>
          <Text style={[styles.footerText, { marginTop: 3 }]}>
            أرض المبارك للسيارات · جدة · المملكة العربية السعودية
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ─── Download Function ────────────────────────────────────────
export async function downloadQuotationPDF(quote: any, lines: any[]) {
  const blob = await pdf(<QuotationPDFDoc quote={quote} lines={lines} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${quote.quote_no}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
