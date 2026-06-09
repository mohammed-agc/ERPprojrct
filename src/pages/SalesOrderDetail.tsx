import { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Check, FileText, ArrowRight, Copy, User2, Phone, MapPin, Hash, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
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
import { customerSettlementService } from "@/services/erp/customerSettlement";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSalesActions } from "@/hooks/erp/useSalesActions";
import { Banknote, Truck, XCircle, Printer, FileMinus } from "lucide-react";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";
import { creditNotesService } from "@/services/erp/creditNotes";
import { CreditGateBanner } from "@/components/erp/CreditGateBanner";

interface Line {
  id?: string;
  line_no: number;
  vehicle_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_pct: number;            // مشتقّ (للتوافق/العرض)
  discount_input: number;          // قيمة الإدخال (ثابت أو نسبة) — واجهة
  discount_type: "fixed" | "pct";  // نوع الخصم — واجهة
  vat_pct: number;
  line_total: number;
}

/** مبلغ الخصم الفعلي (مصدر الحقيقة) — دقيق بلا فقدان عند الثابت */
const discountAmount = (l: Pick<Line, "discount_input" | "discount_type" | "unit_price" | "quantity">): number => {
  const gross = l.unit_price * l.quantity;
  const amt = l.discount_type === "pct" ? gross * (l.discount_input / 100) : l.discount_input;
  return Number(Math.min(Math.max(0, amt), gross).toFixed(2));
};

/** النسبة المشتقّة من المبلغ (للتخزين في discount_pct فقط) */
const toDiscountPct = (l: Pick<Line, "discount_input" | "discount_type" | "unit_price" | "quantity">): number => {
  const gross = l.unit_price * l.quantity;
  return gross > 0 ? (discountAmount(l) / gross) * 100 : 0;
};

const calcLine = (l: Line) => {
  const gross = l.quantity * l.unit_price;
  const afterDisc = gross - discountAmount(l);
  return Number(Math.max(0, afterDisc).toFixed(2));
};

/** إجمالي البند شامل الضريبة (للعرض في عمود "المجموع") */
const lineGrand = (l: Line) => Number((calcLine(l) * (1 + l.vat_pct / 100)).toFixed(2));

