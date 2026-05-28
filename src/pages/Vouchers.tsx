import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import { VoucherDialog } from "@/components/erp/VoucherDialog";
import { FileSpreadsheet, Plus, RotateCw, Search, Undo2 } from "lucide-react";
import {
  treasuryService, type Voucher, type VoucherType, type TreasuryAccount,
  receiptKindLabel, paymentKindLabel, methodLabel, statusLabel,
} from "@/services/erp/treasury";
import { fmtSAR, todayIso, startOfMonthIso } from "@/lib/erpFormat";

interface Props { type: VoucherType }

export default function VouchersPage({ type }: Props) {
  const isReceipt = type === "receipt";
  const kindLabels = isReceipt ? receiptKindLabel : paymentKindLabel;
  const title = isReceipt ? "سندات القبض" : "سندات الصرف";

  const [rows, setRows] = useState<Voucher[]>([]);
  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("posted");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [v, a] = await Promise.all([treasuryService.listVouchers(type), treasuryService.listAccounts()]);
      setRows(v); setAccounts(a);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  const filtered = useMemo(() => {
    const t = query.trim();
    return rows
      .filter(r => (!from || r.date >= from) && (!to || r.date <= to))
      .filter(r => accountFilter === "all" || r.account_id === accountFilter)
      .filter(r => kindFilter === "all" || r.kind === kindFilter)
      .filter(r => statusFilter === "all" || r.status === statusFilter)
      .filter(r => !t || r.number.includes(t) || r.counterparty.includes(t) ||
        (r.reference ?? "").includes(t) || (r.linked_invoice ?? "").includes(t));
  }, [rows, from, to, accountFilter, kindFilter, statusFilter, query]);

  const totals = useMemo(() =>
    filtered.filter(r => r.status === "posted").reduce((s, r) => s + r.amount, 0), [filtered]);

  const exportCsv = () => {
    const head = ["الرقم", "التاريخ", "النوع", isReceipt ? "الدافع" : "المستفيد",
      "الحساب", "المبلغ", "طريقة الدفع", "المرجع", "الفاتورة", "الحالة"];
    const lines = filtered.map(r => {
      const acc = accounts.find(a => a.id === r.account_id);
      return [r.number, r.date, kindLabels[r.kind as keyof typeof kindLabels] ?? r.kind,
        r.counterparty, acc?.name_ar ?? "", r.amount.toFixed(2), methodLabel[r.method],
        r.reference ?? "", r.linked_invoice ?? "", statusLabel[r.status]].map(s => `"${s}"`).join(",");
    });
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${type}-vouchers-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={`${filtered.length} سند — الإجمالي ${fmtSAR(totals)}`}
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5 ml-1" /> {isReceipt ? "سند قبض" : "سند صرف"} جديد</Button>
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
          <Label className="text-xs">الحساب</Label>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">النوع</Label>
          <Select value={kindFilter} onValueChange={setKindFilter}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(kindLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الحالة</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="posted">مُرحَّل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="reversed">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="الرقم / الاسم / المرجع" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th><th>التاريخ</th><th>النوع</th><th>{isReceipt ? "الدافع" : "المستفيد"}</th>
              <th>الحساب</th><th className="text-left">المبلغ</th><th>طريقة الدفع</th>
              <th>المرجع</th><th>الفاتورة</th><th>الحالة</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={11} className="text-center text-muted-foreground py-8">…</td></tr>}
            {!loading && filtered.length === 0 && <EmptyState inTable colSpan={11} title="لا توجد سندات" />}
            {!loading && filtered.map(r => {
              const acc = accounts.find(a => a.id === r.account_id);
              return (
                <tr key={r.id} className={r.status === "reversed" ? "opacity-50" : ""}>
                  <td className="font-mono text-xs">{r.number}</td>
                  <td className="num">{r.date}</td>
                  <td className="text-xs">{kindLabels[r.kind as keyof typeof kindLabels] ?? r.kind}</td>
                  <td className="font-medium">{r.counterparty}</td>
                  <td className="text-xs">{acc?.name_ar ?? "—"}</td>
                  <td className={`num text-left font-semibold ${isReceipt ? "text-emerald-600" : "text-rose-600"}`}>{fmtSAR(r.amount)}</td>
                  <td className="text-xs">{methodLabel[r.method]}</td>
                  <td className="text-xs">{r.reference ?? "—"}</td>
                  <td className="text-xs font-mono">{r.linked_invoice ?? "—"}</td>
                  <td>
                    {r.status === "posted" && <Badge className="text-[10px]">مُرحَّل</Badge>}
                    {r.status === "draft" && <Badge variant="secondary" className="text-[10px]">مسودة</Badge>}
                    {r.status === "reversed" && <Badge variant="destructive" className="text-[10px]">ملغي</Badge>}
                  </td>
                  <td>
                    {r.status === "posted" && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                        onClick={async () => { await treasuryService.reverseVoucher(r.id); load(); }}>
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={5} className="text-left">الإجمالي (المُرحَّل)</td>
                <td className="num text-left">{fmtSAR(totals)}</td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <VoucherDialog open={open} onOpenChange={setOpen} type={type} accounts={accounts} onSaved={load} />
    </div>
  );
}
