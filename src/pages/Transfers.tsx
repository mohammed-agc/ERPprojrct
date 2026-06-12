import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { TransferDialog } from "@/components/erp/TransferDialog";
import { FileSpreadsheet, Plus, RotateCw, Search, Undo2, ArrowLeft } from "lucide-react";
import {
  treasuryService, type Transfer, type TreasuryAccount,
  transferKindLabel, statusLabel,
} from "@/services/erp/treasury";
import { fmtSAR, todayIso, startOfMonthIso } from "@/lib/erpFormat";

export default function Transfers() {
  const [rows, setRows] = useState<Transfer[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [t, a] = await Promise.all([treasuryService.listTransfers(), treasuryService.listAccounts()]);
      setRows(t); setAccounts(a);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const accMap = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts]);

  const filtered = useMemo(() => {
    const t = query.trim();
    return rows
      .filter(r => (!from || r.date >= from) && (!to || r.date <= to))
      .filter(r => kindFilter === "all" || r.kind === kindFilter)
      .filter(r => statusFilter === "all" || r.status === statusFilter)
      .filter(r => !t || r.number.includes(t) || (r.reference ?? "").includes(t));
  }, [rows, from, to, kindFilter, statusFilter, query]);

  const totals = useMemo(() =>
    filtered.filter(r => r.status === "completed").reduce((s, r) => s + r.amount, 0), [filtered]);

  const exportCsv = () => {
    const head = ["الرقم", "التاريخ", "النوع", "من", "إلى", "المبلغ", "الرسوم", "المرجع", "الحالة"];
    const lines = filtered.map(r => [r.number, r.date, transferKindLabel[r.kind],
      accMap.get(r.from_account_id)?.name_ar ?? "", accMap.get(r.to_account_id)?.name_ar ?? "",
      r.amount.toFixed(2), (r.fees ?? 0).toFixed(2), r.reference ?? "", statusLabel[r.status]
    ].map(s => `"${s}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `transfers-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="التحويلات الداخلية"
        subtitle={`${filtered.length} تحويل — الإجمالي ${fmtSAR(totals)}`}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 ml-1" /> تحويل جديد</Button>
            <Button size="sm" variant="outline" onClick={exportCsv}><FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير</Button>
            <Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">من</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">النوع</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(transferKindLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="completed">مكتمل</SelectItem>
              <SelectItem value="pending">قيد التنفيذ</SelectItem>
              <SelectItem value="reversed">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="الرقم / المرجع" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th><th>التاريخ</th><th>النوع</th>
              <th>المسار</th><th className="text-right">المبلغ</th><th className="text-right">الرسوم</th>
              <th>المرجع</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">…</td></tr>}
            {!loading && filtered.length === 0 && <EmptyState inTable colSpan={9} title="لا توجد تحويلات" />}
            {!loading && filtered.map(r => (
              <tr key={r.id} className={r.status === "reversed" ? "opacity-50" : ""}>
                <td className="font-mono text-xs">{r.number}</td>
                <td className="num">{r.date}</td>
                <td className="text-xs">{transferKindLabel[r.kind]}</td>
                <td className="text-xs">
                  <div className="flex items-center gap-1.5">
                    <span>{accMap.get(r.from_account_id)?.name_ar ?? "—"}</span>
                    <ArrowLeft className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{accMap.get(r.to_account_id)?.name_ar ?? "—"}</span>
                  </div>
                </td>
                <td className="num text-right font-semibold">{fmtSAR(r.amount)}</td>
                <td className="num text-right text-xs">{r.fees ? fmtSAR(r.fees) : "—"}</td>
                <td className="text-xs">{r.reference ?? "—"}</td>
                <td>
                  {r.status === "completed" && <Badge className="text-[11.5px] bg-success">مكتمل</Badge>}
                  {r.status === "pending" && <Badge variant="secondary" className="text-[11.5px]">قيد التنفيذ</Badge>}
                  {r.status === "reversed" && <Badge variant="destructive" className="text-[11.5px]">ملغي</Badge>}
                </td>
                <td>
                  {r.status !== "reversed" && (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                      onClick={async () => { await treasuryService.reverseTransfer(r.id); load(); }}>
                      <Undo2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <TransferDialog open={open} onOpenChange={setOpen} accounts={accounts} onSaved={load} />
    </div>
  );
}