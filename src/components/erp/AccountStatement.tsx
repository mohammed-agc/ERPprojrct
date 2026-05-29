import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintLayout } from "@/components/erp/PrintLayout";
import { purchasingService, fmtSAR, fmtDate } from "@/services/erp/purchasing";
import { salesService } from "@/services/erp/sales";

export interface AcctLine {
  date: string;
  type: "purchase_invoice" | "sales_invoice" | "purchase_payment" | "sales_receipt" | "adjustment";
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface Props {
  contactName: string;
  contactCode?: string;
  /** which side of the ledger to compute. Both = include all matched entries. */
  scope: "customer" | "supplier" | "both";
  /** Optional pre-loaded sales invoices from supabase (already filtered by customer_id). */
  customerInvoices?: Array<{ invoice_no: string; invoice_date: string; total: number | string; status: string }>;
  creditLimit?: number;
}

const TYPE_LABEL: Record<AcctLine["type"], string> = {
  purchase_invoice: "فاتورة شراء",
  sales_invoice: "فاتورة مبيعات",
  purchase_payment: "دفعة مورد",
  sales_receipt: "مقبوضات عميل",
  adjustment: "تسوية",
};

const TYPE_TONE: Record<AcctLine["type"], string> = {
  purchase_invoice: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  sales_invoice: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  purchase_payment: "bg-success/15 text-success border-success/30",
  sales_receipt: "bg-success/15 text-success border-success/30",
  adjustment: "bg-muted text-muted-foreground border-border",
};

export function AccountStatement({ contactName, contactCode, scope, customerInvoices, creditLimit }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const lines = useMemo<AcctLine[]>(() => {
    const events: Omit<AcctLine, "balance">[] = [];
    const nm = contactName.trim().toLowerCase();

    if (scope === "supplier" || scope === "both") {
      const suppliers = purchasingService.listSuppliers();
      const sup = suppliers.find(s => s.name.trim().toLowerCase() === nm);
      if (sup) {
        const invs = purchasingService.listPurchaseInvoices().filter(i => i.supplier_id === sup.id);
        const pays = purchasingService.listPurchasePayments().filter(p => p.supplier_id === sup.id);
        // Supplier ledger: invoice = CREDIT (we owe), payment = DEBIT (we paid)
        invs.forEach(i => events.push({
          date: i.issued_at.slice(0, 10), type: "purchase_invoice",
          reference: i.code, description: `فاتورة شراء — استحقاق ${fmtDate(i.due_date)}`,
          debit: 0, credit: Number(i.total || 0),
        }));
        pays.forEach(p => events.push({
          date: p.paid_at.slice(0, 10), type: "purchase_payment",
          reference: p.code, description: `دفعة (${p.method})${p.reference ? " — " + p.reference : ""}`,
          debit: Number(p.amount || 0), credit: 0,
        }));
      }
    }

    if (scope === "customer" || scope === "both") {
      // Sales invoices from in-memory sales service (match by customer name)
      const sInvs = salesService.listSalesInvoices().filter(i => i.customer.trim().toLowerCase() === nm);
      sInvs.forEach(i => {
        events.push({
          date: i.issued_at.slice(0, 10), type: "sales_invoice",
          reference: i.code, description: `${i.vehicle}${i.vin ? " — " + i.vin : ""}`,
          debit: Number(i.total || 0), credit: 0,
        });
        const pays = salesService.paymentsForInvoice(i.id);
        pays.forEach(p => events.push({
          date: p.paid_at.slice(0, 10), type: "sales_receipt",
          reference: p.code, description: `مقبوضات (${p.method})${p.reference ? " — " + p.reference : ""}`,
          debit: 0, credit: Number(p.amount || 0),
        }));
      });
      // Supabase customer invoices (from props): treat as debit + paid status = credit
      (customerInvoices ?? []).forEach(i => {
        events.push({
          date: i.invoice_date, type: "sales_invoice",
          reference: i.invoice_no, description: "فاتورة مبيعات",
          debit: Number(i.total || 0), credit: 0,
        });
        if (i.status === "paid") {
          events.push({
            date: i.invoice_date, type: "sales_receipt",
            reference: i.invoice_no, description: "تسوية كاملة",
            debit: 0, credit: Number(i.total || 0),
          });
        }
      });
    }

    const filtered = events
      .filter(e => (!from || e.date >= from) && (!to || e.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date));

    let bal = 0;
    return filtered.map(e => {
      bal += (e.debit || 0) - (e.credit || 0);
      return { ...e, balance: bal };
    });
  }, [contactName, scope, customerInvoices, from, to]);

  const totals = useMemo(() => ({
    debit: lines.reduce((s, l) => s + l.debit, 0),
    credit: lines.reduce((s, l) => s + l.credit, 0),
    balance: lines.length ? lines[lines.length - 1].balance : 0,
    lastDate: lines.length ? lines[lines.length - 1].date : null,
  }), [lines]);

  const balanceLabel = totals.balance > 0
    ? (scope === "supplier" ? "رصيد مدين علينا" : "ذمم مدينة من العميل")
    : totals.balance < 0
      ? (scope === "supplier" ? "رصيد دائن للمورد" : "رصيد دائن للعميل")
      : "متوازن";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <SummaryCard label="الرصيد الحالي" value={fmtSAR(Math.abs(totals.balance))} hint={balanceLabel} tone={totals.balance > 0 ? "warn" : "ok"} />
        <SummaryCard label="إجمالي مدين" value={fmtSAR(totals.debit)} />
        <SummaryCard label="إجمالي دائن" value={fmtSAR(totals.credit)} />
        <SummaryCard label="آخر حركة" value={totals.lastDate ? fmtDate(totals.lastDate) : "—"} />
      </div>

      {scope === "customer" && creditLimit ? (
        <Card>
          <CardContent className="p-3 text-xs flex flex-wrap items-center gap-3">
            <KV k="حد الائتمان" v={fmtSAR(creditLimit)} />
            <KV k="المستخدم" v={fmtSAR(Math.max(0, totals.balance))} />
            <KV k="المتاح" v={fmtSAR(Math.max(0, creditLimit - Math.max(0, totals.balance)))} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-xs">حركات الحساب</CardTitle>
          <div className="flex items-end gap-2 print:hidden">
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">من</Label>
              <Input type="date" className="h-7 w-32 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px]">إلى</Label>
              <Input type="date" className="h-7 w-32 text-xs" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <DocPrintActions
              doc={
                <PrintLayout
                  title="كشف حساب"
                  subtitle={`${contactName}${contactCode ? " — " + contactCode : ""}`}
                  meta={[
                    { label: "النطاق", value: scope === "supplier" ? "مورد" : scope === "customer" ? "عميل" : "عميل/مورد" },
                    { label: "من", value: from || "البداية" },
                    { label: "إلى", value: to || "حتى اليوم" },
                  ]}
                >
                  <StatementTable lines={lines} totals={totals} />
                </PrintLayout>
              }
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <StatementTable lines={lines} totals={totals} />
        </CardContent>
      </Card>
    </div>
  );
}

function StatementTable({ lines, totals }: { lines: AcctLine[]; totals: { debit: number; credit: number; balance: number } }) {
  return (
    <table className="erp-table">
      <thead>
        <tr>
          <th className="w-28">التاريخ</th>
          <th className="w-32">المستند</th>
          <th>المرجع / البيان</th>
          <th className="text-left w-28">مدين</th>
          <th className="text-left w-28">دائن</th>
          <th className="text-left w-32">الرصيد</th>
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 && (
          <tr><td colSpan={6} className="text-center text-muted-foreground py-8 text-xs">لا توجد حركات</td></tr>
        )}
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="num text-xs">{fmtDate(l.date)}</td>
            <td><Badge variant="outline" className={`text-[10px] ${TYPE_TONE[l.type]}`}>{TYPE_LABEL[l.type]}</Badge></td>
            <td className="text-xs">
              <span className="font-mono text-[10px] text-muted-foreground ml-2">{l.reference}</span>
              {l.description}
            </td>
            <td className="num text-xs text-left">{l.debit ? fmtSAR(l.debit) : "—"}</td>
            <td className="num text-xs text-left">{l.credit ? fmtSAR(l.credit) : "—"}</td>
            <td className={`num text-xs text-left font-semibold ${l.balance > 0 ? "text-destructive" : l.balance < 0 ? "text-success" : ""}`}>
              {fmtSAR(Math.abs(l.balance))}
            </td>
          </tr>
        ))}
      </tbody>
      {lines.length > 0 && (
        <tfoot>
          <tr className="bg-muted/60 font-semibold">
            <td colSpan={3} className="text-left text-xs">الإجمالي</td>
            <td className="num text-xs text-left">{fmtSAR(totals.debit)}</td>
            <td className="num text-xs text-left">{fmtSAR(totals.credit)}</td>
            <td className="num text-xs text-left">{fmtSAR(Math.abs(totals.balance))}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

function SummaryCard({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={`text-lg font-bold num ${tone === "warn" ? "text-destructive" : tone === "ok" ? "text-foreground" : ""}`}>{value}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground">{k}:</span>
      <span className="font-semibold num">{v}</span>
    </div>
  );
}
