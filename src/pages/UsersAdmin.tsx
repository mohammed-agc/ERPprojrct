import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

export default function UsersAdmin() {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const load = async () => {
    const [{ data: ps }, { data: ds }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("departments").select("*"),
      supabase.from("user_roles").select("*"),
    ]);
    const byUser = new Map<string, string[]>();
    (rs ?? []).forEach((r: any) => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]); });
    setUsers((ps ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] })));
    setDepartments(ds ?? []);
  };
  useEffect(() => { load(); }, []);

  const changeDept = async (userId: string, deptId: string) => {
    const { error } = await supabase.from("profiles").update({ department_id: deptId || null }).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم التحديث");
    load();
  };

  if (!isAdmin) return <div className="text-muted-foreground">هذه الصفحة متاحة للمسؤولين فقط.</div>;

  return (
    <div>
      <PageHeader title="المستخدمون والصلاحيات" subtitle="إدارة الأقسام والأدوار" />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>الاسم</th><th>الرقم الوظيفي</th><th>القسم</th><th>الأدوار</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name}</td>
                <td className="font-mono text-xs">{u.employee_no || "—"}</td>
                <td className="w-64">
                  <Select value={u.department_id || ""} onValueChange={v => changeDept(u.id, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="بدون قسم" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="text-xs">{u.roles.join(" • ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        ملاحظة: تعيين قسم لكل موظف يحدد ما يستطيع رؤيته أو تعديله من بيانات النظام (مثلاً موظف المركبات لا يستطيع تعديل المخزون أو القيود).
      </p>
    </div>
  );
}
