import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { purchasingService, fmtSAR, fmtDate } from "@/services/erp/purchasing";
import type { SupplierLedgerKind } from "@/services/erp/purchasing";

const KIND_LABEL: Record<SupplierLedgerKind, string> = {
  invoice: "فاتورة شراء",
  payment_cash: "سداد نقدي/بنكي",
  payment_credit: "تسوية بالحد الائتماني",
  credit_utilization: "استخدام حد ائتماني",
  adjustment: "تسوية محاسبية",
};
const KIND_TONE: Record<SupplierLedgerKind, string> = {
  invoice: "bg-primary/10 text-primary border border-primary/30",
  payment_cash: "bg-success/10 text-success border border-success/40",
  payment_credit: "bg-amber-500/10 text-amber-700 border border-amber-400/50",
  credit_utilization: "bg-amber-500/10 text-amber-800 border border-amber-400/40",
  adjustment: "bg-muted text-muted-foreground border border-border",
};

export function SupplierStatementDialog({
  supplierId, open, onOpenChange,
}: {
  supplierId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const stmt = useMemo(
    () => (supplierId ? purchasingService.supplierStatement(supplierId) : null),
    [supplierId, open],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            كشف حساب المورد {stmt?.supplier?.name ? `· ${stmt.supplier.name}` : ""}
          </DialogTitle>
        </DialogHeader>

        {!stmt || !stmt.supplier ? (
          <div className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</div>
        ) : (
          <>
            {/* Credit summary header — aligned accounting style */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              <Kpi label="الحد الائتماني" value={fmtSAR(stmt.totals.credit_limit)} />
              <Kpi label="المستخدم" value={fmtSAR(stmt.totals.credit_used)} tone="warning" />
              <Kpi label="المتبقي" value={fmtSAR(stmt.totals.credit_remaining)} tone="success" />
              <Kpi label="الرصيد المستحق" value={fmtSAR(stmt.totals.balance)} tone={stmt.totals.balance > 0 ? "destructive" : "default"} />
            </div>

            {/* Ledger */}
            <div className="border border-border rounded overflow-hidden">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>المرجع</th>
                    <th>النوع</th>
                    <th>البيان</th>
                    <th className="text-left">مدين</th>
                    <th className="text-left">دائن</th>
                    <th className="text-left">الرصيد</th>
                    <th className="text-left">استخدام الائتمان</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.rows.length === 0 && (
                    <tr><td colSpan={8} className="text-center text-muted-foreground py-6">لا توجد حركات بعد</td></tr>
                  )}
                  {stmt.rows.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{fmtDate(r.at)}</td>
                      <td className="font-mono text-[11px]">{r.reference ?? "—"}</td>
                      <td><Badge className={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge></td>
                      <td>{r.description}</td>
                      <td className="num text-left tabular-nums">{r.debit ? fmtSAR(r.debit) : "—"}</td>
                      <td className="num text-left tabular-nums">{r.credit ? fmtSAR(r.credit) : "—"}</td>
                      <td className="num text-left tabular-nums font-semibold">{fmtSAR(r.running_balance)}</td>
                      <td className="num text-left tabular-nums text-amber-700">{fmtSAR(r.running_credit_used)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-muted/40">
                    <td colSpan={4} className="text-left">الإجماليات</td>
                    <td className="num text-left tabular-nums">{fmtSAR(stmt.totals.debit)}</td>
                    <td className="num text-left tabular-nums">{fmtSAR(stmt.totals.credit)}</td>
                    <td className="num text-left tabular-nums">{fmtSAR(stmt.totals.balance)}</td>
                    <td className="num text-left tabular-nums text-amber-700">{fmtSAR(stmt.totals.credit_used)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, tone = "default" }: {
  label: string; value: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="border border-border bg-card rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold num tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
