import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { TreasuryAccountDialog } from "@/components/erp/TreasuryAccountDialog";
import { FileSpreadsheet, Plus, RotateCw, Search, Pencil, Power } from "lucide-react";
import { treasuryService, type TreasuryAccount, accountTypeLabel, accountTypeColor } from "@/services/erp/treasury";
import { fmtSAR, todayIso } from "@/lib/erpFormat";

export default function TreasuryAccounts() {
  const [rows, setRows] = useState<TreasuryAccount[]>([]);
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showInactive, setShowInactive] = useState(false);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<TreasuryAccount | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([treasuryService.listAccounts(), treasuryService.allBalances()]);
      setRows(a); setBalances(b);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = query.trim();
    return rows
      .filter(r => showInactive || r.active)
      .filter(r => typeFilter === "all" || r.type === typeFilter)
      .filter(r => !t || r.code.includes(t) || r.name_ar.includes(t) || (r.bank_name ?? "").includes(t));
  }, [rows, query, typeFilter, showInactive]);

  const totals = useMemo(() => {
    let cash = 0, bank = 0, other = 0;
    for (const r of filtered) {
      const b = balances.get(r.id) ?? 0;
      if (r.type === "bank") bank += b;
      else if (r.type === "suspended" || r.type === "clearing") other += b;
      else cash += b;
    }
    return { cash, bank, other };
  }, [filtered, balances]);

  const exportCsv = () => {
    const head = ["الكود", "الاسم", "النوع", "العملة", "الفرع", "البنك", "IBAN", "المسؤول", "الرصيد الافتتاحي", "الرصيد الحالي", "نشط"];
    const lines = filtered.map(r => [r.code, r.name_ar, accountTypeLabel[r.type], r.currency,
      r.branch ?? "", r.bank_name ?? "", r.iban ?? "", r.responsible ?? "",
      r.opening_balance.toFixed(2), (balances.get(r.id) ?? 0).toFixed(2), r.active ? "نعم" : "لا"].map(s => `"${s}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `treasury-accounts-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="حسابات الخزينة"
        subtitle={`${filtered.length} حساب — نقدية ${fmtSAR(totals.cash)} | بنوك ${fmtSAR(totals.bank)} | معلقة ${fmtSAR(totals.other)}`}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEdit(null); setOpen(true); }}><Plus className="h-3.5 w-3.5 ml-1" /> حساب جديد</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="الكود / الاسم / البنك" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">النوع</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(accountTypeLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant={showInactive ? "default" : "outline"} size="sm" onClick={() => setShowInactive(v => !v)}>
          عرض غير النشطة
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th><th>الاسم</th><th>النوع</th><th>العملة</th><th>الفرع</th>
              <th>البنك / IBAN</th><th>المسؤول</th>
              <th className="text-left">افتتاحي</th><th className="text-left">الرصيد</th>
              <th>الحالة</th><th className="w-24"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">…</td></tr>}
            {!loading && filtered.length === 0 && <EmptyState inTable colSpan={11} title="لا توجد حسابات" />}
            {!loading && filtered.map(r => {
              const bal = balances.get(r.id) ?? 0;
              return (
                <tr key={r.id} className={!r.active ? "opacity-60" : ""}>
                  <td className="font-mono text-xs">
                    <Link to={`/treasury/accounts/${r.id}`} className="text-primary hover:underline">{r.code}</Link>
                  </td>
                  <td className="font-medium">{r.name_ar}</td>
                  <td><span className={`text-[11.5px] px-1.5 py-0.5 rounded border ${accountTypeColor[r.type]}`}>{accountTypeLabel[r.type]}</span></td>
                  <td className="text-xs">{r.currency}</td>
                  <td className="text-xs text-muted-foreground">{r.branch ?? "—"}</td>
                  <td className="text-xs">
                    {r.bank_name && <div>{r.bank_name}</div>}
                    {r.iban && <div className="font-mono text-[11.5px] text-muted-foreground" dir="ltr">{r.iban}</div>}
                    {!r.bank_name && !r.iban && "—"}
                  </td>
                  <td className="text-xs">{r.responsible ?? "—"}</td>
                  <td className="num text-left text-xs">{fmtSAR(r.opening_balance)}</td>
                  <td className={`num text-left font-semibold ${bal < 0 ? "text-destructive" : ""}`}>{fmtSAR(bal)}</td>
                  <td>{r.active ? <Badge variant="secondary" className="text-[11.5px]">نشط</Badge> : <Badge variant="outline" className="text-[11.5px]">معطل</Badge>}</td>
                  <td className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEdit(r); setOpen(true); }}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => { await treasuryService.toggleAccount(r.id); load(); }}><Power className="h-3 w-3" /></Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <TreasuryAccountDialog open={open} onOpenChange={setOpen} edit={edit} onSaved={load} />
    </div>
  );
}
