import { useQuery } from "@tanstack/react-query";
import {
  getDocumentAllocations, fmtSAR, fmtDate, ALLOC_TYPE_LABEL,
} from "@/services/erp/partnerLedger";
import { Layers } from "lucide-react";

interface Props {
  docType: "purchase_invoice" | "sales_invoice";
  docId: string;
  total: number;
}

const TYPE_TONE: Record<string, string> = {
  PAYMENT: "text-success",
  SETTLEMENT: "text-primary",
  CREDIT_NOTE: "text-warning",
  DEBIT_NOTE: "text-warning",
  WRITE_OFF: "text-destructive",
  ADJUSTMENT: "text-muted-foreground",
};

export function AllocationInquiry({ docType, docId, total }: Props) {
  const { data, isFetching } = useQuery({
    queryKey: ["doc-allocations", docType, docId],
    queryFn: () => getDocumentAllocations(docType, docId, total),
    enabled: !!docId,
  });

  if (isFetching) {
    return <div className="text-sm text-muted-foreground py-4">جارٍ تحميل التخصيصات…</div>;
  }
  if (!data) return null;

  const breakdown = [
    { label: "الأصلي", value: data.total, tone: "text-foreground" },
    { label: "مدفوع (دفعات)", value: data.payment_allocated, tone: "text-success" },
    { label: "مسوّى (مقاصّة)", value: data.settlement_allocated, tone: "text-primary" },
    { label: "إشعارات دائنة", value: data.credit_note_allocated, tone: "text-warning" },
  ].filter(b => b.label === "الأصلي" || b.value > 0.01);

  return (
    <div className="bg-card border border-border rounded-lg p-4 mt-4">
      <div className="flex items-center gap-2 mb-3 font-semibold text-sm">
        <Layers className="h-4 w-4" /> تفصيل التصفية (Open Items)
      </div>

      {/* ملخّص التركيبة */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
        {breakdown.map(b => (
          <div key={b.label} className="p-2 bg-muted/40 rounded-lg text-center">
            <div className="text-[10px] text-muted-foreground">{b.label}</div>
            <div className={`num text-sm font-bold ${b.tone}`}>{fmtSAR(b.value)}</div>
          </div>
        ))}
        <div className="p-2 bg-primary/10 border border-primary/30 rounded-lg text-center">
          <div className="text-[10px] text-muted-foreground">المتبقّي</div>
          <div className="num text-sm font-bold text-primary">{fmtSAR(data.remaining)}</div>
        </div>
      </div>

      {/* سجل التخصيصات */}
      {data.allocations.length > 0 ? (
        <table className="erp-table w-full text-xs">
          <thead>
            <tr>
              <th>رقم التخصيص</th>
              <th>النوع</th>
              <th>التاريخ</th>
              <th className="text-left">المبلغ</th>
              <th>ملاحظة</th>
            </tr>
          </thead>
          <tbody>
            {data.allocations.map((a, i) => (
              <tr key={i}>
                <td className="font-mono text-[10px]">{a.allocation_number}</td>
                <td>
                  <span className={`font-medium ${TYPE_TONE[a.allocation_type] ?? ""}`}>
                    {ALLOC_TYPE_LABEL[a.allocation_type] ?? a.allocation_type}
                  </span>
                </td>
                <td>{fmtDate(a.allocation_date)}</td>
                <td className="num text-left">{fmtSAR(a.allocated_amount)}</td>
                <td className="text-[10px] text-muted-foreground">{a.remarks ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="text-xs text-muted-foreground text-center py-3">لا توجد تخصيصات بعد — الفاتورة مفتوحة بالكامل</div>
      )}
    </div>
  );
}
