import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, Car, Tag, Wrench, Truck, ShoppingCart, ArrowDownToLine, RotateCcw, Image as ImageIcon } from "lucide-react";
import { parseVehicleMeta } from "@/lib/vehicleMeta";

type StatusKey = "available" | "reserved" | "sold" | "delivered" | "maintenance" | "transit";

const statusMap: Record<StatusKey, { label: string; className: string }> = {
  available:   { label: "متوفر",  className: "bg-success text-success-foreground" },
  reserved:    { label: "محجوز",  className: "bg-secondary text-secondary-foreground" },
  sold:        { label: "مُباع",  className: "bg-primary text-primary-foreground" },
  delivered:   { label: "مُسلَّم", className: "bg-success/10 text-success border border-success/30" },
  maintenance: { label: "صيانة",  className: "bg-warning/10 text-warning border border-warning/30" },
  transit:     { label: "ترانزيت", className: "bg-primary/10 text-primary border border-primary/30" },
};

type TimelineEvent = {
  type: "purchase" | "reservation" | "sale" | "delivery" | "transfer" | "maintenance" | "return";
  label: string;
  at: string;
  detail?: string;
  icon: any;
  tone: "default" | "success" | "warning" | "primary";
};

const fmtDateTime = (s?: string) =>
  s ? new Date(s).toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function VehicleDetail() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const [vehicle, setVehicle] = useState<any | null>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
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
    })();
  }, [id]);

  const meta = useMemo(() => parseVehicleMeta(vehicle?.notes), [vehicle?.notes]);

  // Derive reservation / sale linkage from active sales order lines
  const activeLine = useMemo(() => {
    if (!lines.length) return null;
    // prefer non-cancelled, most recent
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
        type: "purchase",
        label: "إضافة للمخزون",
        at: vehicle.created_at,
        detail: meta.supplier ? `المورد: ${meta.supplier}` : undefined,
        icon: ArrowDownToLine,
        tone: "default",
      });
    }
    lines.forEach((l) => {
      const so = l.sales_orders;
      if (!so) return;
      const cust = so.customers?.name ?? "عميل";
      if (so.status === "draft" || so.status === "confirmed") {
        events.push({
          type: "reservation",
          label: "حجز للعميل",
          at: so.order_date,
          detail: `${cust} · أمر ${so.order_no}`,
          icon: ShoppingCart,
          tone: "warning",
        });
      }
      if (so.status === "confirmed" || so.status === "invoiced") {
        events.push({
          type: "sale",
          label: "تأكيد البيع",
          at: so.order_date,
          detail: `${cust} · أمر ${so.order_no}`,
          icon: Tag,
          tone: "primary",
        });
      }
      if (so.status === "invoiced") {
        events.push({
          type: "delivery",
          label: "جاهز للتسليم",
          at: so.order_date,
          detail: `أمر ${so.order_no}`,
          icon: Truck,
          tone: "success",
        });
      }
      if (so.status === "cancelled") {
        events.push({
          type: "return",
          label: "إلغاء أمر البيع",
          at: so.order_date,
          detail: `أمر ${so.order_no}`,
          icon: RotateCcw,
          tone: "warning",
        });
      }
    });
    return events.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  }, [lines, vehicle, meta.supplier]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  }
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

  const status = (vehicle.status as StatusKey) ?? "available";
  const s = statusMap[status] ?? statusMap.available;

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
            <Badge className={s.className}>{s.label}</Badge>
            <Button variant="ghost" size="sm" onClick={()=>nav("/vehicles")}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: specs + pricing + photos */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold flex items-center gap-2">
                <Car className="h-4 w-4 text-primary" /> المواصفات
              </div>
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

          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-primary" /> معرض الصور
            </div>
            {(meta.photos ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed border-border rounded-md">
                لا توجد صور — رفع الصور سيتوفر مع إعداد التخزين.
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {meta.photos!.map((p, i) => (
                  <img key={i} src={p} alt={`photo-${i}`} className="rounded-md border border-border aspect-video object-cover" />
                ))}
              </div>
            )}
          </Card>

          {meta.note && (
            <Card className="p-4">
              <div className="text-sm font-semibold mb-2">ملاحظات</div>
              <div className="text-sm text-muted-foreground whitespace-pre-wrap">{meta.note}</div>
            </Card>
          )}
        </div>

        {/* Right: reservation + timeline */}
        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> حالة الحجز
            </div>
            {linkedOrder ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">أمر البيع</span>
                  <button
                    className="font-mono text-primary hover:underline"
                    onClick={()=>nav(`/sales-orders/${linkedOrder.id}`)}
                    dir="ltr"
                  >
                    {linkedOrder.order_no}
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">العميل</span>
                  <span>{linkedCustomer?.name ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">التاريخ</span>
                  <span className="num">{linkedOrder.order_date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">حالة الأمر</span>
                  <Badge variant="outline">{orderStatusLabel(linkedOrder.status)}</Badge>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-3 text-center border border-dashed border-border rounded-md">
                لا يوجد حجز نشط لهذه المركبة.
              </div>
            )}
          </Card>

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
    </div>
  );
}

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
