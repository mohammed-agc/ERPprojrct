import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Receipt, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtSAR, fmtDate } from "@/services/erp/purchasing";

type InvStatus = "draft" | "posted" | "paid" | "cancelled";

const STATUS_LABEL: Record<InvStatus | "all", string> = {
  all: "كل الحالات",
  draft: "مسودة",
  posted: "مرحّلة",
  paid: "مدفوعة",
  cancelled: "ملغاة",
};

const STATUS_TONE: Record<InvStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  posted: "bg-primary/15 text-primary",
  paid: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

interface InvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  status: InvStatus;
  subtotal: number;
  vat_amount: number;
  total: number;
  qr_code: string | null;
  sales_order_id: string | null;
  customer_name: string;
  vehicle: string;
  vin: string | null;
  so_code: string;
}

export default function SalesInvoicesRegistry() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<InvStatus | "all">("all");
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: invs } = await supabase
      .from("invoices")
      .select("*, customers(name), sales_orders(order_no)")
      .order("invoice_date", { ascending: false });
    const list = invs ?? [];

    // Enrich with vehicles via sales_order_lines
    const soIds = Array.from(new Set(list.map((i: any) => i.sales_order_id).filter(Boolean)));
    let vehiclesBySo: Record<string, any[]> = {};
    if (soIds.length > 0) {
      const { data: lines } = await supabase
        .from("sales_order_lines")
        .select("order_id, vehicles(vin, brand, model, year)")
        .in("order_id", soIds);
      (lines ?? []).forEach((l: any) => {
        if (!l.vehicles) return;
        (vehiclesBySo[l.order_id] ??= []).push(l.vehicles);
      });
    }

    const mapped: InvoiceRow[] = list.map((i: any) => {
      const vehs = i.sales_order_id ? (vehiclesBySo[i.sales_order_id] ?? []) : [];
      const veh = vehs[0];
      return {
        id: i.id,
        invoice_no: i.invoice_no,
        invoice_date: i.invoice_date,
        status: i.status as InvStatus,
        subtotal: Number(i.subtotal),
        vat_amount: Number(i.vat_amount),
        total: Number(i.total),
        qr_code: i.qr_code,
        sales_order_id: i.sales_order_id,
        customer_name: i.customers?.name ?? "—",
        vehicle: vehs.length === 0 ? "—"
          : vehs.length === 1 ? `${veh.brand} ${veh.model} ${veh.year ?? ""}`.trim()
          : `${vehs.length} مركبات`,
        vin: vehs.length === 1 ? (veh.vin ?? null) : null,
        so_code: i.sales_orders?.order_no ?? "—",
      };
    });
    setRows(mapped);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return rows.filter(i => {
      if (status !== "all" && i.status !== status) return false;
      if (!qv) return true;
      return `${i.invoice_no} ${i.customer_name} ${i.vehicle} ${i.vin ?? ""} ${i.so_code}`.toLowerCase().includes(qv);
    });
  }, [rows, q, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    sub: filtered.reduce((s, i) => s + i.subtotal, 0),
    vat: filtered.reduce((s, i) => s + i.vat_amount, 0),
    total: filtered.reduce((s, i) => s + i.total, 0),
    paid: filtered.filter(i => i.status === "paid").reduce((s, i) => s + i.total, 0),
  }), [filtered]);

  return (
    <div>
      <PageHeader
        title="فواتير المبيعات — سجل المحاسبة"
        subtitle={`${totals.count} فاتورة · إجمالي ${fmtSAR(totals.total)} · مدفوع ${fmtSAR(totals.paid)} · متبقي ${fmtSAR(totals.total - totals.paid)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، VIN، أمر بيع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {(["all","draft","posted","paid","cancelled"] as const).map(v =>
              <SelectItem key={v} value={v}>{STATUS_LABEL[v]}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>العميل</th>
              <th>أمر البيع</th>
              <th>المركبة</th>
              <th>VIN</th>
              <th>التاريخ</th>
              <th className="text-left">المبلغ</th>
              <th className="text-left">الضريبة</th>
              <th className="text-left">الإجمالي</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8 text-xs">جاري التحميل...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8 text-xs">لا توجد فواتير مطابقة</td></tr>
            )}
            {!loading && filtered.map(i => (
              <tr key={i.id}>
                <td className="font-mono text-[11px]">
                  <Link to="/invoices" className="flex items-center gap-1.5 text-primary hover:underline">
                    <Receipt className="h-3 w-3" />{i.invoice_no}
                  </Link>
                </td>
                <td className="text-xs">{i.customer_name}</td>
                <td className="font-mono text-[10px] text-muted-foreground">{i.so_code}</td>
                <td className="text-xs">{i.vehicle}</td>
                <td className="font-mono text-[10px]">{i.vin ?? "—"}</td>
                <td className="text-xs">{fmtDate(i.invoice_date)}</td>
                <td className="num text-xs text-left">{fmtSAR(i.subtotal)}</td>
                <td className="num text-xs text-left">{fmtSAR(i.vat_amount)}</td>
                <td className="num text-xs text-left font-semibold">{fmtSAR(i.total)}</td>
                <td><Badge className={STATUS_TONE[i.status]}>{STATUS_LABEL[i.status]}</Badge></td>
              </tr>
            ))}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={6} className="text-left text-xs">الإجمالي</td>
                <td className="num text-xs text-left">{fmtSAR(totals.sub)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.vat)}</td>
                <td className="num text-xs text-left">{fmtSAR(totals.total)}</td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
