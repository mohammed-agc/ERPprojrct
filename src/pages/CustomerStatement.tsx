import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import { ArrowRight, Download } from "lucide-react";
import { accounting, type CustomerStatementLine } from "@/services/erp/accounting";
import {
  customerSettlementService,
  type CustomerStatementSnapshot,
} from "@/services/erp/customerSettlement";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintableCustomerStatementDoc } from "@/components/erp/PrintableCustomerStatementDoc";
import { adminSettings } from "@/services/erp/adminSettings";

const fmt = (n: number) => Number(n || 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CustomerStatement() {
  const { id = "" } = useParams();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{
    customer: { id: string; code: string; name: string } | null;
    lines: CustomerStatementLine[];
    totals: { debit: number; credit: number; balance: number };
  }>({ customer: null, lines: [], totals: { debit: 0, credit: 0, balance: 0 } });
  const [snapshot, setSnapshot] = useState<CustomerStatementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      accounting.customerStatement(id, from || undefined, to || undefined),
      customerSettlementService.customerStatement(id, from || undefined, to || undefined),
    ]).then(([legacy, snap]) => {
      setData(legacy);
      setSnapshot(snap);
    }).finally(() => setLoading(false));
  }, [id, from, to]);

  const company = adminSettings.get().company;
  const printDoc = useMemo(() => {
    if (!snapshot?.customer) return null;
    return (
      <PrintableCustomerStatementDoc
        company={{
          name: company.name_ar,
          cr_number: company.cr_number,
          vat_number: company.vat_number,
          address: company.address,
          contact: company.phone,
        }}
        customer={snapshot.customer}
        rows={snapshot.rows}
        period_from={from || undefined}
        period_to={to || undefined}
        totals={snapshot.totals}
      />
    );
  }, [snapshot, company, from, to]);

  const exportCsv = () => {
    const headers = ["التاريخ", "النوع", "المرجع", "البيان", "مدين", "دائن", "الرصيد"];
    const lines = data.lines.map(l => [
      l.date, l.type === "invoice" ? "فاتورة" : "دفعة",
      l.reference, l.description, l.debit, l.credit, l.running_balance,
    ].join(","));
    const csv = "\uFEFF" + [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `statement-${data.customer?.code || id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={data.customer ? `كشف حساب — ${data.customer.name}` : "كشف حساب العميل"}
        subtitle={data.customer ? `كود ${data.customer.code}` : ""}
        sticky
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to="/ar"><ArrowRight className="h-3.5 w-3.5 ml-1" /> رجوع</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={!data.lines.length}>
              <Download className="h-3.5 w-3.5 ml-1" /> تصدير CSV
            </Button>
            {printDoc && <DocPrintActions doc={printDoc} />}
          </>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="mr-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">الرصيد الحالي:</span>
          <Badge variant={data.totals.balance > 0 ? "destructive" : "default"} className="num">
            {fmt(data.totals.balance)}
          </Badge>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>المرجع</th>
              <th>البيان</th>
              <th className="text-left w-28">مدين</th>
              <th className="text-left w-28">دائن</th>
              <th className="text-left w-32">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && data.lines.length === 0 && <EmptyState inTable colSpan={7} title="لا توجد حركات" description="لا توجد فواتير أو دفعات ضمن النطاق." />}
            {!loading && data.lines.map((l, i) => (
              <tr key={`${l.source_id}-${i}`}>
                <td className="num">{l.date}</td>
                <td>
                  {l.type === "invoice"
                    ? <Badge variant="outline" className="text-xs">فاتورة</Badge>
                    : <Badge className="text-xs bg-success/15 text-success border-success/30">دفعة</Badge>}
                </td>
                <td className="font-mono text-xs">{l.reference}</td>
                <td>{l.description}</td>
                <td className="num text-left">{l.debit ? fmt(l.debit) : "—"}</td>
                <td className="num text-left">{l.credit ? fmt(l.credit) : "—"}</td>
                <td className={`num text-left font-semibold ${l.running_balance > 0 ? "text-destructive" : ""}`}>{fmt(l.running_balance)}</td>
              </tr>
            ))}
          </tbody>
          {data.lines.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={4} className="text-left">الإجمالي</td>
                <td className="num text-left">{fmt(data.totals.debit)}</td>
                <td className="num text-left">{fmt(data.totals.credit)}</td>
                <td className="num text-left">{fmt(data.totals.balance)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
