import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Power, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  productsService, PRODUCT_CATEGORY_LABEL, type Product, type ProductCategory,
} from "@/services/erp/masterData";

export default function ProductsMaster() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const products = useMemo(() => productsService.list(), [tick]);
  const [filter, setFilter] = useState<ProductCategory | "all">("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = products.filter(p => {
    if (filter !== "all" && p.category !== filter) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return p.name.toLowerCase().includes(t) || p.code.toLowerCase().includes(t) ||
      (p.brand ?? "").toLowerCase().includes(t) || (p.model ?? "").toLowerCase().includes(t);
  });

  const create = () => { setEditing(null); setOpen(true); };
  const edit = (p: Product) => { setEditing(p); setOpen(true); };
  const toggle = (p: Product) => {
    productsService.toggleActive(p.id);
    toast.success(p.active ? "تم تعطيل المنتج" : "تم تنشيط المنتج");
    refresh();
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title="الأصناف الرئيسية (Product Master)" subtitle="قاعدة موحّدة للمركبات وقطع الغيار والخدمات — مشتركة بين المشتريات والمبيعات والمخزون والورشة" />

      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-center gap-2">
        <Input placeholder="بحث بالاسم أو الكود أو الموديل..." value={q} onChange={e => setQ(e.target.value)} className="h-9 max-w-xs" />
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفئات</SelectItem>
            <SelectItem value="vehicle">مركبات</SelectItem>
            <SelectItem value="part">قطع غيار</SelectItem>
            <SelectItem value="service">خدمات</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground mr-auto">{filtered.length} منتج</div>
        <Button size="sm" onClick={create}><Plus className="h-3.5 w-3.5 ml-1" /> منتج جديد</Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table text-xs">
          <thead>
            <tr>
              <th>الكود</th><th>الاسم</th><th>الفئة</th><th>العلامة</th><th>الموديل</th>
              <th>السنة</th><th>سعر افتراضي</th><th>الحالة</th><th className="w-[100px]">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className={!p.active ? "opacity-50" : ""}>
                <td className="font-mono">{p.code}</td>
                <td className="font-semibold">{p.name}</td>
                <td><Badge variant="outline">{PRODUCT_CATEGORY_LABEL[p.category]}</Badge></td>
                <td>{p.brand ?? "—"}</td>
                <td>{p.model ?? "—"}</td>
                <td className="num">{p.year ?? "—"}</td>
                <td className="num">{p.default_unit_price?.toLocaleString() ?? "—"}</td>
                <td>{p.active ? <Badge className="bg-success/15 text-success">نشط</Badge> : <Badge variant="outline">معطّل</Badge>}</td>
                <td>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => edit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggle(p)}><Power className="h-3.5 w-3.5" /></Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد منتجات</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ProductDialog open={open} onOpenChange={setOpen} product={editing} onSaved={refresh} />
    </div>
  );
}

function ProductDialog({ open, onOpenChange, product, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; product: Product | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState<ProductCategory>("vehicle");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [price, setPrice] = useState<number | "">("");

  useMemo(() => {
    if (open) {
      setName(product?.name ?? "");
      setCategory(product?.category ?? "vehicle");
      setBrand(product?.brand ?? "");
      setModel(product?.model ?? "");
      setYear(product?.year ?? "");
      setPrice(product?.default_unit_price ?? "");
    }
  }, [open, product]);

  const submit = () => {
    if (!name.trim()) return toast.error("أدخل اسم المنتج");
    const payload = {
      name: name.trim(), category,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      year: year === "" ? undefined : Number(year),
      default_unit_price: price === "" ? undefined : Number(price),
    };
    if (product) {
      productsService.update(product.id, payload);
      toast.success("تم تحديث المنتج");
    } else {
      const p = productsService.create(payload);
      toast.success(`تم إنشاء المنتج ${p.code}`);
    }
    onOpenChange(false); onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader><DialogTitle>{product ? `تعديل ${product.code}` : "منتج جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-xs">
          <div>
            <Label className="text-xs">الفئة</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)} disabled={!!product}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vehicle">مركبات</SelectItem>
                <SelectItem value="part">قطع غيار</SelectItem>
                <SelectItem value="service">خدمات</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">اسم المنتج *</Label><Input value={name} onChange={e => setName(e.target.value)} className="h-9" placeholder={category === "vehicle" ? "Toyota Camry GL 2025" : ""} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">العلامة التجارية</Label><Input value={brand} onChange={e => setBrand(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">الموديل</Label><Input value={model} onChange={e => setModel(e.target.value)} className="h-9" /></div>
            {category === "vehicle" && (
              <div><Label className="text-xs">السنة</Label><Input type="number" value={year} onChange={e => setYear(e.target.value === "" ? "" : Number(e.target.value))} className="h-9" /></div>
            )}
            <div><Label className="text-xs">سعر افتراضي (ر.س)</Label><Input type="number" value={price} onChange={e => setPrice(e.target.value === "" ? "" : Number(e.target.value))} className="h-9" /></div>
          </div>
          <div className="text-[12px] text-muted-foreground bg-muted/30 rounded p-2">
            ملاحظة: لا تخزّن رقم الهيكل (VIN) أو رقم المحرك في الأصناف الرئيسية — هذه خصائص للوحدة الفعلية في المخزون أو التخصيص.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>{product ? "حفظ" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
