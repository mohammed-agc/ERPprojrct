import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Calculator } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createPurchaseOrder, listActiveSuppliers, type POLineInput } from "@/services/erp/purchasingDb";
import { useBranches } from "@/lib/company/useBranches";

interface Brand { id: string; name: string; }
interface VehicleModel { id: string; name: string; brand_id: string; }
interface Trim { id: string; name: string; model_id: string; }
interface Color { id: string; name: string; hex?: string; }

interface POLine extends POLineInput {
  trim?: string;
  _subtotal: number;
  _total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + 1 - i);
const PAYMENT_TERMS = [
  { value: "cash", label: "نقداً" },
  { value: "net_30", label: "30 يوم" },
  { value: "net_60", label: "60 يوم" },
  { value: "net_90", label: "90 يوم" },
];

const emptyLine = (): POLine => ({
  brand: "", model: "", trim: "", year: new Date().getFullYear(),
  color: "", quantity: 1, unit_cost: 0, vat_pct: 15,
  _subtotal: 0, _total: 0,
});

function calcLine(l: POLine): POLine {
  const sub   = (l.quantity || 0) * (l.unit_cost || 0);
  const total = sub * (1 + (l.vat_pct ?? 15) / 100);
  return { ...l, _subtotal: sub, _total: total };
}

