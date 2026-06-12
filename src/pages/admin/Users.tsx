import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { KeyRound, Plus, X } from "lucide-react";
import { ROLE_LABELS, type ErpRole } from "@/lib/erpPermissions";

type Row = {
  id: string;
  full_name: string;
  employee_no: string | null;
  department_id: string | null;
  roles: string[];
};

const ALL_ROLES: ErpRole[] = [
  "admin", "general_manager",
  "purchasing_officer", "purchasing_manager",
  "sales_officer", "sales_manager",
  "accountant", "treasury_officer",
  "inventory_officer", "receiving_officer", "inspection_officer",
  "workshop_manager", "spare_parts_manager",
  "employee",
];

export default function AdminUsers() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const load = async () => {
    const [{ data: ps }, { data: ds }, { data: rs }] = await Promise.all([
      supabase.from("profiles").select("*"),
      supabase.from("departments").select("*"),
      supabase.from("user_roles").select("*"),
    ]);
    const byUser = new Map<string, string[]>();
    (rs ?? []).forEach((r: any) => { byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r.role]); });
    setRows((ps ?? []).map((p: any) => ({ ...p, roles: byUser.get(p.id) ?? [] })));
    setDepartments(ds ?? []);
  };
  useEffect(() => { load(); }, []);

  const changeDept = async (userId: string, deptId: string) => {
    const { error } = await supabase.from("profiles").update({ department_id: deptId || null }).eq("id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("تم تحديث القسم");
    load();
  };

  const addRole = async (userId: string, role: string) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: role as any });
    if (error) { toast.error(error.message); return; }
    toast.success(`تم إضافة دور: ${ROLE_LABELS[role as ErpRole] ?? role}`);
    load();
  };

  const removeRole = async (userId: string, role: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role as any);
    if (error) { toast.error(error.message); return; }
    toast.success("تم إزالة الدور");
    load();
  };

  const resetPassword = async (email: string) => {
    if (!email) { toast.error("لا يوجد بريد لهذا المستخدم"); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`تم إرسال رابط إعادة تعيين كلمة المرور إلى ${email}`);
  };

  if (!isAdmin) return <div className="text-muted-foreground">هذه الصفحة متاحة للمسؤولين فقط.</div>;

  const filtered = rows.filter(r => {
    if (search && !r.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (roleFilter !== "all" && !r.roles.includes(roleFilter)) return false;
    return true;
  });

  return (
    <div>
      <PageHeader title="المستخدمون" subtitle="إدارة الأقسام، الأدوار، وكلمات المرور" />
      <Card className="p-3 mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="بحث بالاسم..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-8 w-60"
        />
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأدوار</SelectItem>
            {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ms-auto text-xs text-muted-foreground">إجمالي: {rows.length} • معروض: {filtered.length}</div>
      </Card>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الرقم الوظيفي</th>
              <th>القسم</th>
              <th>الأدوار</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(u => (
              <tr key={u.id}>
                <td className="font-medium">{u.full_name}</td>
                <td className="font-mono text-xs">{u.employee_no || "—"}</td>
                <td className="w-56">
                  <Select value={u.department_id || ""} onValueChange={v => changeDept(u.id, v)}>
                    <SelectTrigger className="h-8"><SelectValue placeholder="بدون قسم" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name_ar}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {u.roles.map(r => (
                      <Badge key={r} variant="secondary" className="text-[11.5px] gap-1">
                        {ROLE_LABELS[r as ErpRole] ?? r}
                        <button onClick={() => removeRole(u.id, r)} className="hover:text-destructive">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                    <Select value="" onValueChange={(v) => v && addRole(u.id, v)}>
                      <SelectTrigger className="h-6 w-32 text-[11.5px]">
                        <Plus className="h-3 w-3" />
                      </SelectTrigger>
                      <SelectContent>
                        {ALL_ROLES.filter(r => !u.roles.includes(r)).map(r => (
                          <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </td>
                <td>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      const email = prompt("أدخل البريد الإلكتروني للمستخدم لإرسال رابط إعادة التعيين:");
                      if (email) resetPassword(email);
                    }}
                  >
                    <KeyRound className="h-3 w-3 me-1" />
                    إعادة تعيين كلمة المرور
                  </Button>
                </td>
              </tr>
            ))}
            {!filtered.length && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-6">لا توجد نتائج</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        ملاحظة: إعادة تعيين كلمة المرور ترسل رابطاً عبر البريد. لا يمكن للمسؤول رؤية كلمة المرور الحالية.
      </p>
    </div>
  );
}
