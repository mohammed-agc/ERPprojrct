import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { purchasingService, type Urgency, type ItemKind, fmtSAR } from "@/services/erp/purchasing";
import { ProductPicker } from "@/components/erp/ProductPicker";
import { ColorPicker } from "@/components/erp/ColorPicker";
import { categoryFromDepartment, type Product, type ProductCategory } from "@/services/erp/masterData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

type Draft = {
  product_id?: string; product_code?: string;
  kind: ItemKind;
  description: string;
  brand?: string; model?: string; year?: number;
  color_id?: string; color_name?: string;
  qty: number; unit_cost: number; vat_pct: number;
};

const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];
const DEPARTMENTS = ["المبيعات", "قطع الغيار", "الورشة", "الإدارة", "خدمة العملاء"];

const emptyDraft = (): Draft => ({ kind: "vehicle", description: "", qty: 1, unit_cost: 0, vat_pct: 15 });

export function PurchaseRequestDialog({ open, onOpenChange, onCreated }: Props) {
  const [requester, setRequester] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<Draft[]>([emptyDraft()]);

  // Role-based picker: lock category to the department
  const allowedCategory: ProductCategory | null = categoryFromDepartment(department);

  const subtotal = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const vatTotal = items.reduce((s, i) => s + i.qty * i.unit_cost * (i.vat_pct / 100), 0);
  const grand = subtotal + vatTotal;

  const update = (idx: number, patch: Partial<Draft>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const onPickProduct = (idx: number, p: Product) => {
    update(idx, {
      product_id: p.id, product_code: p.code,
      kind: p.category === "vehicle" ? "vehicle" : "part",
      description: p.name,
      brand: p.brand, model: p.model, year: p.year,
      unit_cost: p.default_unit_price ?? items[idx].unit_cost,
    });
  };

  const reset = () => {
    setRequester(""); setDepartment(DEPARTMENTS[0]); setBranch(BRANCHES[0]);
    setUrgency("normal"); setJustification("");
    setItems([emptyDraft()]);
  };

  const submit = (asDraft: boolean) => {
    if (!requester.trim()) return toast.error("يرجى إدخال اسم الطالب");
    if (!justification.trim()) return toast.error("يرجى إدخال مبرر الطلب");
    const valid = items.filter(i => i.description.trim() && i.qty > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل");

    const pr = purchasingService.createPR({
      requester, department, branch, urgency, justification,
      items: valid, submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظت المسودة ${pr.code}` : `أُرسل الطلب ${pr.code} للاعتماد`);
    onOpenChange(false); reset(); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
          <DialogDescription>أنشئ طلب شراء داخلي للاعتماد قبل تحويله إلى أمر شراء.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الطالب</Label>
            <Input value={requester} onChange={e => setRequester(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الأولوية</Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="normal">عادية</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="critical">حرجة</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">القسم</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
            {allowedCategory && (
              <div className="text-[10px] text-muted-foreground">منتقي الأصناف مُقيّد بـ: {allowedCategory === "vehicle" ? "مركبات" : allowedCategory === "part" ? "قطع غيار" : "خدمات"}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الفرع</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">مبرر الطلب</Label>
          <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">الأصناف</Label>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setItems([...items, emptyDraft()])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> إضافة سطر
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="erp-table text-[11px]">
              <thead>
                <tr>
                  <th className="min-w-[180px]">المنتج</th>
                  <th className="min-w-[180px]">الوصف</th>
                  <th className="w-[120px]">اللون</th>
                  <th className="w-[110px]">الموديل</th>
                  <th className="w-[70px]">السنة</th>
                  <th className="w-[60px]">الكمية</th>
                  <th className="w-[110px]">سعر الوحدة</th>
                  <th className="w-[60px]">ض.ق.م %</th>
                  <th className="w-[100px]">الإجمالي</th>
                  <th className="w-[36px]"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => {
                  const lineTotal = it.qty * it.unit_cost * (1 + it.vat_pct / 100);
                  return (
                    <tr key={idx}>
                      <td><ProductPicker value={it.product_id ?? null} onChange={(p) => onPickProduct(idx, p)} category={allowedCategory} /></td>
                      <td><Input className="h-8" value={it.description} onChange={e => update(idx, { description: e.target.value })} placeholder="وصف" /></td>
                      <td>{it.kind === "vehicle" ? <ColorPicker value={it.color_id} onChange={(c) => update(idx, { color_id: c.id, color_name: c.name_ar })} /> : <span className="text-muted-foreground text-[10px]">—</span>}</td>
                      <td><Input className="h-8" value={it.model ?? ""} onChange={e => update(idx, { model: e.target.value })} /></td>
                      <td><Input className="h-8 num" type="number" value={it.year ?? ""} onChange={e => update(idx, { year: e.target.value ? Number(e.target.value) : undefined })} /></td>
                      <td><Input className="h-8 num" type="number" min={1} value={it.qty} onChange={e => update(idx, { qty: Number(e.target.value) })} /></td>
                      <td><Input className="h-8 num" type="number" min={0} value={it.unit_cost} onChange={e => update(idx, { unit_cost: Number(e.target.value) })} /></td>
                      <td><Input className="h-8 num" type="number" min={0} value={it.vat_pct} onChange={e => update(idx, { vat_pct: Number(e.target.value) })} /></td>
                      <td className="num text-[11px] font-semibold">{fmtSAR(lineTotal)}</td>
                      <td><Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}><Trash2 className="h-3.5 w-3.5" /></Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="text-left mt-2 text-xs space-y-0.5">
            <div>قبل الضريبة: <span className="font-mono">{fmtSAR(subtotal)}</span></div>
            <div>الضريبة: <span className="font-mono">{fmtSAR(vatTotal)}</span></div>
            <div className="text-sm">الإجمالي: <span className="font-bold font-mono">{fmtSAR(grand)}</span></div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