const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2 });
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

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
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [gateWarnings, setGateWarnings] = useState<any[]>([]);

  const VEH_COLS = "id, name, brand, model, trim, year, color, notes, sku, vin, sale_price, cost_price, avg_cost, status, qty_on_hand, qty_reserved";

  const load = async () => {
    // نجلب بنود الأمر أولاً لمعرفة مركباته (حتى المحجوزة منها)
    const { data: ls } = await supabase
      .from("sales_order_lines").select("*").eq("order_id", id).order("line_no");
    const orderVehIds = (ls ?? []).map((x: any) => x.vehicle_id).filter(Boolean);

    const [{ data: o }, { data: c }, { data: vActive }, { data: vOrder }] = await Promise.all([
      supabase.from("sales_orders").select("*, contact:contacts(name, vat_number, phone, email)").eq("id", id).maybeSingle(),
      supabase.from("contacts").select("id, name, code, vat_number, phone, city").eq("is_customer", true).order("name"),
      // المتاح للاختيار في بنود جديدة
      supabase.from("inventory_items").select(VEH_COLS).eq("status", "active"),
      // مركبات هذا الأمر (قد تكون reserved/sold) لضمان ظهورها في العرض
      orderVehIds.length
        ? supabase.from("inventory_items").select(VEH_COLS).in("id", orderVehIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    // دمج القائمتين وإزالة التكرار
    const vmap = new Map<string, any>();
    [...(vActive ?? []), ...(vOrder ?? [])].forEach((v: any) => vmap.set(v.id, v));

    setOrder(o);
    setCustomers(c ?? []);
    setVehicles([...vmap.values()]);
    setLines((ls ?? []).map((x: any) => {
      const amt = Number(x.discount ?? 0);
      const pct = Number(x.discount_pct ?? 0);
      // المبلغ هو المصدر؛ إن لم يوجد نشتقّه من النسبة (بيانات قديمة/محوّلة)
      const gross = Number(x.unit_price) * Number(x.quantity);
      const hasAmt = amt > 0;
      const row: Line = {
        ...x,
        quantity: Number(x.quantity),
        unit_price: Number(x.unit_price),
        discount_pct: pct,
        discount_input: hasAmt ? amt : (pct > 0 ? Number((gross * pct / 100).toFixed(2)) : 0),
        discount_type: "fixed" as const,   // نعرضه دائماً كمبلغ (دقيق)
        vat_pct: Number(x.vat_pct ?? 15),
        line_total: 0,
      };
      row.line_total = lineGrand(row);     // إجمالي شامل الضريبة (يصحّح البيانات القديمة)
      return row;
    }));
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
      next[i].line_total = lineGrand(next[i]);
      return next;
    });
  };

  const onPickVehicle = (i: number, vid: string) => {
    if (lines.some((l, idx) => idx !== i && l.vehicle_id === vid)) {
      toast.error("هذه المركبة مُختارة بالفعل في بند آخر");
      return;
    }
    const v = vehicles.find(x => x.id === vid);
    if (!v) return;
    const desc = buildVehicleDescription(v);
    updateLine(i, { vehicle_id: vid, description: desc, unit_price: Number(v.sale_price) });
  };

  const addLine = () => {
    setLines(prev => [...prev, {
      line_no: prev.length + 1, vehicle_id: null, description: "",
      quantity: 1, unit_price: 0, discount_pct: 0, discount_input: 0, discount_type: "fixed", vat_pct: 15, line_total: 0,
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
        vehicle_id: null,
        description: src.description,
        quantity: src.quantity,
        unit_price: src.unit_price,
        discount_pct: src.discount_pct,
        discount_input: src.discount_input,
        discount_type: src.discount_type,
        vat_pct: src.vat_pct,
        line_total: src.line_total,
      };
      return [...prev, copy];
    });
  };

  const save = async () => {
    if (!order) return;
    setSaving(true);

    if (deletedIds.length) {
      const { error: delErr } = await supabase.from("sales_order_lines").delete().in("id", deletedIds);
      if (delErr) { toast.error(delErr.message); setSaving(false); return; }
    }

    if (lines.length) {
      const payload = lines.map((l, idx) => ({
        ...(l.id ? { id: l.id } : {}),
        order_id: id,
        line_no: idx + 1,
        vehicle_id: l.vehicle_id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: discountAmount(l),                       // ✅ المبلغ الفعلي (دقيق)
        discount_pct: Number(toDiscountPct(l).toFixed(4)),  // مشتقّ للتوافق
        vat_pct: l.vat_pct,
        line_total: l.line_total,
      }));
      const { error: upErr } = await supabase.from("sales_order_lines").upsert(payload, { onConflict: "id" });
      if (upErr) { toast.error(upErr.message); setSaving(false); return; }
    }

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
    // تحقق صارم قبل التأكيد
    if (!order?.customer_id) { toast.error("يجب اختيار العميل قبل تأكيد الأمر"); return; }
    if (lines.length === 0) { toast.error("لا يمكن تأكيد أمر بلا بنود — أضف منتجاً واحداً على الأقل"); return; }
    if (lines.some(l => !l.vehicle_id)) { toast.error("كل بند يجب أن يرتبط بمركبة من المخزون"); return; }
    // البوابة الائتمانية
    const gate = await customerSettlementService.checkCreditGate({
      customerId: order.customer_id, additionalExposure: totals.total,
    });
    setGateWarnings(gate.warnings ?? []);
    if (gate.blocked) { setOverrideOpen(true); return; }
    await doConfirm();
  };

  // التأكيد الفعلي (الحجز) — بعد اجتياز البوابة أو تجاوز مدير موثّق
  const doConfirm = async (override?: { reason: string }) => {
    const conflicts = await salesVehicleStatus.assertAvailable(id!);
    if (conflicts.length) {
      toast.error(`بعض المركبات لم تعد متاحة: ${conflicts.join("، ")}`);
      return;
    }
    const { error } = await supabase.from("sales_orders").update({ status: "confirmed" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    const res = await salesVehicleStatus.reserveForOrder(id!);
    if (res?.error) { toast.error("تعذّر حجز المركبات: " + res.error.message); return; }
    const custRec = customers.find((c: any) => c.id === order!.customer_id);
    await customerSettlementService.logGateDecision({
      customerId: order!.customer_id!,
      customerName: custRec?.name ?? null,
      customerCode: custRec?.code ?? null,
      documentType: "sales_order",
      documentId: id!, documentCode: order!.order_no,
      action: override ? "override" : "proceed",
      warnings: gateWarnings, additionalExposure: totals.total,
      reason: override?.reason ?? null,
      userRole: role,
    });
    if (override) {
      await supabase.from("sales_orders").update({
        notes: ((order!.notes ?? "") + `\n[تجاوز ائتماني] ${role}: ${override.reason}`).trim(),
      }).eq("id", id);
    }
    toast.success(override ? "تم التأكيد بتجاوز مدير موثّق — تم حجز المركبات" : "تم تأكيد الأمر — تم حجز المركبات فعلياً");
    setOverrideOpen(false); setOverrideReason("");
    load();
  };

  const generateInvoice = async () => {
    if (!order) return;
    const invNo = "INV-" + Date.now().toString().slice(-8);
    const sellerName = "أرض المبارك للسيارات";
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
    const full = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
    let off = 0; parts.forEach(p => { full.set(p, off); off += p.length; });
    const qr = btoa(String.fromCharCode(...full));

    const { data: inv, error } = await supabase.from("invoices").insert({
      invoice_no: invNo, customer_id: order.customer_id, sales_order_id: id,
      subtotal: totals.subtotal, vat_amount: totals.vat, total: totals.total,
      qr_code: qr, status: "issued",
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }

    const { error: lErr } = await supabase.from("invoice_lines").insert(
      lines.map((l, idx) => {
        const veh = vehicles.find(v => v.id === l.vehicle_id);
        const disc = discountAmount(l);                          // مبلغ الخصم الفعلي
        const base = Math.max(0, l.unit_price * l.quantity - disc);  // قبل الضريبة بعد الخصم
        const lineVat = Math.round(base * (l.vat_pct / 100) * 100) / 100;
        return {
          invoice_id: inv.id, line_no: idx + 1, description: l.description,
          quantity: l.quantity, unit_price: l.unit_price, vat_pct: l.vat_pct,
          discount: disc,                                        // ✅ ينتقل الخصم
          total: Number((base + lineVat).toFixed(2)),            // إجمالي البند شامل الضريبة
          vat_amount: lineVat,                                   // ضريبة على القاعدة بعد الخصم
          vin: veh?.vin ?? null, brand: veh?.brand ?? null, model: veh?.model ?? null,
          year: veh?.year ?? null, color: veh?.color ?? null,
        };
      })
    );
    if (lErr) { toast.error("فشل حفظ بنود الفاتورة: " + lErr.message); return; }

    await supabase.from("sales_orders").update({ status: "invoiced" }).eq("id", id);
    toast.success("تم إنشاء الفاتورة");
    nav(`/invoices`);
  };

  /** طباعة أمر البيع من نافذة مستقلة نظيفة (يحل الصفحة البيضاء + يتيح PDF). */
  const printOrder = () => {
    if (!order) return;
    const cust = customers.find((c: any) => c.id === order.customer_id) || order.contact || {};
    const linesHTML = lines.length
      ? lines.map((l, i) => {
          const discAmount = discountAmount(l);
          return `
        <tr style="background:${i % 2 === 0 ? "#fff" : "#f9fafb"}">
          <td style="text-align:center;color:#6b7280">${i + 1}</td>
          <td>${esc((l.description || "").replace(/\n/g, "<br>"))}</td>
          <td style="text-align:center">${l.quantity}</td>
          <td style="text-align:left;font-family:monospace">${fmtSAR(l.unit_price)} ر.س</td>
          <td style="text-align:left;font-family:monospace;color:${discAmount > 0 ? "#dc2626" : "#9ca3af"}">${discAmount > 0 ? "- " + fmtSAR(discAmount) + " ر.س" : "—"}</td>
          <td style="text-align:center">${l.vat_pct}%</td>
          <td style="text-align:left;font-family:monospace;font-weight:600">${fmtSAR(l.line_total)} ر.س</td>
        </tr>`;
        }).join("")
      : `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px">لا توجد بنود</td></tr>`;

    const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${esc(order.order_no)}</title>
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:30px 35px;color:#1a1a1a}
  table{border-collapse:collapse;width:100%}
  th,td{border:1px solid #e5e7eb;padding:7px 10px;text-align:right;font-size:12px}
  th{background:#0f766e;color:#fff}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #0f766e;padding-bottom:18px;margin-bottom:22px}
  .parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:22px}
  .box{padding:14px;border-radius:8px}
  .totals{width:300px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-right:auto}
  .trow{display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280}
  .grand{display:flex;justify-content:space-between;padding:12px 14px;background:#0f766e;color:#fff;font-weight:bold;font-size:15px}
  @page{size:A4 portrait;margin:12mm 14mm}
</style></head><body>
  <div class="header">
    <div><div style="font-size:26px;font-weight:bold;color:#0f766e">أمر بيع</div><div style="color:#6b7280;font-size:13px">Sales Order</div></div>
    <div style="text-align:left">
      <div style="font-size:20px;font-weight:bold">${esc(order.order_no)}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">التاريخ: ${fmtDate(order.order_date || order.created_at)}</div>
      <div style="font-size:12px;color:#6b7280">الحالة: ${esc(STATE_LABELS[(order.status ?? "draft") as SalesOrderState] || order.status)}</div>
    </div>
  </div>
  <div class="parties">
    <div class="box" style="background:#f0fdfa;border:1px solid #99f6e4">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">من / FROM</div>
      <div style="font-weight:bold;font-size:15px">أرض المبارك للسيارات</div>
      <div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: 300000000000003</div>
      <div style="font-size:12px;color:#374151">جدة، المملكة العربية السعودية</div>
    </div>
    <div class="box" style="background:#f9fafb;border:1px solid #e5e7eb">
      <div style="font-size:10px;color:#6b7280;font-weight:700;margin-bottom:8px">إلى / TO</div>
      <div style="font-weight:bold;font-size:15px">${esc(cust.name || "—")}</div>
      ${cust.vat_number ? `<div style="font-size:12px;color:#374151;margin-top:5px">الرقم الضريبي: ${esc(cust.vat_number)}</div>` : ""}
      ${cust.phone ? `<div style="font-size:12px;color:#374151">${esc(cust.phone)}</div>` : ""}
      ${cust.city ? `<div style="font-size:12px;color:#374151">${esc(cust.city)}</div>` : ""}
    </div>
  </div>
  <table style="margin-bottom:20px">
    <thead><tr>
      <th style="width:30px;text-align:center">#</th>
      <th>الوصف (VIN · الصانع · الموديل · السنة · اللون)</th>
      <th style="width:50px;text-align:center">الكمية</th>
      <th style="width:110px;text-align:left">السعر</th>
      <th style="width:90px;text-align:left">الخصم</th>
      <th style="width:50px;text-align:center">VAT%</th>
      <th style="width:120px;text-align:left">المجموع</th>
    </tr></thead>
    <tbody>${linesHTML}</tbody>
  </table>
  <div style="display:flex">
    <div class="totals">
      <div class="trow"><span>المجموع قبل الضريبة</span><span style="font-family:monospace">${fmtSAR(totals.subtotal)} ر.س</span></div>
      <div class="trow"><span>ضريبة القيمة المضافة (15%)</span><span style="font-family:monospace">${fmtSAR(totals.vat)} ر.س</span></div>
      <div class="grand"><span>الإجمالي</span><span style="font-family:monospace">${fmtSAR(totals.total)} ر.س</span></div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:30px;margin-top:40px">
    <div style="text-align:center"><div style="border-top:1px solid #9ca3af;padding-top:8px;margin-top:44px;font-size:12px;color:#6b7280">توقيع البائع</div></div>
    <div style="text-align:center"><div style="border-top:1px solid #9ca3af;padding-top:8px;margin-top:44px;font-size:12px;color:#6b7280">توقيع العميل</div></div>
  </div>
  <div style="border-top:2px solid #e5e7eb;padding-top:14px;text-align:center;color:#9ca3af;font-size:11px;margin-top:22px">
    أرض المبارك للسيارات · جدة · المملكة العربية السعودية
  </div>
</body></html>`;

    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { toast.error("الرجاء السماح بالنوافذ المنبثقة (Popups)"); return; }
    w.document.open(); w.document.write(html); w.document.close(); w.focus();
    setTimeout(() => w.print(), 500);
  };

  const state = ((order?.status ?? "draft") as SalesOrderState);
  const { can } = useSalesActions(state);
  if (!order) return <div className="text-muted-foreground">جاري التحميل...</div>;

  const canEditHeader = can("edit_header").allowed;
  const canEditLines = can("edit_lines").allowed;

  const setStatus = async (next: SalesOrderState, msg: string) => {
    if (next === "cancelled") {
      const { data: invs } = await supabase.from("invoices").select("id, status").eq("sales_order_id", id);
      const reversible = (invs ?? []).filter(i => ["posted", "partially_paid", "paid"].includes(i.status as string));
      try {
        for (const inv of reversible) {
          const cnId = await creditNotesService.issueFullReversal(inv.id, "sales_order_cancellation");
          if (cnId) toast.success("تم إصدار إشعار دائن لعكس قيمة الفاتورة");
        }
      } catch (e: any) {
        toast.error(e.message ?? "فشل إصدار إشعار الدائن");
        return;
      }
    }

    // منع التسليم قبل سداد الفاتورة بالكامل
    if (next === "delivered") {
      const { data: invs } = await supabase
        .from("invoices")
        .select("total, paid_amount, credited_amount, status")
        .eq("sales_order_id", id)
        .neq("status", "cancelled");
      if (!invs || invs.length === 0) {
        toast.error("لا يمكن التسليم: لا توجد فاتورة لهذا الأمر");
        return;
      }
      const allPaid = invs.every((i: any) =>
        Number(i.paid_amount ?? 0) >= Number(i.total) - Number(i.credited_amount ?? 0) - 0.01);
      if (!allPaid) {
        toast.error("لا يمكن تسليم السيارة قبل سداد الفاتورة بالكامل");
        return;
      }
    }

    const { error } = await supabase.from("sales_orders").update({ status: next as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (next === "paid")      await salesVehicleStatus.markSoldForOrder(id!);
    if (next === "delivered") await salesVehicleStatus.markDeliveredForOrder(id!);
    if (next === "cancelled") await salesVehicleStatus.releaseForOrder(id!);
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
            <div className="erp-action-group">
              <Button variant="ghost" size="sm" onClick={()=>nav("/sales-orders")}>
                <ArrowRight className="h-4 w-4 ml-1" /> رجوع
              </Button>
              <ActionButton size="sm" variant="ghost" permission={can("print")} hideIfDenied onClick={printOrder}>
                <Printer className="h-4 w-4 ml-1" /> طباعة / PDF
              </ActionButton>
              <Button variant="ghost" size="sm" onClick={()=>nav(`/sales/credit-notes?order_id=${id}`)}>
                <FileMinus className="h-4 w-4 ml-1" /> إشعارات دائنة
              </Button>
            </div>

            <span className="erp-action-divider" />

            <div className="erp-action-group">
              <ActionButton size="sm" variant="outline" permission={can("save")} onClick={save} disabled={saving}>
                {saving ? "جاري الحفظ..." : "حفظ"}
              </ActionButton>
            </div>

            <span className="erp-action-divider" />

            <div className="erp-action-group">
              <ActionButton size="sm" permission={can("confirm")} onClick={confirm} disabled={saving}>
                <Check className="h-4 w-4 ml-1" /> تأكيد
              </ActionButton>
              <ActionButton size="sm" permission={can("invoice")} onClick={generateInvoice}>
                <FileText className="h-4 w-4 ml-1" /> إصدار فاتورة
              </ActionButton>
              <ActionButton size="sm" permission={can("receive_payment")} hideIfDenied onClick={async()=>{ const { data: iv } = await supabase.from("invoices").select("id").eq("sales_order_id", id).limit(1).maybeSingle(); if (iv?.id) nav("/invoices/" + iv.id); else toast.error("أصدر فاتورة أولاً"); }}>
                <Banknote className="h-4 w-4 ml-1" /> عرض الفاتورة
              </ActionButton>
              <ActionButton size="sm" permission={can("deliver")} onClick={()=>setStatus("delivered","تم التسليم")}>
                <Truck className="h-4 w-4 ml-1" /> تسليم
              </ActionButton>
            </div>

            <ActionButton size="sm" variant="destructive" permission={can("cancel")} hideIfDenied onClick={()=>setStatus("cancelled","تم إلغاء الأمر")}>
              <XCircle className="h-4 w-4 ml-1" /> إلغاء
            </ActionButton>
          </div>
        }
      />

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

      {order.customer_id && (
        <CreditGateBanner
          customerId={order.customer_id}
          additionalExposure={Number(order.total ?? 0)}
          documentType="sales_order"
          documentId={id}
          documentCode={order.order_no}
        />
      )}

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
              <th className="w-32">الخصم</th>
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
                    disabled={!canEditLines || !!l.description}
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
                  {veh && (() => {
                    const idv = vehicleIdentity(veh);
                    return (
                      <div className="flex flex-wrap items-center gap-1 px-2 mt-1 text-[10.5px]">
                        <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono" dir="ltr">VIN: {idv.vin || "—"}</span>
                        {idv.engine && <span className="px-1.5 py-0.5 rounded bg-success/10 text-success font-mono" dir="ltr">المحرك: {idv.engine}</span>}
                        <span className="px-1.5 py-0.5 rounded bg-muted">الصانع: {idv.manufacturer}</span>
                        <span className="px-1.5 py-0.5 rounded bg-muted">الموديل: {idv.model}</span>
                        {idv.trim && <span className="px-1.5 py-0.5 rounded bg-muted">الفئة: {idv.trim}</span>}
                        <span className="px-1.5 py-0.5 rounded bg-muted num">السنة: {idv.year}</span>
                        {idv.color && <span className="px-1.5 py-0.5 rounded bg-muted">اللون: {idv.color}</span>}
                      </div>
                    );
                  })()}
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
                <td className="w-32 align-top">
                  <div className="flex items-center gap-1">
                    <button type="button" disabled={!canEditLines}
                      onClick={() => updateLine(i, { discount_type: l.discount_type === "fixed" ? "pct" : "fixed", discount_input: 0 })}
                      className={cn("h-8 w-7 flex items-center justify-center rounded border text-xs flex-shrink-0 transition-colors disabled:opacity-50",
                        l.discount_type === "pct" ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border")}
                      title={l.discount_type === "pct" ? "نسبة % — اضغط لتحويل لثابت" : "ثابت — اضغط لتحويل لنسبة"}>
                      {l.discount_type === "pct" ? <Percent className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                    </button>
                    <NumberCell value={l.discount_input} onChange={v => updateLine(i, { discount_input: v ?? 0 })} min={0} disabled={!canEditLines} />
                  </div>
                  {l.discount_type === "pct" && l.discount_input > 0 && (
                    <div className="text-[10px] text-muted-foreground px-1 mt-0.5">
                      {discountAmount(l).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                    </div>
                  )}
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

      {/* نافذة تجاوز البوابة الائتمانية (موثّقة) */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-destructive">حظر ائتماني — يتطلب تجاوز مدير</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="bg-destructive/5 border border-destructive/30 rounded p-3 text-sm space-y-1">
              {gateWarnings.map((w, i) => (<div key={i} className="text-destructive">• {w.message}</div>))}
            </div>
            {role === "admin" ? (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">سبب التجاوز (إلزامي للتوثيق)</label>
                  <Textarea className="mt-1" rows={3} value={overrideReason}
                    onChange={e => setOverrideReason(e.target.value)}
                    placeholder="مثال: العميل سدّد نقداً خارج النظام / موافقة إدارة عليا..." />
                </div>
                <p className="text-[11px] text-muted-foreground">سيُسجّل هذا القرار في سجل التدقيق باسمك وتاريخه.</p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground bg-muted/40 rounded p-3">
                لا تملك صلاحية تجاوز الحظر الائتماني. يلزم سداد المديونية أو تجاوز من مدير المبيعات.
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setOverrideOpen(false); setOverrideReason(""); }}>إلغاء</Button>
            {role === "admin" && (
              <Button variant="destructive" onClick={() => {
                if (!overrideReason.trim()) { toast.error("سبب التجاوز مطلوب"); return; }
                doConfirm({ reason: overrideReason.trim() });
              }}>تجاوز وتأكيد</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}