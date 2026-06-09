/**
 * Payroll — لوحة كشوف الرواتب (مع ربط التفاصيل)
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, DollarSign, Save, Eye } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  draft: "مسودة", calculated: "محسوب", approved: "معتمد", paid: "مدفوع", cancelled: "ملغي",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-500/10 text-slate-700",
  calculated: "bg-blue-500/10 text-blue-700",
  approved: "bg-emerald-500/10 text-emerald-700",
  paid: "bg-purple-500/10 text-purple-700",
  cancelled: "bg-rose-500/10 text-rose-700",
};

const MONTH_LABEL = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function Payroll() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRunOpen, setNewRunOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payroll_runs")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (error) toast.error(error.message);
    else setRuns(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            كشوف الرواتب
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {runs.length} كشف · إدارة رواتب الموظفين الشهرية
          </p>
        </div>
        <Button onClick={() => setNewRunOpen(true)}>
          <Plus className="h-4 w-4 ml-2" /> كشف جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {runs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لم يتم إنشاء أي كشف رواتب بعد</p>
              <Button onClick={() => setNewRunOpen(true)} className="mt-4">
                <Plus className="h-4 w-4 ml-2" /> إنشاء أول كشف
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 z-10">
                <TableRow>
                  <TableHead>الرقم</TableHead>
                  <TableHead>الفترة</TableHead>
                  <TableHead>تاريخ الدفع</TableHead>
                  <TableHead>عدد الموظفين</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>الخصومات</TableHead>
                  <TableHead>الصافي</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-32">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(r => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/40" onClick={() => navigate(`/hr/payroll/${r.id}`)}>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.run_no}</code></TableCell>
                    <TableCell className="font-medium">
                      {MONTH_LABEL[r.period_month - 1]} {r.period_year}
                    </TableCell>
                    <TableCell>{new Date(r.pay_date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell>{r.total_employees ?? 0}</TableCell>
                    <TableCell className="font-mono text-sm">{(r.total_earnings ?? 0).toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm text-rose-600">{(r.total_deductions ?? 0).toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm font-bold text-emerald-700">{(r.total_net ?? 0).toLocaleString('en-US')}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost">
                        <Eye className="h-3.5 w-3.5" /> فتح
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {newRunOpen && <NewPayrollDialog open={newRunOpen} onClose={() => setNewRunOpen(false)} onSaved={load} />}
    </div>
  );
}

function NewPayrollDialog({ open, onClose, onSaved }: any) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payDate, setPayDate] = useState(new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10));

  const handleSave = async () => {
    const periodStart = new Date(year, month - 1, 1).toISOString().slice(0, 10);
    const periodEnd = new Date(year, month, 0).toISOString().slice(0, 10);
    const runNo = `PAY-${year}-${String(month).padStart(2, '0')}`;
    
    const { error } = await supabase.from("payroll_runs").insert({
      run_no: runNo,
      period_year: year,
      period_month: month,
      period_label: `${MONTH_LABEL[month - 1]} ${year}`,
      pay_date: payDate,
      period_start: periodStart,
      period_end: periodEnd,
      status: "draft",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء كشف الرواتب");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>كشف رواتب جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">السنة *</label>
              <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الشهر *</label>
              <Select value={month.toString()} onValueChange={v => setMonth(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_LABEL.map((m, i) => (
                    <SelectItem key={i+1} value={(i+1).toString()}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">تاريخ الدفع *</label>
            <Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> إنشاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
