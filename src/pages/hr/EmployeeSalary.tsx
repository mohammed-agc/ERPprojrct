/**
 * EmployeeSalary — إدارة راتب الموظف الشخصي
 * إضافة/تعديل/حذف مكونات الراتب لكل موظف (بدلات، خصومات، مكافآت)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowRight, Plus, DollarSign, Edit, Trash2, Save, ArrowUp, ArrowDown, Calculator } from "lucide-react";

export default function EmployeeSalary() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(null);
  const [salaries, setSalaries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [empRes, salRes] = await Promise.all([
      supabase.from("employees").select("*, position:job_positions(title_ar)").eq("id", id).single(),
      supabase
        .from("employee_salaries")
        .select("*, component:salary_components(*)")
        .eq("employee_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (empRes.error) { toast.error(empRes.error.message); navigate("/hr/employees"); return; }
    setEmployee(empRes.data);
    setSalaries(salRes.data ?? []);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (sid: string, name: string) => {
    if (!confirm(`حذف "${name}" من راتب الموظف؟`)) return;
    const { error } = await supabase.from("employee_salaries").delete().eq("id", sid);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    load();
  };

  const earnings = salaries.filter(s => s.component?.type === "earning");
  const deductions = salaries.filter(s => s.component?.type === "deduction");

  // الحسابات
  const calculations = useMemo(() => {
    const basic = employee?.basic_salary ?? 0;
    
    let totalEarnings = basic;
    let totalDeductions = 0;
    let gosiBase = basic;
    
    earnings.forEach(e => {
      const amount = e.percentage 
        ? (basic * e.percentage / 100) 
        : (e.amount ?? 0);
      totalEarnings += amount;
      if (e.component?.is_gosi_eligible) gosiBase += amount;
    });
    
    deductions.forEach(d => {
      const amount = d.percentage 
        ? (basic * d.percentage / 100) 
        : (d.amount ?? 0);
      totalDeductions += amount;
    });
    
    // GOSI تلقائي للسعوديين 9.75%
    const gosiAmount = employee?.is_saudi ? (gosiBase * 0.0975) : 0;
    
    const grossSalary = totalEarnings;
    const totalDeductionsWithGosi = totalDeductions + gosiAmount;
    const netSalary = grossSalary - totalDeductionsWithGosi;
    
    return {
      basic,
      totalEarnings,
      totalDeductions: totalDeductionsWithGosi,
      gosiAmount,
      gosiBase,
      grossSalary,
      netSalary,
    };
  }, [employee, earnings, deductions]);

  if (loading || !employee) {
    return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(`/hr/employees/${id}`)}>
          <ArrowRight className="h-4 w-4 ml-2" /> العودة للموظف
        </Button>
      </div>

      {/* رأس الصفحة */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{employee.full_name_ar}</h1>
              <div className="text-sm text-muted-foreground">
                {employee.position?.title_ar ?? "—"} · {employee.employee_no}
              </div>
            </div>
            <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 ml-2" /> إضافة مكون
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ملخص الحسابات */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-muted-foreground">الراتب الأساسي</div>
            <div className="text-2xl font-bold mt-1">{calculations.basic.toLocaleString('en-US')}</div>
            <div className="text-xs text-muted-foreground">ر.س</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-300">
          <CardContent className="p-4">
            <div className="text-sm text-emerald-700">إجمالي الاستحقاقات</div>
            <div className="text-2xl font-bold mt-1 text-emerald-700">{calculations.grossSalary.toLocaleString('en-US')}</div>
            <div className="text-xs text-muted-foreground">+بدلات ومكافآت</div>
          </CardContent>
        </Card>
        <Card className="border-rose-300">
          <CardContent className="p-4">
            <div className="text-sm text-rose-700">إجمالي الخصومات</div>
            <div className="text-2xl font-bold mt-1 text-rose-700">{calculations.totalDeductions.toLocaleString('en-US')}</div>
            <div className="text-xs text-muted-foreground">
              تأمينات: {calculations.gosiAmount.toFixed(0)} ر.س
            </div>
          </CardContent>
        </Card>
        <Card className="border-blue-300 bg-blue-50/50">
          <CardContent className="p-4">
            <div className="text-sm text-blue-700">الصافي الشهري</div>
            <div className="text-2xl font-bold mt-1 text-blue-700">{calculations.netSalary.toLocaleString('en-US')}</div>
            <div className="text-xs text-muted-foreground">ر.س</div>
          </CardContent>
        </Card>
      </div>

      {/* الاستحقاقات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-emerald-700">
            <ArrowUp className="h-5 w-5" />
            الاستحقاقات (البدلات والمكافآت)
            <Badge className="bg-emerald-500/10 text-emerald-700">{earnings.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {earnings.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              لم تتم إضافة بدلات بعد. اضغط "إضافة مكون" لإضافة بدل أو مكافأة.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>المكون</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>المبلغ/النسبة</TableHead>
                  <TableHead>القيمة المحسوبة</TableHead>
                  <TableHead>من تاريخ</TableHead>
                  <TableHead>إلى تاريخ</TableHead>
                  <TableHead className="w-20">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings.map(s => {
                  const calculated = s.percentage 
                    ? (calculations.basic * s.percentage / 100) 
                    : (s.amount ?? 0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.component?.name_ar}</div>
                        <code className="text-xs text-muted-foreground">{s.component?.code}</code>
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.component?.category}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">
                        {s.percentage ? `${s.percentage}%` : s.amount?.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-emerald-700">
                        {calculated.toLocaleString('en-US')} ر.س
                      </TableCell>
                      <TableCell className="text-sm">{new Date(s.effective_from).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell className="text-sm">
                        {s.effective_to ? new Date(s.effective_to).toLocaleDateString('en-GB') : <span className="text-muted-foreground">مستمر</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id, s.component?.name_ar)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* الخصومات */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-rose-700">
            <ArrowDown className="h-5 w-5" />
            الخصومات
            <Badge className="bg-rose-500/10 text-rose-700">{deductions.length}</Badge>
            {employee.is_saudi && (
              <Badge className="bg-blue-500/10 text-blue-700 mr-2">
                + GOSI 9.75% تلقائي ({calculations.gosiAmount.toFixed(2)} ر.س)
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deductions.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              لا توجد خصومات يدوية. التأمينات الاجتماعية تُحسب تلقائياً.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow>
                  <TableHead>المكون</TableHead>
                  <TableHead>الفئة</TableHead>
                  <TableHead>المبلغ/النسبة</TableHead>
                  <TableHead>القيمة المحسوبة</TableHead>
                  <TableHead>من تاريخ</TableHead>
                  <TableHead className="w-20">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductions.map(s => {
                  const calculated = s.percentage 
                    ? (calculations.basic * s.percentage / 100) 
                    : (s.amount ?? 0);
                  return (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-medium">{s.component?.name_ar}</div>
                        <code className="text-xs text-muted-foreground">{s.component?.code}</code>
                      </TableCell>
                      <TableCell><Badge variant="outline">{s.component?.category}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">
                        {s.percentage ? `${s.percentage}%` : s.amount?.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-bold text-rose-700">
                        {calculated.toLocaleString('en-US')} ر.س
                      </TableCell>
                      <TableCell className="text-sm">{new Date(s.effective_from).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id, s.component?.name_ar)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && (
        <SalaryComponentDialog
          employeeId={id!}
          basicSalary={calculations.basic}
          editing={editing}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function SalaryComponentDialog({ employeeId, basicSalary, editing, open, onClose, onSaved }: any) {
  const isEdit = !!editing;
  const [components, setComponents] = useState<any[]>([]);
  const [componentId, setComponentId] = useState(editing?.component_id ?? "");
  const [useType, setUseType] = useState<"amount" | "percentage">(editing?.percentage ? "percentage" : "amount");
  const [amount, setAmount] = useState(editing?.amount ?? 0);
  const [percentage, setPercentage] = useState(editing?.percentage ?? 0);
  const [effectiveFrom, setEffectiveFrom] = useState(editing?.effective_from ?? new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState(editing?.effective_to ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");

  useEffect(() => {
    (async () => {
      // نستثني GOSI لأنه يُحسب تلقائياً
      const { data } = await supabase
        .from("salary_components")
        .select("*")
        .eq("active", true)
        .not("code", "in", "(GOSI_EMP,GOSI_EMP_NON)")
        .order("type")
        .order("sort_order");
      setComponents(data ?? []);
    })();
  }, []);

  const selectedComponent = components.find(c => c.id === componentId);

  // عند اختيار مكون، عبئ القيم الافتراضية
  useEffect(() => {
    if (!isEdit && selectedComponent) {
      if (selectedComponent.calculation_type === "percentage" && selectedComponent.default_percentage) {
        setUseType("percentage");
        setPercentage(selectedComponent.default_percentage);
        setAmount(0);
      } else {
        setUseType("amount");
        setAmount(selectedComponent.default_amount ?? 0);
        setPercentage(0);
      }
    }
  }, [componentId, selectedComponent, isEdit]);

  const calculated = useType === "percentage" 
    ? (basicSalary * Number(percentage) / 100) 
    : Number(amount);

  const handleSave = async () => {
    if (!componentId) { toast.error("اختر المكون"); return; }
    if (useType === "amount" && amount <= 0) { toast.error("المبلغ يجب أن يكون أكبر من 0"); return; }
    if (useType === "percentage" && percentage <= 0) { toast.error("النسبة يجب أن تكون أكبر من 0"); return; }
    
    const payload = {
      employee_id: employeeId,
      component_id: componentId,
      amount: useType === "amount" ? Number(amount) : null,
      percentage: useType === "percentage" ? Number(percentage) : null,
      effective_from: effectiveFrom,
      effective_to: effectiveTo || null,
      notes: notes.trim() || null,
    };
    
    const { error } = isEdit
      ? await supabase.from("employee_salaries").update(payload).eq("id", editing.id)
      : await supabase.from("employee_salaries").insert(payload);
    
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "تم التحديث" : "تم الإضافة");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل مكون الراتب" : "إضافة مكون راتب"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-sm font-medium mb-1 block">المكون *</label>
            <Select value={componentId} onValueChange={setComponentId} disabled={isEdit}>
              <SelectTrigger><SelectValue placeholder="اختر بدل أو خصم..." /></SelectTrigger>
              <SelectContent>
                <div className="px-2 py-1 text-xs font-bold text-emerald-700">الاستحقاقات</div>
                {components.filter(c => c.type === "earning").map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_ar} ({c.code})
                  </SelectItem>
                ))}
                <div className="px-2 py-1 text-xs font-bold text-rose-700 mt-2">الخصومات</div>
                {components.filter(c => c.type === "deduction").map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_ar} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedComponent && (
            <div className="p-2 bg-muted/50 rounded text-xs">
              <span className="font-medium">{selectedComponent.type === "earning" ? "استحقاق" : "خصم"}</span>
              {selectedComponent.is_gosi_eligible && " · يحتسب في GOSI"}
              {selectedComponent.is_eosb_eligible && " · يحتسب في EOSB"}
            </div>
          )}

          <div>
            <label className="text-sm font-medium mb-1 block">طريقة الحساب</label>
            <Select value={useType} onValueChange={v => setUseType(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">مبلغ ثابت</SelectItem>
                <SelectItem value="percentage">نسبة من الراتب الأساسي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {useType === "amount" ? (
            <div>
              <label className="text-sm font-medium mb-1 block">المبلغ (ر.س) *</label>
              <Input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))} />
            </div>
          ) : (
            <div>
              <label className="text-sm font-medium mb-1 block">النسبة % *</label>
              <Input type="number" step="0.01" value={percentage} onChange={e => setPercentage(Number(e.target.value))} />
              <div className="text-xs text-muted-foreground mt-1">
                = {(basicSalary * Number(percentage) / 100).toLocaleString('en-US')} ر.س من راتب أساسي {basicSalary.toLocaleString('en-US')}
              </div>
            </div>
          )}

          <div className="p-3 bg-blue-50/50 border border-blue-200 rounded">
            <div className="text-xs text-muted-foreground">القيمة المحسوبة:</div>
            <div className="text-xl font-bold text-blue-700">{calculated.toLocaleString('en-US')} ر.س / شهر</div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">من تاريخ *</label>
              <Input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">إلى تاريخ (اختياري)</label>
              <Input type="date" value={effectiveTo} onChange={e => setEffectiveTo(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">ملاحظات</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> {isEdit ? "حفظ" : "إضافة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
