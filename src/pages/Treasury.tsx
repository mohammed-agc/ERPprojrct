import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";
import { VoucherDialog } from "@/components/erp/VoucherDialog";
import { TransferDialog } from "@/components/erp/TransferDialog";
import { Wallet, Landmark, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, AlertCircle, Plus, RotateCw } from "lucide-react";
import {
  treasuryService, type TreasuryAccount, type TreasuryMovement,
  accountTypeLabel, accountTypeColor, statusLabel,
} from "@/services/erp/treasury";
import { fmtSAR } from "@/lib/erpFormat";

function Kpi({ label, value, sub, icon: Icon, tone }: any) {
  const toneCls = {
    good: "border-success/40 bg-success/5",
    bad: "border-destructive/40 bg-destructive/5",
    warn: "border-warning/40 bg-warning/5",
    info: "border-primary/40 bg-primary/5",
  }[tone as string] ?? "border-border";
  return (
    <div className={`bg-card border rounded-md p-3 ${toneCls}`}>
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-muted-foreground font-medium">{label}</div>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="text-lg font-bold mt-1">{value}</div>
      {sub && <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

const movementIcon = (t: TreasuryMovement["type"]) => {
  if (t === "receipt") return <ArrowDownCircle className="h-3.5 w-3.5 text-emerald-600" />;
  if (t === "payment") return <ArrowUpCircle className="h-3.5 w-3.5 text-rose-600" />;
  if (t === "transfer_in" || t === "transfer_out") return <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600" />;
  return <Wallet className="h-3.5 w-3.5 text-muted-foreground" />;
};

export default function Treasury() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [kpis, setKpis] = useState<any>(null);
  const [movs, setMovs] = useState<TreasuryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [openReceipt, setOpenReceipt] = useState(false);
  const [openPayment, setOpenPayment] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b, k, m] = await Promise.all([
        treasuryService.listAccounts(),
        treasuryService.allBalances(),
        treasuryService.kpis(),
        treasuryService.movements(),
      ]);
      setAccounts(a); setBalances(b); setKpis(k);
      setMovs(m.reverse().slice(0, 15));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="الخزينة والنقدية"
        subtitle="مركز عمليات الخزينة — صناديق وحسابات بنكية والحركات اليومية"
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setOpenReceipt(true)}><Plus className="h-3.5 w-3.5 ml-1" /> سند قبض</Button>
            <Button size="sm" variant="secondary" onClick={() => setOpenPayment(true)}><Plus className="h-3.5 w-3.5 ml-1" /> سند صرف</Button>
            <Button size="sm" variant="outline" onClick={() => setOpenTransfer(true)}><ArrowLeftRight className="h-3.5 w-3.5 ml-1" /> تحويل</Button>
            <Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
          <Kpi label="إجمالي النقدية" value={fmtSAR(kpis.total_cash)} icon={Wallet} tone="good" />
          <Kpi label="أرصدة البنوك" value={fmtSAR(kpis.total_bank)} icon={Landmark} tone="info" />
          <Kpi label="أموال معلقة" value={fmtSAR(kpis.total_suspended)} icon={AlertCircle} tone="warn" />
          <Kpi label="تحصيلات اليوم" value={fmtSAR(kpis.daily_inflow)} icon={ArrowDownCircle} tone="good" />
          <Kpi label="مدفوعات اليوم" value={fmtSAR(kpis.daily_outflow)} icon={ArrowUpCircle} tone="bad" />
          <Kpi label="سندات اليوم" value={kpis.vouchers_today} icon={Plus} />
          <Kpi label="سطور بانتظار التسوية" value={kpis.pending_reconciliation} icon={AlertCircle} tone={kpis.pending_reconciliation > 0 ? "warn" : undefined} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        {/* Accounts panel */}
        <div className="lg:col-span-3 bg-card border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted flex items-center justify-between">
            <div className="font-semibold text-sm">حسابات الخزينة</div>
            <Link to="/treasury/accounts" className="text-xs text-primary hover:underline">إدارة الحسابات →</Link>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>الفرع</th><th>العملة</th><th className="text-right">الرصيد</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center text-muted-foreground py-6">…</td></tr>}
              {!loading && accounts.length === 0 && <EmptyState inTable colSpan={6} title="لا توجد حسابات" />}
              {!loading && accounts.map(a => {
                const bal = balances.get(a.id) ?? 0;
                return (
                  <tr key={a.id} className={!a.active ? "opacity-50" : ""}>
                    <td className="font-mono text-xs">
                      <Link to={`/treasury/accounts/${a.id}`} className="text-primary hover:underline">{a.code}</Link>
                    </td>
                    <td className="font-medium">{a.name_ar}</td>
                    <td><span className={`text-[11.5px] px-1.5 py-0.5 rounded border ${accountTypeColor[a.type]}`}>{accountTypeLabel[a.type]}</span></td>
                    <td className="text-xs text-muted-foreground">{a.branch ?? "—"}</td>
                    <td className="text-xs">{a.currency}</td>
                    <td className={`num text-right font-semibold ${bal < 0 ? "text-destructive" : ""}`}>{fmtSAR(bal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Recent movements timeline */}
        <div className="lg:col-span-2 bg-card border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted font-semibold text-sm">آخر الحركات</div>
          <div className="divide-y">
            {loading && <div className="p-4 text-center text-muted-foreground text-sm">…</div>}
            {!loading && movs.length === 0 && <div className="p-4"><EmptyState title="لا توجد حركات بعد" /></div>}
            {!loading && movs.map(m => {
              const acc = accounts.find(a => a.id === m.account_id);
              return (
                <div key={m.id} className="px-3 py-2 flex items-center gap-2 hover:bg-muted/40">
                  {movementIcon(m.type)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-mono">{m.reference}</span>
                      <span className="text-muted-foreground">{m.date}</span>
                      <span className="text-muted-foreground truncate">{acc?.name_ar}</span>
                    </div>
                    <div className="text-xs truncate">{m.description}</div>
                  </div>
                  <div className={`text-sm font-semibold ${m.amount >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {m.amount >= 0 ? "+" : ""}{fmtSAR(m.amount)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <VoucherDialog open={openReceipt} onOpenChange={setOpenReceipt} type="receipt" accounts={accounts} onSaved={load} />
      <VoucherDialog open={openPayment} onOpenChange={setOpenPayment} type="payment" accounts={accounts} onSaved={load} />
      <TransferDialog open={openTransfer} onOpenChange={setOpenTransfer} accounts={accounts} onSaved={load} />
    </div>
  );
}