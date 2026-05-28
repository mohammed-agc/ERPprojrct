import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight, Car, Tag, Wrench, Truck, ShoppingCart, ArrowDownToLine, RotateCcw,
  Image as ImageIcon, FileText, Upload, X, AlertTriangle, BookmarkPlus, BookmarkX, Settings2, Trash2,
  ClipboardCheck, UserCheck, PackageCheck, KeyRound, ShieldCheck,
} from "lucide-react";
import {
  parseVehicleMeta, serializeVehicleMeta, reservationDaysLeft, effectiveStatus, deliveryProgress,
  DELIVERY_CHECKLIST_KEYS, DeliveryChecklistKey, VehicleMeta, EffectiveStatus,
} from "@/lib/vehicleMeta";
import {
  VEHICLE_STATUS_LABEL, VEHICLE_STATUS_CLASS, OVERLAY_STATUSES,
} from "@/lib/vehicleStatus";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

const MEDIA_BUCKET = "vehicle-media";

const fmtDateTime = (s?: string) =>
  s ? new Date(s).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "—";
const fmtDate = (s?: string) =>
  s ? new Date(s).toLocaleDateString("ar-SA", { dateStyle: "medium" }) : "—";

type TimelineEvent = {
  type: "purchase" | "reservation" | "release" | "sale" | "ready" | "delivery" | "transfer" | "maintenance" | "return" | "ownership";
  label: string;
  at: string;
  detail?: string;
  icon: any;
  tone: "default" | "success" | "warning" | "primary" | "destructive";
};

