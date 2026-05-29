import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, RefreshCw } from "lucide-react";
import { auditLogService, type AuditEntry } from "@/services/erp/auditLog";
import { toast } from "sonner";

const MODULES = [
  "purchasing", "sales", "inventory", "accounting", "treasury",
  "master_data", "admin", "auth", "governance",
];

export default function AdminAuditLog() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("");

  const load = async () => {
    try {
      const data = await auditLogService.list({
        module: moduleFilter === "all" ? undefined : moduleFilter,
        action: actionFilter || undefined,
        search: search || undefined,
        limit: 500,
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر تحميل السجل");
      setRows([]);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const exportCsv = () => {
    if (!rows?.length) return;
    const headers = ["التاريخ", "المستخدم", "الإجراء", "الوحدة", "نوع المستند", "كود المستند"];
    const lines = [headers.join(",")];
    rows.forEach(r => {
      lines.push([
        new Date(r.created_at).toISOString(),
        r.user_name ?? "",
        r.action,
        r.module,
        r.document_type ?? "",
        r.document_code ?? "",
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit_log_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title="مركز التدقيق" subtitle="سجل كامل لإجراءات المستخدمين عبر النظام" />
      <Card className="p-3 mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="بحث بكود مستند أو اسم..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && load()}
          className="h-8 w-60"
        />
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="الوحدة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الوحدات</SelectItem>
            {MODULES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          placeholder="الإجراء..."
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value)}
          className="h-8 w-36"
        />
        <Button variant="outline" size="sm" onClick={load} className="h-8">
          <RefreshCw className="h-3.5 w-3.5 me-1" />
          تطبيق
        </Button>
        <Button variant="outline" size="sm" onClick={exportCsv} className="h-8 ms-auto">
          <Download className="h-3.5 w-3.5 me-1" />
          تصدير CSV
        </Button>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>المستخدم</th>
              <th>الإجراء</th>
              <th>الوحدة</th>
              <th>نوع المستند</th>
              <th>كود المستند</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">جاري التحميل...</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="font-mono text-[11px] whitespace-nowrap">{new Date(r.created_at).toLocaleString("ar-SA")}</td>
                <td>{r.user_name ?? "—"}</td>
                <td><Badge variant="secondary" className="text-[10px]">{r.action}</Badge></td>
                <td className="text-xs">{r.module}</td>
                <td className="text-xs">{r.document_type ?? "—"}</td>
                <td className="font-mono text-xs">{r.document_code ?? "—"}</td>
              </tr>
            ))}
            {rows && !rows.length && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">لا توجد سجلات بعد. سيظهر هنا أي حدث يُسجَّل عبر خدمة التدقيق.</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
