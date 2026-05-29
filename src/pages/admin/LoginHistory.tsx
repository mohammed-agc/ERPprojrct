import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History } from "lucide-react";

interface LoginRecord {
  user_id: string;
  user_name: string;
  created_at: string;
  action: string;
}

export default function AdminLoginHistory() {
  const [rows, setRows] = useState<LoginRecord[]>([]);

  useEffect(() => {
    (async () => {
      // Pull sign-in events from the audit_log if recorded.
      const { data } = await supabase
        .from("audit_log")
        .select("user_id,user_name,created_at,action")
        .in("action", ["login", "logout", "password_reset"])
        .order("created_at", { ascending: false })
        .limit(200);
      setRows((data ?? []) as LoginRecord[]);
    })();
  }, []);

  return (
    <div>
      <PageHeader
        title="سجل تسجيل الدخول"
        subtitle="آخر عمليات الدخول والخروج وإعادة تعيين كلمات المرور"
      />
      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>المستخدم</th>
              <th>الإجراء</th>
              <th>التاريخ والوقت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{r.user_name ?? r.user_id}</span>
                  </div>
                </td>
                <td>
                  <Badge variant="secondary" className="text-[10px]">
                    {r.action === "login" ? "تسجيل دخول" : r.action === "logout" ? "تسجيل خروج" : "إعادة تعيين كلمة مرور"}
                  </Badge>
                </td>
                <td className="font-mono text-[11px]">{new Date(r.created_at).toLocaleString("ar-SA")}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={3} className="text-center text-muted-foreground py-8">لا توجد سجلات بعد</td></tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        السجلات تُسحب من جدول التدقيق. الأحداث القادمة من Supabase Auth يمكن مزامنتها لاحقاً عبر خدمة الخادم.
      </p>
    </div>
  );
}
