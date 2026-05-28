import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/erp/EmptyState";
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, ArrowRight, FileSpreadsheet, Wallet } from "lucide-react";
import {
  treasuryService, type TreasuryAccount, type TreasuryMovement,
  accountTypeLabel, accountTypeColor, statusLabel,
} from "@/services/erp/treasury";
import { fmtSAR, todayIso, startOfMonthIso } from "@/lib/erpFormat";

const movementIcon = (t: TreasuryMovement["type"]) => {
  if (t === "receipt") return <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />;
  if (t === "payment") return <ArrowUpCircle className="h-3.5 w-3.5 text-rose-600" />;
  if (t === "transfer_in") return <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600" />;
  if (t === "transfer_out") return <ArrowLeftRight className="h-3.5 w-3.5 text-rose-600" />;
  return <Wallet className="h-3.5 w-3.5 text-muted-foreground" />;
};

const movementLabel: Record<TreasuryMovement["type"], string> = {
  receipt: "قبض", payment: "صرف", transfer_in: "تحويل وارد", transfer_out: "تحويل صادر", opening: "افتتاحي",
};

export default function TreasuryAccountDetail() {
  const { id = "" } = useParams();
  const [account, setAccount] = useState<TreasuryAccount | null>(null);
  const [movs, setMovs] = useState<TreasuryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());

  const load = async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([treasuryService.getAccount(id), treasuryService.movements(id)]);
      setAccount(a); setMovs(m);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [id]);

  const filtered = useMemo(() =>
    movs.filter(m => (!from || m.date >= from) && (!to || m.date <= to)), [movs, from, to]);

  // Running balance over filtered set
  const withRunning = useMemo(() => {
    // Start from balance before "from" date
    const before = movs.filter(m => from && m.date < from).reduce((s, m) => s + m.amount, 0);
    let bal = before;
    return filtered.map(m => { bal += m.amount; return { ...m, running: bal }; });
  }, [filtered, movs, from]);

  const totals = useMemo(() => {
    let inflow = 0, outflow = 0;
    for (const m of filtered) m.amount >= 0 ? inflow += m.amount : outflow += -m.amount;
    return { inflow, outflow, net: inflow - outflow };
  }, [filtered]);

  const currentBalance = useMemo(() => movs.reduce((s, m) => s + m.amount, 0), [movs]);

  const exportCsv = () => {
    const head = ["التاريخ", "النوع", "المرجع", "الوصف", "وارد", "صادر", "الرصيد"];
    const lines = withRunning.map(m => [m.date, movementLabel[m.type], m.reference, m.description,
      m.amount > 0 ? m.amount.toFixed(2) : "", m.amount < 0 ? (-m.amount).toFixed(2) : "",
      m.running.toFixed(2)].map(s => `"${s}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `treasury-${account?.code}-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={account ? `${account.code} — ${account.name_ar}` : "حساب خزينة"}
        subtitle={account && <span className={`text-[10px] px-1.5 py-0.5 rounded border ${accountTypeColor[account.type]}`}>{accountTypeLabel[account.type]}</span>}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Link to="/treasury/accounts"><Button size="sm" variant="ghost"><ArrowRight className="h-3.5 w-3.5 ml-1" /> القائمة</Button></Link>
          </div>
        }
      />

      {/* Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">العملة</div>
          <div className="text-lg font-bold">{account?.currency ?? "—"}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">الرصيد الحالي</div>
          <div className={`text-lg font-bold ${currentBalance < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(currentBalance)}</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3">
          <div className="text-[11px] text-emerald-700">إجمالي الوارد</div>
          <div className="text-lg font-bold text-emerald-700">{fmtSAR(totals.inflow)}</div>
        </div>
        <div className="bg-rose-50 border border-rose-200 rounded-md p-3">
          <div className="text-[11px] text-rose-700">إجمالي الصادر</div>
          <div className="text-lg font-bold text-rose-700">{fmtSAR(totals.outflow)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">صافي الفترة</div>
          <div className={`text-lg font-bold ${totals.net < 0 ? "text-destructive" : "text-success"}`}>{fmtSAR(totals.net)}</div>
        </div>
      </div>

      {account && (account.bank_name || account.responsible || account.branch) && (
        <div className="bg-card border rounded-md p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {account.bank_name && <div><div className="text-[11px] text-muted-foreground">البنك</div>{account.bank_name}</div>}
          {account.iban && <div className="col-span-2"><div className="text-[11px] text-muted-foreground">IBAN</div><span className="font-mono text-xs" dir="ltr">{account.iban}</span></div>}
          {account.branch && <div><div className="text-[11px] text-muted-foreground">الفرع</div>{account.branch}</div>}
          {account.responsible && <div><div className="text-[11px] text-muted-foreground">المسؤول</div>{account.responsible}</div>}
        </div>
      )}

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">من</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {/* Timeline */}
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th><th>النوع</th><th>المرجع</th><th>الوصف</th>
              <th className="text-left">وارد</th><th className="text-left">صادر</th><th className="text-left">الرصيد</th><th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="text-center text-muted-foreground py-8">…</td></tr>}
            {!loading && withRunning.length === 0 && <EmptyState inTable colSpan={8} title="لا توجد حركات" />}
            {!loading && withRunning.map(m => (
              <tr key={m.id}>
                <td className="num">{m.date}</td>
                <td><div className="flex items-center gap-1.5 text-xs">{movementIcon(m.type)}{movementLabel[m.type]}</div></td>
                <td className="font-mono text-xs">{m.reference}</td>
                <td className="text-xs max-w-[280px] truncate">{m.description}</td>
                <td className="num text-left text-emerald-600">{m.amount > 0 ? fmtSAR(m.amount) : "—"}</td>
                <td className="num text-left text-rose-600">{m.amount < 0 ? fmtSAR(-m.amount) : "—"}</td>
                <td className={`num text-left font-semibold ${m.running < 0 ? "text-destructive" : ""}`}>{fmtSAR(m.running)}</td>
                <td><Badge variant="secondary" className="text-[10px]">{statusLabel[m.status] ?? m.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
