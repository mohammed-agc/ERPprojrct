import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/erp/EmptyState";
import { DocPrintActions } from "@/components/erp/DocPrintActions";
import { PrintableReceiptDoc } from "@/components/erp/PrintableReceiptDoc";
import { supabase } from "@/integrations/supabase/client";
import { adminSettings } from "@/services/erp/adminSettings";
import { fmtSAR } from "@/lib/erpFormat";
import { Banknote, FileText, BookOpen, User, Download, Receipt as ReceiptIcon } from "lucide-react";

interface PaymentRow {
  id: string;
  payment_no: string;
  payment_date: string;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  customer_id: string;
  invoice_id: string | null;
  customer?: { id: string; code: string; name: string; vat_number: string | null } | null;
  invoice?: { id: string; invoice_no: string; invoice_date: string; total: number; paid_amount: number; credited_amount: number } | null;
  journal_entry?: { id: string; entry_no: string; is_posted: boolean } | null;
}

const METHOD_LABEL: Record<string, string> = {
  cash: "نقدًا", bank: "تحويل بنكي", transfer: "تحويل بنكي",
  card: "بطاقة", cheque: "شيك", check: "شيك", other: "أخرى",
};

const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

export default function CustomerPayments() {
  const [rows, setRows] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const company = adminSettings.get().company;

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: pmts } = await supabase
        .from("payments")
        .select("id, payment_no, payment_date, amount, method, reference, notes, customer_id, invoice_id")
        .order("payment_date", { ascending: false })
        .limit(1000);
      const list = (pmts ?? []) as any[];
      const custIds = Array.from(new Set(list.map(p => p.customer_id).filter(Boolean)));
      const invIds = Array.from(new Set(list.map(p => p.invoice_id).filter(Boolean)));
      const [{ data: customers }, { data: invoices }, { data: jes }] = await Promise.all([
        custIds.length
          ? supabase.from("customers").select("id, code, name, vat_number").in("id", custIds)
          : Promise.resolve({ data: [] as any[] }),
        invIds.length
          ? supabase.from("invoices").select("id, invoice_no, invoice_date, total, paid_amount, credited_amount").in("id", invIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("journal_entries")
          .select("id, entry_no, is_posted, source_id, source_type")
          .eq("source_type", "payment")
          .in("source_id", list.map(p => p.id) as string[]),
      ]);
      const custMap = new Map((customers ?? []).map((c: any) => [c.id, c]));
      const invMap = new Map((invoices ?? []).map((i: any) => [i.id, i]));
      const jeMap = new Map((jes ?? []).map((j: any) => [j.source_id, j]));
      setRows(list.map(p => ({
        ...p,
        customer: custMap.get(p.customer_id) ?? null,
        invoice: p.invoice_id ? invMap.get(p.invoice_id) ?? null : null,
        journal_entry: jeMap.get(p.id) ?? null,
      })));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (method !== "all" && r.method !== method) return false;
    if (from && r.payment_date < from) return false;
    if (to && r.payment_date > to) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.payment_no} ${r.reference ?? ""} ${r.customer?.code ?? ""} ${r.customer?.name ?? ""} ${r.invoice?.invoice_no ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, method, from, to, search]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + Number(r.amount || 0), 0),
    customers: new Set(filtered.map(r => r.customer_id)).size,
    posted: filtered.filter(r => r.journal_entry?.is_posted).length,
  }), [filtered]);

  const byCustomer = useMemo(() => {
    const map = new Map<string, { customer: PaymentRow["customer"]; count: number; amount: number; last: string }>();
    for (const r of filtered) {
      const key = r.customer_id;
      const prev = map.get(key);
      if (prev) {
        prev.count += 1; prev.amount += Number(r.amount || 0);
        if (r.payment_date > prev.last) prev.last = r.payment_date;
      } else map.set(key, { customer: r.customer, count: 1, amount: Number(r.amount || 0), last: r.payment_date });
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const byInvoice = useMemo(() => {
    const map = new Map<string, { invoice: PaymentRow["invoice"]; customer: PaymentRow["customer"]; count: number; amount: number }>();
    for (const r of filtered) {
      const key = r.invoice_id ?? "__on_account__";
      const prev = map.get(key);
      if (prev) { prev.count += 1; prev.amount += Number(r.amount || 0); }
      else map.set(key, { invoice: r.invoice, customer: r.customer, count: 1, amount: Number(r.amount || 0) });
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.amount - a.amount);
  }, [filtered]);

  const exportCsv = () => {
    const headers = ["رقم السند", "التاريخ", "العميل", "كود العميل", "الفاتورة", "الطريقة", "المرجع", "المبلغ", "القيد"];
    const lines = filtered.map(r => [
      r.payment_no, r.payment_date,
      r.customer?.name ?? "", r.customer?.code ?? "",
      r.invoice?.invoice_no ?? "", METHOD_LABEL[r.method] ?? r.method,
      r.reference ?? "", r.amount,
      r.journal_entry?.entry_no ?? "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = "\uFEFF" + [headers.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `customer-payments-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const buildReceipt = (r: PaymentRow) => {
    if (!r.customer) return null;
    const inv = r.invoice;
    const outstandingAfter = inv ? Math.max(0, Number(inv.total) - Number(inv.paid_amount ?? 0) - Number(inv.credited_amount ?? 0)) : undefined;
    return (
      <PrintableReceiptDoc
        company={{
          name: company.name_ar,
          cr_number: company.cr_number,
          vat_number: company.vat_number,
          address: company.address,
          contact: company.phone,
        }}
        receipt={{
          no: r.payment_no, date: r.payment_date, amount: Number(r.amount || 0),
          method: r.method, reference: r.reference, notes: r.notes,
        }}
        customer={{ code: r.customer.code, name: r.customer.name, vat_number: r.customer.vat_number }}
        invoice={inv ? {
          no: inv.invoice_no, date: inv.invoice_date,
          total: Number(inv.total), outstanding_after: outstandingAfter,
        } : null}
      />
    );
  };

  return (
    <div>
      <PageHeader
        title="سجل دفعات العملاء"
        subtitle="كل دفعة عميل مرتبطة بالعميل، الفاتورة، السند، والقيد المحاسبي."
        sticky
        actions={
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5 ml-1" /> تصدير CSV
          </Button>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">عدد الدفعات</div><div className="text-xl font-bold num">{totals.count}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">إجمالي المحصّل</div><div className="text-xl font-bold num">{fmtSAR(totals.amount)}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">عدد العملاء</div><div className="text-xl font-bold num">{totals.customers}</div></Card>
        <Card className="p-3"><div className="text-[11px] text-muted-foreground">دفعات مرحَّلة محاسبيًا</div><div className="text-xl font-bold num">{totals.posted} / {totals.count}</div></Card>
      </div>

      <Card className="p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <Label className="text-xs">بحث</Label>
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="رقم سند، عميل، فاتورة، مرجع…" className="h-8" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الطريقة</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الطرق</SelectItem>
              {Object.entries(METHOD_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1"><Label className="text-xs">من تاريخ</Label><Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى تاريخ</Label><Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
      </Card>

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history"><Banknote className="h-3.5 w-3.5 ml-1" /> سجل الدفعات</TabsTrigger>
          <TabsTrigger value="by-customer"><User className="h-3.5 w-3.5 ml-1" /> حسب العميل</TabsTrigger>
          <TabsTrigger value="by-invoice"><FileText className="h-3.5 w-3.5 ml-1" /> حسب الفاتورة</TabsTrigger>
        </TabsList>

        <TabsContent value="history">
          <Card className="overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>رقم السند</th>
                  <th>التاريخ</th>
                  <th>العميل</th>
                  <th>الفاتورة</th>
                  <th>الطريقة</th>
                  <th>المرجع</th>
                  <th className="num text-left">المبلغ</th>
                  <th>القيد</th>
                  <th className="text-left w-32">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td></tr>}
                {!loading && !filtered.length && <EmptyState inTable colSpan={9} title="لا توجد دفعات" description="لا توجد دفعات ضمن عوامل التصفية." />}
                {!loading && filtered.map(r => (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.payment_no}</td>
                    <td className="num text-xs">{fmtDate(r.payment_date)}</td>
                    <td>
                      {r.customer ? (
                        <Link to={`/ar/${r.customer.id}`} className="hover:underline">
                          <div className="font-medium text-xs">{r.customer.name}</div>
                          <div className="text-[10px] text-muted-foreground font-mono">{r.customer.code}</div>
                        </Link>
                      ) : "—"}
                    </td>
                    <td>
                      {r.invoice ? (
                        <Link to={`/invoices/${r.invoice.id}`} className="font-mono text-xs hover:underline">{r.invoice.invoice_no}</Link>
                      ) : <span className="text-[10px] text-muted-foreground">على الحساب</span>}
                    </td>
                    <td><Badge variant="outline" className="text-[10px]">{METHOD_LABEL[r.method] ?? r.method}</Badge></td>
                    <td className="font-mono text-[10px]">{r.reference || "—"}</td>
                    <td className="num text-left font-semibold">{fmtSAR(Number(r.amount || 0))}</td>
                    <td>
                      {r.journal_entry ? (
                        <Link to={`/journals/${r.journal_entry.id}`} className="inline-flex items-center gap-1 text-xs hover:underline">
                          <BookOpen className="h-3 w-3" />
                          <span className="font-mono">{r.journal_entry.entry_no}</span>
                          {r.journal_entry.is_posted && <Badge className="text-[9px] h-4">مُرحَّل</Badge>}
                        </Link>
                      ) : <Badge variant="outline" className="text-[10px] text-warning border-warning/40">بدون قيد</Badge>}
                    </td>
                    <td className="text-left">
                      <DocPrintActions doc={buildReceipt(r)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="by-customer">
          <Card className="overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>الكود</th>
                  <th className="num">عدد الدفعات</th>
                  <th>آخر دفعة</th>
                  <th className="num text-left">الإجمالي</th>
                  <th className="text-left">كشف الحساب</th>
                </tr>
              </thead>
              <tbody>
                {!byCustomer.length && <EmptyState inTable colSpan={6} title="لا توجد بيانات" description="لا توجد دفعات." />}
                {byCustomer.map(g => (
                  <tr key={g.id}>
                    <td>{g.customer?.name ?? "—"}</td>
                    <td className="font-mono text-xs">{g.customer?.code ?? "—"}</td>
                    <td className="num">{g.count}</td>
                    <td className="num text-xs">{fmtDate(g.last)}</td>
                    <td className="num text-left font-semibold">{fmtSAR(g.amount)}</td>
                    <td className="text-left">
                      {g.customer && (
                        <Button asChild size="sm" variant="outline"><Link to={`/ar/${g.customer.id}`}><ReceiptIcon className="h-3.5 w-3.5 ml-1" /> كشف الحساب</Link></Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="by-invoice">
          <Card className="overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>الفاتورة</th>
                  <th>العميل</th>
                  <th className="num">إجمالي الفاتورة</th>
                  <th className="num">عدد الدفعات</th>
                  <th className="num text-left">المحصّل</th>
                  <th className="num text-left">المتبقي</th>
                </tr>
              </thead>
              <tbody>
                {!byInvoice.length && <EmptyState inTable colSpan={6} title="لا توجد بيانات" description="لا توجد دفعات." />}
                {byInvoice.map(g => {
                  const total = g.invoice ? Number(g.invoice.total) : 0;
                  const credited = g.invoice ? Number(g.invoice.credited_amount ?? 0) : 0;
                  const paid = g.invoice ? Number(g.invoice.paid_amount ?? 0) : g.amount;
                  const remaining = g.invoice ? Math.max(0, total - paid - credited) : 0;
                  return (
                    <tr key={g.id}>
                      <td>
                        {g.invoice
                          ? <Link to={`/invoices/${g.invoice.id}`} className="font-mono text-xs hover:underline">{g.invoice.invoice_no}</Link>
                          : <span className="text-[10px] text-muted-foreground">دفعات على الحساب</span>}
                      </td>
                      <td>{g.customer?.name ?? "—"}</td>
                      <td className="num">{g.invoice ? fmtSAR(total) : "—"}</td>
                      <td className="num">{g.count}</td>
                      <td className="num text-left font-semibold">{fmtSAR(g.amount)}</td>
                      <td className="num text-left">{g.invoice ? fmtSAR(remaining) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
