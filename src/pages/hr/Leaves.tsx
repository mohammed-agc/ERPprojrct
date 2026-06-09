/**
 * Leaves — إدارة طلبات الإجازات
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Plus, Calendar, Check, X, Save, Search } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  pending: "بانتظار الموافقة",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغي",
  taken: "تم أخذها",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-300",
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  rejected: "bg-rose-500/10 text-rose-700 border-rose-300",
  cancelled: "bg-slate-500/10 text-slate-700 border-slate-300",
  taken: "bg-blue-500/10 text-blue-700 border-blue-300",
};

export default function Leaves() {
  const [params] = useSearchParams();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(params.get("filter") ?? "all");
  const [dialogOpen, setDialogOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leave_requests")
      .select("*, employee:employees(employee_no, full_name_ar), leave_type:leave_types(name_ar, is_paid)")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setRequests(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = requests;
    if (statusFilter !== "all") list = list.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(r =>
        r.request_no?.toLowerCase().includes(s) ||
        r.employee?.full_name_ar?.includes(search) ||
        r.employee?.employee_no?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [requests, search, statusFilter]);

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    rejected: requests.filter(r => r.status === "rejected").length,
  }), [requests]);

  const handleApprove = async (id: string) => {
    const { error } = await supabase.from("leave_requests").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم اعتماد الطلب");
    load();
  };

  const handleReject = async (id: string) => {
    const reason = prompt("سبب الرفض:");
    if (!reason) return;
    const { error } = await supabase.from("leave_requests").update({
      status: "rejected",
      rejection_reason: reason,
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("تم رفض الطلب");
    load();
  };

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Calendar className="h-6 w-6" />
            طلبات الإجازات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total} طلب · {stats.pending} بانتظار · {stats.approved} معتمد · {stats.rejected} مرفوض
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 ml-2" /> طلب جديد
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="بحث: رقم، موظف..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="pending">بانتظار</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
                <SelectItem value="taken">مأخوذة</SelectItem>
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
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد طلبات إجازات</p>
              <Button onClick={() => setDialogOpen(true)} className="mt-4">
                <Plus className="h-4 w-4 ml-2" /> إنشاء أول طلب
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 z-10">
                <TableRow>
                  <TableHead>رقم الطلب</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>نوع الإجازة</TableHead>
                  <TableHead>من تاريخ</TableHead>
                  <TableHead>إلى تاريخ</TableHead>
                  <TableHead>الأيام</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-32">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(r => (
                  <TableRow key={r.id}>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{r.request_no}</code></TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{r.employee?.full_name_ar}</div>
                        <div className="text-xs text-muted-foreground">{r.employee?.employee_no}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {r.leave_type?.name_ar}
                        {r.leave_type?.is_paid ? "" : " (بدون أجر)"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{new Date(r.start_date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell className="text-sm">{new Date(r.end_date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell className="font-medium">{r.total_days}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={STATUS_COLOR[r.status]}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === "pending" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleApprove(r.id)}>
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleReject(r.id)}>
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

      {dialogOpen && <NewLeaveDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={load} />}
    </div>
  );
}

function NewLeaveDialog({ open, onClose, onSaved }: any) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    (async () => {
      const [empRes, typeRes] = await Promise.all([
        supabase.from("employees").select("id, employee_no, full_name_ar").eq("status", "active").order("full_name_ar"),
        supabase.from("leave_types").select("id, name_ar, code").eq("active", true).order("sort_order"),
      ]);
      setEmployees(empRes.data ?? []);
      setLeaveTypes(typeRes.data ?? []);
    })();
  }, []);

  const totalDays = startDate && endDate ? 
    Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (24 * 60 * 60 * 1000)) + 1 : 0;

  const handleSave = async () => {
    if (!employeeId || !leaveTypeId || !startDate || !endDate) {
      toast.error("الحقول المطلوبة ناقصة");
      return;
    }
    if (totalDays <= 0) {
      toast.error("تاريخ النهاية يجب أن يكون بعد تاريخ البداية");
      return;
    }
    const requestNo = `LR-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const { error } = await supabase.from("leave_requests").insert({
      request_no: requestNo,
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason: reason.trim() || null,
      status: "pending",
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء الطلب");
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>طلب إجازة جديد</DialogTitle></DialogHeader>
        <div className="space-y-3 py-3">
          <div>
            <label className="text-sm font-medium mb-1 block">الموظف *</label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="اختر موظف..." /></SelectTrigger>
              <SelectContent>
                {employees.map(e => (
                  <SelectItem key={e.id} value={e.id}>{e.employee_no} — {e.full_name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">نوع الإجازة *</label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger><SelectValue placeholder="اختر نوع..." /></SelectTrigger>
              <SelectContent>
                {leaveTypes.map(t => (
                  <SelectItem key={t.id} value={t.id}>{t.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">من تاريخ *</label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">إلى تاريخ *</label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
          </div>
          {totalDays > 0 && (
            <div className="p-2 bg-blue-500/10 rounded text-sm">
              عدد أيام الإجازة: <strong>{totalDays} يوم</strong>
            </div>
          )}
          <div>
            <label className="text-sm font-medium mb-1 block">السبب</label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave}><Save className="h-4 w-4 ml-2" /> إرسال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
