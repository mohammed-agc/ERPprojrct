import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionButton } from "@/components/erp/ActionButton";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { canPerform } from "@/lib/erpPermissions";
import { PaymentDialog, PaymentSubmitPayload, PaymentInvoiceContext } from "@/components/erp/PaymentDialog";
import { creditNotesService } from "@/services/erp/creditNotes";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";
import { Search, Receipt, RefreshCw, Banknote, FileMinus, ExternalLink, Layers } from "lucide-react";
import { toast } from "sonner";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_LABEL: Record<string, string> = {
  all: "كل الحالات", draft: "مسودة", issued: "مُصدرة", posted: "مرحّلة",
  partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة",
};

function payBadge(s: "unpaid" | "partial" | "paid") {
  if (s === "paid") return <Badge className="bg-success text-success-foreground">مدفوعة</Badge>;
  if (s === "partial") return <Badge variant="secondary">جزئية</Badge>;
  return <Badge variant="destructive">غير مدفوعة</Badge>;
}

const DOC_STATUS_LABEL: Record<string, string> = {
  OPEN: "مفتوحة", PARTIALLY_CLEARED: "مسوّاة جزئياً", CLEARED: "مسوّاة بالكامل", CANCELLED: "ملغاة",
};
function docStatusBadge(s: "OPEN" | "PARTIALLY_CLEARED" | "CLEARED" | "CANCELLED") {
  if (s === "CLEARED") return <Badge className="bg-success text-success-foreground">{DOC_STATUS_LABEL.CLEARED}</Badge>;
  if (s === "PARTIALLY_CLEARED") return <Badge className="bg-warning text-warning-foreground">{DOC_STATUS_LABEL.PARTIALLY_CLEARED}</Badge>;
  if (s === "CANCELLED") return <Badge variant="destructive">{DOC_STATUS_LABEL.CANCELLED}</Badge>;
  return <Badge variant="secondary">{DOC_STATUS_LABEL.OPEN}</Badge>;
}

