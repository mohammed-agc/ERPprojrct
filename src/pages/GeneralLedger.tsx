import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { accountingService, type AccountRow, type LedgerMovement } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GeneralLedger() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<LedgerMovement[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    accountingService.listAccounts().then(setAccounts);
  }, []);

  useEffect(() => {
    if (!accountId) { setRows([]); return; }
    setLoading(true);
    accountingService.ledger(accountId, from || undefined, to || undefined)
      .then(setRows).finally(() => setLoading(false));
  }, [accountId, from, to]);

  const selected = accounts.find(a => a.id === accountId);
  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }
  ), [rows]);
  const ending = rows.length ? rows[rows.length - 1].running_balance : 0;

  return (
    <div>
      <PageHeader
        title="دفتر الأستاذ العام"
        subtitle={selected ? `${selected.code} — ${selected.name_ar}` : "اختر حساباً لعرض الحركات"}
        sticky
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[260px] flex-1">
          <Label className="text-xs">الحساب</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="اختر حساباً" /></SelectTrigger>
            <SelectContent>
              {accounts.map(a => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>رقم القيد</th>
              <th>المرجع</th>
              <th>البيان</th>
              <th className="text-left">مدين</th>
              <th className="text-left">دائن</th>
              <th className="text-left">الرصيد الجاري</th>
            </tr>
          </thead>
          <tbody>
            {!accountId && <EmptyState inTable colSpan={7} title="اختر حساباً" description="يُعرض هنا سجل الحركات والرصيد الجاري." />}
            {accountId && loading && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {accountId && !loading && rows.length === 0 && <EmptyState inTable colSpan={7} title="لا توجد حركات" description="لا توجد قيود مُرحَّلة على هذا الحساب ضمن النطاق." />}
            {accountId && !loading && rows.map((r, i) => (
              <tr key={`${r.entry_id}-${i}`}>
                <td className="num">{r.entry_date}</td>
                <td className="font-mono">
                  <Link to={`/journals/${r.entry_id}`} className="text-primary hover:underline">{r.entry_no}</Link>
                </td>
                <td className="text-xs">{r.reference || "—"}</td>
                <td className="max-w-[280px] truncate">{r.description || "—"}</td>
                <td className="num text-left">{r.debit ? fmt(r.debit) : "—"}</td>
                <td className="num text-left">{r.credit ? fmt(r.credit) : "—"}</td>
                <td className={`num text-left font-semibold ${r.running_balance < 0 ? "text-destructive" : ""}`}>{fmt(r.running_balance)}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={4} className="text-left">الإجمالي</td>
                <td className="num text-left">{fmt(totals.d)}</td>
                <td className="num text-left">{fmt(totals.c)}</td>
                <td className={`num text-left ${ending < 0 ? "text-destructive" : ""}`}>{fmt(ending)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
