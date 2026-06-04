import { PrintLayout } from "@/components/erp/PrintLayout";
import { fmtSAR } from "@/lib/erpFormat";

const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا",
  bank: "تحويل بنكي",
  transfer: "تحويل بنكي",
  card: "بطاقة",
  cheque: "شيك",
  check: "شيك",
  other: "أخرى",
};

function amountInWords(n: number): string {
  // Lightweight SAR-in-words placeholder. Final localization can replace this.
  const rounded = Math.round(n * 100) / 100;
  const halalas = Math.round((rounded - Math.floor(rounded)) * 100);
  const riyals = Math.floor(rounded).toLocaleString("ar-SA");
  return `${riyals} ريال${halalas ? ` و ${halalas} هللة` : ""} فقط لا غير`;
}

export interface ReceiptCompany {
  name: string;
  cr_number?: string;
  vat_number?: string;
  address?: string;
  contact?: string;
}

export interface PrintableReceiptDocProps {
  company: ReceiptCompany;
  receipt: {
    no: string;
    date: string;
    amount: number;
    method: string;
    reference?: string | null;
    notes?: string | null;
  };
  customer: { code: string; name: string; vat_number?: string | null };
  invoice?: { no: string; date?: string; total?: number; outstanding_after?: number } | null;
  cashier?: string;
}

/**
 * Receipt voucher (سند قبض) — printable / PDF.
 * Matches the approved ERP document design language.
 */
export function PrintableReceiptDoc(p: PrintableReceiptDocProps) {
  const method = METHOD_LABEL[p.receipt.method?.toLowerCase()] ?? p.receipt.method ?? "—";
  return (
    <PrintLayout
      title="سند قبض · RECEIPT VOUCHER"
      subtitle="ساراط ERP — مستند محاسبي رسمي"
      orgName={p.company.name}
      vatNumber={p.company.vat_number}
      documentNo={p.receipt.no}
      documentDate={p.receipt.date}
      showSignatures={false}
      watermark="مستلم"
    >
      <div className="bg-primary text-primary-foreground rounded-t -mx-1 px-4 py-3 mb-3 flex items-center justify-between">
        <div className="w-16 h-16 bg-white/10 border border-white/30 rounded flex items-center justify-center text-[9px] opacity-80">LOGO</div>
        <div className="text-center">
          <div className="text-lg font-black tracking-wide">سند قبض</div>
          <div className="text-[10px] tracking-[0.2em] opacity-80 mt-0.5">RECEIPT VOUCHER</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{p.company.name}</div>
          {p.company.cr_number && <div className="text-[9px] opacity-80">س.ت: <span className="font-mono">{p.company.cr_number}</span></div>}
          {p.company.vat_number && <div className="text-[9px] opacity-80">ر.ض: <span className="font-mono">{p.company.vat_number}</span></div>}
          {p.company.address && <div className="text-[9px] opacity-70">{p.company.address}</div>}
        </div>
      </div>

      {/* Receipt meta */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="border border-border rounded p-2.5 text-[10.5px]">
          <div className="text-[10px] text-muted-foreground font-semibold mb-1">بيانات السند</div>
          <Row label="رقم السند" value={p.receipt.no} mono />
          <Row label="التاريخ" value={fmtDate(p.receipt.date)} mono />
          <Row label="طريقة الدفع" value={method} />
          {p.receipt.reference && <Row label="المرجع" value={p.receipt.reference} mono />}
          {p.cashier && <Row label="أمين الصندوق" value={p.cashier} />}
        </div>
        <div className="border border-border rounded p-2.5 text-[10.5px]">
          <div className="text-[10px] text-muted-foreground font-semibold mb-1">بيانات العميل</div>
          <div className="font-bold text-[12px] mb-1.5 text-primary">{p.customer.name}</div>
          <Row label="كود العميل" value={p.customer.code} mono />
          {p.customer.vat_number && <Row label="الرقم الضريبي" value={p.customer.vat_number} mono />}
        </div>
      </div>

      {/* Amount block */}
      <div className="avoid-break border-2 border-primary rounded mb-3 overflow-hidden">
        <div className="bg-primary text-primary-foreground px-3 py-1.5 text-[11px] font-bold flex justify-between">
          <span>المبلغ المستلم</span>
          <span className="font-mono font-black text-base">{fmtSAR(p.receipt.amount)}</span>
        </div>
        <div className="p-3 text-[10.5px] leading-relaxed">
          <span className="text-muted-foreground">المبلغ كتابةً: </span>
          <span className="font-semibold">{amountInWords(p.receipt.amount)}</span>
        </div>
      </div>

      {/* Invoice reference */}
      <div className="border border-border rounded mb-3 overflow-hidden">
        <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-bold">مرجع الفاتورة</div>
        {p.invoice ? (
          <table className="erp-table text-[10.5px] w-full">
            <thead>
              <tr className="bg-muted/40">
                <th>رقم الفاتورة</th>
                <th>تاريخ الفاتورة</th>
                <th className="num">إجمالي الفاتورة</th>
                <th className="num">المبلغ المسدد</th>
                <th className="num">المتبقي بعد السداد</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono">{p.invoice.no}</td>
                <td className="font-mono">{fmtDate(p.invoice.date)}</td>
                <td className="num">{p.invoice.total != null ? fmtSAR(p.invoice.total) : "—"}</td>
                <td className="num font-bold">{fmtSAR(p.receipt.amount)}</td>
                <td className="num">{p.invoice.outstanding_after != null ? fmtSAR(p.invoice.outstanding_after) : "—"}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="p-3 text-[10px] text-muted-foreground">دفعة على الحساب — لا توجد فاتورة محددة.</div>
        )}
      </div>

      {p.receipt.notes && (
        <div className="border border-border rounded p-3 text-[10px] leading-relaxed mb-3">
          <div className="text-muted-foreground font-semibold mb-1">ملاحظات</div>
          <div>{p.receipt.notes}</div>
        </div>
      )}

      <footer className="avoid-break grid grid-cols-3 gap-6 mt-6 pt-4 print:mt-4 print:pt-3 border-t-2 border-primary text-[10px]">
        {["استلمها أمين الصندوق", "اعتماد المحاسب", "توقيع العميل"].map(role => (
          <div key={role} className="text-center">
            <div className="h-12 border-b border-dashed border-muted-foreground/40 mb-1" />
            <div className="text-muted-foreground font-semibold">{role}</div>
          </div>
        ))}
      </footer>
    </PrintLayout>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
