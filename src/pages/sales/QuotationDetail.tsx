import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowRight, CheckCircle, XCircle, ArrowLeftRight, Printer, Send, AlertTriangle, Pencil, Trash2, Plus, Save, Percent, Hash } from "lucide-react";
import { cn } from "@/lib/utils";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " ر.س";
const fmtN = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";
const norm = (s: any) => String(s ?? "").trim().toLowerCase();

const STATUS_MAP: Record<string, { label: string; variant: any }> = {
  draft:       { label: "مسودة",   variant: "secondary" },
  sent:        { label: "مُرسل",   variant: "default" },
  negotiating: { label: "تفاوض",  variant: "outline" },
  approved:    { label: "معتمدة",  variant: "default" },
  rejected:    { label: "مرفوضة", variant: "destructive" },
  expired:     { label: "منتهية", variant: "secondary" },
  converted:   { label: "محوّلة", variant: "outline" },
};

interface EditLine {
  id?: string;
  brand: string; model: string; trim: string;
  year: number; color: string;
  unit_price: number; quantity: number;
  discount: number; discount_type: "fixed" | "pct";
  vat_pct: number;
}

const discAmt = (l: EditLine) => l.discount_type === "pct" ? (l.unit_price * l.quantity) * (l.discount / 100) : l.discount;
const lineTotal = (l: EditLine) => Math.max(0, l.unit_price * l.quantity - discAmt(l)) * (1 + l.vat_pct / 100);

