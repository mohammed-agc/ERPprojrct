import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MonitorSmartphone } from "lucide-react";

export default function AdminSessions() {
  const { user, session } = useAuth();
  const [info, setInfo] = useState<{ ua: string; ip: string }>({ ua: "", ip: "" });

  useEffect(() => {
    setInfo({ ua: navigator.userAgent, ip: "—" });
  }, []);

  return (
    <div>
      <PageHeader
        title="الجلسات النشطة"
        subtitle="الجلسة الحالية للمستخدم المسجَّل دخوله"
      />
      <Card className="p-4">
        {user ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <MonitorSmartphone className="h-5 w-5" />
              </div>
              <div>
                <div className="font-bold text-sm">{user.email}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{user.id}</div>
              </div>
              <Badge variant="default" className="ms-auto bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15">
                نشط
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-muted-foreground">آخر نشاط</div>
                <div className="font-medium">الآن</div>
              </div>
              <div>
                <div className="text-muted-foreground">انتهاء الجلسة</div>
                <div className="font-medium">{session?.expires_at ? new Date(session.expires_at * 1000).toLocaleString("ar-SA") : "—"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-muted-foreground">المتصفح/الجهاز</div>
                <div className="font-mono text-[10px] break-all">{info.ua}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">لا توجد جلسة نشطة</div>
        )}
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        ملاحظة: لعرض جلسات كل المستخدمين عبر الأجهزة، يلزم تفعيل خدمة إدارة جلسات على مستوى الخادم.
      </p>
    </div>
  );
}
