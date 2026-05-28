import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Eye, Car, CheckCircle2, Clock, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { parseVehicleMeta, serializeVehicleMeta, VehicleMeta } from "@/lib/vehicleMeta";

type StatusKey = "available" | "reserved" | "sold" | "delivered" | "maintenance" | "transit";

const statusMap: Record<StatusKey, { label: string; variant: any; className?: string }> = {
  available:   { label: "متوفر",  variant: "default",     className: "bg-success text-success-foreground hover:bg-success/90" },
  reserved:    { label: "محجوز",  variant: "secondary" },
  sold:        { label: "مُباع",  variant: "outline" },
  delivered:   { label: "مُسلَّم", variant: "outline",     className: "border-success/60 text-success" },
  maintenance: { label: "صيانة",  variant: "outline",     className: "border-warning/60 text-warning" },
  transit:     { label: "ترانزيت", variant: "outline",    className: "border-primary/60 text-primary" },
};

const STATUS_FILTERS: { value: StatusKey | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "available", label: "متوفر" },
  { value: "reserved", label: "محجوز" },
  { value: "sold", label: "مُباع" },
  { value: "delivered", label: "مُسلَّم" },
  { value: "maintenance", label: "صيانة" },
  { value: "transit", label: "ترانزيت" },
];

// DB-supported persisted statuses today (vehicle_status enum)
const PERSISTED_STATUSES: StatusKey[] = ["available", "reserved", "sold"];

const emptyForm = {
  code: "",
  name: "",
  brand: "",
  model: "",
  year: new Date().getFullYear(),
  vin: "",
  color: "",
  mileage: 0,
  cost_price: 0,
  sale_price: 0,
  status: "available" as StatusKey,
  // extended (stored in notes JSON envelope)
  chassis: "",
  engine: "",
  trim: "",
  transmission: "" as VehicleMeta["transmission"],
  fuel_type: "" as VehicleMeta["fuel_type"],
  branch: "",
  supplier: "",
  note: "",
};