export default function QuotationDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [quote, setQuote] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState<any[] | null>(null);

  // edit mode
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState<EditLine[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // catalog
  const [brands, setBrands] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [trims, setTrims] = useState<any[]>([]);
  const [colors, setColors] = useState<any[]>([]);

  const load = async () => {
    if (!id) return;
    const [{ data: q }, { data: ls }, { data: b }, { data: m }, { data: t }, { data: c }] = await Promise.all([
      supabase.from("quotations").select("*, contact:contacts(name, vat_number, phone, phone2, whatsapp, city, national_id)").eq("id", id).maybeSingle(),
      supabase.from("quotation_lines").select("*").eq("quote_id", id).order("line_no"),
      supabase.from("vehicle_brands").select("id,name").order("name"),
      supabase.from("vehicle_models").select("id,name,brand_id").order("name"),
      supabase.from("vehicle_trims").select("id,name,model_id").order("name"),
      supabase.from("vehicle_colors").select("id,name").order("name"),
    ]);
    setQuote(q);
    setLines(ls ?? []);
    setBrands(b ?? []); setModels(m ?? []); setTrims(t ?? []); setColors(c ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, [id]);

  const updateStatus = async (status: string) => {
    setSaving(true);
    const { error } = await supabase.from("quotations").update({ status }).eq("id", id!);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setQuote((q: any) => ({ ...q, status }));
    const msgs: Record<string, string> = { sent: "تم تغيير الحالة إلى مُرسل", approved: "تم اعتماد العرض ✅", rejected: "تم رفض العرض" };
    toast.success(msgs[status] ?? "تم تحديث الحالة");
  };

  // ---------- EDIT MODE ----------
  const enterEdit = () => {
    setEditLines(lines.map(l => ({
      id: l.id, brand: l.brand || "", model: l.model || "", trim: l.trim || "",
      year: l.year || new Date().getFullYear(), color: l.color || "",
      unit_price: Number(l.unit_price), quantity: Number(l.quantity ?? 1),
      discount: Number(l.discount ?? 0), discount_type: "fixed", vat_pct: Number(l.vat_pct ?? 15),
    })));
    setDeletedIds([]);
    setEditing(true);
  };

  const updateEdit = (i: number, patch: Partial<EditLine>) =>
    setEditLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));

  const removeEdit = (i: number) =>
    setEditLines(prev => {
      const t = prev[i];
      if (t?.id) setDeletedIds(d => [...d, t.id!]);
      return prev.filter((_, idx) => idx !== i);
    });

  const addEdit = () => setEditLines(p => [...p, {
    brand: "", model: "", trim: "", year: new Date().getFullYear(), color: "",
    unit_price: 0, quantity: 1, discount: 0, discount_type: "fixed", vat_pct: 15,
  }]);

  const saveEdit = async () => {
    if (editLines.some(l => !l.unit_price)) { toast.error("أدخل السعر لكل بند"); return; }
    setSaving(true);
    try {
      if (deletedIds.length) {
        const { error } = await supabase.from("quotation_lines").delete().in("id", deletedIds);
        if (error) throw error;
      }
      const payload = editLines.map((l, idx) => {
        const d = discAmt(l);
        const base = Math.max(0, l.unit_price * l.quantity - d);
        return {
          ...(l.id ? { id: l.id } : {}),
          quote_id: id,
          line_no: idx + 1,
          description: [l.brand, l.model, l.trim, l.year, l.color].filter(Boolean).join(" ") || "بند",
          brand: l.brand || null, model: l.model || null, trim: l.trim || null,
          year: l.year || null, color: l.color || null,
          unit_price: l.unit_price, quantity: l.quantity,
          discount: d, vat_pct: l.vat_pct,
          total: base * (1 + l.vat_pct / 100),
        };
      });
      const { error: upErr } = await supabase.from("quotation_lines").upsert(payload, { onConflict: "id" });
      if (upErr) throw upErr;

      const subtotal = editLines.reduce((s, l) => s + Math.max(0, l.unit_price * l.quantity - discAmt(l)), 0);
      const totalDisc = editLines.reduce((s, l) => s + discAmt(l), 0);
      const vat = editLines.reduce((s, l) => s + Math.max(0, l.unit_price * l.quantity - discAmt(l)) * (l.vat_pct / 100), 0);
      const { error: hErr } = await supabase.from("quotations").update({
        subtotal, discount_amount: totalDisc, vat_amount: vat, total: subtotal + vat,
      }).eq("id", id!);
      if (hErr) throw hErr;

      toast.success("تم حفظ التعديلات");
      setEditing(false);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteQuote = async () => {
    setSaving(true);
    try {
      await supabase.from("quotation_lines").delete().eq("quote_id", id!);
      const { error } = await supabase.from("quotations").delete().eq("id", id!);
      if (error) throw error;
      toast.success("تم حذف العرض نهائياً");
      nav("/sales/quotations");
    } catch (e: any) {
      toast.error(e.message);
      setSaving(false);
    }
  };

  // ---------- CONVERT ----------
  const matchVehicle = (line: any, inv: any[], used: Set<string>) =>
    inv.find(v =>
      !used.has(v.id) && v.status === "active" &&
      norm(v.brand) === norm(line.brand) && norm(v.model) === norm(line.model) &&
      (!line.trim || norm(v.trim) === norm(line.trim)) &&
      (!line.year || Number(v.year) === Number(line.year)) &&
      (!line.color || norm(v.color) === norm(line.color))
    );

  const convert = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      const { data: inv } = await supabase.from("inventory_items")
        .select("id, brand, model, trim, year, color, status, sale_price").eq("status", "active");
      const used = new Set<string>();
      const matched: { line: any; vehicle: any }[] = [];
      const missing: any[] = [];
      for (const l of lines) {
        const v = matchVehicle(l, inv ?? [], used);
        if (v) { used.add(v.id); matched.push({ line: l, vehicle: v }); }
        else missing.push(l);
      }
      if (missing.length) { setUnavailable(missing); setSaving(false); return; }

      const orderNo = "SO-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random() * 9000) + 1000);
      const { data: so, error } = await supabase.from("sales_orders").insert({
        order_no: orderNo, quotation_id: id,
        customer_id: quote.customer_id, customer_name: quote.customer_name ?? quote.contact?.name,
        sales_rep_id: quote.sales_rep_id, sales_rep_name: quote.sales_rep_name,
        branch: quote.branch, department_code: "vehicles",
        subtotal: quote.subtotal, discount_amount: quote.discount_amount ?? 0,
        vat_amount: quote.vat_amount, total: quote.total, status: "draft",
      }).select().single();
      if (error) throw error;

      const { error: lErr } = await supabase.from("sales_order_lines").insert(
        matched.map(({ line, vehicle }, idx) => {
          const gross = Number(line.unit_price) * Number(line.quantity ?? 1);
          const dAmt = Number(line.discount ?? 0);                     // مبلغ الخصم من العرض (دقيق)
          const dPct = gross > 0 ? (dAmt / gross) * 100 : 0;
          return {
            order_id: so.id, line_no: idx + 1, vehicle_id: vehicle.id,
            description: line.description, quantity: line.quantity ?? 1, unit_price: line.unit_price,
            discount: dAmt,                                            // ✅ المبلغ الفعلي
            discount_pct: Number(dPct.toFixed(4)), vat_pct: line.vat_pct ?? 15,
            line_total: Number((gross - dAmt).toFixed(2)),
          };
        })
      );
      if (lErr) { await supabase.from("sales_orders").delete().eq("id", so.id); throw new Error("فشل نقل البنود: " + lErr.message); }

      await supabase.from("quotations").update({ status: "converted" }).eq("id", id!);
      toast.success("✅ تم تحويل العرض إلى أمر بيع");
      nav(`/sales-orders/${so.id}`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">جاري التحميل...</div>;
  if (!quote) return <div className="p-8 text-muted-foreground">العرض غير موجود</div>;

  const sm = STATUS_MAP[quote.status] ?? { label: quote.status, variant: "secondary" };
  const custName = quote.contact?.name ?? quote.customer_name ?? "—";
  const totalDiscount = Number(quote.discount_amount ?? 0);
  const canModify = !["converted"].includes(quote.status);   // تعديل/حذف متاح ما لم يُحوَّل

  return (
    <div dir="rtl">
      <PageHeader
        title={`عرض سعر ${quote.quote_no}`}
        subtitle={
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={sm.variant}>{sm.label}</Badge>
            <span className="text-xs text-muted-foreground">التاريخ: {fmtDate(quote.created_at)}</span>
            <span className="text-xs text-muted-foreground">صالح حتى: {fmtDate(quote.valid_until)}</span>
          </div>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {editing ? (
              <>
                <Button size="sm" onClick={saveEdit} disabled={saving}>
                  <Save className="h-4 w-4 ml-1" /> حفظ التعديلات
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>إلغاء التعديل</Button>
              </>
            ) : (
              <>
                {quote.status === "draft" && (
                  <Button size="sm" variant="outline" onClick={() => updateStatus("sent")} disabled={saving}>
                    <Send className="h-3.5 w-3.5 ml-1" /> إرسال للعميل
                  </Button>
                )}
                {["sent", "negotiating"].includes(quote.status) && (
                  <>
                    <Button size="sm" variant="outline" className="text-green-600 border-green-600" onClick={() => updateStatus("approved")} disabled={saving}>
                      <CheckCircle className="h-4 w-4 ml-1" /> اعتماد
                    </Button>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => updateStatus("rejected")} disabled={saving}>
                      <XCircle className="h-4 w-4 ml-1" /> رفض
                    </Button>
                  </>
                )}
                {quote.status === "approved" && (
                  <Button size="sm" onClick={convert} disabled={saving}>
                    <ArrowLeftRight className="h-4 w-4 ml-1" /> تحويل لأمر بيع
                  </Button>
                )}
                {canModify && (
                  <Button size="sm" variant="outline" onClick={enterEdit}>
                    <Pencil className="h-4 w-4 ml-1" /> تعديل
                  </Button>
                )}
                {canModify && (
                  <Button size="sm" variant="outline" className="text-destructive border-destructive" onClick={() => setConfirmDelete(true)}>
                    <Trash2 className="h-4 w-4 ml-1" /> حذف
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => window.open(`/print/quotations/${id}`, "_blank")}>
                  <Printer className="h-4 w-4 ml-1" /> طباعة / PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={() => nav("/sales/quotations")}>
                  <ArrowRight className="h-4 w-4 ml-1" /> رجوع
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="px-4 pb-8 space-y-4">
        {/* بطاقات العميل/المندوب/الملخص */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border border-border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">العميل</div>
            <div className="font-semibold text-base">{custName}</div>
            {quote.contact?.vat_number && <div className="text-xs text-muted-foreground mt-1">الرقم الضريبي: {quote.contact.vat_number}</div>}
            {quote.contact?.national_id && <div className="text-xs text-muted-foreground">الهوية: {quote.contact.national_id}</div>}
            {quote.contact?.phone && <div className="text-xs text-muted-foreground">{quote.contact.phone}</div>}
            {quote.contact?.city && <div className="text-xs text-muted-foreground">{quote.contact.city}</div>}
          </div>
          <div className="border border-border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">المندوب</div>
            <div className="font-semibold">{quote.sales_rep_name || "—"}</div>
            {quote.branch && <div className="text-xs text-muted-foreground">{quote.branch}</div>}
          </div>
          <div className="border border-border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium">ملخص مالي</div>
            <div className="space-y-1 text-sm">
              {totalDiscount > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground"><span>قبل الخصم</span><span className="font-mono">{fmtSAR(Number(quote.subtotal) + totalDiscount)}</span></div>
                  <div className="flex justify-between text-red-600"><span>الخصم</span><span className="font-mono">- {fmtSAR(totalDiscount)}</span></div>
                </>
              )}
              <div className="flex justify-between text-muted-foreground"><span>قبل الضريبة</span><span className="font-mono">{fmtSAR(Number(quote.subtotal))}</span></div>
              <div className="flex justify-between text-muted-foreground"><span>VAT</span><span className="font-mono">{fmtSAR(Number(quote.vat_amount))}</span></div>
              <div className="flex justify-between font-bold border-t border-border pt-1"><span>الإجمالي</span><span className="font-mono">{fmtSAR(Number(quote.total))}</span></div>
            </div>
          </div>
        </div>

        {/* جدول البنود — عرض أو تحرير */}
        <div className="border border-border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium">{editing ? "تعديل البنود" : "بنود العرض"}</span>
            {editing
              ? <Button size="sm" variant="outline" onClick={addEdit}><Plus className="h-3 w-3 ml-1" /> بند</Button>
              : <span className="text-xs text-muted-foreground">{lines.length} بند</span>}
          </div>

          {!editing ? (
            lines.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">لا توجد بنود</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b border-border">
                    <tr>
                      <th className="text-right px-3 py-2 font-medium w-8">#</th>
                      <th className="text-right px-3 py-2 font-medium">الوصف</th>
                      <th className="text-right px-3 py-2 font-medium w-16">السنة</th>
                      <th className="text-right px-3 py-2 font-medium">اللون</th>
                      <th className="text-right px-3 py-2 font-medium w-12">الكمية</th>
                      <th className="text-right px-3 py-2 font-medium">سعر الوحدة</th>
                      <th className="text-right px-3 py-2 font-medium">الخصم</th>
                      <th className="text-right px-3 py-2 font-medium w-14">VAT%</th>
                      <th className="text-right px-3 py-2 font-medium">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map(l => (
                      <tr key={l.id} className="hover:bg-muted/20">
                        <td className="px-3 py-2.5 text-muted-foreground text-xs">{l.line_no}</td>
                        <td className="px-3 py-2.5"><div className="font-medium">{[l.brand, l.model, l.trim].filter(Boolean).join(" ") || l.description}</div></td>
                        <td className="px-3 py-2.5 text-xs">{l.year || "—"}</td>
                        <td className="px-3 py-2.5 text-xs">{l.color || "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-center">{l.quantity ?? 1}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{fmtSAR(Number(l.unit_price))}</td>
                        <td className="px-3 py-2.5 text-xs text-red-600 font-mono">{Number(l.discount) > 0 ? `- ${fmtSAR(Number(l.discount))}` : "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-center">{l.vat_pct}%</td>
                        <td className="px-3 py-2.5 font-medium font-mono text-xs">{fmtSAR(Number(l.total))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 border-b border-border text-xs">
                  <tr>
                    <th className="px-2 py-2 w-6">#</th>
                    <th className="px-2 py-2 text-right">الماركة</th>
                    <th className="px-2 py-2 text-right">الموديل</th>
                    <th className="px-2 py-2 text-right">الفئة</th>
                    <th className="px-2 py-2 text-right w-16">السنة</th>
                    <th className="px-2 py-2 text-right">اللون</th>
                    <th className="px-2 py-2 text-right w-28">السعر</th>
                    <th className="px-2 py-2 text-right w-36">الخصم</th>
                    <th className="px-2 py-2 text-right w-16">VAT%</th>
                    <th className="px-2 py-2 text-right w-28">الإجمالي</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {editLines.map((l, i) => {
                    const fModels = models.filter((m: any) => m.brand_id === brands.find((b: any) => b.name === l.brand)?.id);
                    const fTrims = trims.filter((t: any) => t.model_id === models.find((m: any) => m.name === l.model)?.id);
                    return (
                      <tr key={i}>
                        <td className="px-2 py-1 text-center text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1 min-w-[110px]">
                          <Select value={l.brand} onValueChange={v => updateEdit(i, { brand: v, model: "", trim: "" })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الماركة" /></SelectTrigger>
                            <SelectContent>{brands.map((b: any) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1 min-w-[110px]">
                          <Select value={l.model} onValueChange={v => updateEdit(i, { model: v, trim: "" })} disabled={!l.brand}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الموديل" /></SelectTrigger>
                            <SelectContent>{fModels.map((m: any) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1 min-w-[90px]">
                          <Select value={l.trim} onValueChange={v => updateEdit(i, { trim: v })} disabled={!l.model}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
                            <SelectContent>{fTrims.map((t: any) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1"><Input className="h-8 text-xs w-16" type="number" value={l.year} onChange={e => updateEdit(i, { year: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1 min-w-[90px]">
                          <Select value={l.color} onValueChange={v => updateEdit(i, { color: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اللون" /></SelectTrigger>
                            <SelectContent>{colors.map((c: any) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1"><Input className="h-8 text-xs w-28" type="number" dir="ltr" value={l.unit_price || ""} onChange={e => updateEdit(i, { unit_price: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1">
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => updateEdit(i, { discount_type: l.discount_type === "fixed" ? "pct" : "fixed", discount: 0 })}
                              className={cn("h-8 w-8 flex items-center justify-center rounded border text-xs flex-shrink-0",
                                l.discount_type === "pct" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border")}>
                              {l.discount_type === "pct" ? <Percent className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                            </button>
                            <Input className="h-8 text-xs w-20" type="number" dir="ltr" value={l.discount || ""} onChange={e => updateEdit(i, { discount: Number(e.target.value) })} />
                          </div>
                        </td>
                        <td className="px-2 py-1">
                          <Select value={String(l.vat_pct)} onValueChange={v => updateEdit(i, { vat_pct: Number(v) })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="15">15%</SelectItem><SelectItem value="0">0%</SelectItem></SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-1 text-left font-mono text-xs">{fmtN(lineTotal(l))}</td>
                        <td className="px-2 py-1">
                          {editLines.length > 1 && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeEdit(i)}>
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
          )}
        </div>

        {quote.notes && !editing && (
          <div className="border border-border rounded-lg p-3 bg-muted/20 text-sm">
            <span className="font-medium text-foreground ml-2">ملاحظات:</span>
            <span className="text-muted-foreground">{quote.notes}</span>
          </div>
        )}
      </div>

      {/* حوار: منتجات غير متاحة */}
      <Dialog open={!!unavailable} onOpenChange={(o) => !o && setUnavailable(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> منتجات غير متاحة في المخزون
            </DialogTitle>
            <DialogDescription>لا يمكن تحويل العرض لأمر بيع لأن المركبات التالية غير موجودة أو غير متاحة للبيع حالياً:</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(unavailable ?? []).map((l, i) => (
              <div key={i} className="border border-destructive/30 bg-destructive/5 rounded-lg px-3 py-2 text-sm">
                <div className="font-medium">{[l.brand, l.model, l.trim].filter(Boolean).join(" ") || l.description}</div>
                <div className="text-xs text-muted-foreground">{[l.year && `السنة: ${l.year}`, l.color && `اللون: ${l.color}`].filter(Boolean).join(" · ")}</div>
              </div>
            ))}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => { setUnavailable(null); enterEdit(); }}>
              <Pencil className="h-4 w-4 ml-1" /> تعديل العرض
            </Button>
            <Button variant="destructive" onClick={async () => { setUnavailable(null); await updateStatus("rejected"); }}>
              <XCircle className="h-4 w-4 ml-1" /> إلغاء عرض السعر
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* تأكيد الحذف */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" /> حذف عرض السعر</DialogTitle>
            <DialogDescription>سيُحذف العرض {quote.quote_no} وكل بنوده نهائياً. لا يمكن التراجع.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>تراجع</Button>
            <Button variant="destructive" onClick={deleteQuote} disabled={saving}>نعم، احذف نهائياً</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
