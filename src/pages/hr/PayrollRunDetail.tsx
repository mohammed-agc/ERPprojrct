/**
 * PayrollRunDetail — تفاصيل كشف الرواتب مع زر الحساب التلقائي
 */
import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowRight, Calculator, FileCheck, Send, Eye, Loader2, DollarSign } from "lucide-react";

const MONTH_LABEL = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

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

export default function PayrollRunDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [runRes, slipsRes] = await Promise.all([
      supabase.from("payroll_runs").select("*").eq("id", id).single(),
      supabase
        .from("payslips")
        .select("*, employee:employees(employee_no, full_name_ar, is_saudi)")
        .eq("payroll_run_id", id)
        .order("created_at"),
    ]);
    if (runRes.error) { toast.error(runRes.error.message); navigate("/hr/payroll"); return; }
    setRun(runRes.data);
    setPayslips(slipsRes.data ?? []);
    setLoading(false);
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  /**
   * الحاسبة الذكية للرواتب
   * 1. تجلب كل الموظفين النشطين
   * 2. لكل موظف: تجمع الاستحقاقات والخصومات
   * 3. تحسب GOSI تلقائياً للسعوديين (9.75%)
   * 4. تخصم السلف النشطة
   * 5. تنشئ payslip + payslip_lines لكل موظف
   */
  const handleCalculate = async () => {
    if (!confirm("هل تريد حساب كشف الرواتب لجميع الموظفين النشطين؟\nسيتم حذف الكشوف السابقة لهذا الشهر.")) return;
    
    setCalculating(true);
    try {
      // 1. حذف الكشوف السابقة لهذا الشهر
      await supabase.from("payslips").delete().eq("payroll_run_id", id);
      
      // 2. جلب الموظفين النشطين
      const { data: employees, error: empError } = await supabase
        .from("employees")
        .select("*")
        .eq("status", "active");
      if (empError) throw empError;
      
      if (!employees || employees.length === 0) {
        toast.error("لا يوجد موظفين نشطين");
        setCalculating(false);
        return;
      }
      
      // 3. جلب كل مكونات الرواتب
      const { data: allSalaries } = await supabase
        .from("employee_salaries")
        .select("*, component:salary_components(*)")
        .lte("effective_from", run.period_end)
        .or(`effective_to.is.null,effective_to.gte.${run.period_start}`);
      
      // 4. جلب السلف النشطة
      const { data: activeLoans } = await supabase
        .from("employee_loans")
        .select("*")
        .eq("status", "active");
      
      let totalEarnings = 0;
      let totalDeductions = 0;
      let totalNet = 0;
      let totalGosiEmp = 0;
      let totalGosiCompany = 0;
      
      // 5. لكل موظف، احسب كشف الراتب
      for (const emp of employees) {
        const empSalaries = (allSalaries ?? []).filter(s => s.employee_id === emp.id);
        const empLoans = (activeLoans ?? []).filter(l => l.employee_id === emp.id);
        
        const basic = emp.basic_salary ?? 0;
        let earnings = basic;  // الراتب الأساسي
        let deductions = 0;
        let gosiBase = basic;
        let totalAllowances = 0;
        let totalBonuses = 0;
        let loanDeduction = 0;
        
        const payslipLines: any[] = [];
        
        // أضف بند الراتب الأساسي (يدوياً لأنه ليس في employee_salaries عادة)
        const { data: basicComp } = await supabase
          .from("salary_components")
          .select("id")
          .eq("code", "BASIC")
          .single();
        if (basicComp) {
          payslipLines.push({
            component_id: basicComp.id,
            type: "earning",
            amount: basic,
          });
        }
        
        // 5a. الاستحقاقات
        for (const s of empSalaries.filter(s => s.component?.type === "earning")) {
          const amount = s.percentage 
            ? (basic * Number(s.percentage) / 100) 
            : Number(s.amount ?? 0);
          earnings += amount;
          
          if (s.component?.is_gosi_eligible) gosiBase += amount;
          if (s.component?.category === "allowance") totalAllowances += amount;
          if (s.component?.category === "bonus") totalBonuses += amount;
          
          payslipLines.push({
            component_id: s.component_id,
            type: "earning",
            amount,
          });
        }
        
        // 5b. الخصومات اليدوية
        for (const s of empSalaries.filter(s => s.component?.type === "deduction")) {
          const amount = s.percentage 
            ? (basic * Number(s.percentage) / 100) 
            : Number(s.amount ?? 0);
          deductions += amount;
          payslipLines.push({
            component_id: s.component_id,
            type: "deduction",
            amount,
          });
        }
        
        // 5c. خصم السلف
        for (const loan of empLoans) {
          const installment = Math.min(loan.monthly_deduction ?? 0, loan.remaining_amount ?? 0);
          if (installment > 0) {
            loanDeduction += installment;
            deductions += installment;
          }
        }
        if (loanDeduction > 0) {
          const { data: loanComp } = await supabase
            .from("salary_components")
            .select("id")
            .eq("code", "LOAN_DEDUCT")
            .single();
          if (loanComp) {
            payslipLines.push({
              component_id: loanComp.id,
              type: "deduction",
              amount: loanDeduction,
              notes: "خصم أقساط السلف",
            });
          }
        }
        
        // 5d. GOSI تلقائي للسعوديين
        let gosiEmp = 0;
        let gosiCompany = 0;
        if (emp.is_saudi) {
          gosiEmp = gosiBase * 0.0975;   // حصة الموظف
          gosiCompany = gosiBase * 0.1175;  // حصة الشركة
          deductions += gosiEmp;
          
          const { data: gosiComp } = await supabase
            .from("salary_components")
            .select("id")
            .eq("code", "GOSI_EMP")
            .single();
          if (gosiComp) {
            payslipLines.push({
              component_id: gosiComp.id,
              type: "deduction",
              amount: gosiEmp,
              notes: `9.75% من ${gosiBase.toFixed(2)}`,
            });
          }
        }
        
        const grossSalary = earnings;
        const netSalary = grossSalary - deductions;
        
        // 6. إنشاء payslip
        const payslipNo = `PS-${run.period_year}-${String(run.period_month).padStart(2, '0')}-${emp.employee_no.slice(-5)}`;
        
        const { data: payslip, error: psError } = await supabase
          .from("payslips")
          .insert({
            payslip_no: payslipNo,
            payroll_run_id: id,
            employee_id: emp.id,
            period_year: run.period_year,
            period_month: run.period_month,
            total_days: 30,
            worked_days: 30,
            basic_salary: basic,
            total_allowances: totalAllowances,
            total_bonuses: totalBonuses,
            gross_salary: grossSalary,
            gosi_employee: gosiEmp,
            gosi_company: gosiCompany,
            loan_deduction: loanDeduction,
            total_deductions: deductions,
            net_salary: netSalary,
            status: "pending",
          })
          .select()
          .single();
        
        if (psError) throw psError;
        
        // 7. إنشاء payslip_lines
        if (payslip && payslipLines.length > 0) {
          await supabase.from("payslip_lines").insert(
            payslipLines.map(l => ({ ...l, payslip_id: payslip.id }))
          );
        }
        
        totalEarnings += grossSalary;
        totalDeductions += deductions;
        totalNet += netSalary;
        totalGosiEmp += gosiEmp;
        totalGosiCompany += gosiCompany;
      }
      
      // 8. تحديث payroll_run بالإحصائيات
      await supabase.from("payroll_runs").update({
        status: "calculated",
        total_employees: employees.length,
        total_earnings: totalEarnings,
        total_deductions: totalDeductions,
        total_net: totalNet,
        total_gosi_emp: totalGosiEmp,
        total_gosi_company: totalGosiCompany,
        calculated_at: new Date().toISOString(),
      }).eq("id", id);
      
      toast.success(`تم حساب رواتب ${employees.length} موظف بنجاح`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCalculating(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm("هل تريد اعتماد كشف الرواتب؟ لن يمكن تعديله بعد ذلك.")) return;
    const { error } = await supabase.from("payroll_runs").update({
      status: "approved",
      approved_at: new Date().toISOString(),
    }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("payslips").update({ status: "approved" }).eq("payroll_run_id", id);
    toast.success("تم اعتماد الكشف");
    load();
  };

  if (loading || !run) {
    return <div className="p-6 text-center text-muted-foreground">جاري التحميل...</div>;
  }

  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/hr/payroll")}>
          <ArrowRight className="h-4 w-4 ml-2" /> العودة
        </Button>
        <div className="flex gap-2">
          {run.status === "draft" && (
            <Button onClick={handleCalculate} disabled={calculating}>
              {calculating ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Calculator className="h-4 w-4 ml-2" />}
              {calculating ? "جاري الحساب..." : "حساب الرواتب تلقائياً"}
            </Button>
          )}
          {run.status === "calculated" && (
            <>
              <Button variant="outline" onClick={handleCalculate} disabled={calculating}>
                <Calculator className="h-4 w-4 ml-2" /> إعادة الحساب
              </Button>
              <Button onClick={handleApprove}>
                <FileCheck className="h-4 w-4 ml-2" /> اعتماد
              </Button>
            </>
          )}
          {run.status === "approved" && (
            <Button disabled>
              <Send className="h-4 w-4 ml-2" /> صرف (قريباً)
            </Button>
          )}
        </div>
      </div>

      {/* رأس الكشف */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <DollarSign className="h-6 w-6" />
                كشف رواتب {MONTH_LABEL[run.period_month - 1]} {run.period_year}
              </h1>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                <code className="bg-muted px-1.5 py-0.5 rounded">{run.run_no}</code>
                <span>· تاريخ الدفع: {new Date(run.pay_date).toLocaleDateString('en-GB')}</span>
                <Badge className={STATUS_COLOR[run.status]}>{STATUS_LABEL[run.status]}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* الإحصائيات */}
      {run.status !== "draft" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <StatCard label="عدد الموظفين" value={run.total_employees ?? 0} icon={null} />
          <StatCard label="إجمالي الاستحقاقات" value={`${(run.total_earnings ?? 0).toLocaleString('en-US')}`} color="emerald" />
          <StatCard label="إجمالي الخصومات" value={`${(run.total_deductions ?? 0).toLocaleString('en-US')}`} color="rose" />
          <StatCard label="حصة الشركة (GOSI)" value={`${(run.total_gosi_company ?? 0).toLocaleString('en-US')}`} color="amber" />
          <StatCard label="الصافي للدفع" value={`${(run.total_net ?? 0).toLocaleString('en-US')}`} color="blue" />
        </div>
      )}

      {/* كشوف الموظفين */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">كشوف الموظفين ({payslips.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payslips.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>اضغط "حساب الرواتب تلقائياً" لتوليد الكشوف</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-muted/60 z-10">
                <TableRow>
                  <TableHead>الكشف</TableHead>
                  <TableHead>الموظف</TableHead>
                  <TableHead>الأساسي</TableHead>
                  <TableHead>البدلات</TableHead>
                  <TableHead>الإجمالي</TableHead>
                  <TableHead>GOSI</TableHead>
                  <TableHead>السلف</TableHead>
                  <TableHead>إجمالي الخصم</TableHead>
                  <TableHead>الصافي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payslips.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.payslip_no}</code></TableCell>
                    <TableCell>
                      <div className="font-medium">{p.employee?.full_name_ar}</div>
                      <div className="text-xs text-muted-foreground">
                        {p.employee?.employee_no}
                        {p.employee?.is_saudi && <Badge variant="outline" className="mr-1 bg-emerald-500/10 text-emerald-700">سعودي</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{p.basic_salary?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm text-emerald-700">+{p.total_allowances?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm font-bold">{p.gross_salary?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm text-amber-700">{p.gosi_employee?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm text-rose-700">{p.loan_deduction?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm text-rose-700">-{p.total_deductions?.toLocaleString('en-US')}</TableCell>
                    <TableCell className="font-mono text-sm font-bold text-blue-700">{p.net_salary?.toLocaleString('en-US')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, color, icon }: any) {
  const colorClass: Record<string, string> = {
    emerald: "text-emerald-700",
    rose: "text-rose-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
  };
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${color ? colorClass[color] : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
