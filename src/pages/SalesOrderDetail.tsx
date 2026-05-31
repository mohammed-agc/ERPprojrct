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
import { NumberCell } from "@/components/erp/master/NumberCell";
import { parseVehicleMeta } from "@/lib/vehicleMeta";
import { WorkflowStepper } from "@/components/erp/WorkflowStepper";
import { ActionButton } from "@/components/erp/ActionButton";
import { RoleSwitcher } from "@/components/erp/RoleSwitcher";
import { EmptyState } from "@/components/erp/EmptyState";
import { SalesOrderState, STATE_LABELS } from "@/lib/erpPermissions";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { useSalesActions } from "@/hooks/erp/useSalesActions";
import { Banknote, Truck, XCircle, Printer } from "lucide-react";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";

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

/** Derive identity (VIN, engine, trim, …) from a vehicle row (incl. notes meta). */
function vehicleIdentity(v: any) {
  const meta = parseVehicleMeta(v?.notes ?? null);
  return {
    vin: v?.vin || "",
    engine: meta.engine || "",
    chassis: meta.chassis || "",
    trim: meta.trim || "",
    manufacturer: v?.brand || "",
    model: v?.model || "",
    year: v?.year ?? "",
    color: v?.color || "",
  };
}

/** Compose the full VIN-bound description used on SO line, Invoice line, Delivery. */
function buildVehicleDescription(v: any): string {
  const id = vehicleIdentity(v);
  const head = [id.manufacturer, id.model, id.trim, id.year, id.color].filter(Boolean).join(" ");
  const tags: string[] = [];
  if (id.vin) tags.push(`VIN: ${id.vin}`);
  if (id.engine) tags.push(`المحرك: ${id.engine}`);
  return tags.length ? `${head}\n${tags.join(" · ")}` : (head || v?.name || "");
}

