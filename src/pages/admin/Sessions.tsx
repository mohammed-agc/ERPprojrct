import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonitorSmartphone, RefreshCw, Search, Smartphone, Monitor, Globe } from "lucide-react";
import { toast } from "sonner";

interface SessionRow {
  session_id: string;
  user_id: string;
  email: string;
  full_name: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string | null;
  refreshed_at: string | null;
  not_after: string | null;
  aal: string | null;
}

function deviceIcon(ua: string | null) {
  if (!ua) return Globe;
  const s = ua.toLowerCase();
  if (s.includes("mobile") || s.includes("android") || s.includes("iphone")) return Smartphone;
  return Monitor;
}
function deviceLabel(ua: string | null) {
  if (!ua) return "غير معروف";
  const s = ua.toLowerCase();
  let os = "غير معروف", browser = "";
  if (s.includes("windows")) os = "Windows";
  else if (s.includes("mac os")) os = "macOS";
  else if (s.includes("android")) os = "Android";
  else if (s.includes("iphone") || s.includes("ipad") || s.includes("ios")) os = "iOS";
  else if (s.includes("linux")) os = "Linux";
  if (s.includes("edg/")) browser = "Edge";
  else if (s.includes("chrome/")) browser = "Chrome";
  else if (s.includes("firefox/")) browser = "Firefox";
  else if (s.includes("safari/")) browser = "Safari";
  return [os, browser].filter(Boolean).join(" • ");
}
function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" });
}
function isActive(notAfter: string | null) {
  if (!notAfter) return true;
  return new Date(notAfter).getTime() > Date.now();
}

export default function AdminSessions() {
  const { user, isAdmin } = useAuth();
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_sessions" as any);
    if (error) {
      toast.error("تعذر تحميل الجلسات: " + error.message);
      setRows([]);
    } else {
      setRows((data as any[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) load(); else setLoading(false); }, [isAdmin]);

  const filtered = rows.filter(r => {
    if (!q) return true;
    const s = q.toLowerCase();
    return [r.email, r.full_name, r.ip, r.user_agent].some(v => (v ?? "").toLowerCase().includes(s));
  });

  const active = filtered.filter(r => isActive(r.not_after));
  const expired = filtered.filter(r => !isActive(r.not_after));

  if (!isAdmin) {
    return (
      <div>
        <PageHeader title="الجلسات النشطة" subtitle="عرض جلسات جميع المستخدمين" />
        <Card className="p-6 text-center text-sm text-muted-foreground">
          هذه الشاشة مقتصرة على مدير النظام.
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="الجلسات النشطة"
        subtitle="عرض جلسات جميع المستخدمين عبر الأجهزة من الخادم — IP، الجهاز، الإنشاء والإنتهاء"
        actions={
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">إجمالي الجلسات</div>
          <div className="text-2xl font-bold tabular-nums">{rows.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">جلسات نشطة</div>
          <div className="text-2xl font-bold tabular-nums text-emerald-600">{rows.filter(r => isActive(r.not_after)).length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">مستخدمون فريدون</div>
          <div className="text-2xl font-bold tabular-nums">{new Set(rows.map(r => r.user_id)).size}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">عناوين IP فريدة</div>
          <div className="text-2xl font-bold tabular-nums">{new Set(rows.map(r => r.ip).filter(Boolean)).size}</div>
        </Card>
      </div>

      <Card className="p-3 mb-3">
        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)}
            placeholder="بحث: اسم، بريد، IP، جهاز..." className="pr-8 h-8 text-xs" />
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">المستخدم</TableHead>
              <TableHead className="text-xs">الجهاز</TableHead>
              <TableHead className="text-xs">IP</TableHead>
              <TableHead className="text-xs">الإنشاء</TableHead>
              <TableHead className="text-xs">آخر تحديث</TableHead>
              <TableHead className="text-xs">الانتهاء</TableHead>
              <TableHead className="text-xs">الحالة</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">جاري التحميل…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">لا توجد جلسات</TableCell></TableRow>
            ) : (
              [...active, ...expired].map(r => {
                const Icon = deviceIcon(r.user_agent);
                const act = isActive(r.not_after);
                const isMe = r.user_id === user?.id;
                return (
                  <TableRow key={r.session_id} className={act ? "" : "opacity-60"}>
                    <TableCell className="text-xs">
                      <div className="font-bold flex items-center gap-1">
                        {r.full_name || r.email}
                        {isMe && <Badge variant="secondary" className="text-[9px]">أنت</Badge>}
                      </div>
                      <div className="text-[10px] text-muted-foreground">{r.email}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div>{deviceLabel(r.user_agent)}</div>
                          <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[260px]" title={r.user_agent ?? ""}>
                            {r.user_agent ?? "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs font-mono">{r.ip ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fmt(r.created_at)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.updated_at)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.not_after)}</TableCell>
                    <TableCell>
                      {act ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 text-[10px]">نشط</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px]">منتهي</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-xs text-muted-foreground mt-3">
        تُقرأ البيانات من جدول `auth.sessions` عبر دالة آمنة `admin_list_sessions` المحمية بفحص دور `admin`.
      </p>
    </div>
  );
}
