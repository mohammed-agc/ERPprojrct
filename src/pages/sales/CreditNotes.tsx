import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/erp/EmptyState";

const fmt = (n: number) =>
  Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CreditNotes() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sp] = useSearchParams();
  const invoiceFilter = sp.get("invoice_id");
  const orderFilter = sp.get("order_id");

  useEffect(() => {
    (async () => {
      setLoading(true);
      let query = supabase
        .from("credit_notes")
        .select("*, customers(name), invoices(invoice_no, sales_order_id)")
        .order("cn_date", { ascending: false });
      if (invoiceFilter) query = query.eq("invoice_id", invoiceFilter);
      const { data } = await query;
      let list = data ?? [];
      if (orderFilter) {
        list = list.filter((r: any) => r.invoices?.sales_order_id === orderFilter);
      }
      setRows(list);
      setLoading(false);
    })();
  }, [invoiceFilter, orderFilter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      r =>
        r.credit_note_no?.toLowerCase().includes(s) ||
        r.invoices?.invoice_no?.toLowerCase().includes(s) ||
        r.customers?.name?.toLowerCase().includes(s),
    );
  }, [rows, q]);

  return (
    <div>
      <PageHeader
        title="إشعارات دائنة"
        subtitle={
          invoiceFilter
            ? "الإشعارات الدائنة لفاتورة محددة"
            : orderFilter
            ? "الإشعارات الدائنة لأمر بيع محدد"
            : "مستندات عكس قيمة الفواتير المرحَّلة"
        }
        sticky
      />

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex items-end gap-3">
        <Input
          placeholder="بحث برقم الإشعار، رقم الفاتورة، أو العميل…"
          className="h-8 max-w-md"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الإشعار</th>
              <th>التاريخ</th>
              <th>الفاتورة</th>
              <th>العميل</th>
              <th>السبب</th>
              <th className="text-right">قبل الضريبة</th>
              <th className="text-right">VAT</th>
              <th className="text-right">الإجمالي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="text-center text-muted-foreground py-8">جارٍ التحميل…</td>
              </tr>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState inTable colSpan={9} title="لا توجد إشعارات دائنة" description="ستظهر هنا عند إلغاء فواتير مرحَّلة." />
            )}
            {!loading &&
              filtered.map(r => (
                <tr key={r.id}>
                  <td className="font-mono">
                    <Link to={`/sales/credit-notes/${r.id}`} className="text-primary hover:underline">
                      {r.credit_note_no}
                    </Link>
                  </td>
                  <td className="num">{r.cn_date}</td>
                  <td className="font-mono text-xs">{r.invoices?.invoice_no ?? "—"}</td>
                  <td>{r.customers?.name ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">{r.reason}</td>
                  <td className="num text-right">{fmt(Number(r.subtotal))}</td>
                  <td className="num text-right">{fmt(Number(r.vat_amount))}</td>
                  <td className="num text-right font-bold">{fmt(Number(r.total))}</td>
                  <td>
                    <Badge variant={r.status === "posted" ? "default" : "secondary"}>
                      {r.status === "posted" ? "مرحَّل" : r.status}
                    </Badge>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}