export default function Vehicles() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey | "all">("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const nav = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const enriched = useMemo(
    () => rows.map((r) => ({ ...r, _meta: parseVehicleMeta(r.notes) })),
    [rows],
  );

  const brands = useMemo(
    () => Array.from(new Set(enriched.map((r) => r.brand).filter(Boolean))).sort(),
    [enriched],
  );
  const years = useMemo(
    () => Array.from(new Set(enriched.map((r) => String(r.year)))).sort((a, b) => +b - +a),
    [enriched],
  );
  const branches = useMemo(
    () => Array.from(new Set(enriched.map((r) => r._meta.branch).filter(Boolean))).sort() as string[],
    [enriched],
  );

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return enriched.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (brandFilter !== "all" && r.brand !== brandFilter) return false;
      if (yearFilter !== "all" && String(r.year) !== yearFilter) return false;
      if (branchFilter !== "all" && r._meta.branch !== branchFilter) return false;
      if (!qv) return true;
      const hay = [
        r.code, r.name, r.brand, r.model, r.vin, r.color,
        r._meta.chassis, r._meta.engine, r._meta.trim, r._meta.supplier, r._meta.branch,
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(qv);
    });
  }, [enriched, q, statusFilter, brandFilter, yearFilter, branchFilter]);

  const kpis = useMemo(() => {
    const total = enriched.length;
    const count = (s: StatusKey) => enriched.filter((r) => r.status === s).length;
    return {
      total,
      available: count("available"),
      reserved: count("reserved"),
      sold: count("sold"),
    };
  }, [enriched]);

  const save = async () => {
    if (!form.code || !form.name || !form.brand) {
      toast.error("الكود والاسم والصانع مطلوبة");
      return;
    }
    const meta: VehicleMeta = {
      chassis: form.chassis,
      engine: form.engine,
      trim: form.trim,
      transmission: form.transmission,
      fuel_type: form.fuel_type,
      branch: form.branch,
      supplier: form.supplier,
      note: form.note,
    };
    const persistedStatus: StatusKey = PERSISTED_STATUSES.includes(form.status) ? form.status : "available";
    const { error } = await supabase.from("vehicles").insert({
      code: form.code,
      name: form.name,
      brand: form.brand,
      model: form.model,
      year: Number(form.year),
      vin: form.vin || null,
      color: form.color,
      mileage: Number(form.mileage),
      cost_price: Number(form.cost_price),
      sale_price: Number(form.sale_price),
      status: persistedStatus as "available" | "reserved" | "sold",
      notes: serializeVehicleMeta(meta) || null,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة المركبة");
    setForm(emptyForm);
    setOpen(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="المركبات"
        subtitle={`${rows.length} مركبة في المخزون`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> مركبة جديدة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>إضافة مركبة جديدة</DialogTitle></DialogHeader>

              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">المعلومات الأساسية</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>الكود *</Label><Input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} /></div>
                    <div className="col-span-2"><Label>الاسم التجاري *</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="تويوتا كامري 2024 فل كامل" /></div>
                    <div><Label>الصانع *</Label><Input value={form.brand} onChange={e=>setForm({...form, brand:e.target.value})} /></div>
                    <div><Label>الموديل</Label><Input value={form.model} onChange={e=>setForm({...form, model:e.target.value})} /></div>
                    <div><Label>الفئة (Trim)</Label><Input value={form.trim} onChange={e=>setForm({...form, trim:e.target.value})} placeholder="GLE / GLX..." /></div>
                    <div><Label>السنة</Label><Input type="number" value={form.year} onChange={e=>setForm({...form, year:Number(e.target.value)})} dir="ltr" /></div>
                    <div><Label>اللون</Label><Input value={form.color} onChange={e=>setForm({...form, color:e.target.value})} /></div>
                    <div><Label>الممشى (كم)</Label><Input type="number" value={form.mileage} onChange={e=>setForm({...form, mileage:Number(e.target.value)})} dir="ltr" /></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">أرقام التعريف</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>VIN</Label><Input value={form.vin} onChange={e=>setForm({...form, vin:e.target.value})} dir="ltr" /></div>
                    <div><Label>رقم الهيكل</Label><Input value={form.chassis} onChange={e=>setForm({...form, chassis:e.target.value})} dir="ltr" /></div>
                    <div><Label>رقم المحرك</Label><Input value={form.engine} onChange={e=>setForm({...form, engine:e.target.value})} dir="ltr" /></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">المواصفات الفنية</div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>ناقل الحركة</Label>
                      <Select value={form.transmission || ""} onValueChange={(v)=>setForm({...form, transmission:v as any})}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="automatic">أوتوماتيك</SelectItem>
                          <SelectItem value="manual">يدوي</SelectItem>
                          <SelectItem value="cvt">CVT</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>نوع الوقود</Label>
                      <Select value={form.fuel_type || ""} onValueChange={(v)=>setForm({...form, fuel_type:v as any})}>
                        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="petrol">بنزين</SelectItem>
                          <SelectItem value="diesel">ديزل</SelectItem>
                          <SelectItem value="hybrid">هايبرد</SelectItem>
                          <SelectItem value="electric">كهربائي</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>الحالة</Label>
                      <Select value={form.status} onValueChange={(v)=>setForm({...form, status:v as StatusKey})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PERSISTED_STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>{statusMap[s].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2">التسعير والمصدر</div>
                  <div className="grid grid-cols-4 gap-3">
                    <div><Label>التكلفة (ر.س)</Label><Input type="number" value={form.cost_price} onChange={e=>setForm({...form, cost_price:Number(e.target.value)})} dir="ltr" /></div>
                    <div><Label>سعر البيع (ر.س)</Label><Input type="number" value={form.sale_price} onChange={e=>setForm({...form, sale_price:Number(e.target.value)})} dir="ltr" /></div>
                    <div><Label>الفرع</Label><Input value={form.branch} onChange={e=>setForm({...form, branch:e.target.value})} placeholder="الرياض / جدة..." /></div>
                    <div><Label>المورد</Label><Input value={form.supplier} onChange={e=>setForm({...form, supplier:e.target.value})} /></div>
                  </div>
                </div>

                <div>
                  <Label>ملاحظات</Label>
                  <Textarea value={form.note} onChange={e=>setForm({...form, note:e.target.value})} rows={2} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={()=>setOpen(false)}>إلغاء</Button>
                <Button onClick={save}>حفظ المركبة</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <KpiCard icon={Car} label="إجمالي المركبات" value={kpis.total} tone="default" />
        <KpiCard icon={CheckCircle2} label="متوفر" value={kpis.available} tone="success" />
        <KpiCard icon={Clock} label="محجوز" value={kpis.reserved} tone="warning" />
        <KpiCard icon={PackageCheck} label="مُباع" value={kpis.sold} tone="muted" />
      </div>

      {/* Sticky filter bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث VIN، هيكل، محرك، اسم، كود..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={(v)=>setStatusFilter(v as any)}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={brandFilter} onValueChange={setBrandFilter}>
          <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="الصانع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الصانعين</SelectItem>
            {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[110px] h-9"><SelectValue placeholder="السنة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل السنوات</SelectItem>
            {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="الفرع" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفروع</SelectItem>
            {branches.length === 0 && <SelectItem value="__none" disabled>لا توجد فروع</SelectItem>}
            {branches.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الصانع/الموديل</th>
              <th>السنة</th>
              <th>VIN</th>
              <th>الفرع</th>
              <th>اللون</th>
              <th className="text-left">السعر (ر.س)</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد مركبات مطابقة</td></tr>
            )}
            {filtered.map((r) => {
              const s = statusMap[r.status as StatusKey] ?? statusMap.available;
              return (
                <tr key={r.id} className="cursor-pointer" onClick={() => nav(`/vehicles/${r.id}`)}>
                  <td className="font-mono text-xs">{r.code}</td>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted-foreground">{r.brand} {r.model}{r._meta.trim ? ` · ${r._meta.trim}` : ""}</td>
                  <td className="num">{r.year}</td>
                  <td className="font-mono text-[11px]" dir="ltr">{r.vin || "—"}</td>
                  <td className="text-xs">{r._meta.branch || "—"}</td>
                  <td>{r.color || "—"}</td>
                  <td className="num text-left font-semibold">{Number(r.sale_price).toLocaleString("ar-SA")}</td>
                  <td><Badge variant={s.variant} className={s.className}>{s.label}</Badge></td>
                  <td onClick={(e)=>e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={()=>nav(`/vehicles/${r.id}`)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: number; tone: "default" | "success" | "warning" | "muted" }) {
  const toneCls =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "muted" ? "text-muted-foreground" :
    "text-primary";
  return (
    <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-md bg-muted flex items-center justify-center ${toneCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold leading-tight">{value.toLocaleString("ar-SA")}</div>
      </div>
    </div>
  );
}
