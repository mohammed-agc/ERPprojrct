import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/erp/EmptyState";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { accounting, type AccountRow, type LedgerMovement } from "@/services/erp/accounting";
import { fmtSAR, accountTypeLabel, accountTypeColor, startOfYearIso, todayIso } from "@/lib/erpFormat";

export default function AccountDetail() {
  const { id } = useParams();
  const [account, setAccount] = useState<AccountRow | null>(null);
  const [from, setFrom] = useState(startOfYearIso());
  const [to, setTo] = useState(todayIso());
  const [rows, setRows] = useState<LedgerMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    accounting.listAccounts().then(list => setAccount(list.find(a => a.id === id) ?? null));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    accounting.ledger(id, from || undefined, to || undefined).then(setRows).finally(() => setLoading(false));
  }, [id, from, to]);

  const totals = useMemo(() => rows.reduce((a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }), [rows]);
  const ending = rows.length ? rows[rows.length - 1].running_balance : 0;

  // Monthly aggregation for sparkline-like chart
  const monthly = useMemo(() => {
    const m = new Map<string, { d: number; c: number; net: number }>();
    for (const r of rows) {
      const key = r.entry_date.slice(0, 7);
      const cur = m.get(key) ?? { d: 0, c: 0, net: 0 };
      cur.d += r.debit; cur.c += r.credit; cur.net += r.debit - r.credit;
      m.set(key, cur);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);
  const maxMonthly = Math.max(1, ...monthly.map(([, v]) => Math.max(v.d, v.c)));

  const exportCsv = () => {
    const head = ["التاريخ", "رقم القيد", "المرجع", "البيان", "مدين", "دائن", "الرصيد الجاري"];
    const lines = rows.map(r => [r.entry_date, r.entry_no, r.reference ?? "", r.description ?? "",
      r.debit.toFixed(2), r.credit.toFixed(2), r.running_balance.toFixed(2)].map(s => `"${s}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `account-${account?.code}-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={account ? `${account.code} — ${account.name_ar}` : "تفاصيل الحساب"}
        subtitle={account?.name_en ?? ""}
        sticky
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Link to="/accounts"><Button variant="ghost" size="sm"><ArrowRight className="h-3.5 w-3.5 ml-1" /> دليل الحسابات</Button></Link>
          </div>
        }
      />

      {/* Info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">النوع</div>
          {account && <span className={`text-xs px-2 py-1 rounded border mt-1 inline-block ${accountTypeColor[account.type]}`}>{accountTypeLabel[account.type]}</span>}
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">مجموع المدين</div>
          <div className="text-lg font-bold">{fmtSAR(totals.d)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">مجموع الدائن</div>
          <div className="text-lg font-bold">{fmtSAR(totals.c)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-xs text-muted-foreground">الرصيد الختامي</div>
          <div className={`text-lg font-bold ${ending < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(ending)}</div>
        </div>
      </div>

      {/* Monthly chart */}
      {monthly.length > 0 && (
        <div className="bg-card border rounded-md p-3 mb-3">
          <div className="text-xs font-semibold mb-2">الحركة الشهرية</div>
          <div className="flex items-end gap-1 h-24">
            {monthly.map(([k, v]) => (
              <div key={k} className="flex-1 flex flex-col items-center gap-0.5" title={`${k}: مدين ${fmtSAR(v.d)} / دائن ${fmtSAR(v.c)}`}>
                <div className="w-full flex gap-0.5 items-end h-20">
                  <div className="flex-1 bg-blue-400/70 rounded-t-sm" style={{ height: `${(v.d / maxMonthly) * 100}%` }} />
                  <div className="flex-1 bg-amber-400/70 rounded-t-sm" style={{ height: `${(v.c / maxMonthly) * 100}%` }} />
                </div>
                <div className="text-[9px] text-muted-foreground">{k.slice(2)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 text-[10px] text-muted-foreground mt-1">
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-blue-400" /> مدين</span>
            <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 bg-amber-400" /> دائن</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {/* Movements */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th><th>القيد</th><th>المرجع</th><th>البيان</th>
              <th className="text-left">مدين</th><th className="text-left">دائن</th><th className="text-left">الرصيد</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {!loading && rows.length === 0 && <EmptyState inTable colSpan={7} title="لا توجد حركات" description="لا توجد قيود مُرحَّلة ضمن النطاق." />}
            {!loading && rows.map((r, i) => (
              <tr key={i}>
                <td className="num">{r.entry_date}</td>
                <td className="font-mono"><Link to={`/journals/${r.entry_id}`} className="text-primary hover:underline">{r.entry_no}</Link></td>
                <td className="text-xs">{r.reference || "—"}</td>
                <td className="max-w-[280px] truncate">{r.description || "—"}</td>
                <td className="num text-left">{r.debit ? fmtSAR(r.debit) : "—"}</td>
                <td className="num text-left">{r.credit ? fmtSAR(r.credit) : "—"}</td>
                <td className={`num text-left font-semibold ${r.running_balance < 0 ? "text-destructive" : ""}`}>{fmtSAR(r.running_balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
