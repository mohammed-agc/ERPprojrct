import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Trash2, ArrowRight, Percent, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });

interface Line {
  description: string;
  brand: string;
  model: string;
  trim: string;
  year: number;
  color: string;
  unit_price: number;
  quantity: number;
  discount: number;          // القيمة (ثابتة أو نسبة)
  discount_type: "fixed" | "pct";  // نوع الخصم (UI فقط)
  vat_pct: number;
}

const emptyLine = (): Line => ({
  description: "", brand: "", model: "", trim: "",
  year: new Date().getFullYear(), color: "",
  unit_price: 0, quantity: 1,
  discount: 0, discount_type: "fixed",
  vat_pct: 15,
});

/** احسب قيمة الخصم الفعلية (دائماً ثابتة) */
const calcDiscountAmt = (l: Line): number => {
  if (l.discount_type === "pct") {
    return (l.unit_price * l.quantity) * (l.discount / 100);
  }
  return l.discount;
};

/** احسب إجمالي البند شامل الضريبة */
const calcLineTotal = (l: Line): number => {
  const base = l.unit_price * l.quantity - calcDiscountAmt(l);
  return Math.max(0, base) * (1 + l.vat_pct / 100);
};

export default function QuotationNew() {
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [custId, setCustId] = useState("");
  const [repId, setRepId] = useState("");
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-customers"],
    queryFn: async () => (await supabase.from("contacts").select("id,name,code").order("name")).data ?? [],
  });

  const { data: reps = [] } = useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => (await supabase.from("sales_reps").select("id,name,branch").eq("active", true).order("name")).data ?? [],
  });

  const { data: brands = [] } = useQuery({
    queryKey: ["vehicle-brands"],
    queryFn: async () => (await supabase.from("vehicle_brands").select("id,name").order("name")).data ?? [],
  });

  const { data: allModels = [] } = useQuery({
    queryKey: ["vehicle-models"],
    queryFn: async () => (await supabase.from("vehicle_models").select("id,name,brand_id").order("name")).data ?? [],
  });

  const { data: allTrims = [] } = useQuery({
    queryKey: ["vehicle-trims"],
    queryFn: async () => (await supabase.from("vehicle_trims").select("id,name,model_id").order("name")).data ?? [],
  });

  const { data: colors = [] } = useQuery({
    queryKey: ["vehicle-colors"],
    queryFn: async () => (await supabase.from("vehicle_colors").select("id,name").order("name")).data ?? [],
  });

  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  // الإجماليات
  const subtotal = lines.reduce((s, l) => s + Math.max(0, l.unit_price * l.quantity - calcDiscountAmt(l)), 0);
  const totalDiscount = lines.reduce((s, l) => s + calcDiscountAmt(l), 0);
  const vat = lines.reduce((s, l) => {
    const base = Math.max(0, l.unit_price * l.quantity - calcDiscountAmt(l));
    return s + base * (l.vat_pct / 100);
  }, 0);
  const total = subtotal + vat;

  const save = async () => {
    if (!custId) { toast.error("اختر العميل"); return; }
    if (lines.some(l => !l.unit_price)) { toast.error("أدخل السعر لكل بند"); return; }
    setSaving(true);
    try {
      const cust = contacts.find(c => c.id === custId);
      const rep = reps.find(r => r.id === repId);
      const { data: qt, error } = await supabase.from("quotations").insert({
        customer_id: custId,
        customer_name: cust?.name,
        sales_rep_id: repId || null,
        sales_rep_name: rep?.name,
        branch: rep?.branch || null,
        status: "draft",
        valid_until: validUntil,
        subtotal,
        discount_amount: totalDiscount,
        vat_amount: vat,
        total,
        notes: notes || null,
      }).select().single();
      if (error) throw error;

      const { error: linesError } = await supabase.from("quotation_lines").insert(
        lines.map((l, idx) => {
          const discountAmt = calcDiscountAmt(l);
          const base = Math.max(0, l.unit_price * l.quantity - discountAmt);
          const desc = [l.brand, l.model, l.trim, l.year, l.color].filter(Boolean).join(" ") || l.description || "بند";
          return {
            quote_id: qt.id,
            line_no: idx + 1,
            description: desc,               // NOT NULL — لا نتركه فارغاً
            brand: l.brand || null,
            model: l.model || null,
            trim: l.trim || null,
            year: l.year || null,
            color: l.color || null,
            unit_price: l.unit_price,
            quantity: l.quantity,
            discount: discountAmt,           // نخزن القيمة الفعلية دائماً
            vat_pct: l.vat_pct,
            total: base * (1 + l.vat_pct / 100),
          };
        })
      );
      if (linesError) {
        await supabase.from("quotations").delete().eq("id", qt.id);
        throw new Error("فشل حفظ البنود: " + linesError.message);
      }
      toast.success("تم إنشاء عرض السعر");
      nav("/sales/quotations");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="عرض سعر جديد"
        actions={
          <Button variant="ghost" size="sm" onClick={() => nav("/sales/quotations")}>
            <ArrowRight className="h-4 w-4 ml-1" /> رجوع
          </Button>
        }
      />
      <div className="px-4 space-y-4 pb-8">

        {/* رأس العرض */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border border-border rounded-lg p-4 bg-card">
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">العميل *</Label>
            <Select value={custId} onValueChange={setCustId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
              <SelectContent>
                {contacts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} — {c.code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">المندوب</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر المندوب" /></SelectTrigger>
              <SelectContent>
                {reps.map((r: any) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">صالح حتى</Label>
            <Input type="date" className="h-9" value={validUntil} onChange={e => setValidUntil(e.target.value)} />
          </div>
        </div>

        {/* البنود */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 flex justify-between items-center border-b border-border">
            <span className="text-sm font-medium">بنود العرض</span>
            <Button size="sm" variant="outline" onClick={() => setLines(p => [...p, emptyLine()])}>
              <Plus className="h-3 w-3 ml-1" /> بند جديد
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border text-xs">
                <tr>
                  <th className="text-right px-2 py-2 w-6">#</th>
                  <th className="text-right px-2 py-2">الماركة</th>
                  <th className="text-right px-2 py-2">الموديل</th>
                  <th className="text-right px-2 py-2">الفئة</th>
                  <th className="text-right px-2 py-2 w-16">السنة</th>
                  <th className="text-right px-2 py-2">اللون</th>
                  <th className="text-right px-2 py-2 w-28">السعر</th>
                  <th className="text-right px-2 py-2 w-36">الخصم</th>
                  <th className="text-right px-2 py-2 w-16">VAT%</th>
                  <th className="text-right px-2 py-2 w-28">الإجمالي</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((l, i) => {
                  const filteredModels = (allModels as any[]).filter(m => m.brand_id === (brands as any[]).find(b => b.name === l.brand)?.id);
                  const filteredTrims = (allTrims as any[]).filter(t => t.model_id === (allModels as any[]).find(m => m.name === l.model)?.id);
                  const lineTotal = calcLineTotal(l);
                  const discAmt = calcDiscountAmt(l);
                  return (
                    <tr key={i} className="hover:bg-muted/10">
                      <td className="px-2 py-1 text-muted-foreground text-center text-xs">{i + 1}</td>
                      <td className="px-2 py-1 min-w-[110px]">
                        <Select value={l.brand} onValueChange={v => updateLine(i, { brand: v, model: "", trim: "" })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الماركة" /></SelectTrigger>
                          <SelectContent>{(brands as any[]).map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1 min-w-[110px]">
                        <Select value={l.model} onValueChange={v => updateLine(i, { model: v, trim: "" })} disabled={!l.brand}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الموديل" /></SelectTrigger>
                          <SelectContent>{filteredModels.map((m: any) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1 min-w-[90px]">
                        <Select value={l.trim} onValueChange={v => updateLine(i, { trim: v })} disabled={!l.model}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
                          <SelectContent>{filteredTrims.map((t: any) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8 text-xs w-16" type="number" value={l.year} onChange={e => updateLine(i, { year: Number(e.target.value) })} />
                      </td>
                      <td className="px-2 py-1 min-w-[90px]">
                        <Select value={l.color} onValueChange={v => updateLine(i, { color: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اللون" /></SelectTrigger>
                          <SelectContent>{(colors as any[]).map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1">
                        <Input className="h-8 text-xs w-28" type="number" inputMode="decimal"
                          value={l.unit_price || ""} placeholder="0" dir="ltr"
                          onChange={e => updateLine(i, { unit_price: Number(e.target.value) })} />
                      </td>
                      {/* الخصم مع زر تبديل ثابت/نسبة */}
                      <td className="px-2 py-1">
                        <div className="flex items-center gap-1">
                          <button type="button"
                            onClick={() => updateLine(i, { discount_type: l.discount_type === "fixed" ? "pct" : "fixed", discount: 0 })}
                            className={cn("h-8 w-8 flex items-center justify-center rounded border text-xs flex-shrink-0 transition-colors",
                              l.discount_type === "pct"
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-muted text-muted-foreground border-border"
                            )}
                            title={l.discount_type === "pct" ? "نسبة % - اضغط للتحويل لثابت" : "ثابت - اضغط للتحويل لنسبة"}>
                            {l.discount_type === "pct" ? <Percent className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                          </button>
                          <Input className="h-8 text-xs w-20" type="number" inputMode="decimal"
                            value={l.discount || ""} placeholder="0" dir="ltr"
                            onChange={e => updateLine(i, { discount: Number(e.target.value) })} />
                        </div>
                        {discAmt > 0 && l.discount_type === "pct" && (
                          <div className="text-[11.5px] text-muted-foreground px-1 mt-0.5">{fmtSAR(discAmt)} ر.س</div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <Select value={String(l.vat_pct)} onValueChange={v => updateLine(i, { vat_pct: Number(v) })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="15">15%</SelectItem>
                            <SelectItem value="0">0% معفي</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1 text-left font-medium text-xs font-mono">{fmtSAR(lineTotal)}</td>
                      <td className="px-2 py-1">
                        {lines.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                            onClick={() => setLines(p => p.filter((_, idx) => idx !== i))}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* الملاحظات والإجماليات */}
        <div className="flex justify-between gap-4">
          <div className="flex-1">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="mt-1" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات اختيارية..." />
          </div>
          <div className="w-72 border border-border rounded-lg p-3 bg-card space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>قبل الخصم</span>
              <span className="font-mono">{fmtSAR(lines.reduce((s,l)=>s+l.unit_price*l.quantity,0))} ر.س</span>
            </div>
            {totalDiscount > 0 && (
              <div className="flex justify-between text-red-600">
                <span>الخصم</span>
                <span className="font-mono">- {fmtSAR(totalDiscount)} ر.س</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground border-t border-border pt-1">
              <span>قبل الضريبة</span>
              <span className="font-mono">{fmtSAR(subtotal)} ر.س</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>ضريبة القيمة المضافة</span>
              <span className="font-mono">{fmtSAR(vat)} ر.س</span>
            </div>
            <div className="flex justify-between font-bold border-t border-border pt-1 text-base">
              <span>الإجمالي</span>
              <span className="font-mono">{fmtSAR(total)} ر.س</span>
            </div>
          </div>
        </div>

        {/* أزرار الحفظ */}
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={() => nav("/sales/quotations")}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="min-w-32">
            {saving ? "جاري الحفظ..." : "حفظ العرض"}
          </Button>
        </div>
      </div>
    </div>
  );
}