export default function SalesOrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [order, setOrder] = useState<any>(null);
  const [customers, setCustomers] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { role, setRole } = useErpSession();


  const load = async () => {
    const [{ data: o }, { data: c }, { data: v }, { data: ls }] = await Promise.all([
      supabase.from("sales_orders").select("*, customers(name, vat_number)").eq("id", id).maybeSingle(),
      supabase.from("customers").select("id, name, code, vat_number, phone, city"),
      supabase.from("vehicles").select("id, name, brand, model, year, vin, sale_price, status, color, notes").eq("status", "available"),
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
    if (!v.vin) {
      toast.error("لا يمكن إضافة مركبة بدون VIN — أكمل إدخال المخزون أولاً");
      return;
    }
    // Auto-build description: includes VIN + engine for full traceability
    const desc = buildVehicleDescription(v);
    updateLine(i, { vehicle_id: vid, description: desc, unit_price: Number(v.sale_price) });
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
    // Sanity check: every linked vehicle must still be sellable
    const conflicts = await salesVehicleStatus.assertAvailable(id!);
    if (conflicts.length) {
      toast.error(`بعض المركبات لم تعد متاحة: ${conflicts.join(", ")}`);
      return;
    }
    const { error } = await supabase.from("sales_orders").update({ status: "confirmed" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    // Reserve linked vehicles in inventory
    await salesVehicleStatus.reserveForOrder(id!);
    toast.success("تم تأكيد الأمر — تم حجز المركبات");
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

  const state = ((order?.status ?? "draft") as SalesOrderState);
  const { can } = useSalesActions(state);
  if (!order) return <div className="text-muted-foreground">جاري التحميل...</div>;

  const canEditHeader = can("edit_header").allowed;
  const canEditLines = can("edit_lines").allowed;

  const setStatus = async (next: SalesOrderState, msg: string) => {
    const { error } = await supabase.from("sales_orders").update({ status: next as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(msg);
    load();
  };

  const stateClass: Record<SalesOrderState, string> = {
    draft: "state-draft",
    confirmed: "state-confirmed",
    invoiced: "state-invoiced",
    paid: "state-paid",
    delivered: "state-delivered",
    cancelled: "state-cancelled",
  };

  return (
    <div>
      <PageHeader
        sticky
        title={`أمر بيع ${order.order_no}`}
        subtitle={
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className={`state-badge ${stateClass[state]}`}>{STATE_LABELS[state]}</span>
            <RoleSwitcher value={role} onChange={setRole} />
          </div>
        }
        actions={
          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            {/* Navigation group */}
            <div className="erp-action-group">
              <Button variant="ghost" size="sm" onClick={()=>nav("/sales-orders")}>
                <ArrowRight className="h-4 w-4 ml-1" /> رجوع
              </Button>
              <ActionButton size="sm" variant="ghost" permission={can("print")} hideIfDenied onClick={()=>window.print()}>
                <Printer className="h-4 w-4 ml-1" /> طباعة
              </ActionButton>
            </div>

            <span className="erp-action-divider" />

            {/* Persistence group */}
            <div className="erp-action-group">
              <ActionButton size="sm" variant="outline" permission={can("save")} onClick={save} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ"}
              </ActionButton>
            </div>

            <span className="erp-action-divider" />

            {/* Workflow progression group */}
            <div className="erp-action-group">
              <ActionButton size="sm" permission={can("confirm")} onClick={confirm} disabled={saving}>
                <Check className="h-4 w-4 ml-1" /> تأكيد
              </ActionButton>
              <ActionButton size="sm" permission={can("invoice")} onClick={generateInvoice}>
                <FileText className="h-4 w-4 ml-1" /> إصدار فاتورة
              </ActionButton>
              {/* Payment registration belongs to Accounting (Invoices screen).
                  Hidden from sales operational flow; visible only when the
                  current actor has the accounting permission. */}
              <ActionButton size="sm" permission={can("receive_payment")} hideIfDenied onClick={()=>setStatus("paid","تم تسجيل الدفعة")}>
                <Banknote className="h-4 w-4 ml-1" /> استلام دفعة
              </ActionButton>
              <ActionButton size="sm" permission={can("deliver")} onClick={()=>setStatus("delivered","تم التسليم")}>
                <Truck className="h-4 w-4 ml-1" /> تسليم
              </ActionButton>
            </div>

            {/* Destructive — separated, hidden when not allowed */}
            <ActionButton size="sm" variant="destructive" permission={can("cancel")} hideIfDenied onClick={()=>setStatus("cancelled","تم إلغاء الأمر")}>
              <XCircle className="h-4 w-4 ml-1" /> إلغاء
            </ActionButton>
          </div>
        }
      />

      {/* Workflow stepper */}
      <div className="bg-card border border-border rounded-lg p-2.5 mb-4">
        <WorkflowStepper
          steps={[
            { key: "draft", label: "مسودة" },
            { key: "confirmed", label: "مؤكَّد" },
            { key: "invoiced", label: "مفوتر" },
            { key: "paid", label: "مسدَّد" },
            { key: "delivered", label: "مُسلَّم" },
          ]}
          current={state}
          cancelled={state === "cancelled"}
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
                disabled={!canEditHeader}
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
            <div className="mt-2"><span className={`state-badge ${stateClass[state]}`}>{STATE_LABELS[state]}</span></div>
          </div>

        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden mb-4">
        <table className="erp-table text-[12px]">
          <thead>
            <tr>
              <th className="w-10">#</th>
              <th className="min-w-[360px]">المركبة (VIN · الصانع · الموديل · الفئة · السنة · اللون)</th>
              <th className="w-20">الكمية</th>
              <th className="w-32">السعر (ر.س)</th>
              <th className="w-20">خصم %</th>
              <th className="w-20">VAT %</th>
              <th className="w-32 text-left">المجموع</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <EmptyState
                inTable
                colSpan={8}
                title="لا توجد بنود"
                description="ابدأ بإضافة بند جديد لإنشاء أمر البيع."
                action={canEditLines ? (
                  <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-4 w-4 ml-1" /> إضافة بند</Button>
                ) : undefined}
              />
            )}

            {lines.map((l, i) => {
              const veh = vehicles.find(v => v.id === l.vehicle_id);
              return (
              <tr key={l.id ?? `new-${i}`}>
                <td className="text-muted-foreground num w-10 align-top pt-2">{i+1}</td>
                <td className="align-top">
                  <ProductCombobox
                    items={vehicles as any[]}
                    value={l.vehicle_id}
                    onChange={(vid) => onPickVehicle(i, vid)}
                    disabled={!canEditLines}
                    placeholder="اختر مركبة (VIN · الصانع · الموديل · السنة · اللون)..."
                    searchKeys={["name","brand","model","vin","year","color","notes"] as any}
                    displayValue={(v: any) => {
                      const id = vehicleIdentity(v);
                      const trimPart = id.trim ? ` ${id.trim}` : "";
                      const enginePart = id.engine ? ` · المحرك ${id.engine}` : "";
                      return `${id.vin || "بدون VIN"} · ${id.manufacturer} ${id.model}${trimPart} ${id.year}${id.color ? " · " + id.color : ""}${enginePart}`;
                    }}
                    columns={[
                      { key: "vin", header: "VIN", className: "text-[11px] font-mono", render: (v: any) => <span dir="ltr" className="num truncate">{v.vin || "—"}</span> },
                      { key: "engine", header: "المحرك", className: "text-[11px] font-mono", render: (v: any) => <span dir="ltr" className="num truncate">{vehicleIdentity(v).engine || "—"}</span> },
                      { key: "brand", header: "الصانع", className: "font-medium", render: (v: any) => <span>{v.brand}</span> },
                      { key: "model", header: "الموديل", render: (v: any) => <span>{v.model}{vehicleIdentity(v).trim ? <span className="text-muted-foreground"> · {vehicleIdentity(v).trim}</span> : null}</span> },
                      { key: "year", header: "السنة", render: (v: any) => <span className="num">{v.year}</span> },
                      { key: "color", header: "اللون", render: (v: any) => <span className="text-muted-foreground">{v.color || "—"}</span> },
                      { key: "price", header: "السعر", className: "text-left", render: (v: any) => <span className="num">{Number(v.sale_price).toLocaleString("ar-SA")}</span> },
                    ]}
                  />
                  {/* Vehicle identification chips — VIN-bound traceability */}
                  {veh && (() => {
                    const id = vehicleIdentity(veh);
                    return (
                      <div className="flex flex-wrap items-center gap-1 px-2 mt-1 text-[10.5px]">
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono" dir="ltr">VIN: {id.vin || "—"}</span>
                        {id.engine && <span className="px-1.5 py-0.5 rounded bg-success/10 text-success font-mono" dir="ltr">المحرك: {id.engine}</span>}
                        <span className="px-1.5 py-0.5 rounded bg-muted">الصانع: {id.manufacturer}</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted">الموديل: {id.model}</span>
                        {id.trim && <span className="px-1.5 py-0.5 rounded bg-muted">الفئة: {id.trim}</span>}
                        <span className="px-1.5 py-0.5 rounded bg-muted num">السنة: {id.year}</span>
                        {id.color && <span className="px-1.5 py-0.5 rounded bg-muted">اللون: {id.color}</span>}
                      </div>
                    );
                  })()}
                  {/* Editable auto-built description (multi-line — preserves VIN/engine for invoice) */}
                  <textarea
                    className="erp-input text-[11px] mt-1 w-full leading-snug"
                    rows={2}
                    value={l.description}
                    onChange={e => updateLine(i, { description: e.target.value })}
                    placeholder="الوصف — يُولَّد تلقائياً من المركبة (VIN + المحرك)، قابل للتعديل"
                    disabled={!canEditLines}
                  />
                </td>
                <td className="w-20 align-top">
                  <NumberCell value={l.quantity} onChange={v => updateLine(i, { quantity: v ?? 0 })} integer min={1} disabled={!canEditLines} />
                </td>
                <td className="w-32 align-top">
                  <NumberCell value={l.unit_price} onChange={v => updateLine(i, { unit_price: v ?? 0 })} currency min={0} disabled={!canEditLines} />
                </td>
                <td className="w-20 align-top">
                  <NumberCell value={l.discount_pct} onChange={v => updateLine(i, { discount_pct: v ?? 0 })} min={0} max={100} disabled={!canEditLines} />
                </td>
                <td className="w-20 align-top">
                  <NumberCell value={l.vat_pct} onChange={v => updateLine(i, { vat_pct: v ?? 0 })} min={0} max={100} disabled={!canEditLines} />
                </td>
                <td className="num text-left font-semibold w-32 align-top pt-2">{l.line_total.toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                <td className="w-20 align-top">
                  {canEditLines && (
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
        {canEditLines && (
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
