/**
 * HRDashboard — لوحة الموارد البشرية الرئيسية
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, UserCheck, UserX, Calendar, FileText, DollarSign, 
  AlertTriangle, Briefcase, Building2, GraduationCap, Heart, Award,
} from "lucide-react";

export default function HRDashboard() {
  const [stats, setStats] = useState({
    total_employees: 0,
    active_employees: 0,
    saudi_employees: 0,
    non_saudi_employees: 0,
    on_leave: 0,
    expiring_iqama: 0,
    pending_leaves: 0,
    pending_overtime: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, leaveRes, overtimeRes] = await Promise.all([
        supabase.from("employees").select("status, is_saudi, iqama_expiry"),
        supabase.from("leave_requests").select("status").eq("status", "pending"),
        supabase.from("overtime_requests").select("status").eq("status", "pending"),
      ]);
      
      const employees = empRes.data ?? [];
      const today = new Date();
      const in30days = new Date();
      in30days.setDate(today.getDate() + 30);
      
      setStats({
        total_employees: employees.length,
        active_employees: employees.filter((e: any) => e.status === 'active').length,
        saudi_employees: employees.filter((e: any) => e.is_saudi).length,
        non_saudi_employees: employees.filter((e: any) => !e.is_saudi).length,
        on_leave: employees.filter((e: any) => e.status === 'on_leave').length,
        expiring_iqama: employees.filter((e: any) => 
          !e.is_saudi && e.iqama_expiry && new Date(e.iqama_expiry) <= in30days && new Date(e.iqama_expiry) >= today
        ).length,
        pending_leaves: leaveRes.data?.length ?? 0,
        pending_overtime: overtimeRes.data?.length ?? 0,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saudization = stats.total_employees > 0 
    ? Math.round((stats.saudi_employees / stats.total_employees) * 100) 
    : 0;

  const sections = [
    { title: "الموظفين", to: "/hr/employees", icon: Users, color: "bg-blue-500/10 text-blue-700", description: "إدارة بيانات الموظفين" },
    { title: "المسميات الوظيفية", to: "/hr/positions", icon: Briefcase, color: "bg-purple-500/10 text-purple-700", description: "30 مسمى وظيفي" },
    { title: "الإجازات", to: "/hr/leaves", icon: Calendar, color: "bg-emerald-500/10 text-emerald-700", description: "إدارة الإجازات والأرصدة" },
    { title: "الحضور والانصراف", to: "/hr/attendance", icon: UserCheck, color: "bg-amber-500/10 text-amber-700", description: "تسجيل الحضور اليومي" },
    { title: "الرواتب", to: "/hr/payroll", icon: DollarSign, color: "bg-green-500/10 text-green-700", description: "كشوف الرواتب الشهرية" },
    { title: "مكونات الراتب", to: "/hr/salary-components", icon: FileText, color: "bg-cyan-500/10 text-cyan-700", description: "بدلات وخصومات" },
    { title: "أنواع الإجازات", to: "/hr/leave-types", icon: Heart, color: "bg-rose-500/10 text-rose-700", description: "15 نوع إجازة" },
    { title: "السلف والقروض", to: "/hr/loans", icon: DollarSign, color: "bg-orange-500/10 text-orange-700", description: "سلف الموظفين" },
    { title: "المستندات", to: "/hr/documents", icon: FileText, color: "bg-indigo-500/10 text-indigo-700", description: "مستندات الموظفين" },
    { title: "التقارير", to: "/hr/reports", icon: Award, color: "bg-pink-500/10 text-pink-700", description: "تقارير الموارد البشرية" },
  ];

  return (
    <div className="p-6 space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6" />
          الموارد البشرية
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          نظام إدارة الموارد البشرية الشامل — متوافق مع نظام العمل السعودي
        </p>
      </div>

      {/* إحصائيات رئيسية */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{stats.total_employees}</div>
                <div className="text-sm text-muted-foreground">إجمالي الموظفين</div>
              </div>
              <Users className="h-8 w-8 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-emerald-600">{stats.active_employees}</div>
                <div className="text-sm text-muted-foreground">نشطون</div>
              </div>
              <UserCheck className="h-8 w-8 text-emerald-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-amber-600">{stats.on_leave}</div>
                <div className="text-sm text-muted-foreground">في إجازة</div>
              </div>
              <Calendar className="h-8 w-8 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-700">{saudization}%</div>
                <div className="text-sm text-muted-foreground">نسبة السعودة</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stats.saudi_employees} سعودي / {stats.non_saudi_employees} وافد
                </div>
              </div>
              <Award className="h-8 w-8 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* تنبيهات */}
      {(stats.expiring_iqama > 0 || stats.pending_leaves > 0 || stats.pending_overtime > 0) && (
        <Card className="border-amber-300 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              التنبيهات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.expiring_iqama > 0 && (
              <Link to="/hr/employees?filter=expiring_iqama" className="flex items-center justify-between p-2 rounded hover:bg-amber-100/50">
                <span className="text-sm">إقامات تنتهي خلال 30 يوم</span>
                <Badge className="bg-amber-100 text-amber-700">{stats.expiring_iqama}</Badge>
              </Link>
            )}
            {stats.pending_leaves > 0 && (
              <Link to="/hr/leaves?filter=pending" className="flex items-center justify-between p-2 rounded hover:bg-amber-100/50">
                <span className="text-sm">طلبات إجازة بانتظار الموافقة</span>
                <Badge className="bg-amber-100 text-amber-700">{stats.pending_leaves}</Badge>
              </Link>
            )}
            {stats.pending_overtime > 0 && (
              <Link to="/hr/overtime?filter=pending" className="flex items-center justify-between p-2 rounded hover:bg-amber-100/50">
                <span className="text-sm">طلبات عمل إضافي بانتظار الموافقة</span>
                <Badge className="bg-amber-100 text-amber-700">{stats.pending_overtime}</Badge>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* أقسام النظام */}
      <div>
        <h2 className="text-lg font-semibold mb-3">أقسام النظام</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {sections.map(s => {
            const Icon = s.icon;
            return (
              <Link key={s.to} to={s.to}>
                <Card className="hover:shadow-md transition-all cursor-pointer h-full">
                  <CardContent className="p-4 space-y-2">
                    <div className={`inline-flex p-2 rounded-lg ${s.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.description}</div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
