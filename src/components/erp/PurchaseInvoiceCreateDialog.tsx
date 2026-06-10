import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Percent, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { getAllocation } from "@/services/erp/allocationsDb";
import {
  createInvoiceFromAllocation, computeInvoiceTotals, fmtSAR,
  type InvoiceLineInput,
} from "@/services/erp/purchaseInvoicesDb";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allocationId: string;
}

export function PurchaseInvoiceCreateDialog({ open, onOpenChange, allocationId }: Props) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);

  // رأس الفاتورة
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");

  // خصم البنود: مفتاح allocation_line_id → { value, type } ، والضريبة
  const [lineDisc, setLineDisc] = useState<Record<string, { value: string; type: "fixed" | "pct" }>>({});
  const [lineVat, setLineVat] = useState<Record<string, number>>({});
  // الخصم الإجمالي: قيمة + نوع
  const [headerDisc, setHeaderDisc] = useState("");
  const [headerDiscType, setHeaderDiscType] = useState<"fixed" | "pct">("fixed");

  const allocQ = useQuery({
    queryKey: ["alloc-for-invoice", allocationId],
    queryFn: () => getAllocation(allocationId),
    enabled: open && !!allocationId,
  });

  useEffect(() => {
    if (!open) {
      setInvoiceNo(""); setDueDate(""); setHeaderDisc(""); setHeaderDiscType("fixed");
      setNotes(""); setLineDisc({}); setLineVat({});
    }
  }, [open]);

  const lines = allocQ.data?.lines ?? [];

  // بناء مدخلات الحساب
  const calcInputs: InvoiceLineInput[] = useMemo(() => lines.map(l => {
    const d = lineDisc[l.id] ?? { value: "", type: "fixed" as const };
    const val = Number(d.value) || 0;
    const vat = lineVat[l.id] ?? (l.vat_pct ?? 15);
    return {
      allocation_line_id: l.id,
      vin: l.vin, brand: l.brand, manufacturer: l.manufacturer, model: l.model,
      trim: l.trim, year: l.year, color: l.color, engine_no: l.engine_no,
      unit_cost: l.unit_cost,
      discount_pct: d.type === "pct" ? val : 0,
      discount_amount: d.type === "fixed" ? val : 0,
      vat_pct: vat,
    };
  }), [lines, lineDisc, lineVat]);

  const headerDiscVal = Number(headerDisc) || 0;
  const calc = useMemo(
    () => computeInvoiceTotals(
      calcInputs,
      headerDiscType === "pct" ? headerDiscVal : 0,
      headerDiscType === "fixed" ? headerDiscVal : 0,
    ),
    [calcInputs, headerDiscVal, headerDiscType],
  );

  const setLD = (id: string, patch: Partial<{ value: string; type: "fixed" | "pct" }>) =>
    setLineDisc(prev => ({ ...prev, [id]: { value: "", type: "fixed", ...prev[id], ...patch } }));

  const create = useMutation({
    mutationFn: () => createInvoiceFromAllocation({
      allocation_id: allocationId,
      invoice_no: invoiceNo || undefined,
      invoice_date: invoiceDate || undefined,
      due_date: dueDate || undefined,
      discount_pct: headerDiscType === "pct" ? headerDiscVal : 0,
      discount_amount: headerDiscType === "fixed" ? headerDiscVal : 0,
      line_discounts: Object.fromEntries(
        Object.entries(lineDisc).map(([k, v]) => {
          const val = Number(v.value) || 0;
          return [k, { pct: v.type === "pct" ? val : 0, amount: v.type === "fixed" ? val : 0 }];
        }),
      ),
      notes: notes || undefined,
    }),
    onSuccess: (inv) => {
      toast.success(`تم إنشاء الفاتورة ${inv.code}`);
      qc.invalidateQueries({ queryKey: ["purchase-invoices"] });
      onOpenChange(false);
      nav(`/purchasing/invoices/${inv.id}`);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>إنشاء فاتورة شراء من التخصيص</DialogTitle></DialogHeader>

        {/* رأس الفاتورة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">رقم فاتورة المورد</Label>
            <Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} dir="ltr" className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">تاريخ الفاتورة</Label>
            <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">تاريخ الاستحقاق</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 text-xs" />
          </div>
        </div>

        {/* بنود المركبات + خصم متغير + ضريبة */}
        <div className="border border-border rounded-lg overflow-x-auto">
          <table className="erp-table">
            <thead>
              <tr><th>المركبة</th><th>VIN</th><th>التكلفة</th><th>الخصم</th><th>الضريبة</th><th>الصافي</th></tr>
            </thead>
            <tbody>
              {lines.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-4 text-xs">جارٍ التحميل…</td></tr>}
              {calc.lines.map((l) => {
                const d = lineDisc[l.allocation_line_id] ?? { value: "", type: "fixed" as const };
                const vat = lineVat[l.allocation_line_id] ?? (l.vat_pct ?? 15);
                return (
                  <tr key={l.allocation_line_id}>
                    <td className="text-xs">{[l.manufacturer || l.brand, l.model, l.year].filter(Boolean).join(" ")}</td>
                    <td className="font-mono text-[10px]" dir="ltr">{l.vin}</td>
                    <td className="num text-xs">{fmtSAR(l.unit_cost)}</td>
                    {/* الخصم مع مبدّل النوع */}
                    <td>
                      <div className="flex items-center gap-1">
                        <button type="button"
                          onClick={() => setLD(l.allocation_line_id, { type: d.type === "fixed" ? "pct" : "fixed", value: "" })}
                          className={cn("h-7 w-7 flex items-center justify-center rounded border text-xs flex-shrink-0 transition-colors",
                            d.type === "pct" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border")}
                          title={d.type === "pct" ? "نسبة % — اضغط للتحويل لمبلغ" : "مبلغ — اضغط للتحويل لنسبة"}>
                          {d.type === "pct" ? <Percent className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                        </button>
                        <Input type="number" value={d.value} dir="ltr" placeholder="0"
                          onChange={e => setLD(l.allocation_line_id, { value: e.target.value })}
                          className="h-7 w-16 text-[11px]" />
                      </div>
                      {l.discount_amount > 0 && d.type === "pct" && (
                        <div className="text-[10px] text-muted-foreground px-1 mt-0.5">{fmtSAR(l.discount_amount)}</div>
                      )}
                    </td>
                    {/* الضريبة */}
                    <td>
                      <Select value={String(vat)} onValueChange={v => setLineVat(prev => ({ ...prev, [l.allocation_line_id]: Number(v) }))}>
                        <SelectTrigger className="h-7 w-20 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15%</SelectItem>
                          <SelectItem value="0">0% معفي</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="num text-xs font-semibold">{fmtSAR(l.net_cost)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* الخصم الإجمالي + الإجماليات */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label className="text-xs font-bold">الخصم الإجمالي (على كامل الفاتورة)</Label>
            <div className="flex items-center gap-1">
              <button type="button"
                onClick={() => { setHeaderDiscType(headerDiscType === "fixed" ? "pct" : "fixed"); setHeaderDisc(""); }}
                className={cn("h-8 w-8 flex items-center justify-center rounded border text-xs flex-shrink-0 transition-colors",
                  headerDiscType === "pct" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border")}
                title={headerDiscType === "pct" ? "نسبة % — اضغط للتحويل لمبلغ" : "مبلغ — اضغط للتحويل لنسبة"}>
                {headerDiscType === "pct" ? <Percent className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
              </button>
              <Input type="number" value={headerDisc} dir="ltr" placeholder="0"
                onChange={e => setHeaderDisc(e.target.value)} className="h-8 text-xs flex-1" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">ملاحظات</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-1.5 text-xs">
            <Row label="المجموع قبل الخصم" value={fmtSAR(calc.subtotal)} />
            {calc.linesDiscount > 0 && <Row label="خصم البنود" value={`-${fmtSAR(calc.linesDiscount)}`} tone="text-destructive" />}
            {calc.headerDiscount > 0 && <Row label="الخصم الإجمالي" value={`-${fmtSAR(calc.headerDiscount)}`} tone="text-destructive" />}
            <Row label="الصافي قبل الضريبة" value={fmtSAR(calc.netBeforeVat)} />
            <Row label="ضريبة القيمة المضافة" value={fmtSAR(calc.vatAmount)} />
            <div className="border-t border-border pt-1.5 mt-1.5">
              <Row label="الإجمالي" value={fmtSAR(calc.total)} bold />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>إلغاء</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending || lines.length === 0}>
            إنشاء الفاتورة ({fmtSAR(calc.total)})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`num ${bold ? "font-bold text-sm" : ""} ${tone ?? ""}`}>{value}</span>
    </div>
  );
}
