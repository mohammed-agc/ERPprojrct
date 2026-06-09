import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ActionButton } from "@/components/erp/ActionButton";
import { useErpSession } from "@/contexts/ErpSessionContext";
import { canPerform } from "@/lib/erpPermissions";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";
import { toast } from "sonner";
import { Search, Truck, CheckCircle2, Printer, Eraser, PenLine, Car } from "lucide-react";

const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";
const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0 }) + " ر.س";
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

const CHECKLIST_ITEMS = [
  "أوراق الاستمارة (الرخصة)",
  "مفاتيح المركبة (عدد 2)",
  "الإطار الاحتياطي والعدّة",
  "دليل المالك وبطاقة الضمان",
  "سلامة الهيكل الخارجي",
  "نظافة المركبة الداخلية",
  "فحص الإطارات والأنوار",
  "شرح ميزات المركبة للعميل",
];

const FUEL_LEVELS = ["ممتلئ", "ثلاثة أرباع", "نصف", "ربع", "فارغ تقريباً"];

// ───────────── لوحة التوقيع ─────────────
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a1a";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); hasInk.current = true;
  };
  const end = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(hasInk.current ? canvasRef.current!.toDataURL("image/png") : null);
  };
  const clear = () => {
    const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    hasInk.current = false; onChange(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <Label className="text-xs flex items-center gap-1"><PenLine className="h-3 w-3" /> توقيع المستلِم *</Label>
        <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={clear}>
          <Eraser className="h-3 w-3 ml-1" /> مسح
        </Button>
      </div>
      <canvas
        ref={canvasRef} width={500} height={140}
        className="w-full border border-border rounded-md bg-white touch-none cursor-crosshair"
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
      />
    </div>
  );
}

