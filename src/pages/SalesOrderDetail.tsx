import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Check, FileText, ArrowRight, Copy, User2, Phone, MapPin, Hash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ProductCombobox } from "@/components/erp/ProductCombobox";
import { WorkflowStepper } from "@/components/erp/WorkflowStepper";
import { ActionButton } from "@/components/erp/ActionButton";
import { RoleSwitcher } from "@/components/erp/RoleSwitcher";
import { canPerform, ErpRole, SalesOrderState, STATE_LABELS } from "@/lib/erpPermissions";
import { Banknote, Truck, XCircle, Printer } from "lucide-react";

interface Line {
  id?: string;
  line_no: number;
  vehicle_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;
  vat_pct: number;
  line_total: number;
}

const calcLine = (l: Line) => {
  const gross = l.quantity * l.unit_price;
  const afterDisc = gross * (1 - l.discount_pct / 100);
  return Number(afterDisc.toFixed(2));
};

export default function SalesOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<ErpRole>("sales_manager");

  const load = async () => {
    const [{ data: o }, { data: c }, { data: v }, { data: ls }] = await Promise.all([
      supabase.from("sales_orders").select("*, customers(name, vat_number)").eq("id", id).maybeSingle(),
      supabase.from("customers").select("id, name, code, vat_number, phone, city"),
      supabase.from("vehicles").select("id, name, brand, model, year, vin, sale_price, status").eq("status", "available"),
      supabase.from("sales_order_lines").select("*").eq("order_id", id).order("line_no"),
    ]);
    setOrder(o); setCustomers(c ?? []); setVehicles(v ?? []);
    setLines((ls ?? []).map((x: any) => ({ ...x, quantity: Number(x.quantity), unit_price: Number(x.unit_price), discount_pct: Number(x.discount_pct), vat_pct: Number(x.vat_pct), line_total: Number(x.line_total) })));
    setDeletedIds([]);
  };
  useEffect(() => { load(); }, [id]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + calcLine(l), 0);
    const vat = lines.reduce((s, l) => s + calcLine(l) * (l.vat_pct / 100), 0);
    return { subtotal: Number(subtotal.toFixed(2)), vat: Number(vat.toFixed(2)), total: Number((subtotal + vat).toFixed(2)) };
  }, [lines]);

  const updateLine = (i: number, patch: Partial<Line>) => {
    setLines(prev => {
      const next = [...prev];
      next[i] = { ...next[i], ...patch };
      next[i].line_total = calcLine(next[i]);
      return next;
    });
  };

  const onPickVehicle = (i: number, vid: string) => {
    // prevent duplicate vehicle within the same order
    if (lines.some((l, idx) => idx !== i && l.vehicle_id === vid)) {
      toast.error("هذه المركبة مُختارة بالفعل في بند آخر");
      return;
    }
    const v = vehicles.find(x => x.id === vid);
    if (!v) return;
    updateLine(i, { vehicle_id: vid, description: v.name, unit_price: Number(v.sale_price) });
  };

  const addLine = () => {
    setLines(prev => [...prev, {
      line_no: prev.length + 1, vehicle_id: null, description: "",
      quantity: 1, unit_price: 0, discount_pct: 0, vat_pct: 15, line_total: 0,
    }]);
  };

  const removeLine = (i: number) => {
    setLines(prev => {
      const target = prev[i];
      if (target?.id) setDeletedIds(d => [...d, target.id!]);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const duplicateLine = (i: number) => {
    setLines(prev => {
      const src = prev[i];
      if (!src) return prev;
      const copy: Line = {
        line_no: prev.length + 1,
        // do NOT copy vehicle_id (vehicle is unique per order)
        vehicle_id: null,
        description: src.description,
        quantity: src.quantity,
        unit_price: src.unit_price,
        discount_pct: src.discount_pct,
        vat_pct: src.vat_pct,
        line_total: src.line_total,
      };
      return [...prev, copy];
    });
  };

  const save = async () => {
    if (!order) return;
    setSaving(true);

    // 1) delete removed lines (only those that existed in DB)
    if (deletedIds.length) {
      const { error: delErr } = await supabase
        .from("sales_order_lines")
        .delete()
        .in("id", deletedIds);
      if (delErr) { toast.error(delErr.message); setSaving(false); return; }
    }

    // 2) upsert remaining lines — keep ids of existing, generate for new
    if (lines.length) {
      const payload = lines.map((l, idx) => ({
        ...(l.id ? { id: l.id } : {}),
        order_id: id,
        line_no: idx + 1,
        vehicle_id: l.vehicle_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount_pct: l.discount_pct,
        vat_pct: l.vat_pct,
        line_total: l.line_total,
      }));
      const { error: upErr } = await supabase
        .from("sales_order_lines")
        .upsert(payload, { onConflict: "id" });
      if (upErr) { toast.error(upErr.message); setSaving(false); return; }
    }

    // 3) update header
    const { error: hErr } = await supabase.from("sales_orders").update({
      subtotal: totals.subtotal, vat_amount: totals.vat, total: totals.total,
      customer_id: order.customer_id, notes: order.notes ?? null,
    }).eq("id", id);
    if (hErr) { toast.error(hErr.message); setSaving(false); return; }

    setSaving(false);
    toast.success("تم الحفظ");
    load();
  };

  const confirm = async () => {
    await save();
    const { error } = await supabase.from("sales_orders").update({ status: "confirmed" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تأكيد الأمر");
    load();
  };

  const generateInvoice = async () => {
    if (!order) return;
    const invNo = "INV-" + Date.now().toString().slice(-8);
    // simple ZATCA Phase 1 QR (Base64 TLV)
    const sellerName = "شركة ERP السعودية";
    const vatNum = "300000000000003";
    const tlv = (tag: number, val: string) => {
      const v = new TextEncoder().encode(val);
      return new Uint8Array([tag, v.length, ...v]);
    };
    const dt = new Date().toISOString();
    const parts = [
      tlv(1, sellerName), tlv(2, vatNum), tlv(3, dt),
      tlv(4, totals.total.toFixed(2)), tlv(5, totals.vat.toFixed(2))
    ];
    const full = new Uint8Array(parts.reduce((s,p)=>s+p.length,0));
    let off = 0; parts.forEach(p=>{ full.set(p, off); off += p.length; });
    const qr = btoa(String.fromCharCode(...full));

    const { data: inv, error } = await supabase.from("invoices").insert({
      invoice_no: invNo, customer_id: order.customer_id, sales_order_id: id,
      subtotal: totals.subtotal, vat_amount: totals.vat, total: totals.total,
      qr_code: qr, status: "draft",
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("invoice_lines").insert(
      lines.map((l, idx) => ({
        invoice_id: inv.id, line_no: idx + 1, description: l.description,
        quantity: l.quantity, unit_price: l.unit_price, vat_pct: l.vat_pct, line_total: l.line_total,
      }))
    );
    await supabase.from("sales_orders").update({ status: "invoiced" }).eq("id", id);
    toast.success("تم إنشاء الفاتورة");
    nav(`/invoices`);
  };

  if (!order) return <div className="text-muted-foreground">جاري التحميل...</div>;

  const isLocked = order.status !== "draft";

  return (
    <div>
      <PageHeader
        title={`أمر بيع ${order.order_no}`}
        subtitle={<></> as any}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={()=>nav("/sales-orders")}><ArrowRight className="h-4 w-4 ml-1" /> رجوع</Button>
            {!isLocked && <Button size="sm" variant="outline" onClick={save} disabled={saving}>حفظ</Button>}
            {!isLocked && <Button size="sm" onClick={confirm} disabled={saving}><Check className="h-4 w-4 ml-1" /> تأكيد</Button>}
            {order.status === "confirmed" && <Button size="sm" onClick={generateInvoice}><FileText className="h-4 w-4 ml-1" /> إصدار فاتورة</Button>}
          </div>
        }
      />

      {/* Workflow stepper */}
      <div className="bg-card border border-border rounded-lg p-3 mb-4">
        <WorkflowStepper
          steps={[
            { key: "draft", label: "مسودة" },
            { key: "confirmed", label: "مؤكَّد" },
            { key: "invoiced", label: "مفوتر" },
            { key: "delivered", label: "مُسلَّم" },
          ]}
          current={order.status === "delivered" ? "delivered" : order.status}
          cancelled={order.status === "cancelled"}
        />
      </div>

      {/* Header form */}
      <div className="bg-card border border-border rounded-lg p-4 mb-4">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-5">
            <Label className="text-xs text-muted-foreground">العميل</Label>
            <div className="mt-1">
              <ProductCombobox
                items={customers as any[]}
                value={order.customer_id}
                onChange={(cid) => setOrder({ ...order, customer_id: cid })}
                disabled={isLocked}
                placeholder="اختر عميلاً..."
                searchKeys={["name", "code", "vat_number", "phone"] as any}
                displayValue={(c: any) => c.name}
                columns={[
                  { key: "code", header: "الكود", className: "text-[11px]", render: (c: any) => <span dir="ltr" className="num">{c.code}</span> },
                  { key: "name", header: "العميل", className: "font-medium", render: (c: any) => <span>{c.name}</span> },
                  { key: "vat", header: "الرقم الضريبي", className: "text-[11px]", render: (c: any) => <span dir="ltr" className="num">{c.vat_number || "—"}</span> },
                  { key: "phone", header: "الجوال", className: "text-[11px]", render: (c: any) => <span dir="ltr" className="num">{c.phone || "—"}</span> },
                  { key: "city", header: "المدينة", render: (c: any) => <span className="text-muted-foreground">{c.city || "—"}</span> },
                ]}
              />
            </div>
            {/* Customer mini-card */}
            {(() => {
              const cust = customers.find((c: any) => c.id === order.customer_id);
              if (!cust) return null;
              return (
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded px-2 py-1.5 border border-border">
                  <div className="flex items-center gap-1 truncate"><Hash className="h-3 w-3 shrink-0" /><span dir="ltr" className="num truncate">{cust.vat_number || "بدون رقم ضريبي"}</span></div>
                  <div className="flex items-center gap-1 truncate"><Phone className="h-3 w-3 shrink-0" /><span dir="ltr" className="num truncate">{cust.phone || "—"}</span></div>
                  <div className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{cust.city || "—"}</span></div>
                </div>
              );
            })()}
          </div>

          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">رقم الأمر</Label>
            <Input value={order.order_no} disabled dir="ltr" className="mt-1 num" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">التاريخ</Label>
            <Input value={order.order_date} disabled dir="ltr" className="mt-1 num" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs text-muted-foreground">القسم</Label>
            <Input value={order.department_code === "vehicles" ? "المركبات" : order.department_code === "spare_parts" ? "قطع الغيار" : order.department_code} disabled className="mt-1" />
          </div>
          <div className="col-span-1">
            <Label className="text-xs text-muted-foreground">الحالة</Label>
            <div className="mt-2"><Badge variant="outline">{order.status}</Badge></div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="w-1/3">المنتج / الوصف</th>
              <th className="w-24">الكمية</th>
              <th className="w-32">السعر (ر.س)</th>
              <th className="w-20">خصم %</th>
              <th className="w-20">VAT %</th>
              <th className="w-32 text-left">المجموع</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-6">لا توجد بنود — أضف بنداً جديداً</td></tr>
            )}
            {lines.map((l, i) => {
              const onLastKey = (e: React.KeyboardEvent) => {
                if (e.key === "Enter" && !isLocked && i === lines.length - 1) {
                  e.preventDefault();
                  addLine();
                }
              };
              return (
              <tr key={l.id ?? `new-${i}`}>
                <td className="text-muted-foreground num w-10">{i+1}</td>
                <td>
                  <ProductCombobox
                    items={vehicles as any[]}
                    value={l.vehicle_id}
                    onChange={(vid) => onPickVehicle(i, vid)}
                    disabled={isLocked}
                    placeholder="اختر مركبة..."
                    searchKeys={["name","brand","model","vin","year"] as any}
                    displayValue={(v: any) => `${v.name} · ${v.year}`}
                    columns={[
                      { key: "name", header: "المركبة", className: "font-medium", render: (v: any) => <span>{v.name}</span> },
                      { key: "model", header: "الموديل", render: (v: any) => <span className="text-muted-foreground">{v.brand} {v.model}</span> },
                      { key: "year", header: "السنة", render: (v: any) => <span className="num">{v.year}</span> },
                      { key: "vin", header: "VIN", className: "text-[11px]", render: (v: any) => <span dir="ltr" className="num truncate">{v.vin || "—"}</span> },
                      { key: "price", header: "السعر", className: "text-left", render: (v: any) => <span className="num">{Number(v.sale_price).toLocaleString("ar-SA")}</span> },
                    ]}
                  />
                  {l.description && <div className="text-[11px] text-muted-foreground px-2 truncate">{l.description}</div>}
                </td>
                <td className="w-24"><input className="erp-input num text-left" type="number" value={l.quantity} onChange={e=>updateLine(i,{quantity:Number(e.target.value)})} disabled={isLocked} /></td>
                <td className="w-32"><input className="erp-input num text-left" type="number" value={l.unit_price} onChange={e=>updateLine(i,{unit_price:Number(e.target.value)})} disabled={isLocked} dir="ltr" /></td>
                <td className="w-20"><input className="erp-input num text-left" type="number" value={l.discount_pct} onChange={e=>updateLine(i,{discount_pct:Number(e.target.value)})} disabled={isLocked} /></td>
                <td className="w-20"><input className="erp-input num text-left" type="number" value={l.vat_pct} onChange={e=>updateLine(i,{vat_pct:Number(e.target.value)})} disabled={isLocked} onKeyDown={onLastKey} /></td>
                <td className="num text-left font-semibold w-32">{l.line_total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                <td className="w-20">
                  {!isLocked && (
                    <div className="flex items-center gap-0.5 justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="تكرار البند" onClick={()=>duplicateLine(i)}>
                        <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="حذف البند" onClick={()=>removeLine(i)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );})}
          </tbody>
        </table>
        {!isLocked && (
          <div className="p-2 border-t border-border bg-muted/30">
            <Button variant="ghost" size="sm" onClick={addLine}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <div className="bg-card border border-border rounded-lg p-4 w-80 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">المجموع قبل الضريبة</span><span className="num font-medium">{totals.subtotal.toLocaleString("ar-SA", {minimumFractionDigits:2})}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted-foreground">ضريبة القيمة المضافة (15%)</span><span className="num font-medium">{totals.vat.toLocaleString("ar-SA", {minimumFractionDigits:2})}</span></div>
          <div className="flex justify-between text-base pt-2 border-t border-border"><span className="font-semibold">الإجمالي</span><span className="num font-bold text-primary">{totals.total.toLocaleString("ar-SA", {minimumFractionDigits:2})} ر.س</span></div>
        </div>
      </div>
    </div>
  );
}
