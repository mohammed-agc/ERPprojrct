import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type ErpRole } from "@/lib/erpPermissions";
import { ShieldCheck, Users } from "lucide-react";

const DEFAULT_ROLES: ErpRole[] = [
  "admin", "general_manager",
  "purchasing_officer", "purchasing_manager",
  "sales_officer", "sales_manager",
  "accountant", "treasury_officer",
  "inventory_officer", "receiving_officer", "inspection_officer",
  "workshop_manager", "spare_parts_manager",
];

export default function AdminRoles() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase.from("user_roles").select("role").then(({ data }) => {
      const c: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { c[r.role] = (c[r.role] ?? 0) + 1; });
      setCounts(c);
    });
  }, []);

  return (
    <div>
      <PageHeader
        title="الأدوار الافتراضية"
        subtitle="قائمة الأدوار المعتمدة في النظام مع وصفها وعدد المستخدمين"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEFAULT_ROLES.map((r) => (
          <Card key={r} className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-bold text-sm">{ROLE_LABELS[r]}</div>
                  <div className="text-[11.5px] font-mono text-muted-foreground">{r}</div>
                </div>
              </div>
              <Badge variant="secondary" className="gap-1 text-[11.5px]">
                <Users className="h-3 w-3" />
                {counts[r] ?? 0}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{ROLE_DESCRIPTIONS[r]}</p>
          </Card>
        ))}
      </div>
      <div className="mt-4 text-xs text-muted-foreground">
        <Link to="/admin/roles-manager" className="text-primary underline font-bold">إدارة الأدوار وتعيين الصلاحيات (دفعة واحدة)</Link> •
        لتعديل صلاحيات الأدوار عبر مصفوفة: <Link to="/admin/permissions" className="text-primary underline">مصفوفة الصلاحيات</Link> •
        لتعيين الأدوار للمستخدمين: <Link to="/admin/users" className="text-primary underline">المستخدمون</Link>
      </div>
    </div>
  );
}
