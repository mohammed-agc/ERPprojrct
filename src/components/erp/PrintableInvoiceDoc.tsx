import { PrintLayout } from "@/components/erp/PrintLayout";
import { fmtSAR } from "@/lib/erpFormat";

/**
 * Invoice Template v1.0 — APPROVED ERP STANDARD
 *
 * Unified document engine for:
 *   - Purchase Invoice  (variant="purchase")
 *   - Sales Invoice     (variant="sales")
 *   - Print Preview
 *   - PDF Export
 *
 * A4 portrait · Arabic RTL · Saudi automotive ERP style · ZATCA compliant.
 * Palette: dark navy (--primary) · white · light gray (--muted).
 *
 * One row per VIN. Engine numbers, internal codes and DB IDs are intentionally
 * suppressed per governance rules.
 */

export interface InvoiceParty {
  name: string;
  cr_number?: string;
  vat_number?: string;
  address?: string;
  contact?: string;
}

export interface InvoiceLine {
  vin?: string;                // bold/highlighted when present
  description: string;         // e.g. "Toyota Camry LE 2025"
  color?: string;
  model_year?: number | string;
  base_price: number;          // unit / line base price (excl discount, excl VAT)
  discount?: number;           // SAR
  vat_pct?: number;            // default 15
  /** override total; otherwise computed = (base - discount) * (1 + vat/100) */
  total?: number;
}

export interface InvoiceErpRefs {
  pr?: string;     // PR-…
  po?: string;     // PO-…
  alc?: string;    // ALC-…
  alc_conf?: string; // ALCC-…
  pi?: string;     // PINV-…
  so?: string;     // SO-…
  dn?: string;     // DN-…
  si?: string;     // INV-…
}

export interface InvoiceCreditInfo {
  credit_limit: number;
  credit_used: number;
  credit_remaining: number;
}

export interface PrintableInvoiceDocProps {
  variant: "purchase" | "sales";
  /** internal status label (e.g. مدفوعة / مسودة / معتمدة / ملغاة) */
  statusLabel: string;
  /** one of: draft | approved | paid | cancelled — drives badge + watermark */
  statusKind: "draft" | "approved" | "paid" | "cancelled";

  invoice_no: string;
  invoice_date: string;
  supply_date?: string;
  branch?: string;
  payment_method: string;
  /** raw payment method key for conditional logic (credit_utilization / supplier_credit shows credit panel) */
  payment_method_key?: string;

  seller: InvoiceParty;
  buyer: InvoiceParty;

  erpRefs?: InvoiceErpRefs;

  items: InvoiceLine[];
  /** if any item.vin is set, vehicle count is shown */
  showVehicleCount?: boolean;

  // financial summary
  totalVehicleValue: number;
  totalDiscounts?: number;
  netBeforeVat: number;
  vatAmount: number;
  additionalCharges?: number;
  finalTotal: number;

  credit?: InvoiceCreditInfo;  // shown only when payment uses supplier credit
  qrCodeDataUrl?: string;      // optional ZATCA QR
  notes?: string;
}

const HEADER_AR = "فاتورة ضريبية — مركبات";
const HEADER_EN = "TAX INVOICE — VEHICLES";

const STATUS_BADGE: Record<PrintableInvoiceDocProps["statusKind"], string> = {
  draft: "bg-muted text-muted-foreground border-border",
  approved: "bg-primary/10 text-primary border-primary/30",
  paid: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  cancelled: "bg-destructive/10 text-destructive border-destructive/40",
};
const STATUS_LABEL_AR: Record<PrintableInvoiceDocProps["statusKind"], string> = {
  draft: "مسودة", approved: "معتمدة", paid: "مدفوعة", cancelled: "ملغاة",
};

const isCreditMethod = (key?: string) =>
  !!key && (
    key === "credit" || key === "supplier_credit" || key === "credit_utilization" ||
    key === "mixed" || key === "mixed_settlement"
  );

