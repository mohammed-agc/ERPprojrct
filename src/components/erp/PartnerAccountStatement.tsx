import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getPartnerSubledger, fmtSAR } from "@/services/erp/partnerLedger";
import { Wallet, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  partnerId: string;
  scope: "supplier" | "customer" | "both";
}

const KIND_MAP = { supplier: "supplier", customer: "customer", both: undefined } as const;

export function PartnerAccountStatement({ partnerId, scope }: Props) {
  const navigate = useNavigate();
  const kind = KIND_MAP[scope];
  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["partner-account-summary", partnerId, kind],
    queryFn: () => getPartnerSubledger(partnerId, undefined, undefined, kind as any),
    enabled: !!partnerId,
  });

  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  const closing = rows.length > 0 ? Number(rows[rows.length - 1].running_balance) : 0;

  const balanceLabel =
    scope === "customer" ? "ذمم مدينة من العميل"
    : scope === "supplier" ? "ذمم دائنة للمورد"
    : "الرصيد الصافي للطرف";

  if (isFetching) {
    return <div className="text-sm text-muted-foreground py-6 text-center">جارٍ تحميل ملخّص الحساب…</div>;
  }

  return (
    <div className="space-y-4">
      {/* ملخّص علوي */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
          <div className="text-[12px] text-muted-foreground">{balanceLabel}</div>
          <div className="num text-lg font-bold text-primary">{fmtSAR(Math.abs(closing))}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[12px] text-muted-foreground">إجمالي مدين</div>
          <div className="num text-lg font-bold">{fmtSAR(totalDebit)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[12px] text-muted-foreground">إجمالي دائن</div>
          <div className="num text-lg font-bold">{fmtSAR(totalCredit)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-[12px] text-muted-foreground">عدد الحركات</div>
          <div className="num text-lg font-bold">{rows.length}</div>
        </div>
      </div>

      {/* زر كشف الحساب الكامل */}
      <div className="flex items-center justify-between bg-muted/30 border border-border rounded-lg p-3">
        <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          هذا ملخّص فقط. لعرض كل الحركات (الفواتير والدفعات والمقاصّات) مع الرصيد الجاري:
        </div>
        <Button
          variant="outline" size="sm" className="gap-1.5 shrink-0"
          onClick={() => navigate(`/accounting/partner-ledger?partner=${partnerId}`)}
        >
          كشف الحساب الكامل <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
