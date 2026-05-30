import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardCheck, FileSearch, PackageCheck, Truck, ShieldCheck,
  CheckCircle2, XCircle, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  VehicleMeta, ProcurementState, InspectionResult, landedCost,
} from "@/lib/vehicleMeta";
import { PROCUREMENT_STATE_LABEL } from "@/lib/vehicleStatus";

type Proc = NonNullable<VehicleMeta["procurement"]>;

const fmtNum = (n: number) => n.toLocaleString("ar-SA", { minimumFractionDigits: 2 });

const INSPECTION_ITEMS: { key: keyof NonNullable<Proc["inspection_items"]>; label: string }[] = [
  { key: "body",         label: "الهيكل الخارجي" },
  { key: "paint",        label: "الدهان" },
  { key: "engine",       label: "المحرك" },
  { key: "transmission", label: "ناقل الحركة" },
  { key: "tires",        label: "الإطارات" },
  { key: "battery",      label: "البطارية" },
];

export function ProcurementWorkflow({
  open, onOpenChange, meta, currentUser, onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: VehicleMeta;
  currentUser: string;
  onSave: (patch: Partial<VehicleMeta>, dbStatus?: "available" | "reserved" | "sold") => Promise<boolean | void>;
}) {
  const existing = meta.procurement ?? {};
  const [tab, setTab] = useState<string>(() => initialTab(existing.state));
  const [p, setP] = useState<Proc>(existing);

  useEffect(() => {
    if (!open) return;
    setP(meta.procurement ?? {});
    setTab(initialTab(meta.procurement?.state));
  }, [open, meta]);

  const set = <K extends keyof Proc>(k: K, v: Proc[K]) =>
    setP((prev) => ({ ...prev, [k]: v }));

  const total = useMemo(() => landedCost({ procurement: p }), [p]);

  const persist = async (patch: Partial<Proc>, msg?: string) => {
    const next: Proc = { ...p, ...patch };
    setP(next);
    const ok = await onSave({ procurement: next });
    if (ok !== false && msg) toast.success(msg);
    return ok !== false;
  };

  const stamp = (extra: Partial<Proc> = {}) => ({
    ...extra,
    [`${extra.state ?? "stage"}_by`]: currentUser,
  });

  /* ---- transitions ---- */
  const submitRequest = async () => {
    if (!p.supplier && !meta.supplier) {
      toast.error("المورد مطلوب");
      return;
    }
    await persist({
      state: "requested",
      requested_at: p.requested_at ?? new Date().toISOString(),
      requested_by: p.requested_by ?? currentUser,
    }, "تم تسجيل طلب الشراء");
  };

  const markOrdered = async () => {
    if (!p.po_reference) { toast.error("مرجع أمر الشراء مطلوب"); return; }
    await persist({
      state: "ordered",
      ordered_at: new Date().toISOString(),
      ordered_by: currentUser,
    }, "تم تأكيد الطلب");
  };

  const markInTransit = async () => {
    await persist({
      state: "in_transit",
      transit_started_at: p.transit_started_at ?? new Date().toISOString(),
    }, "تم تسجيل بدء الشحن");
  };

  const markReceived = async () => {
    if (!p.vin_verified) {
      toast.error("يجب التحقق من رقم الهيكل (VIN)");
      return;
    }
    await persist({
      state: "received",
      received_at: new Date().toISOString(),
      received_by: currentUser,
    }, "تم استلام المركبة");
  };

  const submitInspection = async (result: InspectionResult) => {
    await persist({
      state: result === "rejected" ? "rejected" : "inspection_pending",
      inspection_at: new Date().toISOString(),
      inspection_by: currentUser,
      inspection_result: result,
    }, "تم حفظ تقرير الفحص");
  };

  const approve = async () => {
    const next: Proc = {
      ...p,
      state: "approved",
      approved_at: new Date().toISOString(),
      approved_by: currentUser,
    };
    setP(next);
    const ok = await onSave({ procurement: next }, "available");
    if (ok !== false) toast.success("تم اعتماد إدخال المركبة للمخزون");
  };

  const reject = async () => {
    if (!p.rejection_reason) { toast.error("سبب الرفض مطلوب"); return; }
    await persist({
      state: "rejected",
      approved_at: new Date().toISOString(),
      approved_by: currentUser,
    }, "تم رفض المركبة");
  };

  const stateBadge = p.state
    ? <Badge variant="outline" className="text-[10px]">{PROCUREMENT_STATE_LABEL[p.state as Exclude<ProcurementState, "">]}</Badge>
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            سير عمل المشتريات والاستلام
            {stateBadge}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="request"><ClipboardCheck className="h-3.5 w-3.5 ml-1" /> الطلب</TabsTrigger>
            <TabsTrigger value="receiving"><PackageCheck className="h-3.5 w-3.5 ml-1" /> الاستلام</TabsTrigger>
            <TabsTrigger value="inspection"><FileSearch className="h-3.5 w-3.5 ml-1" /> الفحص</TabsTrigger>
            <TabsTrigger value="approval"><ShieldCheck className="h-3.5 w-3.5 ml-1" /> الاعتماد</TabsTrigger>
            <TabsTrigger value="costs"><Wallet className="h-3.5 w-3.5 ml-1" /> التكاليف</TabsTrigger>
          </TabsList>

          {/* ============ REQUEST ============ */}
          <TabsContent value="request" className="space-y-4 pt-3">
            <Section title="بيانات طلب الشراء">
              <Grid>
                <Field label="رقم الطلب (داخلي)">
                  <Input dir="ltr" value={p.request_no ?? ""} onChange={e=>set("request_no", e.target.value)} placeholder="PR-…" />
                </Field>
                <Field label="المشتري / المسؤول">
                  <Input value={p.buyer ?? ""} onChange={e=>set("buyer", e.target.value)} placeholder={currentUser} />
                </Field>
                <Field label="المورد">
                  <Input value={p.supplier ?? meta.supplier ?? ""} onChange={e=>set("supplier", e.target.value)} />
                </Field>
                <Field label="مصدر الشراء">
                  <Input value={p.purchase_source ?? meta.purchase_source ?? ""} onChange={e=>set("purchase_source", e.target.value)} placeholder="مزاد / وكالة / استيراد..." />
                </Field>
                <Field label="بلد المصدر">
                  <Input value={p.source_country ?? ""} onChange={e=>set("source_country", e.target.value)} placeholder="ألمانيا / اليابان..." />
                </Field>
                <Field label="فرع الوجهة">
                  <Input value={p.branch_destination ?? meta.branch ?? ""} onChange={e=>set("branch_destination", e.target.value)} />
                </Field>
                <Field label="تاريخ الوصول المتوقع">
                  <Input type="date" dir="ltr" value={p.expected_arrival?.slice(0,10) ?? ""} onChange={e=>set("expected_arrival", e.target.value ? new Date(e.target.value).toISOString() : "")} />
                </Field>
                <Field label="التكلفة التقديرية (ر.س)">
                  <Input type="number" dir="ltr" value={p.estimated_cost ?? 0} onChange={e=>set("estimated_cost", Number(e.target.value))} />
                </Field>
                <Field label="سعر البيع المستهدف (ر.س)">
                  <Input type="number" dir="ltr" value={p.target_sale_price ?? 0} onChange={e=>set("target_sale_price", Number(e.target.value))} />
                </Field>
              </Grid>
              <Field label="ملاحظات الطلب" full>
                <Textarea rows={2} value={p.note ?? ""} onChange={e=>set("note", e.target.value)} />
              </Field>
            </Section>

            <Section title="أمر الشراء والشحن">
              <Grid>
                <Field label="مرجع أمر الشراء">
                  <Input dir="ltr" value={p.po_reference ?? ""} onChange={e=>set("po_reference", e.target.value)} placeholder="PO-…" />
                </Field>
                <Field label="الناقل">
                  <Input value={p.transit_carrier ?? ""} onChange={e=>set("transit_carrier", e.target.value)} />
                </Field>
                <Field label="رقم التتبع">
                  <Input dir="ltr" value={p.transit_tracking ?? ""} onChange={e=>set("transit_tracking", e.target.value)} />
                </Field>
              </Grid>
            </Section>

            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border">
              <Button size="sm" variant="outline" onClick={submitRequest}>
                <ClipboardCheck className="h-4 w-4 ml-1" /> تسجيل الطلب
              </Button>
              <Button size="sm" variant="outline" onClick={markOrdered}
                disabled={!p.state || p.state === "rejected"}>
                تأكيد الطلب
              </Button>
              <Button size="sm" onClick={markInTransit}
                disabled={p.state !== "ordered" && p.state !== "in_transit"}>
                <Truck className="h-4 w-4 ml-1" /> بدء الشحن
              </Button>
            </div>
          </TabsContent>

          {/* ============ RECEIVING ============ */}
          <TabsContent value="receiving" className="space-y-4 pt-3">
            <Section title="بيانات الاستلام">
              <Grid>
                <Field label="موظف الاستلام">
                  <Input value={p.received_by ?? currentUser} onChange={e=>set("received_by", e.target.value)} />
                </Field>
                <Field label="تاريخ الاستلام">
                  <Input type="date" dir="ltr" value={p.received_at?.slice(0,10) ?? ""} onChange={e=>set("received_at", e.target.value ? new Date(e.target.value).toISOString() : "")} />
                </Field>
                <Field label="الحالة عند الاستلام">
                  <Select value={p.received_condition ?? ""} onValueChange={(v)=>set("received_condition", v as any)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="good">جيدة</SelectItem>
                      <SelectItem value="minor_damage">أضرار طفيفة</SelectItem>
                      <SelectItem value="major_damage">أضرار كبيرة</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="الممشى عند الاستلام (كم)">
                  <Input type="number" dir="ltr" value={p.received_mileage ?? 0} onChange={e=>set("received_mileage", Number(e.target.value))} />
                </Field>
                <Field label="مستوى الوقود">
                  <Select value={p.fuel_level ?? ""} onValueChange={(v)=>set("fuel_level", v as any)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="empty">فارغ</SelectItem>
                      <SelectItem value="quarter">¼</SelectItem>
                      <SelectItem value="half">½</SelectItem>
                      <SelectItem value="three_quarters">¾</SelectItem>
                      <SelectItem value="full">ممتلئ</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="عدد المفاتيح المستلمة">
                  <Input type="number" dir="ltr" value={p.keys_count ?? 0} onChange={e=>set("keys_count", Number(e.target.value))} />
                </Field>
              </Grid>

              <div className="grid grid-cols-2 gap-2 mt-3">
                <CheckRow label="التحقق من رقم الهيكل (VIN)" checked={!!p.vin_verified} onChange={(v)=>set("vin_verified", v)} />
                <CheckRow label="التحقق من رقم المحرك" checked={!!p.engine_verified} onChange={(v)=>set("engine_verified", v)} />
              </div>

              <Field label="الإكسسوارات المستلمة" full>
                <Input value={p.accessories ?? ""} onChange={e=>set("accessories", e.target.value)} placeholder="حصيرة، شنطة أدوات، رفرف..." />
              </Field>
              <Field label="ملاحظات الاستلام" full>
                <Textarea rows={2} value={p.receiving_note ?? ""} onChange={e=>set("receiving_note", e.target.value)} />
              </Field>
            </Section>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button size="sm" onClick={markReceived}
                disabled={p.state === "approved" || p.state === "rejected"}>
                <PackageCheck className="h-4 w-4 ml-1" /> تأكيد الاستلام
              </Button>
            </div>
          </TabsContent>

          {/* ============ INSPECTION ============ */}
          <TabsContent value="inspection" className="space-y-4 pt-3">
            <Section title="تقرير الفحص">
              <Grid>
                <Field label="فني الفحص">
                  <Input value={p.inspection_by ?? currentUser} onChange={e=>set("inspection_by", e.target.value)} />
                </Field>
                <Field label="تاريخ الفحص">
                  <Input type="date" dir="ltr" value={p.inspection_at?.slice(0,10) ?? ""} onChange={e=>set("inspection_at", e.target.value ? new Date(e.target.value).toISOString() : "")} />
                </Field>
                <Field label="حادث سابق">
                  <Select value={p.accident_detected ? "yes" : "no"} onValueChange={(v)=>set("accident_detected", v === "yes")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">لا يوجد</SelectItem>
                      <SelectItem value="yes">تم اكتشاف حادث</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </Grid>

              <div className="text-[11px] font-semibold text-muted-foreground mt-2 mb-1">عناصر الفحص</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {INSPECTION_ITEMS.map((it) => (
                  <div key={it.key} className="flex items-center gap-2 border border-border rounded-md px-2 py-1.5">
                    <span className="text-sm flex-1">{it.label}</span>
                    <Select
                      value={(p.inspection_items?.[it.key] ?? "") as string}
                      onValueChange={(v) => set("inspection_items", { ...(p.inspection_items ?? {}), [it.key]: v as any })}
                    >
                      <SelectTrigger className="h-7 w-[110px] text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">سليم</SelectItem>
                        <SelectItem value="notes">ملاحظات</SelectItem>
                        <SelectItem value="fail">مرفوض</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Field label="توصيات الصيانة" full>
                <Textarea rows={2} value={p.maintenance_recommendations ?? ""} onChange={e=>set("maintenance_recommendations", e.target.value)} />
              </Field>
              <Field label="ملاحظات الفحص" full>
                <Textarea rows={2} value={p.inspection_note ?? ""} onChange={e=>set("inspection_note", e.target.value)} />
              </Field>
            </Section>

            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border">
              <Button size="sm" variant="outline" onClick={()=>submitInspection("passed")}>
                <CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد الفحص
              </Button>
              <Button size="sm" variant="outline" onClick={()=>submitInspection("passed_with_notes")}>
                اعتماد مع ملاحظات
              </Button>
              <Button size="sm" variant="destructive" onClick={()=>submitInspection("rejected")}>
                <XCircle className="h-4 w-4 ml-1" /> رفض الفحص
              </Button>
            </div>
          </TabsContent>

          {/* ============ APPROVAL ============ */}
          <TabsContent value="approval" className="space-y-4 pt-3">
            <Section title="اعتماد الإدخال للمخزون">
              <div className="text-xs text-muted-foreground">
                عند الاعتماد تصبح المركبة جزءاً من المخزون التشغيلي وقابلة للحجز والبيع.
              </div>
              <Grid>
                <Field label="المرجع المرتبط">
                  <Input dir="ltr" value={p.po_reference ?? p.request_no ?? ""} onChange={e=>set("po_reference", e.target.value)} />
                </Field>
                <Field label="نتيجة الفحص">
                  <Input value={inspectionLabel(p.inspection_result)} readOnly className="bg-muted/40" />
                </Field>
              </Grid>
              <Field label="سبب الرفض (إن وُجد)" full>
                <Textarea rows={2} value={p.rejection_reason ?? ""} onChange={e=>set("rejection_reason", e.target.value)} />
              </Field>
              {p.approved_at && (
                <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-2">
                  آخر إجراء: {new Date(p.approved_at).toLocaleString("ar-SA")}
                  {p.approved_by && ` · ${p.approved_by}`}
                </div>
              )}
            </Section>

            <div className="flex justify-between gap-2 pt-2 border-t border-border">
              <Button size="sm" variant="destructive" onClick={reject}>
                <XCircle className="h-4 w-4 ml-1" /> رفض
              </Button>
              <Button
                size="sm"
                onClick={approve}
                disabled={p.state !== "inspection_pending" && p.state !== "received"}
              >
                <ShieldCheck className="h-4 w-4 ml-1" /> اعتماد الإدخال
              </Button>
            </div>
          </TabsContent>

          {/* ============ COSTS ============ */}
          <TabsContent value="costs" className="space-y-4 pt-3">
            <Section title="مكونات التكلفة (ر.س)">
              <Grid cols={3}>
                <Field label="تكلفة الشراء">
                  <Input type="number" dir="ltr" value={p.cost_purchase ?? 0} onChange={e=>set("cost_purchase", Number(e.target.value))} />
                </Field>
                <Field label="الشحن">
                  <Input type="number" dir="ltr" value={p.cost_shipping ?? 0} onChange={e=>set("cost_shipping", Number(e.target.value))} />
                </Field>
                <Field label="الجمارك">
                  <Input type="number" dir="ltr" value={p.cost_customs ?? 0} onChange={e=>set("cost_customs", Number(e.target.value))} />
                </Field>
                <Field label="الفحص">
                  <Input type="number" dir="ltr" value={p.cost_inspection ?? 0} onChange={e=>set("cost_inspection", Number(e.target.value))} />
                </Field>
                <Field label="الإصلاحات">
                  <Input type="number" dir="ltr" value={p.cost_repair ?? 0} onChange={e=>set("cost_repair", Number(e.target.value))} />
                </Field>
                <Field label="الإكسسوارات">
                  <Input type="number" dir="ltr" value={p.cost_accessories ?? 0} onChange={e=>set("cost_accessories", Number(e.target.value))} />
                </Field>
              </Grid>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">إجمالي التكلفة المُحمَّلة</span>
                <span className="font-bold text-base text-primary num">{fmtNum(total)}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">
                ملاحظة: هذه قيم تشغيلية فقط. القيد المحاسبي وتسعير المخزون يُدار من المحرك الخلفي.
              </div>
            </Section>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button size="sm" onClick={()=>persist({}, "تم حفظ التكاليف")}>حفظ</Button>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={()=>onOpenChange(false)}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* helpers */
function initialTab(s?: ProcurementState): string {
  switch (s) {
    case "received": return "inspection";
    case "inspection_pending": return "approval";
    case "approved":
    case "rejected": return "approval";
    case "in_transit":
    case "ordered": return "receiving";
    default: return "request";
  }
}

function inspectionLabel(r?: InspectionResult) {
  if (r === "passed") return "ناجح";
  if (r === "passed_with_notes") return "ناجح مع ملاحظات";
  if (r === "rejected") return "مرفوض";
  return "—";
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="border border-border rounded-lg p-3 space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}
function Grid({ children, cols }: { children: any; cols?: number }) {
  const cls = cols === 3 ? "md:grid-cols-3" : "md:grid-cols-3";
  return <div className={`grid grid-cols-1 ${cls} gap-3`}>{children}</div>;
}
function Field({ label, children, full }: { label: string; children: any; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-3" : ""}>
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}
function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 border border-border rounded-md px-3 py-2 text-sm cursor-pointer hover:bg-accent/50">
      <Checkbox checked={checked} onCheckedChange={(v)=>onChange(!!v)} />
      <span>{label}</span>
    </label>
  );
}