function fmtN(n: number) {
  return new Intl.NumberFormat("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

export function PurchaseOrderDbDialog({ open, onOpenChange, onCreated }: Props) {

  const { data: suppliers = [] } = useQuery({
    queryKey: ["active-suppliers"],
    queryFn: listActiveSuppliers,
    enabled: open,
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ["vehicle-brands"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_brands").select("id,name").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: allModels = [] } = useQuery<VehicleModel[]>({
    queryKey: ["vehicle-models"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_models").select("id,name,brand_id").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: allTrims = [] } = useQuery<Trim[]>({
    queryKey: ["vehicle-trims"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_trims").select("id,name,model_id").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: colors = [] } = useQuery<Color[]>({
    queryKey: ["vehicle-colors"],
    queryFn: async () => {
      const { data } = await supabase.from("vehicle_colors").select("id,name,hex").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const [supplierId,  setSupplierId]  = useState("");
  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const [expected,    setExpected]    = useState("");
  const [paymentTerm, setPaymentTerm] = useState("net_30");
  const [branch,      setBranch]      = useState("");
  const { branches } = useBranches();
  const [agreementType, setAgreementType] = useState("framework");
  const [notes,       setNotes]       = useState("");
  const [lines,       setLines]       = useState<POLine[]>([emptyLine()]);
  const [saving,      setSaving]      = useState(false);

  const reset = () => {
    setSupplierId(""); setExpected(""); setPaymentTerm("net_30");
    setBranch(""); setNotes(""); setLines([emptyLine()]);
  };

  const updateLine = (i: number, patch: Partial<POLine>) =>
    setLines(prev => prev.map((l, idx) => idx === i ? calcLine({ ...l, ...patch }) : l));

  const addLine    = () => setLines(prev => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const subtotal   = lines.reduce((s, l) => s + l._subtotal, 0);
  const vatAmount  = lines.reduce((s, l) => s + (l._total - l._subtotal), 0);
  const grandTotal = subtotal + vatAmount;

  const submit = async () => {
    if (!supplierId) return toast.error("اختر المورد");
    const valid = lines.filter(l =>
      l.brand.trim() && l.model.trim() &&
      Number(l.quantity) > 0 && Number(l.unit_cost) > 0
    );
    if (!valid.length) return toast.error("أضف بنداً صالحاً (ماركة + موديل + كمية + سعر)");
    setSaving(true);
    try {
      const po = await createPurchaseOrder({
        supplier_id: supplierId,
        expected_delivery: expected || null,
        notes: notes.trim() || undefined,
        lines: valid,
      });
      toast.success(`تم إنشاء أمر الشراء ${po.po_no || po.id.slice(0, 8)}`);
      onOpenChange(false); reset(); onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء أمر الشراء");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>أنشئ أمر شراء مباشر إلى المورد. يبدأ كمسودة، ثم يُرسل ويُؤكّد.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">المورد *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>
                {suppliers.length === 0 && <div className="px-2 py-1 text-xs text-muted-foreground">لا يوجد موردون</div>}
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} {s.code ? `— ${s.code}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedSupplier && (selectedSupplier as any).credit_limit > 0 && (
            <div className="col-span-2 bg-muted/30 border border-border rounded-lg px-3 py-2 text-xs flex gap-4 text-muted-foreground">
              <span>الحد الائتماني: <strong className="text-foreground">{((selectedSupplier as any).credit_limit ?? 0).toLocaleString("en-US")} SAR</strong></span>
              <span>المستخدم: <strong className="text-amber-600">{((selectedSupplier as any).credit_used ?? 0).toLocaleString("en-US")} SAR</strong></span>
              <span>المتبقي: <strong className="text-green-600">{(((selectedSupplier as any).credit_limit ?? 0) - ((selectedSupplier as any).credit_used ?? 0)).toLocaleString("en-US")} SAR</strong></span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">تاريخ الوصول المتوقع</Label>
            <Input type="date" className="h-9" value={expected} onChange={e => setExpected(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">شروط الدفع</Label>
            <Select value={paymentTerm} onValueChange={setPaymentTerm}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_TERMS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">نوع الاتفاقية</Label>
            <Select value={agreementType} onValueChange={setAgreementType}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="framework">إطارية</SelectItem>
                <SelectItem value="spot">فورية</SelectItem>
                <SelectItem value="consignment">أمانة</SelectItem>
                <SelectItem value="agency">وكالة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">الفرع / الوجهة</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
              <SelectContent>
                {branches.length === 0 ? (
                  <SelectItem value="__none__" disabled>لا توجد فروع. أنشئ فرعاً من الإعدادات.</SelectItem>
                ) : (
                  branches.map(b => <SelectItem key={b.id} value={b.code}>{b.name_ar}{b.city ? ` / ${b.city}` : ""}</SelectItem>)
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={1} className="resize-none" />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">بنود الأمر</Label>
            <Button size="sm" variant="outline" onClick={addLine}>
              <Plus className="h-3.5 w-3.5 ml-1" /> بند جديد
            </Button>
          </div>

          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-right px-2 py-2 font-medium">#</th>
                  <th className="text-right px-2 py-2 font-medium w-32">الماركة</th>
                  <th className="text-right px-2 py-2 font-medium w-32">الموديل</th>
                  <th className="text-right px-2 py-2 font-medium w-28">الفئة/الطراز</th>
                  <th className="text-right px-2 py-2 font-medium w-20">السنة</th>
                  <th className="text-right px-2 py-2 font-medium w-24">اللون</th>
                  <th className="text-right px-2 py-2 font-medium w-16">الكمية</th>
                  <th className="text-right px-2 py-2 font-medium w-28">سعر الوحدة</th>
                  <th className="text-right px-2 py-2 font-medium w-14">VAT%</th>
                  <th className="text-right px-2 py-2 font-medium w-32">الإجمالي</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const selectedBrand = brands.find(b => b.name === l.brand);
                  const filteredModels = selectedBrand
                    ? allModels.filter(m => m.brand_id === selectedBrand.id)
                    : allModels;

                  const selectedModel = allModels.find(m => m.name === l.model);
                  const filteredTrims = selectedModel
                    ? allTrims.filter(t => t.model_id === selectedModel.id)
                    : [];

                  return (
                    <tr key={i} className={`border-t border-border ${i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}>
                      <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>

                      {/* الماركة */}
                      <td className="px-1 py-1">
                        {brands.length > 0 ? (
                          <Select value={l.brand} onValueChange={v => updateLine(i, { brand: v, model: "", trim: "", color: "" })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الماركة" /></SelectTrigger>
                            <SelectContent>
                              {brands.map(b => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-8 text-xs" placeholder="الماركة" value={l.brand}
                            onChange={e => updateLine(i, { brand: e.target.value })} />
                        )}
                      </td>

                      {/* الموديل */}
                      <td className="px-1 py-1">
                        {filteredModels.length > 0 ? (
                          <Select value={l.model} onValueChange={v => updateLine(i, { model: v, trim: "" })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الموديل" /></SelectTrigger>
                            <SelectContent>
                              {filteredModels.map(m => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-8 text-xs" placeholder="الموديل" value={l.model}
                            onChange={e => updateLine(i, { model: e.target.value })} />
                        )}
                      </td>

                      {/* الفئة/الطراز */}
                      <td className="px-1 py-1">
                        {filteredTrims.length > 0 ? (
                          <Select value={l.trim ?? ""} onValueChange={v => updateLine(i, { trim: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="الفئة" /></SelectTrigger>
                            <SelectContent>
                              {filteredTrims.map(t => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-8 text-xs" placeholder="الفئة" value={l.trim ?? ""}
                            onChange={e => updateLine(i, { trim: e.target.value })} />
                        )}
                      </td>

                      {/* السنة */}
                      <td className="px-1 py-1">
                        <Select value={String(l.year)} onValueChange={v => updateLine(i, { year: Number(v) })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* اللون */}
                      <td className="px-1 py-1">
                        {colors.length > 0 ? (
                          <Select value={l.color ?? ""} onValueChange={v => updateLine(i, { color: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="اللون" /></SelectTrigger>
                            <SelectContent>
                              {colors.map(c => (
                                <SelectItem key={c.id} value={c.name}>
                                  <div className="flex items-center gap-2">
                                    {c.hex && <span className="w-3 h-3 rounded-full border inline-block" style={{ background: c.hex }} />}
                                    {c.name}
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input className="h-8 text-xs" placeholder="اللون" value={l.color ?? ""}
                            onChange={e => updateLine(i, { color: e.target.value })} />
                        )}
                      </td>

                      {/* الكمية */}
                      <td className="px-1 py-1">
                        <Input className="h-8 text-xs text-center" type="number" min={1}
                          value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) || 0 })} />
                      </td>

                      {/* سعر الوحدة */}
                      <td className="px-1 py-1">
                        <Input className="h-8 text-xs" type="text" inputMode="decimal" placeholder="0.00"
                          value={l.unit_cost || ""} onChange={e => updateLine(i, { unit_cost: Number(e.target.value) || 0 })} />
                      </td>

                      {/* VAT */}
                      <td className="px-1 py-1">
                        <Select value={String(l.vat_pct ?? 15)} onValueChange={v => updateLine(i, { vat_pct: Number(v) })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="15">15%</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* الإجمالي */}
                      <td className="px-2 py-1 font-semibold tabular-nums text-left">
                        {fmtN(l._total)} ر.س
                      </td>

                      {/* حذف */}
                      <td className="px-1 py-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                          disabled={lines.length === 1} onClick={() => removeLine(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-1.5 min-w-64">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>قبل الضريبة</span>
                <span className="tabular-nums font-medium">{fmtN(subtotal)} ر.س</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>ضريبة القيمة المضافة</span>
                <span className="tabular-nums font-medium">{fmtN(vatAmount)} ر.س</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border pt-1.5">
                <span className="flex items-center gap-1"><Calculator className="h-3.5 w-3.5" /> الإجمالي الكلي</span>
                <span className="tabular-nums text-primary">{fmtN(grandTotal)} ر.س</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving} className="min-w-32">
            {saving ? "جاري الحفظ…" : "إنشاء (مسودة)"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}





