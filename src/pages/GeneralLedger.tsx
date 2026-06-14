import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, Check, ChevronsUpDown } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { EmptyState } from "@/components/erp/EmptyState";
import { cn } from "@/lib/utils";
import { accountingService, type AccountRow, type LedgerMovement } from "@/services/erp/accounting";

const fmt = (n: number) => Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GeneralLedger() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [acctOpen, setAcctOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
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

  // بحث نصّي محلي: يفلتر الحركات المعروضة (البيان، رقم القيد، المرجع، المبلغ)
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      (r.description || "").toLowerCase().includes(q) ||
      (r.entry_no || "").toLowerCase().includes(q) ||
      (r.reference || "").toLowerCase().includes(q) ||
      (r.entry_date || "").toLowerCase().includes(q) ||
      String(r.debit ?? "").includes(q) ||
      String(r.credit ?? "").includes(q)
    );
  }, [rows, search]);

  // الإجماليات تُحسب على الصفوف المفلترة
  const totals = useMemo(() => filteredRows.reduce(
    (a, r) => ({ d: a.d + r.debit, c: a.c + r.credit }), { d: 0, c: 0 }
  ), [filteredRows]);

  const ending = search.trim()
    ? (filteredRows.length ? filteredRows[filteredRows.length - 1].running_balance : 0)
    : (rows.length ? rows[rows.length - 1].running_balance : 0);

  return (
    <div>
      <PageHeader
        title="دفتر الأستاذ العام"
        subtitle={selected ? `${selected.code} — ${selected.name_ar}` : "اختر حساباً لعرض الحركات"}
        sticky
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        {/* اختيار الحساب — قائمة قابلة للبحث بالاسم أو الرقم */}
        <div className="flex flex-col gap-1 min-w-[280px] flex-1">
          <Label className="text-xs">الحساب</Label>
          <Popover open={acctOpen} onOpenChange={setAcctOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={acctOpen}
                className="h-8 justify-between font-normal"
              >
                {selected ? (
                  <span className="flex items-center gap-2 truncate">
                    <span className="font-mono text-xs text-muted-foreground">{selected.code}</span>
                    <span className="truncate">{selected.name_ar}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">اختر حساباً…</span>
                )}
                <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command
                filter={(value, query) => {
                  // value يحوي "code name_ar" — نطابق الرقم أو الاسم
                  return value.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
                }}
              >
                <CommandInput placeholder="ابحث بالرقم أو الاسم…" className="h-9" />
                <CommandList>
                  <CommandEmpty>لا يوجد حساب مطابق.</CommandEmpty>
                  <CommandGroup>
                    {accounts.map(a => (
                      <CommandItem
                        key={a.id}
                        value={`${a.code} ${a.name_ar}`}
                        onSelect={() => {
                          setAccountId(a.id === accountId ? "" : a.id);
                          setAcctOpen(false);
                        }}
                      >
                        <Check className={cn("h-3.5 w-3.5 ml-2", accountId === a.id ? "opacity-100" : "opacity-0")} />
                        <span className="font-mono text-xs text-muted-foreground ml-2">{a.code}</span>
                        <span className="truncate">{a.name_ar}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-1">
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1 min-w-[220px] flex-1">
          <Label className="text-xs">بحث في الحركات</Label>
          <div className="relative">
            <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              className="h-8 pr-7"
              placeholder="البيان، رقم القيد، المرجع، المبلغ…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              disabled={!accountId}
            />
          </div>
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
              <th className="text-right">مدين</th>
              <th className="text-right">دائن</th>
              <th className="text-right">الرصيد الجاري</th>
            </tr>
          </thead>
          <tbody>
            {!accountId && <EmptyState inTable colSpan={7} title="اختر حساباً" description="يُعرض هنا سجل الحركات والرصيد الجاري." />}
            {accountId && loading && <tr><td colSpan={7} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
            {accountId && !loading && rows.length === 0 && <EmptyState inTable colSpan={7} title="لا توجد حركات" description="لا توجد قيود مُرحَّلة على هذا الحساب ضمن النطاق." />}
            {accountId && !loading && rows.length > 0 && filteredRows.length === 0 && <EmptyState inTable colSpan={7} title="لا نتائج للبحث" description="لا توجد حركات مطابقة لنص البحث." />}
            {accountId && !loading && filteredRows.map((r, i) => (
              <tr key={`${r.entry_id}-${i}`}>
                <td className="num">{r.entry_date}</td>
                <td className="font-mono">
                  <Link to={`/journals/${r.entry_id}`} className="text-primary hover:underline">{r.entry_no}</Link>
                </td>
                <td className="text-xs">{r.reference || "—"}</td>
                <td className="max-w-[280px] truncate">{r.description || "—"}</td>
                <td className="num text-right">{r.debit ? fmt(r.debit) : "—"}</td>
                <td className="num text-right">{r.credit ? fmt(r.credit) : "—"}</td>
                <td className={`num text-right font-semibold ${r.running_balance < 0 ? "text-destructive" : ""}`}>{fmt(r.running_balance)}</td>
              </tr>
            ))}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={4} className="text-left">
                  {search.trim() ? `الإجمالي (نتائج البحث: ${filteredRows.length})` : "الإجمالي"}
                </td>
                <td className="num text-right">{fmt(totals.d)}</td>
                <td className="num text-right">{fmt(totals.c)}</td>
                <td className={`num text-right ${ending < 0 ? "text-destructive" : ""}`}>{fmt(ending)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
