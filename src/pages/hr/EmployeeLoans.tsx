/**
 * EmployeeLoans — إدارة السلف والقروض
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, DollarSign, Check, X, Save, Search } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الموافقة",
  approved: "معتمد",
  active: "نشط",
  paid: "مسدد",
  cancelled: "ملغي",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700",
  approved: "bg-blue-500/10 text-blue-700",
  active: "bg-emerald-500/10 text-emerald-700",
  paid: "bg-purple-500/10 text-purple-700",
  cancelled: "bg-rose-500/10 text-rose-700",
};

const TYPE_LABEL: Record<string, string> = {
  loan: "قرض",
  advance: "سلفة",
  salary_advance: "سلفة على الراتب",
};

export default function EmployeeLoans() {
  const [loans, setLoans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employee_loans")
      .select("*, employee:employees(employee_no, full_name_ar)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setLoans(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = loans;
    if (statusFilter !== "all") list = list.filter(l => l.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(l =>
        l.loan_no?.toLowerCase().includes(s) ||
        l.employee?.full_name_ar?.includes(search) ||
        l.employee?.employee_no?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [loans, search, statusFilter]);

  const stats = useMemo(() => ({
    total: loans.length,
    pending: loans.filter(l => l.status === "pending").length,
    active: loans.filter(l => l.status === "active" || l.status === "approved").length,
    total_amount: loans.filter(l => l.status === "active").reduce((s, l) => s + (l.remaining_amount ?? l.total_amount), 0),
  }), [loans]);

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from("employee_loans").update({
      status: "active",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم اعتماد السلفة");
    load();
  };

  const handleCancel = async (id: string) => {
    if (!confirm("إلغاء السلفة؟")) return;
    const { error } = await supabase.from("employee_loans").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الإلغاء");
    load();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            السلف والقروض
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total} سلفة · {stats.pending} بانتظار · {stats.active} نشطة · إجمالي مستحق: {stats.total_amount.toLocaleString('en-US')} ر.س
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 ml-2" /> سلفة جديدة
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="pending">بانتظار</SelectItem>
                <SelectItem value="active">نشطة</SelectItem>
                <SelectItem value="paid">مسددة</SelectItem>
              </SelectContent>
            </Select>
            <div className="self-center text-sm text-muted-foreground">عرض {filtered.length} من {stats.total}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد سلف</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 z-10">
                <TableRow>
                  <TableHead>الرقم</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>المبلغ</TableHead>
                  <TableHead>القسط الشهري</TableHead>
                  <TableHead>المتبقي</TableHead>
                  <TableHead>الأقساط</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-32">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(l => (
                  <TableRow key={l.id}>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{l.loan_no}</code></TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{l.employee?.full_name_ar}</div>
                        <div className="text-xs text-muted-foreground">{l.employee?.employee_no}</div>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[l.loan_type]}</Badge></TableCell>
                    <TableCell className="font-mono text-sm font-bold">{l.total_amount?.toLocaleString('en-US')} ر.س</TableCell>
                    <TableCell className="font-mono text-sm">{l.monthly_deduction?.toLocaleString('en-US')} ر.س</TableCell>
                    <TableCell className="font-mono text-sm text-amber-700">{(l.remaining_amount ?? l.total_amount).toLocaleString('en-US')} ر.س</TableCell>
                    <TableCell className="text-sm">{l.paid_installments ?? 0} / {l.total_installments ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_COLOR[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      {l.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(l.id)}>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleCancel(l.id)}>
                            <X className="h-3.5 w-3.5 text-rose-600" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {dialogOpen && <NewLoanDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={load} />}
    </div>
  );
}

function NewLoanDialog({ open, onClose, onSaved }: any) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [loanType, setLoanType] = useState<string>("loan");
  const [totalAmount, setTotalAmount] = useState(0);
  const [installments, setInstallments] = useState(12);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, employee_no, full_name_ar, basic_salary")
        .eq("status", "active")
        .order("full_name_ar");
      setEmployees(data ?? []);
    })();
  }, []);

  const monthly = installments > 0 ? totalAmount / installments : 0;
  const endDate = useMemo(() => {
    if (!startDate || installments <= 0) return "";
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + installments);
    return d.toISOString().slice(0, 10);
  }, [startDate, installments]);

  const handleSave = async () => {
    if (!employeeId) { toast.error("اختر الموظف"); return; }
    if (totalAmount <= 0) { toast.error("المبلغ مطلوب"); return; }
    if (installments <= 0) { toast.error("عدد الأقساط مطلوب"); return; }
    
    const loanNo = `LN-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    
    const { error } = await supabase.from("employee_loans").insert({
      loan_no: loanNo,
      employee_id: employeeId,
      loan_type: loanType,
      total_amount: totalAmount,
      monthly_deduction: monthly,
      remaining_amount: totalAmount,
      total_installments: installments,
      paid_installments: 0,
      start_date: startDate,
      end_date: endDate,
      reason: reason.trim() || null,
      status: "pending",
    });
    
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء طلب السلفة");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>طلب سلفة/قرض جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-sm font-medium mb-1 block">الموظف *</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="اختر موظف..." /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.employee_no} — {e.full_name_ar} ({e.basic_salary?.toLocaleString('en-US')} ر.س)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">النوع *</label>
            <Select value={loanType} onValueChange={setLoanType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="loan">قرض</SelectItem>
                <SelectItem value="advance">سلفة عادية</SelectItem>
                <SelectItem value="salary_advance">سلفة على الراتب</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">المبلغ الإجمالي (ر.س) *</label>
            <Input type="number" value={totalAmount} onChange={e => setTotalAmount(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">عدد الأقساط الشهرية *</label>
            <Input type="number" value={installments} onChange={e => setInstallments(Number(e.target.value))} />
          </div>
          {monthly > 0 && (
            <div className="p-3 bg-blue-50/50 border border-blue-200 rounded">
              <div className="text-xs text-muted-foreground">القسط الشهري:</div>
              <div className="text-xl font-bold text-blue-700">{monthly.toLocaleString('en-US', { maximumFractionDigits: 2 })} ر.س / شهر</div>
              <div className="text-xs text-muted-foreground mt-1">
                تاريخ السداد النهائي: {endDate ? new Date(endDate).toLocaleDateString('en-GB') : "—"}
              </div>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">تاريخ البداية *</label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">السبب</label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> إرسال للموافقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
