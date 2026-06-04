import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { creditNotesService } from "@/services/erp/creditNotes";

const fmt = (n: number) =>
  Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** GL impact rows for a sales credit note (mirror of sales invoice, reversed). */
type GlRow = { account: string; debit: number; credit: number };

const ACC_RETURNS = "4100 — مرتجعات المبيعات";
const ACC_VAT = "2310 — ضريبة القيمة المضافة (مخرجات)";
const ACC_AR = "1200 — الذمم المدينة (العملاء)";

/** Per-line GL contributions (used for the detailed pre-post journal preview). */
type GlLineRow = {
  line_no: number;
  description: string;
  subtotal: number;
  vat: number;
  total: number;
};

const buildGlLineRows = (
  lines: Array<{ description: string; quantity: number; unit_price: number; vat_pct: number; _selected?: boolean }>
): GlLineRow[] =>
  lines
    .filter(l => l._selected !== false && l.quantity > 0 && l.unit_price > 0)
    .map((l, i) => {
      const subtotal = Number((l.quantity * l.unit_price).toFixed(2));
      const vat = Number((subtotal * (l.vat_pct / 100)).toFixed(2));
      return {
        line_no: i + 1,
        description: l.description || `بند ${i + 1}`,
        subtotal,
        vat,
        total: Number((subtotal + vat).toFixed(2)),
      };
    });

/** Aggregate per-line contributions into per-account debit/credit totals. */
const aggregateGl = (rows: GlLineRow[]): GlRow[] => {
  const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
  const vat = rows.reduce((s, r) => s + r.vat, 0);
  const total = rows.reduce((s, r) => s + r.total, 0);
  return [
    { account: ACC_RETURNS, debit: Number(subtotal.toFixed(2)), credit: 0 },
    { account: ACC_VAT, debit: Number(vat.toFixed(2)), credit: 0 },
    { account: ACC_AR, debit: 0, credit: Number(total.toFixed(2)) },
  ];
};



interface CnLine {
  description: string;
  quantity: number;
  unit_price: number;
  vat_pct: number;
  _selected?: boolean;
  /** Maximum quantity allowed for this line (= original invoice line qty). undefined = free row. */
  _maxQty?: number;
  /** Maximum unit price allowed for this line (= original invoice line unit_price). */
  _maxUnit?: number;
  /** Vehicle this line is reversing — drives inventory release on post. */
  vehicle_id?: string | null;
  /** Human-readable VIN/code for display only. */
  vehicle_label?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  invoice: {
    id: string;
    invoice_no: string;
    customer_id: string;
    total: number;
    credited_amount: number;
    paid_amount: number;
  };
  invoiceLines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    vat_pct: number;
    vehicle_id?: string | null;
    vehicle_label?: string | null;
  }>;
  onCreated: (cnId: string) => void;
}

