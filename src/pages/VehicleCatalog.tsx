import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Car, Palette, ChevronLeft } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
interface Brand    { id: string; name: string; }
interface VModel   { id: string; name: string; brand_id: string; brand_name?: string; }
interface Trim     { id: string; name: string; model_id: string; model_name?: string; }
interface Color    { id: string; name: string; hex?: string; }

// ─── Helpers ─────────────────────────────────────────────────
const TABS = ["brands", "models", "trims", "colors"] as const;
type Tab = typeof TABS[number];
const TAB_LABEL: Record<Tab, string> = {
  brands: "🏭 الماركات",
  models: "🚗 الموديلات",
  trims:  "⚙️ الفئات",
  colors: "🎨 الألوان",
};

// ─── Color Preview ────────────────────────────────────────────
const PRESET_COLORS = [
  { name: "أبيض",        hex: "#FFFFFF" },
  { name: "أسود",        hex: "#1A1A1A" },
  { name: "فضي",         hex: "#C0C0C0" },
  { name: "رمادي",       hex: "#808080" },
  { name: "أحمر",        hex: "#CC0000" },
  { name: "أزرق غامق",   hex: "#003399" },
  { name: "أزرق فاتح",   hex: "#4488CC" },
  { name: "بيج",         hex: "#F5F0DC" },
  { name: "ذهبي",        hex: "#C8A84B" },
  { name: "بني",         hex: "#8B4513" },
  { name: "أخضر",        hex: "#2D6A2D" },
  { name: "برتقالي",     hex: "#E85D04" },
  { name: "أبيض لؤلؤي",  hex: "#F8F4F0" },
  { name: "أسود لامع",   hex: "#0D0D0D" },
  { name: "تيتانيوم",    hex: "#878681" },
];

