import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText, ShoppingCart, Receipt, Banknote, Truck, FileMinus,
  Search, User, Clock, TrendingUp,
} from "lucide-react";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US") + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";
const dt = (s?: string) => s ? new Date(s).getTime() : 0;

type EventKind = "quotation" | "sales_order" | "invoice" | "payment" | "delivery" | "credit_note";

interface TLEvent {
  id: string;
  kind: EventKind;
  date: string;
  title: string;
  ref?: string;
  amount?: number;
  status?: string;
  href?: string;
}

const KIND_META: Record<EventKind, { label: string; icon: any; color: string; bg: string }> = {
  quotation:   { label: "عرض سعر",      icon: FileText,    color: "text-blue-600",    bg: "bg-blue-50 border-blue-200" },
  sales_order: { label: "أمر بيع",      icon: ShoppingCart, color: "text-indigo-600",  bg: "bg-indigo-50 border-indigo-200" },
  invoice:     { label: "فاتورة",       icon: Receipt,     color: "text-teal-600",    bg: "bg-teal-50 border-teal-200" },
  payment:     { label: "دفعة",         icon: Banknote,    color: "text-green-600",   bg: "bg-green-50 border-green-200" },
  delivery:    { label: "تسليم",        icon: Truck,       color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" },
  credit_note: { label: "إشعار دائن",   icon: FileMinus,   color: "text-red-600",     bg: "bg-red-50 border-red-200" },
};

export default function CustomerTimeline() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [custSearch, setCustSearch] = useState("");
  const [events, setEvents] = useState<TLEvent[]>([]);
  const [summary, setSummary] = useState({ invoiced: 0, paid: 0, credited: 0, cleared: 0 });
  const [loading, setLoading] = useState(false);

  // قائمة العملاء
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("contacts").select("id, code, name").eq("is_customer", true).order("name");
      setCustomers(data ?? []);
    })();
  }, []);

  // تحميل نشاط العميل المختار
  useEffect(() => {
    if (!selected) { setEvents([]); return; }
    (async () => {
      setLoading(true);
      const [qs, sos, invs, pmts, dels, cns] = await Promise.all([
        supabase.from("quotations").select("id, quote_no, status, total, created_at").eq("customer_id", selected),
        supabase.from("sales_orders").select("id, order_no, status, total, order_date, created_at").eq("customer_id", selected),
        supabase.from("invoices").select("id, invoice_no, status, total, invoice_date, created_at").eq("customer_id", selected),
        supabase.from("payments").select("id, payment_no, amount, payment_date, invoice_id").eq("customer_id", selected),
        supabase.from("deliveries").select("id, delivery_no, status, completed_date, created_at").eq("customer_id", selected),
        supabase.from("credit_notes").select("id, total, cn_date, created_at").eq("customer_id", selected),
      ]);

      const ev: TLEvent[] = [];
      (qs.data ?? []).forEach((r: any) => ev.push({
        id: "q" + r.id, kind: "quotation", date: r.created_at,
        title: `عرض سعر ${r.quote_no ?? ""}`.trim(), ref: r.quote_no, amount: Number(r.total), status: r.status,
        href: `/quotations/${r.id}`,
      }));
      (sos.data ?? []).forEach((r: any) => ev.push({
        id: "so" + r.id, kind: "sales_order", date: r.order_date || r.created_at,
        title: `أمر بيع ${r.order_no ?? ""}`.trim(), ref: r.order_no, amount: Number(r.total), status: r.status,
        href: `/sales-orders/${r.id}`,
      }));
      (invs.data ?? []).forEach((r: any) => ev.push({
        id: "inv" + r.id, kind: "invoice", date: r.invoice_date || r.created_at,
        title: `فاتورة ${r.invoice_no ?? ""}`.trim(), ref: r.invoice_no, amount: Number(r.total), status: r.status,
        href: `/invoices/${r.id}`,
      }));
      (pmts.data ?? []).forEach((r: any) => ev.push({
        id: "p" + r.id, kind: "payment", date: r.payment_date,
        title: `دفعة ${r.payment_no ?? ""}`.trim(), ref: r.payment_no, amount: Number(r.amount),
      }));
      (dels.data ?? []).forEach((r: any) => ev.push({
        id: "d" + r.id, kind: "delivery", date: r.completed_date || r.created_at,
        title: `تسليم ${r.delivery_no ?? ""}`.trim(), ref: r.delivery_no, status: r.status,
      }));
      (cns.data ?? []).forEach((r: any) => ev.push({
        id: "cn" + r.id, kind: "credit_note", date: r.cn_date || r.created_at,
        title: `إشعار دائن`, amount: Number(r.total),
      }));

      ev.sort((a, b) => dt(b.date) - dt(a.date));
      setEvents(ev);

      // المسوّى (cleared) من Open Items لفواتير العميل — كل التسويات (دفعات + مقاصّات + إشعارات)
      const _invIds = (invs.data ?? []).filter((i: any) => i.status !== "cancelled").map((i: any) => i.id);
      let _cleared = 0;
      if (_invIds.length) {
        const { data: _al } = await supabase
          .from("open_item_allocations")
          .select("allocated_amount")
          .eq("target_document_type", "sales_invoice")
          .eq("status", "active")
          .in("target_document_id", _invIds);
        _cleared = (_al ?? []).reduce((s: number, a: any) => s + Number(a.allocated_amount || 0), 0);
      }
      setSummary({
        invoiced: (invs.data ?? []).filter((i: any) => i.status !== "cancelled").reduce((s: number, i: any) => s + Number(i.total), 0),
        paid: (pmts.data ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0),
        credited: (cns.data ?? []).reduce((s: number, c: any) => s + Number(c.total), 0),
        cleared: _cleared,
      });
      setLoading(false);
    })();
  }, [selected]);

  const filteredCustomers = useMemo(() => {
    if (!custSearch) return customers;
    const q = custSearch.toLowerCase();
    return customers.filter(c => `${c.code} ${c.name}`.toLowerCase().includes(q));
  }, [customers, custSearch]);

  const selectedCust = customers.find(c => c.id === selected);
  const outstanding = Math.max(0, summary.invoiced - ((summary as any).cleared ?? (summary.paid + summary.credited)));   // Open Items

  return (
    <div dir="rtl">
      <PageHeader title="الخط الزمني للعميل" subtitle="كل نشاط العميل عبر النظام — عروض، أوامر، فواتير، دفعات، تسليم، إشعارات دائنة" />

      <div className="px-4 pb-4 flex flex-wrap gap-2 items-end">
        <div className="flex flex-col gap-1 min-w-[280px]">
          <label className="text-xs text-muted-foreground">اختر العميل</label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="h-9"><SelectValue placeholder="— اختر عميلاً —" /></SelectTrigger>
            <SelectContent>
              <div className="px-2 py-1.5 sticky top-0 bg-popover z-10">
                <div className="relative">
                  <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="h-8 pr-7 text-xs" placeholder="بحث..." value={custSearch}
                    onChange={e => setCustSearch(e.target.value)} onKeyDown={e => e.stopPropagation()} />
                </div>
              </div>
              {filteredCustomers.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name} <span className="text-muted-foreground font-mono text-[11.5px]">({c.code})</span></SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selected ? (
        <div className="px-4">
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-lg">
            <User className="h-10 w-10 mx-auto mb-2 opacity-30" />
            اختر عميلاً لعرض خطه الزمني الكامل
          </div>
        </div>
      ) : (
        <div className="px-4">
          {/* ملخص */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
            <div className="border border-border rounded-lg p-3">
              <div className="text-[12px] text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> العميل</div>
              <div className="font-semibold text-sm mt-0.5">{selectedCust?.name}</div>
              <Link to={`/ar/${selected}`} className="text-[11.5px] text-primary hover:underline">كشف الحساب ←</Link>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-[12px] text-muted-foreground flex items-center gap-1"><Receipt className="h-3 w-3" /> إجمالي الفواتير</div>
              <div className="font-bold text-lg num mt-0.5">{fmtSAR(summary.invoiced)}</div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-[12px] text-muted-foreground flex items-center gap-1"><Banknote className="h-3 w-3 text-green-600" /> المسوّى (كل التسويات)</div>
              <div className="font-bold text-lg num mt-0.5 text-success">{fmtSAR((summary as any).cleared ?? summary.paid)}</div>
            </div>
            <div className="border border-border rounded-lg p-3">
              <div className="text-[12px] text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> المتبقي</div>
              <div className={`font-bold text-lg num mt-0.5 ${outstanding > 0 ? "text-warning" : "text-muted-foreground"}`}>{fmtSAR(outstanding)}</div>
              {summary.credited > 0 && <div className="text-[11.5px] text-muted-foreground">إشعارات دائنة: {fmtSAR(summary.credited)}</div>}
            </div>
          </div>

          {/* الخط الزمني */}
          {loading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">جاري التحميل…</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border border-dashed border-border rounded-lg">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا يوجد نشاط مسجّل لهذا العميل بعد
            </div>
          ) : (
            <div className="relative pr-4">
              <div className="absolute right-[7px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-3">
                {events.map(e => {
                  const m = KIND_META[e.kind];
                  const Icon = m.icon;
                  const inner = (
                    <div className={`flex-1 border rounded-lg p-3 ${m.bg} transition-colors`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-[11.5px] ${m.color}`}>{m.label}</Badge>
                          <span className="font-medium text-sm">{e.title}</span>
                          {e.status && <span className="text-[11.5px] text-muted-foreground">· {e.status}</span>}
                        </div>
                        <div className="flex items-center gap-3">
                          {e.amount !== undefined && e.amount > 0 && <span className="num font-semibold text-sm">{fmtSAR(e.amount)}</span>}
                          <span className="text-[11.5px] text-muted-foreground">{fmtDate(e.date)}</span>
                        </div>
                      </div>
                    </div>
                  );
                  return (
                    <div key={e.id} className="flex items-start gap-3 relative">
                      <div className={`mt-2 h-4 w-4 rounded-full border-2 border-background shrink-0 z-10 flex items-center justify-center ${m.color}`} style={{ background: "currentColor" }}>
                        <Icon className="h-2.5 w-2.5 text-white" />
                      </div>
                      {e.href ? <Link to={e.href} className="flex-1 hover:opacity-90">{inner}</Link> : inner}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}