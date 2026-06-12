import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, History, RefreshCw } from "lucide-react";

interface LoginRecord {
  user_id: string;
  user_name: string;
  created_at: string;
  action: string;
}

export default function AdminLoginHistory() {
  const [rows, setRows] = useState<LoginRecord[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const load = async () => {
    const { data } = await supabase
      .from("audit_log")
      .select("user_id,user_name,created_at,action")
      .in("action", ["login", "logout", "password_reset"])
      .order("created_at", { ascending: false })
      .limit(200);
    setRows((data ?? []) as LoginRecord[]);
  };

  useEffect(() => {
    load();
    /* eslint-disable-next-line */
  }, []);

  const filteredRows = useMemo(() => {
    let data = [...rows];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(
        (r) =>
          (r.user_name ?? "").toLowerCase().includes(q) ||
          (r.user_id ?? "").toLowerCase().includes(q)
      );
    }
    if (actionFilter && actionFilter !== "all") {
      data = data.filter((r) => r.action === actionFilter);
    }
    return data;
  }, [rows, search, actionFilter]);

  const exportCsv = () => {
    if (!filteredRows.length) return;
    const headers = ["المستخدم", "معرف المستخدم", "الإجراء", "التاريخ والوقت"];
    const lines = [headers.join(",")];
    filteredRows.forEach((r) => {
      const actionLabel =
        r.action === "login"
          ? "تسجيل دخول"
          : r.action === "logout"
          ? "تسجيل خروج"
          : r.action === "password_reset"
          ? "إعادة تعيين كلمة مرور"
          : r.action;
      lines.push(
        [
          r.user_name ?? "—",
          r.user_id ?? "—",
          actionLabel,
          new Date(r.created_at).toISOString(),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(",")
      );
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `login_history_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="سجل تسجيل الدخول"
        subtitle="آخر عمليات الدخول والخروج وإعادة تعيين كلمات المرور"
      />

      <Card className="p-3 mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="بحث باسم المستخدم..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-60"
        />
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="الإجراء" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الإجراءات</SelectItem>
            <SelectItem value="login">تسجيل دخول</SelectItem>
            <SelectItem value="logout">تسجيل خروج</SelectItem>
            <SelectItem value="password_reset">إعادة تعيين كلمة مرور</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={load} className="h-8">
          <RefreshCw className="h-3.5 w-3.5 me-1" />
          تحديث
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={exportCsv}
          className="h-8 ms-auto"
        >
          <Download className="h-3.5 w-3.5 me-1" />
          تصدير CSV
        </Button>
      </Card>

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
            {filteredRows.map((r, i) => (
              <tr key={i}>
                <td>
                  <div className="flex items-center gap-2">
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{r.user_name ?? r.user_id}</span>
                  </div>
                </td>
                <td>
                  <Badge variant="secondary" className="text-[11.5px]">
                    {r.action === "login"
                      ? "تسجيل دخول"
                      : r.action === "logout"
                      ? "تسجيل خروج"
                      : "إعادة تعيين كلمة مرور"}
                  </Badge>
                </td>
                <td className="font-mono text-[12px]">
                  {new Date(r.created_at).toLocaleString("ar-SA")}
                </td>
              </tr>
            ))}
            {!filteredRows.length && (
              <tr>
                <td
                  colSpan={3}
                  className="text-center text-muted-foreground py-8"
                >
                  لا توجد سجلات تطابق الفلاتر
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <p className="text-xs text-muted-foreground mt-3">
        السجلات تُسحب من جدول التدقيق. الأحداث القادمة من Supabase Auth يمكن
        مزامنتها لاحقاً عبر خدمة الخادم.
      </p>
    </div>
  );
}