export default function VehicleCatalog() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("brands");
  const [dialog, setDialog] = useState<{ type: Tab; item?: any } | null>(null);

  // ─── Queries ──────────────────────────────────────────────
  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["brands"],
    queryFn: async () => (await supabase.from("vehicle_brands").select("*").order("name")).data ?? [],
  });

  const { data: models = [] } = useQuery<VModel[]>({
    queryKey: ["models"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_models").select("*, brand:vehicle_brands(name)").order("name");
      return (data ?? []).map(m => ({ ...m, brand_name: (m as any).brand?.name }));
    },
  });

  const { data: trims = [] } = useQuery<Trim[]>({
    queryKey: ["trims"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_trims").select("*, model:vehicle_models(name)").order("name");
      return (data ?? []).map(t => ({ ...t, model_name: (t as any).model?.name }));
    },
  });

  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["colors"],
    queryFn: async () => (await supabase.from("vehicle_colors").select("*").order("name")).data ?? [],
  });

  // ─── Mutations ────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["brands"] });
    qc.invalidateQueries({ queryKey: ["models"] });
    qc.invalidateQueries({ queryKey: ["trims"] });
    qc.invalidateQueries({ queryKey: ["colors"] });
    qc.invalidateQueries({ queryKey: ["vehicle-brands"] });
    qc.invalidateQueries({ queryKey: ["vehicle-models"] });
    qc.invalidateQueries({ queryKey: ["vehicle-trims"] });
    qc.invalidateQueries({ queryKey: ["vehicle-colors"] });
  };

  const deleteMut = useMutation({
    mutationFn: async ({ type, id }: { type: Tab; id: string }) => {
      const tables: Record<Tab, string> = {
        brands: "vehicle_brands", models: "vehicle_models",
        trims: "vehicle_trims", colors: "vehicle_colors",
      };
      const { error } = await supabase.from(tables[type] as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم الحذف بنجاح"); invalidate(); },
    onError: (e: any) => toast.error(e.message ?? "تعذر الحذف"),
  });

  const handleDelete = (type: Tab, id: string, name: string) => {
    if (!confirm(`هل تريد حذف "${name}"؟`)) return;
    deleteMut.mutate({ type, id });
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <div dir="rtl">
      <PageHeader title="كتالوج المركبات" subtitle="إدارة الماركات والموديلات والفئات والألوان" />

      {/* Tabs */}
      <div className="border-b border-border mb-6">
        <nav className="flex gap-1 px-4">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {TAB_LABEL[t]}
              <Badge variant="secondary" className="mr-2 text-xs">
                {t === "brands" ? brands.length : t === "models" ? models.length : t === "trims" ? trims.length : colors.length}
              </Badge>
            </button>
          ))}
        </nav>
      </div>

      <div className="px-4 pb-8">
        {/* Add Button */}
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground">{TAB_LABEL[tab]}</h2>
          <Button size="sm" onClick={() => setDialog({ type: tab })}>
            <Plus className="h-4 w-4 ml-1" /> إضافة جديد
          </Button>
        </div>

        {/* ── Brands ── */}
        {tab === "brands" && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {brands.map(b => (
              <div key={b.id} className="border border-border rounded-lg p-3 bg-card flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Car className="h-5 w-5 text-muted-foreground" />
                  <span className="font-medium text-sm flex-1">{b.name}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {models.filter(m => m.brand_id === b.id).length} موديل
                </div>
                <div className="flex gap-1 mt-auto">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDialog({ type: "brands", item: b })}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => handleDelete("brands", b.id, b.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Models ── */}
        {tab === "models" && (
          <div className="space-y-3">
            {brands.map(b => {
              const brandModels = models.filter(m => m.brand_id === b.id);
              if (brandModels.length === 0) return null;
              return (
                <div key={b.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                    <Car className="h-4 w-4" />
                    <span className="font-semibold text-sm">{b.name}</span>
                    <Badge variant="secondary" className="text-xs">{brandModels.length} موديل</Badge>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 p-3">
                    {brandModels.map(m => (
                      <div key={m.id} className="border border-border rounded p-2 bg-card flex items-center justify-between gap-1">
                        <span className="text-sm font-medium truncate">{m.name}</span>
                        <div className="flex gap-0.5 shrink-0">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDialog({ type: "models", item: m })}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete("models", m.id, m.name)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Trims ── */}
        {tab === "trims" && (
          <div className="space-y-3">
            {models.map(m => {
              const modelTrims = trims.filter(t => t.model_id === m.id);
              if (modelTrims.length === 0) return null;
              const brand = brands.find(b => b.id === m.brand_id);
              return (
                <div key={m.id} className="border border-border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2 flex items-center gap-2">
                    <ChevronLeft className="h-4 w-4" />
                    <span className="text-xs text-muted-foreground">{brand?.name}</span>
                    <span className="font-semibold text-sm">{m.name}</span>
                    <Badge variant="secondary" className="text-xs">{modelTrims.length} فئة</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {modelTrims.map(t => (
                      <div key={t.id} className="border border-border rounded px-3 py-1.5 bg-card flex items-center gap-2">
                        <span className="text-sm">{t.name}</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setDialog({ type: "trims", item: t })}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => handleDelete("trims", t.id, t.name)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Colors ── */}
        {tab === "colors" && (
          <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {colors.map(c => (
              <div key={c.id} className="border border-border rounded-lg p-3 bg-card flex flex-col gap-2 items-center text-center">
                <div className="w-10 h-10 rounded-full border-2 border-border shadow-sm"
                  style={{ background: c.hex ?? "#ccc" }} />
                <span className="text-xs font-medium">{c.name}</span>
                {c.hex && <span className="text-[10px] text-muted-foreground font-mono">{c.hex}</span>}
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setDialog({ type: "colors", item: c })}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => handleDelete("colors", c.id, c.name)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Dialogs ─────────────────────────────────────────── */}
      {dialog && (
        <CatalogDialog
          type={dialog.type}
          item={dialog.item}
          brands={brands}
          models={models}
          onClose={() => setDialog(null)}
          onSaved={() => { invalidate(); setDialog(null); }}
        />
      )}
    </div>
  );
}

// ─── CatalogDialog ────────────────────────────────────────────
function CatalogDialog({ type, item, brands, models, onClose, onSaved }: {
  type: Tab; item?: any; brands: Brand[]; models: VModel[];
  onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!item;
  const [name, setName]       = useState(item?.name ?? "");
  const [brandId, setBrandId] = useState(item?.brand_id ?? "");
  const [modelId, setModelId] = useState(item?.model_id ?? "");
  const [hex, setHex]         = useState(item?.hex ?? "");
  const [saving, setSaving]   = useState(false);

  const filteredModels = models.filter(m => m.brand_id === brandId);

  const titles: Record<Tab, string> = {
    brands: isEdit ? "تعديل ماركة" : "إضافة ماركة جديدة",
    models: isEdit ? "تعديل موديل" : "إضافة موديل جديد",
    trims:  isEdit ? "تعديل فئة"   : "إضافة فئة جديدة",
    colors: isEdit ? "تعديل لون"   : "إضافة لون جديد",
  };

  const save = async () => {
    if (!name.trim()) return toast.error("الاسم مطلوب");
    if (type === "models" && !brandId) return toast.error("اختر الماركة");
    if (type === "trims"  && !modelId) return toast.error("اختر الموديل");
    setSaving(true);
    try {
      const tables: Record<Tab, string> = {
        brands: "vehicle_brands", models: "vehicle_models",
        trims: "vehicle_trims", colors: "vehicle_colors",
      };
      const payload: any = { name: name.trim() };
      if (type === "models") payload.brand_id = brandId;
      if (type === "trims")  payload.model_id = modelId;
      if (type === "colors" && hex) payload.hex = hex;

      if (isEdit) {
        const { error } = await supabase.from(tables[type] as any).update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(tables[type] as any).insert(payload);
        if (error) throw error;
      }
      toast.success(isEdit ? "تم التعديل" : "تمت الإضافة");
      onSaved();
    } catch (e: any) {
      toast.error(e.message ?? "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{titles[type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {/* اختيار الماركة للموديلات */}
          {type === "models" && (
            <div className="space-y-1.5">
              <Label className="text-xs">الماركة *</Label>
              <Select value={brandId} onValueChange={setBrandId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر الماركة" /></SelectTrigger>
                <SelectContent>
                  {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* اختيار الموديل للفئات */}
          {type === "trims" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">الماركة *</Label>
                <Select value={brandId} onValueChange={v => { setBrandId(v); setModelId(""); }}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="اختر الماركة" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">الموديل *</Label>
                <Select value={modelId} onValueChange={setModelId} disabled={!brandId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="اختر الموديل" /></SelectTrigger>
                  <SelectContent>
                    {filteredModels.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* الاسم */}
          <div className="space-y-1.5">
            <Label className="text-xs">الاسم *</Label>
            <Input className="h-9" value={name} onChange={e => setName(e.target.value)}
              placeholder={type === "brands" ? "مثال: Toyota" : type === "models" ? "مثال: Camry" : type === "trims" ? "مثال: XLE" : "مثال: أبيض لؤلؤي"} />
          </div>

          {/* لون HEX */}
          {type === "colors" && (
            <div className="space-y-1.5">
              <Label className="text-xs">كود اللون (HEX)</Label>
              <div className="flex gap-2">
                <input type="color" value={hex || "#ffffff"} onChange={e => setHex(e.target.value)}
                  className="h-9 w-12 rounded border border-border cursor-pointer" />
                <Input className="h-9 font-mono" value={hex} onChange={e => setHex(e.target.value)} placeholder="#FFFFFF" />
              </div>
              {/* ألوان شائعة */}
              <div className="grid grid-cols-5 gap-1.5 mt-2">
                {PRESET_COLORS.map(pc => (
                  <button key={pc.hex} onClick={() => { setHex(pc.hex); setName(name || pc.name); }}
                    className="flex flex-col items-center gap-1 p-1 rounded hover:bg-muted/50 transition-colors">
                    <div className="w-7 h-7 rounded-full border border-border shadow-sm"
                      style={{ background: pc.hex }} />
                    <span className="text-[9px] text-muted-foreground leading-tight text-center">{pc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={save} disabled={saving} className="min-w-24">
            {saving ? "جاري الحفظ..." : isEdit ? "حفظ التعديلات" : "إضافة"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
