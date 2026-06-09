/**
 * LeaveTypes — إدارة أنواع الإجازات (وفق نظام العمل السعودي)
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Heart, Edit, Trash2, Save, FileText } from "lucide-react";

const GENDER_LABEL: Record<string, string> = { all: "الجميع", male: "ذكور", female: "إناث" };
const RELIGION_LABEL: Record<string, string> = { all: "الجميع", muslim: "مسلمين" };

export default function LeaveTypes() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("leave_types").select("*").order("sort_order");
    if (error) toast.error(error.message);
    else setTypes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`حذف "${name}"؟`)) return;
    const { error } = await supabase.from("leave_types").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6" />
            أنواع الإجازات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {types.length} نوع · متوافق مع نظام العمل السعودي (المواد 109-160)
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-2" /> نوع جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/60 z-10">
              <TableRow>
                <TableHead>الكود</TableHead>
                <TableHead>الاسم</TableHead>
                <TableHead>أيام/سنة</TableHead>
                <TableHead>أقصى لطلب</TableHead>
                <TableHead>الأجر</TableHead>
                <TableHead>الجنس</TableHead>
                <TableHead>الديانة</TableHead>
                <TableHead>المرجع</TableHead>
                <TableHead className="w-20">إجراء</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {types.map(t => (
                <TableRow key={t.id}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{t.code}</code></TableCell>
                  <TableCell className="font-medium">{t.name_ar}</TableCell>
                  <TableCell>{t.days_per_year ?? "—"}</TableCell>
                  <TableCell>{t.max_days_per_request ?? "—"}</TableCell>
                  <TableCell>
                    {t.is_paid ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700">{t.pay_percentage}%</Badge>
                    ) : (
                      <Badge variant="outline">بدون</Badge>
                    )}
                  </TableCell>
                  <TableCell><Badge variant="outline">{GENDER_LABEL[t.applies_to_gender] ?? "—"}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{RELIGION_LABEL[t.applies_to_religion] ?? "—"}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{t.legal_reference ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setDialogOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id, t.name_ar)}>
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
        <LeaveTypeDialog
          leaveType={editing}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function LeaveTypeDialog({ leaveType, open, onClose, onSaved }: any) {
  const isEdit = !!leaveType;
  const [code, setCode] = useState(leaveType?.code ?? "");
  const [nameAr, setNameAr] = useState(leaveType?.name_ar ?? "");
  const [nameEn, setNameEn] = useState(leaveType?.name_en ?? "");
  const [isPaid, setIsPaid] = useState(leaveType?.is_paid ?? true);
  const [payPercentage, setPayPercentage] = useState(leaveType?.pay_percentage ?? 100);
  const [daysPerYear, setDaysPerYear] = useState(leaveType?.days_per_year ?? 0);
  const [maxPerRequest, setMaxPerRequest] = useState(leaveType?.max_days_per_request ?? 0);
  const [gender, setGender] = useState(leaveType?.applies_to_gender ?? "all");
  const [religion, setReligion] = useState(leaveType?.applies_to_religion ?? "all");
  const [legalRef, setLegalRef] = useState(leaveType?.legal_reference ?? "");

  const handleSave = async () => {
    if (!code.trim() || !nameAr.trim()) { toast.error("الكود والاسم مطلوبان"); return; }
    const payload = {
      code: code.trim().toUpperCase(),
      name_ar: nameAr.trim(),
      name_en: nameEn.trim() || null,
      is_paid: isPaid,
      pay_percentage: isPaid ? Number(payPercentage) : 0,
      days_per_year: Number(daysPerYear) || null,
      max_days_per_request: Number(maxPerRequest) || null,
      applies_to_gender: gender,
      applies_to_religion: religion,
      legal_reference: legalRef.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from("leave_types").update(payload).eq("id", leaveType.id)
      : await supabase.from("leave_types").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? "تم الحفظ" : "تم الإنشاء");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "تعديل نوع الإجازة" : "نوع إجازة جديد"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الكود *</label>
              <Input value={code} onChange={e => setCode(e.target.value)} placeholder="ANNUAL" />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الاسم العربي *</label>
              <Input value={nameAr} onChange={e => setNameAr(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">الاسم الإنجليزي</label>
            <Input value={nameEn} onChange={e => setNameEn(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">أيام/سنة</label>
              <Input type="number" value={daysPerYear} onChange={e => setDaysPerYear(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">أقصى لطلب</label>
              <Input type="number" value={maxPerRequest} onChange={e => setMaxPerRequest(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">نسبة الأجر %</label>
              <Input type="number" value={payPercentage} onChange={e => setPayPercentage(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="paid" checked={isPaid} onChange={e => setIsPaid(e.target.checked)} />
            <label htmlFor="paid" className="text-sm">إجازة مدفوعة</label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">الجنس</label>
              <Select value={gender} onValueChange={setGender}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الجميع</SelectItem>
                  <SelectItem value="male">ذكور</SelectItem>
                  <SelectItem value="female">إناث</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الديانة</label>
              <Select value={religion} onValueChange={setReligion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الجميع</SelectItem>
                  <SelectItem value="muslim">مسلمين</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">المرجع القانوني</label>
            <Input value={legalRef} onChange={e => setLegalRef(e.target.value)} placeholder="المادة 109 - نظام العمل" />
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