export default function SalesInvoicesRegistry() {
  const { role } = useErpSession();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeInvoice, setActiveInvoice] = useState<PaymentInvoiceContext | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: invs } = await supabase
      .from("invoices")
      .select("*, contact:contacts(name, vat_number)")
      .order("invoice_date", { ascending: false });
    const list = invs ?? [];

    // المركبات عبر sales_order_lines → inventory_items
    const soIds = Array.from(new Set(list.map((i: any) => i.sales_order_id).filter(Boolean)));
    const vehiclesByInvoice: Record<string, any[]> = {};
    if (soIds.length) {
      const { data: soLines } = await supabase
        .from("sales_order_lines").select("order_id, vehicle_id").in("order_id", soIds);
      const vehIds = Array.from(new Set((soLines ?? []).map((l: any) => l.vehicle_id).filter(Boolean)));
      const itemsById: Record<string, any> = {};
      if (vehIds.length) {
        const { data: items } = await supabase
          .from("inventory_items").select("id, vin, brand, model, year").in("id", vehIds);
        (items ?? []).forEach((it: any) => { itemsById[it.id] = it; });
      }
      const bySo: Record<string, any[]> = {};
      (soLines ?? []).forEach((l: any) => {
        const it = l.vehicle_id ? itemsById[l.vehicle_id] : null;
        if (it) (bySo[l.order_id] ??= []).push(it);
      });
      list.forEach((i: any) => { if (i.sales_order_id) vehiclesByInvoice[i.id] = bySo[i.sales_order_id] ?? []; });
    }

    // التخصيصات النشطة (Open Items) — المتبقّي الصحيح لكل فاتورة (يشمل المقاصّة)
    const allocByInv: Record<string, number> = {};
    const invIds = list.map((i: any) => i.id);
    if (invIds.length) {
      const { data: allocs } = await supabase
        .from("open_item_allocations")
        .select("target_document_id, allocated_amount")
        .eq("target_document_type", "sales_invoice")
        .eq("status", "active")
        .in("target_document_id", invIds);
      (allocs ?? []).forEach((a: any) => {
        allocByInv[a.target_document_id] = (allocByInv[a.target_document_id] ?? 0) + Number(a.allocated_amount || 0);
      });
    }

    setRows(list.map((i: any) => ({ ...i, _vehicles: vehiclesByInvoice[i.id] ?? [], _remaining: Math.max(0, Number(i.total ?? 0) - (allocByInv[i.id] ?? 0)) })));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openPayment = (r: any) => {
    setActiveInvoice({
      id: r.id, invoice_no: r.invoice_no,
      customer_name: r.contact?.name ?? r.customer_name,
      total: Number(r.total), paid_amount: Number(r.paid_amount ?? 0),
    });
    setDialogOpen(true);
  };

  const handleSubmitPayment = async (p: PaymentSubmitPayload) => {
    setSubmitting(true);
    try {
      const row = rows.find(r => r.id === p.invoiceId);
      if (!row) throw new Error("الفاتورة غير موجودة");
      const userId = (await supabase.auth.getUser()).data.user?.id;
      const { data: payRow, error } = await supabase.from("payments").insert({
        payment_no: "PMT-" + Date.now().toString().slice(-10),
        customer_id: row.customer_id, invoice_id: p.invoiceId,
        amount: p.amount, payment_date: p.paymentDate, method: p.method,
        reference: p.reference || null, notes: p.notes || null, created_by: userId,
      }).select("id").single();
      if (error) throw error;

      // إنشاء سجلّ التخصيص (Open Item Allocation) — نوع PAYMENT
      const { error: eAlloc } = await supabase.rpc("create_allocation" as any, {
        p_allocation_type: "PAYMENT",
        p_partner_id: row.customer_id,
        p_source_document_type: "sales_payment",
        p_source_document_id: payRow.id,
        p_target_document_type: "sales_invoice",
        p_target_document_id: p.invoiceId,
        p_amount: p.amount,
        p_allocation_date: p.paymentDate,
        p_remarks: "دفعة مبيعات",
        p_created_by: userId,
      });
      if (eAlloc) throw eAlloc;
      const totalAfter = Number(row.paid_amount ?? 0) + p.amount;
      if (totalAfter >= Number(row.total)) {
        await salesVehicleStatus.markSoldForInvoice(p.invoiceId);
        toast.success("تم تسجيل الدفعة الكاملة — المركبة أصبحت مباعة");
      } else {
        toast.success(`تم تسجيل دفعة جزئية بقيمة ${p.amount.toLocaleString("ar-SA")}`);
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "فشل تسجيل الدفعة");
    } finally {
      setSubmitting(false);
    }
  };

  const issueCreditNote = async (r: any) => {
    if (!confirm(`إصدار إشعار دائن يعكس المتبقي من الفاتورة ${r.invoice_no}؟`)) return;
    try {
      const cnId = await creditNotesService.issueFullReversal(r.id, "accounting_adjustment", `إشعار دائن من المحاسبة للفاتورة ${r.invoice_no}`);
      if (!cnId) { toast.info("الفاتورة معكوسة بالكامل مسبقاً"); return; }
      toast.success("تم إصدار الإشعار الدائن وتحديث رصيد العميل");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "فشل إصدار الإشعار الدائن");
    }
  };

  const filtered = useMemo(() => rows.filter(r => {
    if (status !== "all" && r.status !== status) return false;
    if (!q) return true;
    const vehs = (r._vehicles ?? []).map((v: any) => `${v.vin ?? ""} ${v.brand ?? ""} ${v.model ?? ""}`).join(" ");
    const hay = `${r.invoice_no} ${r.contact?.name ?? r.customer_name ?? ""} ${vehs}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [rows, q, status]);

  const totals = useMemo(() => {
    const t = filtered.reduce((s, r) => s + Number(r.total), 0);
    const paid = filtered.reduce((s, r) => s + Number(r.paid_amount ?? 0), 0);
    const credited = filtered.reduce((s, r) => s + Number(r.credited_amount ?? 0), 0);
    const outstanding = filtered.reduce((sum, r) => sum + (r._remaining ?? Math.max(0, Number(r.total) - Number(r.paid_amount ?? 0) - Number(r.credited_amount ?? 0))), 0);
    const settled = Math.max(0, t - paid - credited - outstanding);
    return { count: filtered.length, total: t, paid, credited, settled, outstanding };
  }, [filtered]);

  return (
    <div dir="rtl">
      <PageHeader
        title="فواتير المبيعات — سجل المحاسبة"
        subtitle={`${totals.count} فاتورة · الأصلي ${fmtSAR(totals.total)} · المسوّى ${fmtSAR(totals.settled)} · المفتوح ${fmtSAR(totals.outstanding)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، VIN..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "issued", "partially_paid", "paid", "cancelled"].map(v =>
              <SelectItem key={v} value={v}>{STATUS_LABEL[v] ?? v}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-9" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>المركبة / VIN</th>
              <th className="text-right">الأصلي</th>
              <th className="text-right">المسوّى</th>
              <th className="text-right">المفتوح</th>
              <th>الحالة</th>
              <th className="text-left">الإجراءات المحاسبية</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-center text-muted-foreground py-8 text-xs">جاري التحميل...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8 text-xs">لا توجد فواتير مطابقة</td></tr>}
            {!loading && filtered.map(r => {
              // معيار SAP Open Item: الأصلي / المسوّى / المفتوح / الحالة
              const originalAmount = Number(r.total);
              const clearedAmount = originalAmount - (r._remaining ?? originalAmount);   // كل التخصيصات النشطة (أي نوع = clearing)
              const openAmount = r._remaining ?? originalAmount;
              const isCancelled = r.status === "cancelled";
              const docStatus: "OPEN" | "PARTIALLY_CLEARED" | "CLEARED" | "CANCELLED" =
                isCancelled ? "CANCELLED"
                : openAmount <= 0.01 ? "CLEARED"
                : clearedAmount > 0.01 ? "PARTIALLY_CLEARED"
                : "OPEN";
              const payPerm = canPerform("receive_payment", (docStatus === "CLEARED" ? "paid" : "invoiced") as any, role);
              const cnPerm = canPerform("issue_credit_note", "invoiced" as any, role);
              const vehs: any[] = r._vehicles ?? [];
              return (
                <tr key={r.id}>
                  <td className="font-mono text-[12px]">
                    <Link to={`/invoices/${r.id}`} className="flex items-center gap-1 text-primary hover:underline">
                      <Receipt className="h-3 w-3" />{r.invoice_no}
                    </Link>
                  </td>
                  <td className="num text-xs">{fmtDate(r.invoice_date)}</td>
                  <td className="text-xs">
                    {r.customer_id ? (
                      <Link to={`/ar/${r.customer_id}`} className="hover:underline">{r.contact?.name ?? r.customer_name ?? "—"}</Link>
                    ) : (r.contact?.name ?? r.customer_name ?? "—")}
                  </td>
                  <td className="text-xs">
                    {vehs.length === 0 ? <span className="text-muted-foreground">—</span>
                      : vehs.length === 1 ? (
                        <div>
                          <div>{vehs[0].brand} {vehs[0].model} <span className="text-muted-foreground">{vehs[0].year}</span></div>
                          <div className="font-mono text-[11.5px] text-muted-foreground" dir="ltr">{vehs[0].vin || "—"}</div>
                        </div>
                      ) : <span>{vehs.length} مركبات</span>}
                  </td>
                  <td className="num text-right text-xs font-bold">{fmtSAR(originalAmount)}</td>
                  <td className="num text-right text-xs text-primary">{clearedAmount > 0.01 ? fmtSAR(clearedAmount) : "—"}</td>
                  <td className={`num text-right text-xs ${openAmount > 0.01 ? "text-warning font-semibold" : "text-muted-foreground"}`}>{fmtSAR(openAmount)}</td>
                  <td>{docStatusBadge(docStatus)}</td>
                  <td className="text-left">
                    <div className="flex items-center justify-end gap-1">
                      <ActionButton size="sm" variant="outline" permission={payPerm} hideIfDenied
                        onClick={() => openPayment(r)} disabled={docStatus === "CLEARED" || r.status === "cancelled"}>
                        <Banknote className="h-3.5 w-3.5 ml-1" /> دفعة
                      </ActionButton>
                      <ActionButton size="sm" variant="ghost" permission={cnPerm} hideIfDenied
                        onClick={() => issueCreditNote(r)} disabled={r.status === "cancelled" || openAmount <= 0}
                        className="text-destructive">
                        <FileMinus className="h-3.5 w-3.5 ml-1" /> إشعار دائن
                      </ActionButton>
                      <Link to={`/invoices/${r.id}#allocations`} className="inline-flex items-center text-[11.5px] text-primary hover:underline px-1.5 py-1 rounded hover:bg-primary/5" title="سجل التسويات">
                        <Layers className="h-3.5 w-3.5 ml-1" /> التسويات
                      </Link>
                      <Link to={`/invoices/${r.id}`} className="inline-flex items-center text-muted-foreground hover:text-primary px-1" title="فتح الفاتورة">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold">
                <td colSpan={4} className="text-left text-xs">الإجمالي</td>
                <td className="num text-right text-xs font-bold">{fmtSAR(totals.total)}</td>
                <td className="num text-right text-xs text-primary">{fmtSAR(Math.max(0, totals.total - totals.outstanding))}</td>
                <td className="num text-right text-xs text-warning">{fmtSAR(totals.outstanding)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <PaymentDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        invoice={activeInvoice}
        submitting={submitting}
        onSubmit={handleSubmitPayment}
      />
    </div>
  );
}