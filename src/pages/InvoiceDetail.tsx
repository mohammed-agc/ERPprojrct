import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FileMinus } from "lucide-react";
import { CreditNoteDialog } from "@/components/erp/CreditNoteDialog";
import { CreditGateBanner } from "@/components/erp/CreditGateBanner";

const fmt = (n: number) =>
  Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  posted: { label: "مرحّلة", variant: "default" },
  partially_paid: { label: "مدفوعة جزئياً", variant: "secondary" },
  paid: { label: "مدفوعة", variant: "outline" },
  cancelled: { label: "ملغاة", variant: "destructive" },
};

export default function InvoiceDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [creditNotes, setCreditNotes] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [vehicleByLineNo, setVehicleByLineNo] = useState<Record<number, { id: string; label: string }>>({});
  const [dlgOpen, setDlgOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const [{ data: head }, { data: lns }, { data: cns }, { data: pmts }] = await Promise.all([
      supabase.from("invoices").select("*, customers(name, vat_number)").eq("id", id).maybeSingle(),
      supabase.from("invoice_lines").select("*").eq("invoice_id", id).order("line_no"),
      supabase.from("credit_notes").select("*").eq("invoice_id", id).order("cn_date", { ascending: false }),
      supabase.from("payments").select("*").eq("invoice_id", id).order("payment_date", { ascending: false }),
    ]);
    setInv(head);
    setLines(lns ?? []);
    setCreditNotes(cns ?? []);
    setPayments(pmts ?? []);

    // Pull vehicle linkage from the originating SO so credit notes can release inventory.
    if (head?.sales_order_id) {
      const { data: soLines } = await supabase
        .from("sales_order_lines")
        .select("line_no, vehicle_id, vehicles(vin, code)")
        .eq("order_id", head.sales_order_id);
      const map: Record<number, { id: string; label: string }> = {};
      (soLines ?? []).forEach((r: any) => {
        if (r.vehicle_id) {
          map[r.line_no] = { id: r.vehicle_id, label: r.vehicles?.vin || r.vehicles?.code || r.vehicle_id.slice(0, 6) };
        }
      });
      setVehicleByLineNo(map);
    } else {
      setVehicleByLineNo({});
    }
  };
  useEffect(() => { load(); }, [id]);

  if (!inv) return <div className="text-muted-foreground p-4">جارٍ التحميل…</div>;

  const total = Number(inv.total);
  const credited = Number(inv.credited_amount ?? 0);
  const paid = Number(inv.paid_amount ?? 0);
  const outstanding = Math.max(0, total - credited);
  const fullyCredited = outstanding <= 0;

  return (
    <div>
      <PageHeader
        sticky
        title={`فاتورة ${inv.invoice_no}`}
        subtitle={
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <Badge variant={statusMap[inv.status]?.variant}>{statusMap[inv.status]?.label ?? inv.status}</Badge>
            <span className="text-xs text-muted-foreground">التاريخ: {inv.invoice_date}</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => nav("/invoices")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDlgOpen(true)}
              disabled={fullyCredited || inv.status === "draft"}
              title={
                inv.status === "draft"
                  ? "لا يمكن إصدار إشعار دائن على فاتورة مسودة"
                  : fullyCredited
                  ? "تم عكس قيمة الفاتورة بالكامل"
                  : "إنشاء إشعار دائن"
              }
            >
              <FileMinus className="h-4 w-4 ml-1" /> إنشاء إشعار دائن
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">العميل</div>
          <div className="font-medium">{inv.customers?.name ?? "—"}</div>
          {inv.customers?.vat_number && (
            <div className="text-xs text-muted-foreground mt-1">VAT: {inv.customers.vat_number}</div>
          )}
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">الإجمالي</div>
          <div className="num font-bold">{fmt(total)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">المدفوع</div>
          <div className="num font-semibold">{fmt(paid)}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs text-muted-foreground mb-1">القابل للعكس</div>
          <div className="num font-semibold text-primary">{fmt(outstanding)}</div>
          {credited > 0 && (
            <div className="text-[11px] text-muted-foreground mt-1">معكوس: {fmt(credited)}</div>
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 border-b border-border text-sm font-semibold">بنود الفاتورة</div>
        <table className="erp-table">
          <thead>
            <tr><th>#</th><th>الوصف</th><th className="text-left">الكمية</th><th className="text-left">سعر الوحدة</th><th className="text-left">VAT%</th><th className="text-left">الإجمالي</th></tr>
          </thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-4">لا توجد بنود</td></tr>}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold flex items-center justify-between">
            <span>الإشعارات الدائنة</span>
            <Link to={`/sales/credit-notes?invoice_id=${inv.id}`} className="text-xs text-primary hover:underline">عرض الكل ←</Link>
          </div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>السبب</th><th className="text-left">الإجمالي</th></tr></thead>
            <tbody>
              {creditNotes.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-4">لا توجد إشعارات</td></tr>}
              {creditNotes.map(c => (
                <tr key={c.id}>
                  <td className="font-mono"><Link to={`/sales/credit-notes/${c.id}`} className="text-primary hover:underline">{c.credit_note_no}</Link></td>
                  <td className="num">{c.cn_date}</td>
                  <td className="text-xs text-muted-foreground">{c.reason}</td>
                  <td className="num text-left font-semibold">{fmt(Number(c.total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-border text-sm font-semibold">الدفعات</div>
          <table className="erp-table">
            <thead><tr><th>الرقم</th><th>التاريخ</th><th>طريقة الدفع</th><th className="text-left">المبلغ</th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><td colSpan={4} className="text-center text-muted-foreground py-4">لا توجد دفعات</td></tr>}
              {payments.map(p => (
                <tr key={p.id}>
                  <td className="font-mono">{p.payment_no}</td>
                  <td className="num">{p.payment_date}</td>
                  <td className="text-xs">{p.method}</td>
                  <td className="num text-left font-semibold">{fmt(Number(p.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <CreditNoteDialog
        open={dlgOpen}
        onOpenChange={setDlgOpen}
        invoice={{
          id: inv.id,
          invoice_no: inv.invoice_no,
          customer_id: inv.customer_id,
          total,
          credited_amount: credited,
          paid_amount: paid,
        }}
        invoiceLines={lines.map(l => {
          const v = vehicleByLineNo[Number(l.line_no)];
          return {
            description: l.description,
            quantity: Number(l.quantity),
            unit_price: Number(l.unit_price),
            vat_pct: Number(l.vat_pct),
            vehicle_id: v?.id ?? null,
            vehicle_label: v?.label ?? null,
          };
        })}
        onCreated={(cnId) => { load(); nav(`/sales/credit-notes/${cnId}`); }}
      />
    </div>
  );
}
