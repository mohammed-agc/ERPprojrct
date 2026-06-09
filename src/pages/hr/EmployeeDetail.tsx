/**
 * EmployeeDetail — بطاقة الموظف الكاملة
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowRight, User, Briefcase, FileText, DollarSign, Calendar, 
  Phone, Mail, MapPin, Edit, Heart, Users, CreditCard, AlertTriangle, Calculator,
} from "lucide-react";
import EmployeeDialog from "@/components/hr/EmployeeDialog";

const STATUS_LABEL: Record<string, string> = {
  active: "نشط", on_leave: "في إجازة", suspended: "موقوف",
  terminated: "مفصول", resigned: "مستقيل", retired: "متقاعد",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  on_leave: "bg-amber-500/10 text-amber-700 border-amber-300",
  suspended: "bg-orange-500/10 text-orange-700 border-orange-300",
  terminated: "bg-rose-500/10 text-rose-700 border-rose-300",
  resigned: "bg-slate-500/10 text-slate-700 border-slate-300",
};

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("employees")
      .select("*, position:job_positions(title_ar, level)")
      .eq("id", id)
      .single();
    if (error) { toast.error(error.message); navigate("/hr/employees"); return; }
    setEmployee(data);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  if (loading || !employee) {
    return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;
  }

  const today = new Date();
  const iqamaExpiring = employee.iqama_expiry && 
    (new Date(employee.iqama_expiry).getTime() - today.getTime()) <= 30 * 24 * 60 * 60 * 1000;
  const yearsOfService = employee.hire_date ? 
    ((today.getTime() - new Date(employee.hire_date).getTime()) / (365 * 24 * 60 * 60 * 1000)).toFixed(1) : 0;

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/hr/employees")}>
          <ArrowRight className="h-4 w-4 ml-2" /> العودة
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/hr/employees/${id}/salary`)}>
            <Calculator className="h-4 w-4 ml-2" /> إدارة الراتب
          </Button>
          <Button onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 ml-2" /> تعديل
          </Button>
        </div>
      </div>

      {/* بطاقة رئيسية */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full bg-blue-500/10 flex items-center justify-center text-2xl font-bold text-blue-700">
                {employee.first_name_ar?.[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold">{employee.full_name_ar}</h1>
                <div className="text-sm text-muted-foreground mt-1">
                  {employee.position?.title_ar ?? "بدون منصب"}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded">{employee.employee_no}</code>
                  <Badge variant="outline" className={STATUS_COLOR[employee.status]}>
                    {STATUS_LABEL[employee.status] ?? employee.status}
                  </Badge>
                  {employee.is_saudi && (
                    <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-300">سعودي</Badge>
                  )}
                  {iqamaExpiring && !employee.is_saudi && (
                    <Badge className="bg-amber-500/10 text-amber-700 border-amber-300">
                      <AlertTriangle className="h-3 w-3 ml-1" /> الإقامة تنتهي قريباً
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="text-left">
              <div className="text-sm text-muted-foreground">سنوات الخدمة</div>
              <div className="text-3xl font-bold">{yearsOfService}</div>
              <div className="text-xs text-muted-foreground">منذ {new Date(employee.hire_date).toLocaleDateString('en-GB')}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="personal"><User className="h-4 w-4 ml-1" /> شخصية</TabsTrigger>
          <TabsTrigger value="identity"><FileText className="h-4 w-4 ml-1" /> الهوية</TabsTrigger>
          <TabsTrigger value="job"><Briefcase className="h-4 w-4 ml-1" /> الوظيفة</TabsTrigger>
          <TabsTrigger value="financial"><DollarSign className="h-4 w-4 ml-1" /> مالية</TabsTrigger>
          <TabsTrigger value="leaves"><Calendar className="h-4 w-4 ml-1" /> الإجازات</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card>
            <CardHeader><CardTitle className="text-base">البيانات الشخصية</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="الاسم بالعربي" value={employee.full_name_ar} />
              <Field label="الاسم بالإنجليزي" value={employee.full_name_en} />
              <Field label="الجنس" value={employee.gender === "male" ? "ذكر" : "أنثى"} />
              <Field label="تاريخ الميلاد" value={employee.date_of_birth ? new Date(employee.date_of_birth).toLocaleDateString('en-GB') : "—"} />
              <Field label="الحالة الاجتماعية" value={employee.marital_status === "single" ? "أعزب" : employee.marital_status === "married" ? "متزوج" : employee.marital_status} />
              <Field label="الجنسية" value={employee.nationality} />
              <Field label="الديانة" value={employee.religion} />
              <Field label="الجوال" value={employee.mobile} icon={<Phone className="h-3 w-3" />} />
              <Field label="البريد" value={employee.email} icon={<Mail className="h-3 w-3" />} />
              <Field label="المدينة" value={employee.city} icon={<MapPin className="h-3 w-3" />} />
              <Field label="العنوان" value={employee.address} fullSpan />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="identity">
          <Card>
            <CardHeader><CardTitle className="text-base">الهوية والوثائق</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="رقم الهوية الوطنية" value={employee.national_id} />
              <Field label="رقم الإقامة" value={employee.iqama_no} />
              <Field 
                label="تاريخ انتهاء الإقامة" 
                value={employee.iqama_expiry ? new Date(employee.iqama_expiry).toLocaleDateString('en-GB') : "—"}
                warning={iqamaExpiring && !employee.is_saudi}
              />
              <Field label="رقم الجواز" value={employee.passport_no} />
              <Field 
                label="تاريخ انتهاء الجواز" 
                value={employee.passport_expiry ? new Date(employee.passport_expiry).toLocaleDateString('en-GB') : "—"}
              />
              <Field label="بلد إصدار الجواز" value={employee.passport_country} />
              <Field label="رقم التأشيرة" value={employee.visa_no} />
              <Field label="رخصة العمل" value={employee.work_permit_no} />
              <Field label="رقم التأمينات" value={employee.gosi_no} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="job">
          <Card>
            <CardHeader><CardTitle className="text-base">معلومات الوظيفة</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="رقم الموظف" value={employee.employee_no} />
              <Field label="المسمى الوظيفي" value={employee.position?.title_ar} />
              <Field label="تاريخ التعيين" value={new Date(employee.hire_date).toLocaleDateString('en-GB')} />
              <Field label="نوع العقد" value={employee.contract_type} />
              <Field label="نهاية فترة التجربة" value={employee.probation_end_date ? new Date(employee.probation_end_date).toLocaleDateString('en-GB') : "—"} />
              <Field label="سنوات الخدمة" value={`${yearsOfService} سنة`} />
              <Field label="الحالة" value={STATUS_LABEL[employee.status]} />
              {employee.termination_date && (
                <Field label="تاريخ إنهاء الخدمة" value={new Date(employee.termination_date).toLocaleDateString('en-GB')} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="financial">
          <Card>
            <CardHeader><CardTitle className="text-base">المعلومات المالية</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="الراتب الأساسي" value={`${employee.basic_salary?.toLocaleString('en-US') ?? 0} ر.س`} />
              <Field label="اسم البنك" value={employee.bank_name} />
              <Field label="IBAN" value={employee.bank_iban} icon={<CreditCard className="h-3 w-3" />} />
              <Field label="رقم الحساب" value={employee.bank_account_no} />
              <Field label="مسجل في حماية الأجور" value={employee.wps_enrolled ? "نعم" : "لا"} />
              {employee.eosb_calculated_amount && (
                <Field label="مكافأة نهاية الخدمة المحسوبة" value={`${employee.eosb_calculated_amount.toLocaleString('en-US')} ر.س`} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaves">
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>سجل الإجازات سيظهر هنا بعد إنشائها</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {editOpen && (
        <EmployeeDialog
          employee={employee}
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}

function Field({ label, value, icon, warning, fullSpan }: any) {
  return (
    <div className={fullSpan ? "col-span-2" : ""}>
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={`flex items-center gap-1 ${warning ? "text-amber-700 font-medium" : ""}`}>
        {icon}
        {value || <span className="text-muted-foreground">—</span>}
        {warning && <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
      </div>
    </div>
  );
}
