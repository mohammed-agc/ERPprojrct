import { PrintLayout } from "@/components/erp/PrintLayout";
import type { LineItem } from "@/services/erp/purchasing";
import { fmtSAR } from "@/services/erp/purchasing";
import { useCompany, displayCompanyName, displayVatNumber } from "@/lib/company/useCompany";

interface Props {
  title: string;
  docType: "purchase_request" | "purchase_order" | "purchase_invoice";
  documentNo: string;
  documentDate: string;
  watermark?: string;
  /** primary party block (right): supplier/customer */
  partyTitle: string;
  partyName: string;
  partyMeta?: { label: string; value: string }[];
  /** internal meta (left): branch, dept, terms… */
  meta?: { label: string; value: string }[];
  items: LineItem[];
  subtotal: number;
  vatAmount?: number;
  total: number;
  notes?: string;
}

const HEAD: Record<Props["docType"], string> = {
  purchase_request: "طلب شراء",
  purchase_order: "أمر شراء",
  purchase_invoice: "فاتورة شراء",
};

export function PrintablePurchaseDoc(p: Props) {
  const { company } = useCompany();
  return (
    <PrintLayout
      title={`${HEAD[p.docType]} — ${p.title}`}
      subtitle="مستند رسمي"
      orgName={displayCompanyName(company)}
      vatNumber={displayVatNumber(company)}
      documentNo={p.documentNo}
      documentDate={p.documentDate}
      watermark={p.watermark}
      showSignatures
    >
      <div className="grid grid-cols-2 gap-4 mb-4 text-[11px]">
        <div className="border border-border rounded p-2.5">
          <div className="text-[10px] text-muted-foreground mb-1">{p.partyTitle}</div>
          <div className="font-bold text-sm mb-1">{p.partyName}</div>
          {p.partyMeta?.map(m => (
            <div key={m.label} className="flex justify-between"><span className="text-muted-foreground">{m.label}</span><span>{m.value}</span></div>
          ))}
        </div>
        <div className="border border-border rounded p-2.5">
          <div className="text-[10px] text-muted-foreground mb-1">بيانات المستند</div>
          {p.meta?.map(m => (
            <div key={m.label} className="flex justify-between py-0.5"><span className="text-muted-foreground">{m.label}</span><span className="font-semibold">{m.value}</span></div>
          ))}
        </div>
      </div>

      <table className="erp-table text-[11px] w-full mb-3">
        <thead>
          <tr>
            <th className="w-[40px]">#</th>
            <th>المنتج</th>
            <th>الوصف</th>
            <th>الموديل / السنة</th>
            <th>اللون</th>
            <th className="num">الكمية</th>
            <th className="num">سعر الوحدة</th>
            <th className="num">ض.ق.م %</th>
            <th className="num">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {p.items.map((it, idx) => {
            const lineSub = it.qty * it.unit_cost;
            const vat = lineSub * ((it.vat_pct ?? 15) / 100);
            return (
              <tr key={it.id}>
                <td className="num">{idx + 1}</td>
                <td className="font-mono text-[10px]">{it.product_code ?? "—"}</td>
                <td>{it.description}</td>
                <td>{[it.model, it.year].filter(Boolean).join(" / ") || "—"}</td>
                <td>{it.color_name ?? "—"}</td>
                <td className="num">{it.qty}</td>
                <td className="num">{fmtSAR(it.unit_cost)}</td>
                <td className="num">{it.vat_pct ?? 15}%</td>
                <td className="num font-semibold">{fmtSAR(lineSub + vat)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="flex justify-end mb-3">
        <div className="w-72 text-[11px] space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">الإجمالي قبل الضريبة</span><span className="font-semibold">{fmtSAR(p.subtotal)}</span></div>
          {p.vatAmount !== undefined && (
            <div className="flex justify-between"><span className="text-muted-foreground">ضريبة القيمة المضافة</span><span className="font-semibold">{fmtSAR(p.vatAmount)}</span></div>
          )}
          <div className="flex justify-between border-t border-border pt-1 text-sm">
            <span className="font-bold">الإجمالي النهائي</span><span className="font-bold">{fmtSAR(p.total)} ر.س</span>
          </div>
        </div>
      </div>

      {p.notes && (
        <div className="text-[11px] border-t border-border pt-2 mt-2">
          <span className="text-muted-foreground">ملاحظات:</span> {p.notes}
        </div>
      )}
    </PrintLayout>
  );
}