export function CreditNoteDialog({ open, onOpenChange, invoice, invoiceLines, onCreated }: Props) {
  const outstanding = Math.max(0, Number(invoice.total) - Number(invoice.credited_amount));
  const [reason, setReason] = useState("invoice_cancellation");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CnLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<"edit" | "preview" | "verified">("edit");
  const [previewView, setPreviewView] = useState<"detail" | "aggregate">("aggregate");
  const [verify, setVerify] = useState<{
    cnId: string;
    expected: { subtotal: number; vat: number; total: number };
    actual: { subtotal: number; vat: number; total: number; credit_note_no: string };
    match: boolean;
    invoiceCreditedAfter: number;
    invoiceStatusAfter: string;
    journalEntryId: string | null;
    inventoryReleased: number;
    blockedDelivered: string[];
  } | null>(null);


  // Reset / prefill whenever the dialog opens
  useEffect(() => {
    if (!open) return;
    if (invoiceLines.length > 0) {
      setLines(
        invoiceLines.map(l => ({
          ...l,
          _selected: true,
          _maxQty: l.quantity,
          _maxUnit: l.unit_price,
        }))
      );
    } else {
      const base = Number((outstanding / 1.15).toFixed(2));
      setLines([{ description: `عكس قيمة الفاتورة ${invoice.invoice_no}`, quantity: 1, unit_price: base, vat_pct: 15, _selected: true }]);
    }
    setReason("invoice_cancellation");
    setNotes(`إشعار دائن مقابل الفاتورة ${invoice.invoice_no}`);
    setStep("edit");
    setVerify(null);
  }, [open, invoice.id]);

  const totals = useMemo(() => {
    const active = lines.filter(l => l._selected !== false);
    const subtotal = active.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const vat = active.reduce((s, l) => s + l.quantity * l.unit_price * (l.vat_pct / 100), 0);
    return { subtotal, vat, total: subtotal + vat, count: active.length };
  }, [lines]);

  // Per-line validation: qty/unit must not exceed original invoice line values
  const lineErrors = useMemo(() => {
    return lines.map(l => {
      if (l._selected === false) return null;
      if (l._maxQty !== undefined && l.quantity > l._maxQty + 1e-6) {
        return `الكمية تتجاوز الأصلية (${l._maxQty})`;
      }
      if (l._maxUnit !== undefined && l.unit_price > l._maxUnit + 1e-6) {
        return `السعر يتجاوز سعر الفاتورة (${l._maxUnit})`;
      }
      if (l.quantity < 0 || l.unit_price < 0) return "قيم سالبة غير مسموحة";
      return null;
    });
  }, [lines]);

  const overOutstanding = totals.total > outstanding + 0.01;
  const hasLineError = lineErrors.some(Boolean);
  const blocked = overOutstanding || hasLineError || totals.count === 0;

  const update = (i: number, patch: Partial<CnLine>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));
  const addLine = () =>
    setLines(prev => [...prev, { description: "", quantity: 1, unit_price: 0, vat_pct: 15, _selected: true }]);

  const goPreview = () => {
    if (blocked) {
      if (overOutstanding) toast.error(`المبلغ يتجاوز الرصيد القابل للعكس (${outstanding.toFixed(2)})`);
      else if (hasLineError) toast.error("صحّح الأخطاء على البنود قبل الإصدار");
      return;
    }
    setStep("preview");
  };

  const submit = async () => {
    const active = lines.filter(l => l._selected !== false && l.quantity > 0 && l.unit_price > 0);
    if (active.length === 0) {
      toast.error("أضِف بنداً واحداً على الأقل بكمية وسعر صالحَين");
      return;
    }
    setSubmitting(true);
    try {
      const expected = {
        subtotal: Number(totals.subtotal.toFixed(2)),
        vat: Number(totals.vat.toFixed(2)),
        total: Number(totals.total.toFixed(2)),
      };
      const { cnId, journalEntryId, inventory } = await creditNotesService.issueFromLines({
        invoiceId: invoice.id,
        customerId: invoice.customer_id,
        reason,
        notes,
        lines: active.map(({ description, quantity, unit_price, vat_pct, vehicle_id }) => ({
          description, quantity, unit_price, vat_pct, vehicle_id: vehicle_id ?? null,
        })),
      });

      // Round-trip verification against DB
      const [{ data: cnRow }, { data: invRow }] = await Promise.all([
        supabase.from("credit_notes").select("subtotal, vat_amount, total, credit_note_no").eq("id", cnId).maybeSingle(),
        supabase.from("invoices").select("credited_amount, status").eq("id", invoice.id).maybeSingle(),
      ]);
      const actual = {
        subtotal: Number(cnRow?.subtotal ?? 0),
        vat: Number(cnRow?.vat_amount ?? 0),
        total: Number(cnRow?.total ?? 0),
        credit_note_no: String(cnRow?.credit_note_no ?? "—"),
      };
      const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
      const match = near(actual.subtotal, expected.subtotal) && near(actual.vat, expected.vat) && near(actual.total, expected.total);
      setVerify({
        cnId,
        expected,
        actual,
        match,
        invoiceCreditedAfter: Number(invRow?.credited_amount ?? 0),
        invoiceStatusAfter: String(invRow?.status ?? "—"),
        journalEntryId,
        inventoryReleased: inventory.released.length,
        blockedDelivered: inventory.blockedDelivered,
      });
      setStep("verified");
      if (match) toast.success("تم النشر مع قيد محاسبي وتحديث المخزون");
      else toast.error("تم النشر لكن النتيجة لا تطابق المعاينة");
    } catch (e: any) {
      toast.error(e.message ?? "فشل إصدار الإشعار الدائن");
    } finally {
      setSubmitting(false);
    }
  };

  const glLineRows = useMemo(() => buildGlLineRows(lines), [lines]);
  const glRows = useMemo(() => aggregateGl(glLineRows), [glLineRows]);
  const glDebit = glRows.reduce((s, r) => s + r.debit, 0);
  const glCredit = glRows.reduce((s, r) => s + r.credit, 0);
  const glBalanced = Math.abs(glDebit - glCredit) < 0.01;



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "edit" && `إنشاء إشعار دائن — الفاتورة ${invoice.invoice_no}`}
            {step === "preview" && `معاينة الأثر المحاسبي — ${invoice.invoice_no}`}
            {step === "verified" && `تم النشر — ${verify?.actual.credit_note_no ?? ""}`}
          </DialogTitle>
        </DialogHeader>

        {step === "edit" && (<>


        <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
          <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">إجمالي الفاتورة</div><div className="num font-semibold">{fmt(Number(invoice.total))}</div></div>
          <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">إشعارات سابقة</div><div className="num font-semibold">{fmt(Number(invoice.credited_amount))}</div></div>
          <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">الرصيد القابل للعكس</div><div className="num font-semibold text-primary">{fmt(outstanding)}</div></div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <Label className="text-xs">السبب</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="invoice_cancellation">إلغاء الفاتورة</SelectItem>
                <SelectItem value="goods_return">إرجاع بضاعة</SelectItem>
                <SelectItem value="price_adjustment">تسوية سعر</SelectItem>
                <SelectItem value="discount_after_invoice">خصم بعد الإصدار</SelectItem>
                <SelectItem value="other">أخرى</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Input className="h-8" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
          <table className="erp-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>الوصف</th>
                <th style={{ width: 80 }} className="text-left">الكمية</th>
                <th style={{ width: 110 }} className="text-left">سعر الوحدة</th>
                <th style={{ width: 70 }} className="text-left">VAT%</th>
                <th style={{ width: 110 }} className="text-left">الإجمالي</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const lineTotal = l.quantity * l.unit_price * (1 + l.vat_pct / 100);
                const err = lineErrors[i];
                const qtyBad = l._maxQty !== undefined && l.quantity > l._maxQty + 1e-6;
                const priceBad = l._maxUnit !== undefined && l.unit_price > l._maxUnit + 1e-6;
                return (
                  <tr key={i} className={l._selected === false ? "opacity-40" : ""}>
                    <td>
                      <input type="checkbox" checked={l._selected !== false}
                        onChange={e => update(i, { _selected: e.target.checked })} />
                    </td>
                    <td>
                      <Input className="h-7" value={l.description} onChange={e => update(i, { description: e.target.value })} />
                      {err && <div className="text-[10px] text-destructive mt-0.5">{err}</div>}
                    </td>
                    <td>
                      <Input className={`h-7 text-left num ${qtyBad ? "border-destructive" : ""}`}
                        type="number" min={0} max={l._maxQty}
                        value={l.quantity}
                        onChange={e => update(i, { quantity: Math.max(0, Number(e.target.value) || 0) })} />
                      {l._maxQty !== undefined && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">حد: {l._maxQty}</div>
                      )}
                    </td>
                    <td>
                      <Input className={`h-7 text-left num ${priceBad ? "border-destructive" : ""}`}
                        type="number" min={0} max={l._maxUnit}
                        value={l.unit_price}
                        onChange={e => update(i, { unit_price: Math.max(0, Number(e.target.value) || 0) })} />
                      {l._maxUnit !== undefined && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">حد: {fmt(l._maxUnit)}</div>
                      )}
                    </td>
                    <td><Input className="h-7 text-left num" type="number" min={0} max={100}
                      value={l.vat_pct}
                      onChange={e => update(i, { vat_pct: Math.max(0, Number(e.target.value) || 0) })} /></td>
                    <td className="num text-left font-semibold">{fmt(lineTotal)}</td>
                    <td>
                      <Button size="sm" variant="ghost" onClick={() => removeLine(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="p-2 border-t border-border">
            <Button size="sm" variant="outline" onClick={addLine}>+ إضافة بند</Button>
          </div>
        </div>

        <div className="flex flex-col gap-1 max-w-sm ml-auto text-sm mb-2">
          <div className="flex justify-between"><span className="text-muted-foreground">قبل الضريبة</span><span className="num">{fmt(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">VAT</span><span className="num">{fmt(totals.vat)}</span></div>
          <div className="flex justify-between font-bold border-t border-border pt-1"><span>الإجمالي</span><span className={`num ${overOutstanding ? "text-destructive" : ""}`}>{fmt(totals.total)}</span></div>
          {overOutstanding && (
            <div className="text-xs text-destructive">المبلغ يتجاوز الرصيد القابل للعكس ({fmt(outstanding)}).</div>
          )}
          {hasLineError && (
            <div className="text-xs text-destructive">يوجد بنود تتجاوز الكميات أو الأسعار الأصلية.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={goPreview} disabled={blocked}>
            معاينة الأثر المحاسبي <ArrowRight className="h-3.5 w-3.5 mr-1" />
          </Button>
        </DialogFooter>
        </>)}

        {step === "preview" && (<>
          <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
            <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">قبل الضريبة</div><div className="num font-semibold">{fmt(totals.subtotal)}</div></div>
            <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">ضريبة القيمة المضافة</div><div className="num font-semibold">{fmt(totals.vat)}</div></div>
            <div className="bg-muted/40 rounded p-2"><div className="text-muted-foreground">الإجمالي</div><div className="num font-semibold text-primary">{fmt(totals.total)}</div></div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold flex items-center justify-between">
              <span>{previewView === "aggregate" ? "القيد المُجمَّع حسب الحساب" : "تفاصيل القيد لكل بند"}</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={previewView === "aggregate" ? "default" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewView("aggregate")}
                >
                  القيد المُجمَّع
                </Button>
                <Button
                  size="sm"
                  variant={previewView === "detail" ? "default" : "ghost"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewView("detail")}
                >
                  القيد لكل بند
                </Button>
              </div>
            </div>

            {previewView === "aggregate" ? (
              <table className="erp-table">
                <thead>
                  <tr><th>الحساب</th><th className="text-left">مدين</th><th className="text-left">دائن</th></tr>
                </thead>
                <tbody>
                  {glRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.account}</td>
                      <td className="num text-left">{r.debit ? fmt(r.debit) : "—"}</td>
                      <td className="num text-left">{r.credit ? fmt(r.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/60 font-semibold">
                    <td className="text-left">الإجمالي</td>
                    <td className="num text-left">{fmt(glDebit)}</td>
                    <td className="num text-left">{fmt(glCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="erp-table text-xs">
                <thead>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>البند</th>
                    <th>الحساب</th>
                    <th className="text-left">مدين</th>
                    <th className="text-left">دائن</th>
                  </tr>
                </thead>
                <tbody>
                  {glLineRows.flatMap(r => [
                    <tr key={`r-${r.line_no}`}>
                      <td rowSpan={3} className="align-top">{r.line_no}</td>
                      <td rowSpan={3} className="align-top">{r.description}</td>
                      <td>{ACC_RETURNS}</td>
                      <td className="num text-left">{fmt(r.subtotal)}</td>
                      <td className="num text-left">—</td>
                    </tr>,
                    <tr key={`v-${r.line_no}`}>
                      <td>{ACC_VAT}</td>
                      <td className="num text-left">{fmt(r.vat)}</td>
                      <td className="num text-left">—</td>
                    </tr>,
                    <tr key={`a-${r.line_no}`} className="border-b-2 border-border">
                      <td>{ACC_AR}</td>
                      <td className="num text-left">—</td>
                      <td className="num text-left">{fmt(r.total)}</td>
                    </tr>,
                  ])}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/60 font-semibold">
                    <td className="text-left" colSpan={3}>الإجمالي</td>
                    <td className="num text-left">{fmt(glDebit)}</td>
                    <td className="num text-left">{fmt(glCredit)}</td>
                  </tr>
                </tfoot>
              </table>
            )}

            <div className="px-3 py-2 border-t border-border text-xs flex items-center justify-between">
              <span className={`font-medium ${glBalanced ? "text-success" : "text-destructive"}`}>
                {glBalanced ? "القيد متوازن" : "القيد غير متوازن"}
              </span>
              <span className="text-muted-foreground">مدين: {fmt(glDebit)} · دائن: {fmt(glCredit)}</span>
            </div>
          </div>


          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-2 leading-6">
            <div>• سيُنشر إشعار دائن بإجمالي <b className="num">{fmt(totals.total)}</b> مقابل الفاتورة {invoice.invoice_no}.</div>
            <div>• سيرتفع رصيد عمود <code>credited_amount</code> من <span className="num">{fmt(Number(invoice.credited_amount))}</span> إلى <b className="num">{fmt(Number(invoice.credited_amount) + totals.total)}</b>.</div>
            <div>• إذا غطّى العكس كامل قيمة الفاتورة سيتحول حالتها إلى <b>ملغاة</b> تلقائياً عبر تريغر قاعدة البيانات.</div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setStep("edit")} disabled={submitting}>رجوع للتعديل</Button>
            <Button onClick={submit} disabled={submitting || !glBalanced}>
              {submitting ? "جارٍ النشر…" : "تأكيد الإصدار"}
            </Button>
          </DialogFooter>
        </>)}

        {step === "verified" && verify && (<>
          <div className={`flex items-start gap-2 rounded-lg p-3 mb-3 border ${
            verify.match ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"
          }`}>
            {verify.match
              ? <CheckCircle2 className="h-5 w-5 text-success mt-0.5" />
              : <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />}
            <div className="text-sm">
              <div className="font-semibold">
                {verify.match ? "تطابق التحقق المحاسبي" : "تباين بين المعاينة والنشر"}
              </div>
              <div className="text-xs text-muted-foreground">
                إشعار دائن <span className="font-mono">{verify.actual.credit_note_no}</span> — تمت قراءة القيم من قاعدة البيانات.
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden mb-3">
            <table className="erp-table">
              <thead>
                <tr><th>القيمة</th><th className="text-left">المتوقع</th><th className="text-left">من قاعدة البيانات</th><th>الحالة</th></tr>
              </thead>
              <tbody>
                {([
                  ["قبل الضريبة", verify.expected.subtotal, verify.actual.subtotal],
                  ["VAT", verify.expected.vat, verify.actual.vat],
                  ["الإجمالي", verify.expected.total, verify.actual.total],
                ] as const).map(([label, exp, act]) => {
                  const ok = Math.abs(exp - act) < 0.02;
                  return (
                    <tr key={label}>
                      <td>{label}</td>
                      <td className="num text-left">{fmt(exp)}</td>
                      <td className="num text-left">{fmt(act)}</td>
                      <td className={ok ? "text-success" : "text-destructive"}>{ok ? "✓" : "✗"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 mb-2">
            <div>الفاتورة بعد النشر — رصيد العكس: <b className="num">{fmt(verify.invoiceCreditedAfter)}</b> · الحالة: <b>{verify.invoiceStatusAfter}</b></div>
          </div>

          <DialogFooter>
            <Button onClick={() => { onCreated(verify.cnId); onOpenChange(false); }}>
              فتح الإشعار الدائن
            </Button>
          </DialogFooter>
        </>)}
      </DialogContent>
    </Dialog>
  );
}