export default function Deliveries() {
  const { role } = useErpSession();
  const [ready, setReady] = useState<any[]>([]);
  const [log, setLog] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  // delivery form
  const [formOrder, setFormOrder] = useState<any>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [fuel, setFuel] = useState("ممتلئ");
  const [odometer, setOdometer] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    // 1) أوامر جاهزة للتسليم: مدفوعة/مفوترة وغير مسلَّمة
    const { data: orders } = await supabase
      .from("sales_orders")
      .select("*, contact:contacts(name, phone, national_id)")
      .in("status", ["invoiced", "paid"])
      .order("created_at", { ascending: false });

    // 2) سجل التسليمات
    const { data: dels } = await supabase
      .from("deliveries")
      .select("*, contact:contacts(name), order:sales_orders(order_no)")
      .order("completed_date", { ascending: false });

    const deliveredOrderIds = new Set((dels ?? []).filter((d: any) => d.status === "completed").map((d: any) => d.order_id));
    const readyOrders = (orders ?? []).filter((o: any) => !deliveredOrderIds.has(o.id));

    // بنود كل أمر (الوصف + المركبة)
    const orderIds = readyOrders.map((o: any) => o.id);
    const linesByOrder: Record<string, any[]> = {};
    if (orderIds.length) {
      const { data: lns } = await supabase
        .from("sales_order_lines")
        .select("order_id, vehicle_id, description")
        .in("order_id", orderIds);
      (lns ?? []).forEach((l: any) => { (linesByOrder[l.order_id] ??= []).push(l); });
    }
    readyOrders.forEach((o: any) => { o._lines = linesByOrder[o.id] ?? []; });

    setReady(readyOrders);
    setLog(dels ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openForm = (order: any) => {
    setFormOrder(order);
    const init: Record<string, boolean> = {};
    CHECKLIST_ITEMS.forEach(i => { init[i] = true; });
    setChecks(init);
    setFuel("ممتلئ"); setOdometer(""); setNotes("");
    setRecipientName(order.contact?.name ?? order.customer_name ?? "");
    setRecipientId(order.contact?.national_id ?? "");
    setSignature(null);
  };

  const submitDelivery = async () => {
    if (!formOrder) return;
    if (!recipientName.trim()) { toast.error("اسم المستلِم مطلوب"); return; }
    if (!signature) { toast.error("توقيع المستلِم مطلوب"); return; }
    setSaving(true);
    try {
      const firstLine = formOrder._lines?.[0];
      const vehDesc = (formOrder._lines ?? []).map((l: any) => l.description).filter(Boolean).join(" | ") || null;
      const delNo = "DLV-" + Date.now().toString().slice(-8);
      const userId = (await supabase.auth.getUser()).data.user?.id;

      const checklistPayload = {
        items: checks,
        fuel_level: fuel,
        odometer: odometer || null,
        recipient_name: recipientName,
        recipient_id: recipientId || null,
        signature,                       // base64 PNG
        signed_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("deliveries").insert({
        delivery_no: delNo,
        order_id: formOrder.id,
        customer_id: formOrder.customer_id,
        customer_name: formOrder.contact?.name ?? formOrder.customer_name,
        vehicle_id: firstLine?.vehicle_id ?? null,
        vehicle_desc: vehDesc,
        branch: formOrder.branch ?? null,
        status: "completed",
        scheduled_date: new Date().toISOString().slice(0, 10),
        completed_date: new Date().toISOString().slice(0, 10),
        officer: null,
        checklist: checklistPayload,
        notes: notes || null,
        created_by: userId,
      });
      if (error) throw error;

      // المركبات → delivered (تخرج من المخزون المتاح)
      await salesVehicleStatus.markDeliveredForOrder(formOrder.id);
      // أمر البيع → delivered
      await supabase.from("sales_orders").update({ status: "delivered" }).eq("id", formOrder.id);

      toast.success("✅ تم تسليم المركبة وتسجيل سند التسليم");
      setFormOrder(null);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const printNote = (d: any) => {
    const cl = d.checklist || {};
    const items = cl.items || {};
    const itemsHTML = Object.keys(items).length
      ? Object.entries(items).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:center">${v ? "✓" : "✗"}</td></tr>`).join("")
      : `<tr><td colspan="2" style="text-align:center;color:#9ca3af">—</td></tr>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(d.delivery_no)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:30px 35px;color:#1a1a1a}
  table{border-collapse:collapse;width:100%;margin-bottom:16px}
  th,td{border:1px solid #e5e7eb;padding:7px 10px;text-align:right;font-size:12px}
  th{background:#0f766e;color:#fff}
  .header{display:flex;justify-content:space-between;border-bottom:3px solid #0f766e;padding-bottom:16px;margin-bottom:20px}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px;margin-bottom:16px}
  .grid div span{color:#6b7280}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:24px}
  @page{size:A4 portrait;margin:14mm}
</style></head><body>
  <div class="header">
    <div><div style="font-size:24px;font-weight:bold;color:#0f766e">سند تسليم مركبة</div><div style="color:#6b7280;font-size:13px">Vehicle Delivery Note</div></div>
    <div style="text-align:left">
      <div style="font-size:18px;font-weight:bold">${esc(d.delivery_no)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">التاريخ: ${fmtDate(d.completed_date)}</div>
      ${d.order?.order_no ? `<div style="font-size:12px;color:#6b7280">أمر البيع: ${esc(d.order.order_no)}</div>` : ""}
    </div>
  </div>
  <div class="grid">
    <div><span>العميل:</span> <b>${esc(d.customer_name || d.contact?.name || "—")}</b></div>
    <div><span>المستلِم:</span> <b>${esc(cl.recipient_name || "—")}</b></div>
    <div><span>المركبة:</span> <b>${esc(d.vehicle_desc || "—")}</b></div>
    <div><span>هوية المستلِم:</span> <b>${esc(cl.recipient_id || "—")}</b></div>
    <div><span>مستوى الوقود:</span> <b>${esc(cl.fuel_level || "—")}</b></div>
    <div><span>قراءة العداد:</span> <b>${esc(cl.odometer || "—")} كم</b></div>
  </div>
  <table>
    <thead><tr><th>بند الفحص عند التسليم</th><th style="width:60px;text-align:center">الحالة</th></tr></thead>
    <tbody>${itemsHTML}</tbody>
  </table>
  ${d.notes ? `<div style="background:#fefce8;border:1px solid #fde047;border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:16px"><b>ملاحظات:</b> ${esc(d.notes)}</div>` : ""}
  <div class="sign">
    <div style="text-align:center">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">توقيع المستلِم</div>
      ${cl.signature ? `<img src="${cl.signature}" style="max-height:90px;border-bottom:1px solid #9ca3af"/>` : `<div style="border-bottom:1px solid #9ca3af;height:90px"></div>`}
      <div style="font-size:11px;margin-top:4px">${esc(cl.recipient_name || "")}</div>
    </div>
    <div style="text-align:center">
      <div style="font-size:12px;color:#6b7280;margin-bottom:6px">ممثّل المعرض</div>
      <div style="border-bottom:1px solid #9ca3af;height:90px"></div>
    </div>
  </div>
  <div style="border-top:2px solid #e5e7eb;padding-top:12px;text-align:center;color:#9ca3af;font-size:11px;margin-top:24px">
    أرض المبارك للسيارات · جدة · المملكة العربية السعودية · أقرّ باستلام المركبة بحالتها الموضّحة أعلاه
  </div>
</body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("الرجاء السماح بالنوافذ المنبثقة"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  };

  const deliverPerm = canPerform("deliver", "paid" as any, role);

  const fReady = ready.filter(o => !q || o.order_no?.includes(q) || (o.contact?.name || o.customer_name || "").includes(q));
  const fLog = log.filter(d => !q || d.delivery_no?.includes(q) || (d.customer_name || "").includes(q) || (d.vehicle_desc || "").includes(q));

  return (
    <div dir="rtl">
      <PageHeader
        title="تنسيق التسليم"
        subtitle={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>جاهزة للتسليم: <b className="text-foreground">{ready.length}</b></span>
            <span>تم تسليمها: <b className="text-foreground">{log.filter(d => d.status === "completed").length}</b></span>
          </div>
        }
      />

      <div className="flex gap-2 px-4 pb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: رقم، عميل، مركبة..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {/* جاهزة للتسليم */}
      <div className="px-4 mb-6">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Truck className="h-4 w-4 text-primary" /> جاهزة للتسليم</h3>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : fReady.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-border rounded-lg text-sm">لا توجد أوامر جاهزة للتسليم (يجب أن تكون مفوترة أو مدفوعة)</div>
        ) : (
          <div className="space-y-2">
            {fReady.map(o => {
              const vehDesc = (o._lines ?? []).map((l: any) => l.description).filter(Boolean).join(" · ") || "—";
              return (
                <div key={o.id} className="border border-border rounded-lg p-3 bg-card flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-muted-foreground">{o.order_no}</span>
                      <Badge variant={o.status === "paid" ? "default" : "secondary"}>{o.status === "paid" ? "مدفوع" : "مفوتر"}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                      <div><div className="text-xs text-muted-foreground">العميل</div><div className="font-medium">{o.contact?.name ?? o.customer_name ?? "—"}</div></div>
                      <div className="md:col-span-2"><div className="text-xs text-muted-foreground">المركبة</div><div className="font-medium text-xs">{vehDesc}</div></div>
                    </div>
                  </div>
                  <ActionButton size="sm" permission={deliverPerm} hideIfDenied onClick={() => openForm(o)}>
                    <Truck className="h-3.5 w-3.5 ml-1" /> تسليم
                  </ActionButton>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* سجل التسليمات */}
      <div className="px-4">
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-green-600" /> سجل التسليمات</h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">رقم السند</th>
                <th className="text-right px-3 py-2 font-medium">أمر البيع</th>
                <th className="text-right px-3 py-2 font-medium">العميل / المستلِم</th>
                <th className="text-right px-3 py-2 font-medium">المركبة</th>
                <th className="text-right px-3 py-2 font-medium">التاريخ</th>
                <th className="text-right px-3 py-2 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {fLog.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-sm">لا توجد تسليمات مسجّلة</td></tr>
              ) : fLog.map(d => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{d.delivery_no}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{d.order?.order_no || "—"}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium text-xs">{d.customer_name || d.contact?.name || "—"}</div>
                    {d.checklist?.recipient_name && d.checklist.recipient_name !== (d.customer_name || d.contact?.name) && (
                      <div className="text-[10px] text-muted-foreground">المستلِم: {d.checklist.recipient_name}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{d.vehicle_desc || "—"}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(d.completed_date)}</td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="طباعة سند التسليم" onClick={() => printNote(d)}>
                      <Printer className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* نموذج التسليم */}
      <Dialog open={!!formOrder} onOpenChange={(o) => !o && setFormOrder(null)}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5 text-primary" /> نموذج تسليم مركبة</DialogTitle>
            <DialogDescription>
              {formOrder?.order_no} · {formOrder?.contact?.name ?? formOrder?.customer_name}
            </DialogDescription>
          </DialogHeader>

          {/* checklist */}
          <div>
            <Label className="text-xs font-semibold mb-1.5 block">قائمة الفحص عند التسليم</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {CHECKLIST_ITEMS.map(item => (
                <label key={item} className="flex items-center gap-2 text-sm border border-border rounded px-2 py-1.5 cursor-pointer hover:bg-muted/30">
                  <input type="checkbox" checked={checks[item] ?? false} onChange={e => setChecks(c => ({ ...c, [item]: e.target.checked }))} className="accent-primary" />
                  <span className="text-xs">{item}</span>
                </label>
              ))}
            </div>
          </div>

          {/* fuel + odometer */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">مستوى الوقود</Label>
              <Select value={fuel} onValueChange={setFuel}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{FUEL_LEVELS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">قراءة العداد (كم)</Label>
              <Input className="h-9 mt-1" type="number" dir="ltr" value={odometer} onChange={e => setOdometer(e.target.value)} placeholder="0" />
            </div>
          </div>

          {/* recipient */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">اسم المستلِم *</Label>
              <Input className="h-9 mt-1" value={recipientName} onChange={e => setRecipientName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">رقم هوية المستلِم</Label>
              <Input className="h-9 mt-1" dir="ltr" value={recipientId} onChange={e => setRecipientId(e.target.value)} />
            </div>
          </div>

          {/* signature */}
          <SignaturePad onChange={setSignature} />

          <div>
            <Label className="text-xs">ملاحظات</Label>
            <Textarea className="mt-1" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="أي ملاحظات على حالة المركبة عند التسليم..." />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setFormOrder(null)} disabled={saving}>إلغاء</Button>
            <Button onClick={submitDelivery} disabled={saving}>
              <CheckCircle2 className="h-4 w-4 ml-1" /> {saving ? "جاري التسليم..." : "تأكيد التسليم"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
