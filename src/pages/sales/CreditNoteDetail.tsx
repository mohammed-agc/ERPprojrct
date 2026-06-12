import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen } from "lucide-react";

const fmt = (n: number) =>
  Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditNoteDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [cn, setCn] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: head, error } = await supabase
        .from("credit_notes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) console.error("CN fetch error", error);
      let enriched: any = head;
      if (head) {
        const [{ data: cust }, invRes, jeRes] = await Promise.all([
          supabase.from("customers").select("name, vat_number").eq("id", head.customer_id).maybeSingle(),
          head.invoice_id
            ? supabase.from("invoices").select("invoice_no, sales_order_id, invoice_date").eq("id", head.invoice_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
          head.journal_entry_id
            ? supabase.from("journal_entries").select("id, entry_no, entry_date, is_posted").eq("id", head.journal_entry_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
        ]);
        enriched = { ...head, customers: cust, invoices: invRes.data, journal_entry: jeRes.data };
      }
      const { data: lns } = await supabase
        .from("credit_note_lines")
        .select("*")
        .eq("credit_note_id", id)
        .order("line_no");
      setCn(enriched);
      setLines(lns ?? []);
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="text-muted-foreground p-4">جارٍ التحميل…</div>;
  if (!cn) return <div className="text-muted-foreground p-4">الإشعار غير موجود</div>;

  return (
    <div>
      <PageHeader
        sticky
        title={`إشعار دائن ${cn.credit_note_no}`}
        subtitle={
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Badge variant={cn.status === "posted" ? "default" : "secondary"}>
              {cn.status === "posted" ? "مرحَّل" : cn.status}
            </Badge>
            <span className="text-xs text-muted-foreground">التاريخ: {cn.cn_date}</span>
            {cn.journal_entry ? (
              <Link
                to={`/journals/${cn.journal_entry.id}`}
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition"
                title="فتح القيد المحاسبي"
              >
                <BookOpen className="h-3 w-3" />
                <span className="font-mono">{cn.journal_entry.entry_no}</span>
                {cn.journal_entry.is_posted && (
                  <span className="text-[11.5px] opacity-80">• مُرحَّل</span>
                )}
              </Link>
            ) : cn.status === "posted" ? (
              <span className="text-[12px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-600">
                لا يوجد قيد محاسبي مرتبط
              </span>
            ) : null}
          </div>
        }
        actions={
          <Button variant="ghost" size="sm" onClick={() => nav("/sales/credit-notes")}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">الفاتورة المرجعية</div>
          <Link
            to={`/invoices`}
            className="font-mono text-primary hover:underline"
          >
            {cn.invoices?.invoice_no ?? "—"}
          </Link>
          {cn.invoices?.sales_order_id && (
            <div className="mt-1 text-xs">
              <Link
                to={`/sales-orders/${cn.invoices.sales_order_id}`}
                className="text-primary hover:underline"
              >
                أمر البيع المرتبط ←
              </Link>
            </div>
          )}
          <div className="text-xs text-muted-foreground mt-2">السبب: {cn.reason}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">العميل</div>
          <div className="font-medium">{cn.customers?.name ?? "—"}</div>
          {cn.customers?.vat_number && (
            <div className="text-xs text-muted-foreground mt-1">الرقم الضريبي: {cn.customers.vat_number}</div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <table className="erp-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الوصف</th>
              <th className="text-left">الكمية</th>
              <th className="text-left">سعر الوحدة</th>
              <th className="text-left">VAT %</th>
              <th className="text-left">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id}>
                <td>{l.line_no}</td>
                <td>{l.description}</td>
                <td className="num text-left">{fmt(Number(l.quantity))}</td>
                <td className="num text-left">{fmt(Number(l.unit_price))}</td>
                <td className="num text-left">{Number(l.vat_pct)}%</td>
                <td className="num text-left font-semibold">{fmt(Number(l.line_total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1 max-w-sm ml-auto">
        <div className="flex justify-between"><span className="text-muted-foreground">قبل الضريبة</span><span className="num">{fmt(Number(cn.subtotal))}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">ضريبة القيمة المضافة</span><span className="num">{fmt(Number(cn.vat_amount))}</span></div>
        <div className="flex justify-between font-bold border-t border-border pt-1 mt-1"><span>إجمالي الإشعار الدائن</span><span className="num">{fmt(Number(cn.total))}</span></div>
      </div>

      {cn.notes && (
        <div className="mt-3 text-xs text-muted-foreground bg-muted/40 rounded-lg p-3">{cn.notes}</div>
      )}
    </div>
  );
}
