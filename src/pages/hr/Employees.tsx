/**
 * Employees — قائمة الموظفين
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, Users, Eye, Edit, Trash2, Phone, Mail, AlertTriangle } from "lucide-react";
import EmployeeDialog from "@/components/hr/EmployeeDialog";

type Employee = {
  id: string;
  employee_no: string;
  full_name_ar: string;
  mobile: string;
  email: string | null;
  nationality: string;
  is_saudi: boolean;
  national_id: string | null;
  iqama_no: string | null;
  iqama_expiry: string | null;
  hire_date: string;
  basic_salary: number;
  status: string;
  position?: { title_ar: string };
};

const STATUS_LABEL: Record<string, string> = {
  active: "نشط",
  on_leave: "في إجازة",
  suspended: "موقوف",
  terminated: "مفصول",
  resigned: "مستقيل",
  retired: "متقاعد",
  absconded: "هارب",
  deceased: "متوفى",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  on_leave: "bg-amber-500/10 text-amber-700 border-amber-300",
  suspended: "bg-orange-500/10 text-orange-700 border-orange-300",
  terminated: "bg-rose-500/10 text-rose-700 border-rose-300",
  resigned: "bg-slate-500/10 text-slate-700 border-slate-300",
  retired: "bg-purple-500/10 text-purple-700 border-purple-300",
  absconded: "bg-red-500/10 text-red-700 border-red-300",
  deceased: "bg-gray-500/10 text-gray-700 border-gray-300",
};

export default function Employees() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(params.get("filter") === "expiring_iqama" ? "all" : "active");
  const [nationalityFilter, setNationalityFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("employees")
        .select("*, position:job_positions(title_ar)")
        .order("employee_no");
      if (error) throw error;
      setEmployees((data ?? []) as Employee[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    let list = employees;
    
    // فلتر الحالة
    if (statusFilter !== "all") {
      list = list.filter(e => e.status === statusFilter);
    }
    
    // فلتر الجنسية
    if (nationalityFilter === "saudi") {
      list = list.filter(e => e.is_saudi);
    } else if (nationalityFilter === "non_saudi") {
      list = list.filter(e => !e.is_saudi);
    }
    
    // فلتر الإقامة المنتهية
    if (params.get("filter") === "expiring_iqama") {
      const in30days = new Date();
      in30days.setDate(in30days.getDate() + 30);
      list = list.filter(e => e.iqama_expiry && new Date(e.iqama_expiry) <= in30days);
    }
    
    // البحث
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(e => 
        e.employee_no.toLowerCase().includes(s) ||
        e.full_name_ar.includes(search) ||
        (e.mobile?.includes(search) ?? false) ||
        (e.national_id?.includes(search) ?? false) ||
        (e.iqama_no?.includes(search) ?? false)
      );
    }
    
    return list;
  }, [employees, search, statusFilter, nationalityFilter, params]);

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter(e => e.status === 'active').length,
    saudi: employees.filter(e => e.is_saudi).length,
    expiring: employees.filter(e => {
      if (e.is_saudi || !e.iqama_expiry) return false;
      const days = Math.ceil((new Date(e.iqama_expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 30;
    }).length,
  }), [employees]);

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            الموظفين
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.total} موظف · {stats.active} نشط · {stats.saudi} سعودي
            {stats.expiring > 0 && (
              <span className="text-amber-600 mr-2">· {stats.expiring} إقامة تنتهي قريباً</span>
            )}
          </p>
        </div>
        <Button onClick={() => { setEditingEmployee(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-2" /> موظف جديد
        </Button>
      </div>

      {/* الفلاتر */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث: رقم، اسم، جوال، هوية..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pr-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="on_leave">في إجازة</SelectItem>
                <SelectItem value="suspended">موقوف</SelectItem>
                <SelectItem value="terminated">مفصول</SelectItem>
                <SelectItem value="resigned">مستقيل</SelectItem>
              </SelectContent>
            </Select>
            <Select value={nationalityFilter} onValueChange={setNationalityFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الجنسيات</SelectItem>
                <SelectItem value="saudi">سعودي</SelectItem>
                <SelectItem value="non_saudi">وافد</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground self-center">
              عرض {filtered.length} من {stats.total}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الجدول */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد نتائج</p>
              <Button onClick={() => { setEditingEmployee(null); setDialogOpen(true); }} className="mt-4">
                <Plus className="h-4 w-4 ml-2" /> إضافة أول موظف
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 backdrop-blur z-10">
                <TableRow>
                  <TableHead>الرقم</TableHead>
                  <TableHead>الاسم</TableHead>
                  <TableHead>المنصب</TableHead>
                  <TableHead>الجنسية</TableHead>
                  <TableHead>الجوال</TableHead>
                  <TableHead>الراتب</TableHead>
                  <TableHead>تاريخ التعيين</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead className="w-32">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(emp => {
                  const expiringIqama = emp.iqama_expiry && 
                    new Date(emp.iqama_expiry).getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000;
                  return (
                    <TableRow key={emp.id}>
                      <TableCell>
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{emp.employee_no}</code>
                      </TableCell>
                      <TableCell className="font-medium">{emp.full_name_ar}</TableCell>
                      <TableCell>{emp.position?.title_ar ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span>{emp.nationality}</span>
                          {emp.is_saudi && (
                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 text-xs">سعودي</Badge>
                          )}
                          {!emp.is_saudi && expiringIqama && (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm flex items-center gap-1">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {emp.mobile}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {emp.basic_salary?.toLocaleString('en-US') ?? 0} ر.س
                      </TableCell>
                      <TableCell className="text-sm">
                        {new Date(emp.hire_date).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLOR[emp.status]}>
                          {STATUS_LABEL[emp.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/hr/employees/${emp.id}`)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingEmployee(emp); setDialogOpen(true); }}>
                            <Edit className="h-3.5 w-3.5" />
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
        <EmployeeDialog
          employee={editingEmployee}
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