function Party({ title, p }: { title: string; p: InvoiceParty }) {
  return (
    <div className="border border-border rounded p-2.5 text-[10.5px]">
      <div className="text-[10px] text-muted-foreground font-semibold mb-1">{title}</div>
      <div className="font-bold text-[12px] mb-1.5 text-primary">{p.name}</div>
      <div className="space-y-0.5">
        {p.cr_number && <Row label="السجل التجاري" value={p.cr_number} mono />}
        {p.vat_number && <Row label="الرقم الضريبي" value={p.vat_number} mono />}
        {p.address && <Row label="العنوان" value={p.address} />}
        {p.contact && <Row label="التواصل" value={p.contact} />}
      </div>
    </div>
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

/** Accounting-style aligned row: label · dotted leader · right-aligned number. */
function CreditAcctRow({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex items-baseline gap-2 ${bold ? "font-bold" : ""}`}>
      <span className={`shrink-0 ${bold ? "text-amber-900 dark:text-amber-200" : "text-muted-foreground"}`}>{label}</span>
      <span className="flex-1 border-b border-dotted border-amber-400/60 translate-y-[-2px]" aria-hidden />
      <span className="font-mono tabular-nums text-right min-w-[110px]">{fmtSAR(value)}</span>
    </div>
  );
}

function ErpRefBadges({ variant, refs }: { variant: "purchase" | "sales"; refs?: InvoiceErpRefs }) {
  if (!refs) return null;
  const items: { label: string; value?: string }[] = variant === "purchase"
    ? [
        { label: "PR", value: refs.pr },
        { label: "PO", value: refs.po },
        { label: "ALC", value: refs.alc },
        { label: "ALC-CONF", value: refs.alc_conf },
        { label: "PI", value: refs.pi },
      ]
    : [
        { label: "SO", value: refs.so },
        { label: "DN", value: refs.dn },
        { label: "SI", value: refs.si },
      ];
  const shown = items.filter(i => i.value);
  if (shown.length === 0) return null;
  return (
    <div className="border border-border rounded p-2 text-[10px] flex flex-wrap gap-1.5">
      <span className="text-muted-foreground font-semibold ml-1">مراجع ERP:</span>
      {shown.map(i => (
        <span key={i.label} className="inline-flex items-center gap-1 bg-muted/60 border border-border rounded px-1.5 py-0.5 font-mono">
          <span className="text-muted-foreground">{i.label}</span>
          <span className="font-semibold text-foreground">{i.value}</span>
        </span>
      ))}
    </div>
  );
}

export function PrintableInvoiceDoc(p: PrintableInvoiceDocProps) {
  const vehicleCount = p.items.filter(it => it.vin).length;
  const itemsCount = p.items.length;
  const showCredit = !!p.credit && isCreditMethod(p.payment_method_key);

  const sigLabels = p.variant === "purchase"
    ? ["موظف الاستلام", "المحاسب", "مدير المشتريات"]
    : ["مندوب المبيعات", "المحاسب", "مدير المبيعات"];

  return (
    <PrintLayout
      title={`${HEADER_AR} · ${HEADER_EN}`}
      subtitle={p.variant === "purchase" ? "فاتورة مشتريات — ساراط ERP" : "فاتورة مبيعات — ساراط ERP"}
      orgName={p.seller.name}
      vatNumber={p.seller.vat_number}
      documentNo={p.invoice_no}
      documentDate={p.invoice_date}
      watermark={p.statusKind === "paid" ? "مدفوعة" : p.statusKind === "cancelled" ? "ملغاة" : p.statusKind === "draft" ? "مسودة" : undefined}
      showSignatures={false}
    >
      {/* === Header band === */}
      <div className="bg-primary text-primary-foreground rounded-t -mx-1 px-4 py-3 mb-3 flex items-center justify-between">
        <div className="text-[10px] leading-tight">
          {p.qrCodeDataUrl ? (
            <img src={p.qrCodeDataUrl} alt="QR" className="w-16 h-16 bg-white p-1 rounded" />
          ) : (
            <div className="w-16 h-16 bg-white/10 border border-white/30 rounded flex items-center justify-center text-[9px] opacity-80">QR</div>
          )}
        </div>
        <div className="text-center">
          <div className="text-lg font-black tracking-wide">{HEADER_AR}</div>
          <div className="text-[10px] tracking-[0.2em] opacity-80 mt-0.5">{HEADER_EN}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">{p.seller.name}</div>
          {p.seller.cr_number && <div className="text-[9px] opacity-80">س.ت: <span className="font-mono">{p.seller.cr_number}</span></div>}
          {p.seller.vat_number && <div className="text-[9px] opacity-80">ر.ض: <span className="font-mono">{p.seller.vat_number}</span></div>}
          {p.seller.address && <div className="text-[9px] opacity-70">{p.seller.address}</div>}
          {p.seller.contact && <div className="text-[9px] opacity-70">{p.seller.contact}</div>}
        </div>
      </div>

      {/* === Parties === */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Party title="بيانات البائع" p={p.seller} />
        <Party title="بيانات المشتري" p={p.buyer} />
      </div>

      {/* === Document Information === */}
      <div className="border border-border rounded p-2.5 mb-3 grid grid-cols-2 md:grid-cols-6 gap-2 text-[10.5px]">
        <div><div className="text-[9px] text-muted-foreground">رقم الفاتورة</div><div className="font-mono font-bold">{p.invoice_no}</div></div>
        <div><div className="text-[9px] text-muted-foreground">تاريخ الفاتورة</div><div className="font-mono">{p.invoice_date}</div></div>
        <div><div className="text-[9px] text-muted-foreground">تاريخ التوريد</div><div className="font-mono">{p.supply_date ?? p.invoice_date}</div></div>
        <div><div className="text-[9px] text-muted-foreground">الفرع</div><div>{p.branch ?? "—"}</div></div>
        <div><div className="text-[9px] text-muted-foreground">طريقة الدفع</div><div>{p.payment_method}</div></div>
        <div>
          <div className="text-[9px] text-muted-foreground">حالة الفاتورة</div>
          <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-semibold ${STATUS_BADGE[p.statusKind]}`}>
            {p.statusLabel || STATUS_LABEL_AR[p.statusKind]}
          </span>
        </div>
      </div>

      <ErpRefBadges variant={p.variant} refs={p.erpRefs} />

      {/* === Items === */}
      <table className="erp-table text-[10.5px] w-full my-3">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="w-[34px]">م</th>
            <th className="w-[150px]">رقم الهيكل VIN</th>
            <th>وصف المنتج / الخدمة</th>
            <th className="w-[80px]">اللون</th>
            <th className="num w-[64px]">سنة الموديل</th>
            <th className="num w-[88px]">السعر الأساسي</th>
            <th className="num w-[72px]">الخصم</th>
            <th className="num w-[72px]">الضريبة</th>
            <th className="num w-[96px]">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((it, idx) => {
            const base = it.base_price;
            const disc = it.discount ?? 0;
            const net = Math.max(0, base - disc);
            const vatPct = it.vat_pct ?? 15;
            const vat = net * (vatPct / 100);
            const total = it.total ?? (net + vat);
            return (
              <tr key={idx}>
                <td className="num text-muted-foreground">{idx + 1}</td>
                <td className="font-mono font-bold text-[11px] text-primary" dir="ltr">
                  {it.vin || <span className="text-muted-foreground font-normal">—</span>}
                </td>
                <td className="font-medium">{it.description}</td>
                <td>{it.color ?? "—"}</td>
                <td className="num">{it.model_year ?? "—"}</td>
                <td className="num">{fmtSAR(base)}</td>
                <td className="num">{disc ? fmtSAR(disc) : "—"}</td>
                <td className="num">{fmtSAR(vat)}</td>
                <td className="num font-bold">{fmtSAR(total)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-muted/60">
            <td colSpan={9} className="text-[10px] py-1.5">
              <div className="flex items-center justify-between px-1">
                <span>عدد البنود: <span className="font-bold">{itemsCount}</span></span>
                {p.showVehicleCount !== false && vehicleCount > 0 && (
                  <span>عدد المركبات: <span className="font-bold">{vehicleCount}</span></span>
                )}
              </div>
            </td>
          </tr>
        </tfoot>
      </table>

      {/* === Financial Summary (kept together on one page) === */}
      <div className="avoid-break grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        {showCredit && p.credit && (
          <div className="avoid-break border border-amber-300 bg-amber-50 dark:bg-amber-500/10 rounded p-3 text-[10.5px]">
            <div className="text-[10px] font-bold text-amber-900 dark:text-amber-300 mb-1.5">معلومات الحد الائتماني للمورد</div>
            <div className="space-y-0.5 font-mono">
              <CreditAcctRow label="الحد الائتماني" value={p.credit.credit_limit} />
              <CreditAcctRow label="المستخدم"      value={p.credit.credit_used} />
              <div className="border-t border-amber-400/70 my-1" />
              <CreditAcctRow label="المتبقي"        value={p.credit.credit_remaining} bold />
            </div>
          </div>
        )}
        <div className={`avoid-break ${showCredit ? "" : "md:col-start-2"} border border-border rounded text-[10.5px] overflow-hidden`}>
          <div className="bg-muted/60 px-3 py-1.5 text-[10px] font-bold">الملخص المالي</div>
          <div className="p-3 space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي قيمة المركبات</span><span className="font-mono">{fmtSAR(p.totalVehicleValue)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">إجمالي الخصومات</span><span className="font-mono">{p.totalDiscounts ? `(${fmtSAR(p.totalDiscounts)})` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">الصافي قبل الضريبة</span><span className="font-mono font-semibold">{fmtSAR(p.netBeforeVat)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">قيمة الضريبة (15%)</span><span className="font-mono font-semibold">{fmtSAR(p.vatAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">رسوم إضافية</span><span className="font-mono">{p.additionalCharges ? fmtSAR(p.additionalCharges) : "—"}</span></div>
            <div className="flex justify-between items-center mt-2 -mx-3 -mb-3 px-3 py-2 bg-primary text-primary-foreground">
              <span className="font-bold text-sm">الإجمالي النهائي</span>
              <span className="font-mono font-black text-base">{fmtSAR(p.finalTotal)} ر.س</span>
            </div>
          </div>
        </div>
      </div>

      {p.notes && (
        <div className="text-[10px] border-t border-border pt-2 mt-2 mb-3 avoid-break">
          <span className="text-muted-foreground font-semibold">ملاحظات: </span>{p.notes}
        </div>
      )}

      {/* === Signatures (kept together) === */}
      <footer className="avoid-break grid grid-cols-3 gap-6 mt-6 pt-4 print:mt-4 print:pt-3 border-t-2 border-primary text-[10px]">
        {sigLabels.map(role => (
          <div key={role} className="text-center">
            <div className="h-12 border-b border-dashed border-muted-foreground/40 mb-1" />
            <div className="text-muted-foreground font-semibold">{role}</div>
          </div>
        ))}
      </footer>
    </PrintLayout>
  );
}
