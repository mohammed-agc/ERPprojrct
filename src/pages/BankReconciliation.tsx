import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/sonner";
import { CheckCircle2, AlertCircle, Plus, RotateCw, Upload, Link as LinkIcon, EyeOff, Trash2 } from "lucide-react";
import {
  treasuryService, type TreasuryAccount, type BankStatementLine, type Voucher,
} from "@/services/erp/treasury";
import { fmtSAR, todayIso, startOfMonthIso } from "@/lib/erpFormat";

export default function BankReconciliation() {
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [stmt, setStmt] = useState<BankStatementLine[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [statementBalance, setStatementBalance] = useState<string>("");
  const [erpBalance, setErpBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);

  const loadAccounts = async () => {
    const a = await treasuryService.listAccounts();
    setAccounts(a);
    if (!accountId) {
      const bank = a.find(x => x.type === "bank" && x.active);
      if (bank) setAccountId(bank.id);
    }
  };
  const loadData = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const [s, b, v] = await Promise.all([
        treasuryService.listStatementLines(accountId),
        treasuryService.accountBalance(accountId),
        treasuryService.listVouchers(),
      ]);
      setStmt(s); setErpBalance(b);
      setVouchers(v.filter(x => x.account_id === accountId && x.status === "posted"));
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAccounts(); }, []);
  useEffect(() => { loadData(); }, [accountId]);

  const unmatched = stmt.filter(l => l.status === "unmatched");
  const matched = stmt.filter(l => l.status === "matched");
  const stmtBalNum = Number(statementBalance) || 0;
  const diff = stmtBalNum - erpBalance;

  const bank = accounts.find(a => a.id === accountId);

  return (
    <div>
      <PageHeader
        title="التسوية البنكية"
        subtitle={bank ? `${bank.code} — ${bank.name_ar}` : "اختر حساباً بنكياً"}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setAddOpen(true)} disabled={!accountId}>
              <Plus className="h-3.5 w-3.5 ml-1" /> سطر كشف
            </Button>
            <Button size="sm" variant="outline" onClick={async () => { if (accountId) { await treasuryService.clearStatement(accountId); loadData(); toast.success("تم مسح الكشف"); } }} disabled={!stmt.length}>
              <Trash2 className="h-3.5 w-3.5 ml-1" /> مسح الكشف
            </Button>
            <Button size="sm" variant="ghost" onClick={loadData}><RotateCw className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 min-w-[260px]">
          <Label className="text-xs">الحساب البنكي</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="h-8"><SelectValue placeholder="اختر" /></SelectTrigger>
            <SelectContent>
              {accounts.filter(a => a.type === "bank").map(a => (
                <SelectItem key={a.id} value={a.id}><span className="font-mono text-xs ml-2">{a.code}</span> {a.name_ar}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">رصيد كشف البنك</Label>
          <Input type="number" step="0.01" className="h-8 w-40" value={statementBalance} onChange={e => setStatementBalance(e.target.value)} placeholder="0.00" />
        </div>
      </div>

      {/* Reconciliation summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">رصيد كشف البنك</div>
          <div className="text-lg font-bold">{fmtSAR(stmtBalNum)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">رصيد دفاتر ERP</div>
          <div className="text-lg font-bold">{fmtSAR(erpBalance)}</div>
        </div>
        <div className={`border rounded-md p-3 ${Math.abs(diff) < 0.01 ? "bg-success/5 border-success/40" : "bg-warning/5 border-warning/40"}`}>
          <div className="text-[11px] text-muted-foreground">الفرق</div>
          <div className={`text-lg font-bold ${Math.abs(diff) < 0.01 ? "text-success" : "text-warning"}`}>{fmtSAR(diff)}</div>
        </div>
        <div className="bg-card border rounded-md p-3">
          <div className="text-[11px] text-muted-foreground">الحالة</div>
          <div className="mt-1">
            {Math.abs(diff) < 0.01 && stmtBalNum !== 0
              ? <Badge className="bg-success gap-1"><CheckCircle2 className="h-3 w-3" /> مُسوَّى</Badge>
              : <Badge variant="secondary" className="gap-1"><AlertCircle className="h-3 w-3" /> قيد التسوية</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Unmatched */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="bg-muted px-3 py-2 font-semibold text-sm flex justify-between">
            <span>سطور كشف غير مطابقة</span>
            <Badge variant="secondary" className="text-[10px]">{unmatched.length}</Badge>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>التاريخ</th><th>الوصف</th><th className="text-left">مدين</th><th className="text-left">دائن</th><th></th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={5} className="text-center text-muted-foreground py-6">…</td></tr>}
              {!loading && unmatched.length === 0 && <EmptyState inTable colSpan={5} title="جميع السطور مطابقة" />}
              {!loading && unmatched.map(l => (
                <tr key={l.id}>
                  <td className="num">{l.date}</td>
                  <td className="text-xs max-w-[180px] truncate">{l.description}</td>
                  <td className="num text-left">{l.debit ? fmtSAR(l.debit) : "—"}</td>
                  <td className="num text-left">{l.credit ? fmtSAR(l.credit) : "—"}</td>
                  <td className="flex gap-1">
                    <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={() => setMatchLine(l)}>
                      <LinkIcon className="h-3 w-3 ml-0.5" /> مطابقة
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={async () => { await treasuryService.ignoreStatementLine(l.id); loadData(); }}>
                      <EyeOff className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Matched */}
        <div className="bg-card border rounded-lg overflow-hidden">
          <div className="bg-success/10 px-3 py-2 font-semibold text-sm flex justify-between">
            <span>سطور مُطابقة</span>
            <Badge className="bg-success text-[10px]">{matched.length}</Badge>
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>التاريخ</th><th>الوصف</th><th>سند ERP</th><th className="text-left">المبلغ</th><th></th></tr>
            </thead>
            <tbody>
              {!loading && matched.length === 0 && <EmptyState inTable colSpan={5} title="لا توجد مطابقات بعد" />}
              {matched.map(l => {
                const v = vouchers.find(x => x.id === l.matched_voucher_id);
                return (
                  <tr key={l.id}>
                    <td className="num">{l.date}</td>
                    <td className="text-xs max-w-[160px] truncate">{l.description}</td>
                    <td className="font-mono text-xs">{v?.number ?? "—"}</td>
                    <td className="num text-left">{fmtSAR(l.credit - l.debit)}</td>
                    <td>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={async () => { await treasuryService.matchStatementLine(l.id, null); loadData(); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AddLineDialog open={addOpen} onOpenChange={setAddOpen} accountId={accountId} onSaved={loadData} />
      <MatchDialog line={matchLine} onClose={() => setMatchLine(null)} vouchers={vouchers} onSaved={loadData} />
    </div>
  );
}

function AddLineDialog({ open, onOpenChange, accountId, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; accountId: string; onSaved: () => void; }) {
  const [date, setDate] = useState(todayIso());
  const [desc, setDesc] = useState("");
  const [ref, setRef] = useState("");
  const [debit, setDebit] = useState("");
  const [credit, setCredit] = useState("");

  useEffect(() => { if (open) { setDate(todayIso()); setDesc(""); setRef(""); setDebit(""); setCredit(""); } }, [open]);

  const submit = async () => {
    if (!desc || (!debit && !credit)) { toast.error("الوصف ومبلغ واحد على الأقل مطلوبان"); return; }
    await treasuryService.addStatementLine({
      account_id: accountId, date, description: desc, reference: ref || undefined,
      debit: Number(debit) || 0, credit: Number(credit) || 0,
    });
    toast.success("تم إضافة السطر");
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>إضافة سطر كشف بنكي</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1"><Label className="text-xs">التاريخ</Label>
            <Input type="date" className="h-8" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">المرجع</Label>
            <Input className="h-8" value={ref} onChange={e => setRef(e.target.value)} /></div>
          <div className="flex flex-col gap-1 col-span-2"><Label className="text-xs">الوصف *</Label>
            <Input className="h-8" value={desc} onChange={e => setDesc(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">مدين (سحب)</Label>
            <Input type="number" step="0.01" className="h-8" value={debit} onChange={e => setDebit(e.target.value)} /></div>
          <div className="flex flex-col gap-1"><Label className="text-xs">دائن (إيداع)</Label>
            <Input type="number" step="0.01" className="h-8" value={credit} onChange={e => setCredit(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>إضافة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchDialog({ line, onClose, vouchers, onSaved }: { line: BankStatementLine | null; onClose: () => void; vouchers: Voucher[]; onSaved: () => void; }) {
  if (!line) return null;
  const amount = line.credit - line.debit;
  // Suggest vouchers: receipts for credit, payments for debit; closest amount
  const candidates = vouchers
    .filter(v => Math.abs(v.amount - Math.abs(amount)) < Math.max(1, Math.abs(amount) * 0.05))
    .filter(v => (amount > 0 ? v.type === "receipt" : v.type === "payment"))
    .slice(0, 10);
  const others = vouchers.filter(v => !candidates.includes(v)).slice(0, 20);

  return (
    <Dialog open={!!line} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>مطابقة السطر — {fmtSAR(amount)} ({line.date})</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground mb-2">{line.description}</div>
        {candidates.length > 0 && <div className="text-xs font-semibold text-success mb-1">مقترحات قريبة</div>}
        <div className="border rounded-md max-h-80 overflow-y-auto">
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>الجهة</th><th>النوع</th><th className="text-left">المبلغ</th><th></th></tr></thead>
            <tbody>
              {[...candidates, ...others].map(v => (
                <tr key={v.id} className={candidates.includes(v) ? "bg-success/5" : ""}>
                  <td className="font-mono text-xs">{v.number}</td>
                  <td className="num text-xs">{v.date}</td>
                  <td className="text-xs">{v.counterparty}</td>
                  <td className="text-xs">{v.type === "receipt" ? "قبض" : "صرف"}</td>
                  <td className="num text-left">{fmtSAR(v.amount)}</td>
                  <td>
                    <Button size="sm" className="h-6 px-2 text-[10px]" onClick={async () => { await treasuryService.matchStatementLine(line.id, v.id); toast.success("تمت المطابقة"); onClose(); onSaved(); }}>
                      مطابقة
                    </Button>
                  </td>
                </tr>
              ))}
              {vouchers.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-4 text-xs">لا توجد سندات في هذا الحساب</td></tr>}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