const CHECKLIST_LABEL: Record<DeliveryChecklistKey, string> = {
  payment: "تحقق الدفع",
  id: "تحقق الهوية",
  insurance: "إكمال التأمين",
  registration: "إكمال الاستمارة",
  accessories: "تسليم الإكسسوارات",
  spare_key: "تسليم المفتاح الاحتياطي",
  inspection: "إنهاء الفحص",
};

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { profile } = useAuth();
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserveOpen, setReserveOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: v }, { data: ls }] = await Promise.all([
      supabase.from("vehicles").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("sales_order_lines")
        .select("*, sales_orders(id, order_no, order_date, status, customer_id, customers(name, code))")
        .eq("vehicle_id", id),
    ]);
    setVehicle(v);
    setLines(ls ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const meta = useMemo<VehicleMeta>(() => parseVehicleMeta(vehicle?.notes), [vehicle?.notes]);
  const eff = useMemo<EffectiveStatus>(
    () => (vehicle ? effectiveStatus(vehicle.status, meta) : "available"),
    [vehicle, meta],
  );
  const daysLeft = useMemo(() => reservationDaysLeft(meta), [meta]);

  const activeLine = useMemo(() => {
    if (!lines.length) return null;
    const sorted = [...lines]
      .filter((l) => l.sales_orders?.status !== "cancelled")
      .sort((a, b) => (b.sales_orders?.order_date ?? "").localeCompare(a.sales_orders?.order_date ?? ""));
    return sorted[0] ?? lines[0];
  }, [lines]);
  const linkedOrder = activeLine?.sales_orders;
  const linkedCustomer = linkedOrder?.customers;

  const timeline = useMemo<TimelineEvent[]>(() => {
    const events: TimelineEvent[] = [];
    if (vehicle?.created_at) {
      events.push({
        type: "purchase", label: "إضافة للمخزون", at: vehicle.created_at,
        detail: meta.supplier ? `المورد: ${meta.supplier}` : undefined,
        icon: ArrowDownToLine, tone: "default",
      });
    }
    if (meta.reservation?.created_at) {
      events.push({
        type: "reservation", label: "حجز يدوي",
        at: meta.reservation.created_at,
        detail: `${meta.reservation.customer_name ?? "—"}${meta.reservation.reserved_by ? ` · بواسطة ${meta.reservation.reserved_by}` : ""}`,
        icon: BookmarkPlus, tone: "warning",
      });
    }
    if (meta.status_overlay_at && meta.status_overlay) {
      const labels: Record<string, { l: string; tone: TimelineEvent["tone"]; icon: any; type: TimelineEvent["type"] }> = {
        ready_for_delivery: { l: "تحضير للتسليم", tone: "primary",     icon: ClipboardCheck, type: "ready" },
        delivered:          { l: "تسليم للعميل",  tone: "success",     icon: Truck,          type: "delivery" },
        maintenance:        { l: "دخول الصيانة",  tone: "warning",     icon: Wrench,         type: "maintenance" },
        transit:            { l: "حركة ترانزيت",  tone: "primary",     icon: Truck,          type: "transfer" },
        returned:           { l: "ارتجاع",        tone: "destructive", icon: RotateCcw,      type: "return" },
      };
      const info = labels[meta.status_overlay];
      if (info) events.push({
        type: info.type, label: info.l, at: meta.status_overlay_at,
        detail: [meta.status_overlay_by, meta.status_overlay_note].filter(Boolean).join(" — "),
        icon: info.icon, tone: info.tone,
      });
    }
    if (meta.delivery?.ready_at) {
      events.push({
        type: "ready", label: "جاهز للتسليم", at: meta.delivery.ready_at,
        detail: [meta.delivery.officer && `الموظف: ${meta.delivery.officer}`, meta.delivery.invoice_no && `فاتورة ${meta.delivery.invoice_no}`].filter(Boolean).join(" · "),
        icon: ClipboardCheck, tone: "primary",
      });
    }
    if (meta.delivery?.delivered_at) {
      events.push({
        type: "delivery", label: "تم التسليم للعميل", at: meta.delivery.delivered_at,
        detail: [meta.delivery.customer_name, meta.delivery.delivered_by && `بواسطة ${meta.delivery.delivered_by}`].filter(Boolean).join(" · "),
        icon: Truck, tone: "success",
      });
    }
    if (meta.ownership?.transferred_at) {
      events.push({
        type: "ownership", label: "نقل الملكية", at: meta.ownership.transferred_at,
        detail: `${meta.ownership.previous_owner ?? "—"} → ${meta.ownership.current_owner ?? "—"}`,
        icon: UserCheck, tone: "success",
      });
    }
    lines.forEach((l) => {
      const so = l.sales_orders;
      if (!so) return;
      const cust = so.customers?.name ?? "عميل";
      if (so.status === "draft" || so.status === "confirmed") {
        events.push({
          type: "reservation", label: "حجز من أمر بيع", at: so.order_date,
          detail: `${cust} · أمر ${so.order_no}`, icon: ShoppingCart, tone: "warning",
        });
      }
      if (so.status === "confirmed" || so.status === "invoiced") {
        events.push({
          type: "sale", label: "تأكيد البيع", at: so.order_date,
          detail: `${cust} · أمر ${so.order_no}`, icon: Tag, tone: "primary",
        });
      }
      if (so.status === "invoiced") {
        events.push({
          type: "delivery", label: "جاهز للتسليم", at: so.order_date,
          detail: `أمر ${so.order_no}`, icon: Truck, tone: "success",
        });
      }
      if (so.status === "cancelled") {
        events.push({
          type: "return", label: "إلغاء أمر البيع", at: so.order_date,
          detail: `أمر ${so.order_no}`, icon: RotateCcw, tone: "destructive",
        });
      }
    });
    return events.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [lines, vehicle, meta]);

  /** Persist a meta patch, optionally toggling the DB status. */
  const patchMeta = async (
    patch: Partial<VehicleMeta>,
    dbStatus?: "available" | "reserved" | "sold",
  ) => {
    if (!vehicle) return;
    const next: VehicleMeta = { ...meta, ...patch };
    const payload: any = { notes: serializeVehicleMeta(next) || null };
    if (dbStatus) payload.status = dbStatus;
    const { error } = await supabase.from("vehicles").update(payload).eq("id", vehicle.id);
    if (error) { toast.error(error.message); return false; }
    await load();
    return true;
  };

  const onUploadPhotos = async (files: FileList | null) => {
    if (!files?.length || !vehicle) return;
    const urls: string[] = [];
    for (const f of Array.from(files)) {
      const path = `${vehicle.id}/photos/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, f, { upsert: false });
      if (error) { toast.error(`فشل رفع ${f.name}: ${error.message}`); continue; }
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    if (urls.length) {
      await patchMeta({ photos: [...(meta.photos ?? []), ...urls] });
      toast.success(`تم رفع ${urls.length} صورة`);
    }
  };

  const onUploadDocs = async (files: FileList | null) => {
    if (!files?.length || !vehicle) return;
    const added: NonNullable<VehicleMeta["documents"]> = [];
    for (const f of Array.from(files)) {
      const path = `${vehicle.id}/docs/${Date.now()}-${f.name}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, f, { upsert: false });
      if (error) { toast.error(`فشل رفع ${f.name}: ${error.message}`); continue; }
      const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
      added.push({ name: f.name, url: data.publicUrl, size: f.size, type: f.type });
    }
    if (added.length) {
      await patchMeta({ documents: [...(meta.documents ?? []), ...added] });
      toast.success(`تم رفع ${added.length} مستند`);
    }
  };

  const removePhoto = async (url: string) => {
    await patchMeta({ photos: (meta.photos ?? []).filter((p) => p !== url) });
  };
  const removeDoc = async (url: string) => {
    await patchMeta({ documents: (meta.documents ?? []).filter((d) => d.url !== url) });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  if (!vehicle) {
    return (
      <div className="p-6">
        <Button variant="ghost" size="sm" onClick={()=>nav("/vehicles")}>
          <ArrowRight className="h-4 w-4 ml-1" /> رجوع
        </Button>
        <div className="mt-4 text-sm text-muted-foreground">المركبة غير موجودة.</div>
      </div>
    );
  }

  const isReserved = eff === "reserved";
  const expired = daysLeft !== null && daysLeft < 0;
  const expiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

  return (
    <div>
      <PageHeader
        title={vehicle.name}
        subtitle={
          <span className="flex items-center gap-2 text-xs">
            <span className="font-mono">{vehicle.code}</span>
            <span className="text-muted-foreground">·</span>
            <span>{vehicle.brand} {vehicle.model}{meta.trim ? ` · ${meta.trim}` : ""}</span>
            <span className="text-muted-foreground">·</span>
            <span>{vehicle.year}</span>
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Badge className={VEHICLE_STATUS_CLASS[eff]}>{VEHICLE_STATUS_LABEL[eff]}</Badge>
            {isReserved ? (
              <Button size="sm" variant="outline" onClick={() => setReserveOpen(true)}>
                <BookmarkX className="h-4 w-4 ml-1" /> تعديل/تحرير الحجز
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setReserveOpen(true)} disabled={eff === "sold" || eff === "delivered"}>
                <BookmarkPlus className="h-4 w-4 ml-1" /> حجز
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>
              <Settings2 className="h-4 w-4 ml-1" /> تغيير الحالة
            </Button>
            <Button
              size="sm"
              onClick={() => setDeliveryOpen(true)}
              disabled={eff === "available" || eff === "returned"}
            >
              <Truck className="h-4 w-4 ml-1" /> التسليم
            </Button>
            <Button variant="ghost" size="sm" onClick={()=>nav("/vehicles")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        }
      />

      {/* Reservation banner */}
      {isReserved && (expired || expiringSoon) && (
        <div className={`mb-3 rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${
          expired ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-warning/40 bg-warning/10 text-warning"
        }`}>
          <AlertTriangle className="h-4 w-4" />
          {expired
            ? `انتهى الحجز منذ ${Math.abs(daysLeft!)} يوم — يجب تحريره أو تمديده.`
            : `الحجز ينتهي خلال ${daysLeft} يوم.`}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left col */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" /> المواصفات
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-3 gap-x-4 text-sm">
              <Spec label="VIN" value={vehicle.vin} mono />
              <Spec label="رقم الهيكل" value={meta.chassis} mono />
              <Spec label="رقم المحرك" value={meta.engine} mono />
              <Spec label="السنة" value={vehicle.year} />
              <Spec label="اللون" value={vehicle.color} />
              <Spec label="الفئة" value={meta.trim} />
              <Spec label="ناقل الحركة" value={transmissionLabel(meta.transmission)} />
              <Spec label="نوع الوقود" value={fuelLabel(meta.fuel_type)} />
              <Spec label="الممشى (كم)" value={vehicle.mileage?.toLocaleString("ar-SA")} />
              <Spec label="الفرع" value={meta.branch} />
              <Spec label="المورد" value={meta.supplier} />
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-primary" /> التسعير
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <PriceCell label="التكلفة" value={vehicle.cost_price} />
              <PriceCell label="سعر البيع" value={vehicle.sale_price} highlight />
              <PriceCell label="الهامش" value={Number(vehicle.sale_price) - Number(vehicle.cost_price)} />
            </div>
          </Card>

          {/* Photos */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-primary" /> معرض الصور
                <span className="text-xs text-muted-foreground">({(meta.photos ?? []).length})</span>
              </div>
              <div>
                <input
                  ref={photoInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { onUploadPhotos(e.target.files); e.target.value = ""; }}
                />
                <Button size="sm" variant="outline" onClick={() => photoInputRef.current?.click()}>
                  <Upload className="h-4 w-4 ml-1" /> رفع صور
                </Button>
              </div>
            </div>
            {(meta.photos ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
                لم يتم رفع أي صور بعد.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {meta.photos!.map((p, i) => (
                  <div key={i} className="relative group">
                    <img src={p} alt={`photo-${i}`} className="rounded-md border border-border aspect-video object-cover w-full" />
                    <button
                      onClick={() => removePhoto(p)}
                      className="absolute top-1 right-1 bg-background/90 border border-border rounded p-0.5 opacity-0 group-hover:opacity-100 transition"
                      title="حذف"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Documents */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> المستندات
                <span className="text-xs text-muted-foreground">({(meta.documents ?? []).length})</span>
              </div>
              <div>
                <input
                  ref={docInputRef} type="file" multiple className="hidden"
                  onChange={(e) => { onUploadDocs(e.target.files); e.target.value = ""; }}
                />
                <Button size="sm" variant="outline" onClick={() => docInputRef.current?.click()}>
                  <Upload className="h-4 w-4 ml-1" /> رفع مستند
                </Button>
              </div>
            </div>
            {(meta.documents ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
                لا توجد مستندات (استمارة، بطاقة جمارك، فحص...).
              </div>
            ) : (
              <ul className="divide-y divide-border border border-border rounded-md">
                {meta.documents!.map((d) => (
                  <li key={d.url} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 truncate text-primary hover:underline">
                      {d.name}
                    </a>
                    {d.size != null && (
                      <span className="text-[11px] text-muted-foreground">{Math.round(d.size / 1024)} KB</span>
                    )}
                    <button onClick={() => removeDoc(d.url)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {meta.note && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">ملاحظات</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">{meta.note}</div>
            </Card>
          )}
        </div>

        {/* Right col */}
        <div className="space-y-4">
          {/* Reservation panel */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> حالة الحجز
            </div>
            {isReserved && meta.reservation ? (
              <div className="space-y-2 text-sm">
                <Row label="العميل" value={meta.reservation.customer_name ?? linkedCustomer?.name ?? "—"} />
                <Row label="بواسطة" value={meta.reservation.reserved_by ?? "—"} />
                <Row label="ينتهي" value={fmtDate(meta.reservation.expires_at)} highlight={expiringSoon || expired} />
                {meta.reservation.sales_order_no && (
                  <Row label="أمر البيع" value={meta.reservation.sales_order_no} mono />
                )}
                {meta.reservation.note && (
                  <div className="text-xs text-muted-foreground border-r-2 border-border pr-2 mt-2">
                    {meta.reservation.note}
                  </div>
                )}
              </div>
            ) : linkedOrder ? (
              <div className="space-y-2 text-sm">
                <Row label="أمر البيع" value={
                  <button className="font-mono text-primary hover:underline" dir="ltr"
                          onClick={()=>nav(`/sales-orders/${linkedOrder.id}`)}>{linkedOrder.order_no}</button>
                } />
                <Row label="العميل" value={linkedCustomer?.name ?? "—"} />
                <Row label="التاريخ" value={linkedOrder.order_date} />
                <Row label="حالة الأمر" value={<Badge variant="outline">{orderStatusLabel(linkedOrder.status)}</Badge>} />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
                لا يوجد حجز نشط لهذه المركبة.
              </div>
            )}
          </Card>

          {/* Delivery panel */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-primary" /> التسليم
              </div>
              <Button size="sm" variant="ghost" onClick={() => setDeliveryOpen(true)} disabled={eff === "available" || eff === "returned"}>
                إدارة
              </Button>
            </div>
            {(() => {
              const d = meta.delivery;
              const prog = deliveryProgress(meta);
              if (!d && eff !== "ready_for_delivery" && eff !== "delivered") {
                return (
                  <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
                    لم تبدأ عملية التسليم بعد.
                  </div>
                );
              }
              return (
                <div className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">قائمة التحقق</span>
                      <span className="font-medium">{prog.done}/{prog.total}</span>
                    </div>
                    <Progress value={prog.pct} className="h-2" />
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {DELIVERY_CHECKLIST_KEYS.map((k) => {
                      const checked = !!d?.checklist?.[k];
                      return (
                        <div key={k} className="flex items-center gap-2 text-xs">
                          {checked
                            ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            : <span className="h-3.5 w-3.5 rounded-full border border-border" />}
                          <span className={checked ? "text-foreground" : "text-muted-foreground"}>
                            {CHECKLIST_LABEL[k]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {d?.officer && <Row label="موظف التسليم" value={d.officer} />}
                  {d?.invoice_no && <Row label="الفاتورة" value={d.invoice_no} mono />}
                  {d?.ready_at && <Row label="جاهز منذ" value={fmtDateTime(d.ready_at)} />}
                  {d?.delivered_at && <Row label="تم التسليم" value={fmtDateTime(d.delivered_at)} />}
                  {d?.customer_signature_name && (
                    <div className="border border-dashed border-border rounded-md p-2 text-xs">
                      <div className="text-muted-foreground mb-0.5">توقيع العميل (مدخل اسمياً)</div>
                      <div className="font-medium" style={{ fontFamily: "cursive" }}>{d.customer_signature_name}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </Card>

          {/* Ownership panel */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" /> الملكية
            </div>
            {meta.ownership?.current_owner ? (
              <div className="space-y-2 text-sm">
                <Row label="المالك الحالي" value={meta.ownership.current_owner} />
                {meta.ownership.previous_owner && (
                  <Row label="المالك السابق" value={meta.ownership.previous_owner} />
                )}
                {meta.ownership.transferred_at && (
                  <Row label="تاريخ النقل" value={fmtDate(meta.ownership.transferred_at)} />
                )}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
                المركبة ما زالت بملكية المعرض.
              </div>
            )}
          </Card>


          {/* Timeline */}
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" /> سجل الحركات
            </div>
            {timeline.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center">لا توجد حركات.</div>
            ) : (
              <ol className="relative border-r border-border pr-4 space-y-3">
                {timeline.map((ev, i) => {
                  const Icon = ev.icon;
                  const dot =
                    ev.tone === "success" ? "bg-success" :
                    ev.tone === "warning" ? "bg-warning" :
                    ev.tone === "primary" ? "bg-primary" :
                    ev.tone === "destructive" ? "bg-destructive" :
                    "bg-muted-foreground";
                  return (
                    <li key={i} className="relative">
                      <span className={`absolute right-[-22px] top-1 h-3 w-3 rounded-full ${dot} ring-2 ring-background`} />
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {ev.label}
                      </div>
                      {ev.detail && <div className="text-xs text-muted-foreground mt-0.5">{ev.detail}</div>}
                      <div className="text-[11px] text-muted-foreground mt-0.5">{fmtDateTime(ev.at)}</div>
                      {i < timeline.length - 1 && <Separator className="mt-3" />}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold mb-2">سجل التدقيق</div>
            <div className="text-xs text-muted-foreground space-y-1">
              <div>أُنشئت: {fmtDateTime(vehicle.created_at)}</div>
              <div>آخر تحديث: {fmtDateTime(vehicle.updated_at)}</div>
            </div>
          </Card>
        </div>
      </div>

      {/* Reservation dialog */}
      <ReservationDialog
        open={reserveOpen}
        onOpenChange={setReserveOpen}
        meta={meta}
        currentUser={profile?.full_name ?? ""}
        onReserve={async (res) => {
          const ok = await patchMeta(
            { reservation: { ...res, created_at: new Date().toISOString() } },
            "reserved",
          );
          if (ok) { toast.success("تم تسجيل الحجز"); setReserveOpen(false); }
        }}
        onRelease={async () => {
          const ok = await patchMeta({ reservation: undefined }, "available");
          if (ok) { toast.success("تم تحرير الحجز"); setReserveOpen(false); }
        }}
      />

      {/* Status overlay dialog */}
      <StatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        currentEffective={eff}
        currentUser={profile?.full_name ?? ""}
        onApply={async ({ status, note }) => {
          const isOverlay = OVERLAY_STATUSES.includes(status);
          let dbStatus: "available" | "reserved" | "sold" | undefined;
          let overlayPatch: Partial<VehicleMeta> = {};
          if (isOverlay) {
            overlayPatch = {
              status_overlay: status as any,
              status_overlay_at: new Date().toISOString(),
              status_overlay_by: profile?.full_name ?? "",
              status_overlay_note: note,
            };
            // virtual statuses keep DB status sensible
            if (status === "delivered" || status === "returned") dbStatus = status === "delivered" ? "sold" : "available";
          } else {
            overlayPatch = { status_overlay: "", status_overlay_at: "", status_overlay_by: "", status_overlay_note: "" };
            dbStatus = status as any;
          }
          const ok = await patchMeta(overlayPatch, dbStatus);
          if (ok) { toast.success("تم تحديث الحالة"); setStatusOpen(false); }
        }}
      />

      {/* Delivery dialog */}
      <DeliveryDialog
        open={deliveryOpen}
        onOpenChange={setDeliveryOpen}
        meta={meta}
        currentUser={profile?.full_name ?? ""}
        defaultCustomerName={meta.reservation?.customer_name ?? linkedCustomer?.name ?? ""}
        defaultInvoiceNo={meta.reservation?.sales_order_no ?? ""}
        onMarkReady={async (payload) => {
          const ok = await patchMeta(
            {
              delivery: {
                ...(meta.delivery ?? {}),
                ...payload,
                ready_at: meta.delivery?.ready_at ?? new Date().toISOString(),
                ready_by: profile?.full_name ?? "",
              },
              status_overlay: "ready_for_delivery",
              status_overlay_at: new Date().toISOString(),
              status_overlay_by: profile?.full_name ?? "",
              status_overlay_note: undefined,
            },
            "sold",
          );
          if (ok) toast.success("المركبة جاهزة للتسليم");
        }}
        onComplete={async (payload) => {
          const now = new Date().toISOString();
          const ok = await patchMeta(
            {
              delivery: {
                ...(meta.delivery ?? {}),
                ...payload,
                delivered_at: now,
                delivered_by: profile?.full_name ?? "",
              },
              ownership: {
                current_owner: payload.customer_name ?? meta.delivery?.customer_name ?? "",
                previous_owner: meta.ownership?.current_owner ?? "المعرض",
                transferred_at: now,
              },
              status_overlay: "delivered",
              status_overlay_at: now,
              status_overlay_by: profile?.full_name ?? "",
              status_overlay_note: "تم التسليم",
            },
            "sold",
          );
          if (ok) { toast.success("تم تسليم المركبة ونقل الملكية"); setDeliveryOpen(false); }
        }}
        onReturn={async (note) => {
          const now = new Date().toISOString();
          const ok = await patchMeta(
            {
              status_overlay: "returned",
              status_overlay_at: now,
              status_overlay_by: profile?.full_name ?? "",
              status_overlay_note: note,
              ownership: meta.ownership
                ? { ...meta.ownership, previous_owner: meta.ownership.current_owner, current_owner: "المعرض", transferred_at: now }
                : undefined,
            },
            "available",
          );
          if (ok) { toast.success("تم تسجيل ارتجاع المركبة"); setDeliveryOpen(false); }
        }}
      />
    </div>
  );
}

/* ---------------- Subcomponents ---------------- */

function Spec({ label, value, mono }: { label: string; value: any; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm ${mono ? "font-mono" : ""}`} dir={mono ? "ltr" : undefined}>
        {value || value === 0 ? value : "—"}
      </div>
    </div>
  );
}

function PriceCell({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label} (ر.س)</div>
      <div className={`text-lg font-semibold num ${highlight ? "text-primary" : ""}`}>
        {Number(value).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}
      </div>
    </div>
  );
}

function Row({ label, value, mono, highlight }: { label: string; value: any; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${highlight ? "text-warning font-medium" : ""}`} dir={mono ? "ltr" : undefined}>
        {value ?? "—"}
      </span>
    </div>
  );
}

function ReservationDialog({
  open, onOpenChange, meta, currentUser, onReserve, onRelease,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: VehicleMeta;
  currentUser: string;
  onReserve: (res: NonNullable<VehicleMeta["reservation"]>) => void;
  onRelease: () => void;
}) {
  const existing = meta.reservation;
  const defaultExpiry = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }, []);
  const [customer, setCustomer] = useState(existing?.customer_name ?? "");
  const [reservedBy, setReservedBy] = useState(existing?.reserved_by ?? currentUser);
  const [expires, setExpires] = useState(existing?.expires_at?.slice(0, 10) ?? defaultExpiry);
  const [orderNo, setOrderNo] = useState(existing?.sales_order_no ?? "");
  const [note, setNote] = useState(existing?.note ?? "");

  useEffect(() => {
    if (!open) return;
    setCustomer(existing?.customer_name ?? "");
    setReservedBy(existing?.reserved_by ?? currentUser);
    setExpires(existing?.expires_at?.slice(0, 10) ?? defaultExpiry);
    setOrderNo(existing?.sales_order_no ?? "");
    setNote(existing?.note ?? "");
  }, [open, existing, currentUser, defaultExpiry]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "تعديل الحجز" : "حجز المركبة"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>اسم العميل</Label>
              <Input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="العميل المحجوز له" />
            </div>
            <div>
              <Label>محجوز بواسطة</Label>
              <Input value={reservedBy} onChange={(e) => setReservedBy(e.target.value)} />
            </div>
            <div>
              <Label>تاريخ الانتهاء</Label>
              <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} dir="ltr" />
            </div>
            <div>
              <Label>رقم أمر البيع</Label>
              <Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} dir="ltr" placeholder="SO-..." />
            </div>
          </div>
          <div>
            <Label>ملاحظات الحجز</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter className="flex justify-between sm:justify-between">
          {existing ? (
            <Button variant="destructive" onClick={onRelease}>
              <BookmarkX className="h-4 w-4 ml-1" /> تحرير الحجز
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button onClick={() => {
              if (!customer.trim()) { toast.error("اسم العميل مطلوب"); return; }
              onReserve({
                customer_name: customer.trim(),
                reserved_by: reservedBy.trim(),
                expires_at: new Date(expires).toISOString(),
                sales_order_no: orderNo.trim() || undefined,
                note: note.trim() || undefined,
              });
            }}>
              {existing ? "تحديث" : "تأكيد الحجز"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({
  open, onOpenChange, currentEffective, onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentEffective: EffectiveStatus;
  currentUser: string;
  onApply: (v: { status: EffectiveStatus; note?: string }) => void;
}) {
  const [status, setStatus] = useState<EffectiveStatus>(currentEffective);
  const [note, setNote] = useState("");
  useEffect(() => { if (open) { setStatus(currentEffective); setNote(""); } }, [open, currentEffective]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>تغيير حالة المركبة</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>الحالة الجديدة</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as EffectiveStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VEHICLE_STATUS_LABEL) as EffectiveStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{VEHICLE_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>ملاحظة (اختياري)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="سبب التغيير، مرجع، وجهة..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => onApply({ status, note: note.trim() || undefined })}>تطبيق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function transmissionLabel(t?: string) {
  if (t === "automatic") return "أوتوماتيك";
  if (t === "manual") return "يدوي";
  if (t === "cvt") return "CVT";
  return "";
}
function fuelLabel(f?: string) {
  if (f === "petrol") return "بنزين";
  if (f === "diesel") return "ديزل";
  if (f === "hybrid") return "هايبرد";
  if (f === "electric") return "كهربائي";
  return "";
}
function orderStatusLabel(s: string) {
  if (s === "draft") return "مسودة";
  if (s === "confirmed") return "مؤكد";
  if (s === "invoiced") return "مفوتر";
  if (s === "cancelled") return "ملغي";
  return s;
}
