import { useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  purchasingService, fmtSAR, fmtDate,
  AGING_LABEL, AGING_TONE, computeAging, SETTLEMENT_LABEL,
} from "@/services/erp/purchasing";
import type { SupplierLedgerKind } from "@/services/erp/purchasing";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import {
  PrintableSupplierStatementDoc,
  type SupplierStatementRow,
} from "@/components/erp/PrintableSupplierStatementDoc";

const KIND_LABEL: Record<SupplierLedgerKind, string> = {
  invoice: "فاتورة شراء",
  payment_cash: "سداد نقدي/بنكي",
  payment_credit: "سداد عبر ائتمان المورد",
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
  const aging = useMemo(
    () => (supplierId ? purchasingService.supplierAging(supplierId) : null),
    [supplierId, open],
  );
  // index invoice metadata for ledger row enrichment
  const invMap = useMemo(() => {
    if (!supplierId) return new Map<string, { issued_at: string; due_date: string; credit_days?: number; paid: number; total: number }>();
    const m = new Map<string, { issued_at: string; due_date: string; credit_days?: number; paid: number; total: number }>();
    for (const inv of purchasingService.listPurchaseInvoices().filter(i => i.supplier_id === supplierId)) {
      m.set(inv.code, { issued_at: inv.issued_at, due_date: inv.due_date, credit_days: inv.credit_days, paid: inv.paid, total: inv.total });
    }
    return m;
  }, [supplierId, open]);
  const grace = stmt?.supplier?.grace_days ?? 0;

  const printable = useMemo(() => {
    if (!stmt?.supplier) return null;
    const printRows: SupplierStatementRow[] = stmt.rows.map(r => {
      const meta = r.reference ? invMap.get(r.reference) : undefined;
      const isInvoice = r.kind === "invoice" && meta;
      return {
        id: r.id, at: r.at, kind: r.kind, reference: r.reference,
        description: r.description, debit: r.debit, credit: r.credit,
        running_balance: r.running_balance,
        due_date: isInvoice ? meta!.due_date : undefined,
        outstanding: isInvoice ? Math.max(0, meta!.total - meta!.paid) : 0,
      };
    });
    return (
      <PrintableSupplierStatementDoc
        company={{
          name: "ساراط للسيارات",
          cr_number: "1010000000",
          vat_number: "300000000000003",
          address: "المملكة العربية السعودية — الرياض",
          contact: "+966 11 000 0000",
        }}
        supplier={stmt.supplier}
        rows={printRows}
        totals={{
          opening_balance: 0,
          debit: stmt.totals.debit,
          credit: stmt.totals.credit,
          closing_balance: stmt.totals.balance,
          credit_limit: stmt.totals.credit_limit,
          credit_used: stmt.totals.credit_used,
          credit_remaining: stmt.totals.credit_remaining,
          due_balance: aging?.due_balance ?? 0,
          overdue_balance: aging?.overdue_balance ?? 0,
        }}
      />
    );
  }, [stmt, aging, invMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            كشف حساب المورد {stmt?.supplier?.name ? `· ${stmt.supplier.name}` : ""}
            {stmt?.supplier?.settlement_policy && (
              <Badge variant="outline" className="ml-2 text-[10px]">
                سياسة السداد: {SETTLEMENT_LABEL[stmt.supplier.settlement_policy]}
                {stmt.supplier.settlement_policy === "custom" && stmt.supplier.custom_settlement_days
                  ? ` (${stmt.supplier.custom_settlement_days} يوم)` : ""}
                {grace > 0 ? ` · سماح ${grace} يوم` : ""}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {printable && (
          <div className="flex justify-end mb-2">
            <DocPrintActions doc={printable} />
          </div>
        )}

        {!stmt || !stmt.supplier ? (
          <div className="text-center text-sm text-muted-foreground py-8">لا توجد بيانات</div>
        ) : (
          <>
            {/* Credit + aging summary header */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-3">
              <Kpi label="الحد الائتماني" value={fmtSAR(stmt.totals.credit_limit)} />
              <Kpi label="المستخدم" value={fmtSAR(stmt.totals.credit_used)} tone="warning" />
              <Kpi label="المتبقي" value={fmtSAR(stmt.totals.credit_remaining)} tone="success" />
              <Kpi label="رصيد مستحق" value={fmtSAR(aging?.due_balance ?? 0)} />
              <Kpi label="رصيد متأخر" value={fmtSAR(aging?.overdue_balance ?? 0)}
                tone={(aging?.overdue_balance ?? 0) > 0 ? "destructive" : "default"} />
              <Kpi label="أقرب استحقاق" value={aging?.next_due_date ? fmtDate(aging.next_due_date) : "—"} />
            </div>

            {/* Ledger */}
            <div className="border border-border rounded overflow-hidden">
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th>تاريخ الفاتورة</th>
                    <th>المرجع</th>
                    <th>النوع</th>
                    <th>البيان</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>أيام الائتمان</th>
                    <th>حالة العمر</th>
                    <th className="text-left">مدين</th>
                    <th className="text-left">دائن</th>
                    <th className="text-left">الرصيد</th>
                    <th className="text-left">استخدام الائتمان</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.rows.length === 0 && (
                    <tr><td colSpan={11} className="text-center text-muted-foreground py-6">لا توجد حركات بعد</td></tr>
                  )}
                  {stmt.rows.map(r => {
                    const meta = r.reference ? invMap.get(r.reference) : undefined;
                    const isInvoice = r.kind === "invoice" && meta;
                    const aging = isInvoice ? computeAging(meta!.due_date, { grace_days: grace }) : null;
                    const outstanding = isInvoice ? Math.max(0, meta!.total - meta!.paid) : 0;
                    const showAging = aging && outstanding > 0.001;
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap">{fmtDate(r.at)}</td>
                        <td className="font-mono text-[11px]">{r.reference ?? "—"}</td>
                        <td><Badge className={KIND_TONE[r.kind]}>{KIND_LABEL[r.kind]}</Badge></td>
                        <td>{r.description}</td>
                        <td className="whitespace-nowrap">{isInvoice ? fmtDate(meta!.due_date) : "—"}</td>
                        <td className="num text-center tabular-nums">{isInvoice ? (meta!.credit_days ?? "—") : "—"}</td>
                        <td>
                          {showAging ? (
                            <Badge className={AGING_TONE[aging!.status]}>
                              {AGING_LABEL[aging!.status]}
                              {aging!.status === "overdue" ? ` ${aging!.days_overdue} يوم` : ""}
                            </Badge>
                          ) : (isInvoice ? <span className="text-muted-foreground text-[10px]">مسددة</span> : "—")}
                        </td>
                        <td className="num text-left tabular-nums">{r.debit ? fmtSAR(r.debit) : "—"}</td>
                        <td className="num text-left tabular-nums">{r.credit ? fmtSAR(r.credit) : "—"}</td>
                        <td className="num text-left tabular-nums font-semibold">{fmtSAR(r.running_balance)}</td>
                        <td className="num text-left tabular-nums text-amber-700">{fmtSAR(r.running_credit_used)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold bg-muted/40">
                    <td colSpan={7} className="text-left">الإجماليات</td>
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
