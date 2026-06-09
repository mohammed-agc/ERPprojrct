/**
 * SalaryComponents — إدارة مكونات الراتب
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, DollarSign, Edit, Trash2, Save, ArrowUp, ArrowDown } from "lucide-react";

export default function SalaryComponents() {
  const [components, setComponents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("salary_components").select("*").order("sort_order");
    if (error) toast.error(error.message);
    else setComponents(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const earnings = components.filter(c => c.type === "earning");
  const deductions = components.filter(c => c.type === "deduction");

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`حذف "${name}"؟`)) return;
    const { error } = await supabase.from("salary_components").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            مكونات الراتب
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {earnings.length} استحقاق · {deductions.length} خصم
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-2" /> مكون جديد
        </Button>
      </div>

      {/* الاستحقاقات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
            <ArrowUp className="h-5 w-5" />
            الاستحقاقات (Earnings)
            <Badge className="bg-emerald-500/10 text-emerald-700">{earnings.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 z-10">
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الفئة</TableHead>
                <TableHead>الحساب</TableHead>
                <TableHead>المبلغ الافتراضي</TableHead>
                <TableHead>تأمينات</TableHead>
                <TableHead>EOSB</TableHead>
                <TableHead className="w-20">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {earnings.map(c => (
                <TableRow key={c.id}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.code}</code></TableCell>
                  <TableCell className="font-medium">{c.name_ar}</TableCell>
                  <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                  <TableCell>
                    {c.calculation_type === "fixed" ? "ثابت" : c.calculation_type === "percentage" ? "نسبة" : "صيغة"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {c.calculation_type === "percentage" ? `${c.default_percentage}%` : c.default_amount?.toLocaleString('en-US') ?? "—"}
                  </TableCell>
                  <TableCell>{c.is_gosi_eligible ? <Badge className="bg-blue-500/10 text-blue-700">نعم</Badge> : <Badge variant="outline">لا</Badge>}</TableCell>
                  <TableCell>{c.is_eosb_eligible ? <Badge className="bg-purple-500/10 text-purple-700">نعم</Badge> : <Badge variant="outline">لا</Badge>}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id, c.name_ar)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* الخصومات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-rose-700">
            <ArrowDown className="h-5 w-5" />
            الخصومات (Deductions)
            <Badge className="bg-rose-500/10 text-rose-700">{deductions.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 z-10">
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>الفئة</TableHead>
                <TableHead>الحساب</TableHead>
                <TableHead>المبلغ/النسبة</TableHead>
                <TableHead className="w-20">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deductions.map(c => (
                <TableRow key={c.id}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.code}</code></TableCell>
                  <TableCell className="font-medium">{c.name_ar}</TableCell>
                  <TableCell><Badge variant="outline">{c.category}</Badge></TableCell>
                  <TableCell>
                    {c.calculation_type === "fixed" ? "ثابت" : c.calculation_type === "percentage" ? "نسبة" : "صيغة"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {c.calculation_type === "percentage" ? `${c.default_percentage}%` : c.default_amount?.toLocaleString('en-US') ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setDialogOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(c.id, c.name_ar)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialogOpen && (
        <ComponentDialog
          component={editing}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ComponentDialog({ component, open, onClose, onSaved }: any) {
  const isEdit = !!component;
  const [code, setCode] = useState(component?.code ?? "");
  const [nameAr, setNameAr] = useState(component?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(component?.name_en ?? "");
  const [type, setType] = useState(component?.type ?? "earning");
  const [category, setCategory] = useState(component?.category ?? "allowance");
  const [calcType, setCalcType] = useState(component?.calculation_type ?? "fixed");
  const [defaultAmount, setDefaultAmount] = useState(component?.default_amount ?? 0);
  const [defaultPercentage, setDefaultPercentage] = useState(component?.default_percentage ?? 0);
  const [isGosi, setIsGosi] = useState(component?.is_gosi_eligible ?? false);
  const [isEosb, setIsEosb] = useState(component?.is_eosb_eligible ?? false);
  const [isTaxable, setIsTaxable] = useState(component?.is_taxable ?? true);

  const handleSave = async () => {
    if (!code.trim() || !nameAr.trim()) { toast.error("الكود والاسم مطلوبان"); return; }
    const payload = {
      code: code.trim().toUpperCase(),
      name_ar: nameAr.trim(),
      name_en: nameEn.trim() || null,
      type, category,
      calculation_type: calcType,
      default_amount: calcType !== "percentage" ? Number(defaultAmount) || 0 : null,
      default_percentage: calcType === "percentage" ? Number(defaultPercentage) || 0 : null,
      is_gosi_eligible: isGosi,
      is_eosb_eligible: isEosb,
      is_taxable: isTaxable,
    };
    const { error } = isEdit
      ? await supabase.from("salary_components").update(payload).eq("id", component.id)
      : await supabase.from("salary_components").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "تم الحفظ" : "تم الإنشاء");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل المكون" : "مكون راتب جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الكود *</label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ALW_HOUSING" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">النوع *</label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="earning">استحقاق</SelectItem>
                  <SelectItem value="deduction">خصم</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم العربي *</label>
            <Input value={nameAr} onChange={e => setNameAr(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم الإنجليزي</label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الفئة</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">أساسي</SelectItem>
                  <SelectItem value="allowance">بدل</SelectItem>
                  <SelectItem value="bonus">مكافأة</SelectItem>
                  <SelectItem value="gosi">تأمينات</SelectItem>
                  <SelectItem value="tax">ضريبة</SelectItem>
                  <SelectItem value="loan">قرض</SelectItem>
                  <SelectItem value="advance">سلفة</SelectItem>
                  <SelectItem value="penalty">جزاء</SelectItem>
                  <SelectItem value="insurance">تأمين طبي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">طريقة الحساب</label>
              <Select value={calcType} onValueChange={setCalcType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                  <SelectItem value="percentage">نسبة %</SelectItem>
                  <SelectItem value="formula">صيغة محسوبة</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {calcType === "percentage" ? (
            <div>
              <label className="text-sm font-medium mb-1 block">النسبة الافتراضية %</label>
              <Input type="number" step="0.01" value={defaultPercentage} onChange={e => setDefaultPercentage(Number(e.target.value))} />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ الافتراضي</label>
              <Input type="number" value={defaultAmount} onChange={e => setDefaultAmount(Number(e.target.value))} />
            </div>
          )}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isGosi} onChange={e => setIsGosi(e.target.checked)} />
              يحتسب ضمن التأمينات الاجتماعية
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isEosb} onChange={e => setIsEosb(e.target.checked)} />
              يحتسب ضمن مكافأة نهاية الخدمة (EOSB)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isTaxable} onChange={e => setIsTaxable(e.target.checked)} />
              خاضع للضريبة
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> {isEdit ? "حفظ" : "إنشاء"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
