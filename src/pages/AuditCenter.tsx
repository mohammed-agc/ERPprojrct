import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/erp/EmptyState";
import {
  governanceService, type AuditEntry, type AuditKind,
  auditKindLabel, auditSeverityTone,
} from "@/services/erp/governance";
import { fmtSAR, startOfMonthIso, todayIso } from "@/lib/erpFormat";
import { FileSpreadsheet, Search, RotateCw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export default function AuditCenter() {
  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [from, setFrom] = useState(startOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [kind, setKind] = useState<AuditKind | "all">("all");
  const [severity, setSeverity] = useState<"all" | "info" | "warning" | "critical">("all");
  const [q, setQ] = useState("");

  const load = async () => setRows(await governanceService.listAudit({ from, to, kind, severity }));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, kind, severity]);

  const filtered = useMemo(() => {
    const t = q.trim();
    return rows.filter(r => !t || r.entity_ref.includes(t) || r.user.includes(t) || r.description.includes(t));
  }, [rows, q]);

  const counts = useMemo(() => ({
    critical: rows.filter(r => r.severity === "critical").length,
    warning: rows.filter(r => r.severity === "warning").length,
    info: rows.filter(r => r.severity === "info").length,
  }), [rows]);

  const exportCsv = () => {
    const head = ["التاريخ", "النوع", "المرجع", "الفترة", "المستخدم", "المبلغ", "الخطورة", "الوصف"];
    const lines = filtered.map(r => [
      r.at.slice(0, 16).replace("T", " "), auditKindLabel[r.kind], r.entity_ref,
      r.period ?? "", r.user, r.amount ? fmtSAR(r.amount) : "", r.severity, r.description,
    ].map(s => `"${s}"`).join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `audit-${todayIso()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title="مركز المراجعة والتدقيق"
        subtitle="استعراض القيود المعدلة والمعكوسة والتسويات وتجاوزات الاعتماد"
        sticky
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <FileSpreadsheet className="h-3.5 w-3.5 ml-1" /> تصدير
            </Button>
            <Button size="sm" variant="ghost" onClick={load}><RotateCw className="h-3.5 w-3.5" /></Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="border rounded-lg p-3 bg-card">
          <div className="text-xs text-muted-foreground">تنبيهات حرجة</div>
          <div className="font-bold text-2xl text-rose-600 flex items-center gap-2"><ShieldAlert className="h-5 w-5" /> {counts.critical}</div>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="text-xs text-muted-foreground">تحذيرات</div>
          <div className="font-bold text-2xl text-amber-600">{counts.warning}</div>
        </div>
        <div className="border rounded-lg p-3 bg-card">
          <div className="text-xs text-muted-foreground">معلوماتي</div>
          <div className="font-bold text-2xl text-blue-600">{counts.info}</div>
        </div>
      </div>

      <div className="sticky top-[64px] z-10 bg-background/95 backdrop-blur border rounded-lg p-3 mb-3 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1"><Label className="text-xs">من</Label>
          <Input type="date" className="h-8 w-36" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div className="flex flex-col gap-1"><Label className="text-xs">إلى</Label>
          <Input type="date" className="h-8 w-36" value={to} onChange={e => setTo(e.target.value)} /></div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">النوع</Label>
          <Select value={kind} onValueChange={v => setKind(v as AuditKind | "all")}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {Object.entries(auditKindLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">الخطورة</Label>
          <Select value={severity} onValueChange={v => setSeverity(v as "all" | "info" | "warning" | "critical")}>
            <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="critical">حرج</SelectItem>
              <SelectItem value="warning">تحذير</SelectItem>
              <SelectItem value="info">معلوماتي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <Label className="text-xs">بحث</Label>
          <div className="relative">
            <Search className="absolute right-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input className="h-8 pr-8" placeholder="المرجع / المستخدم / الوصف"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ والوقت</th><th>النوع</th><th>المرجع</th><th>الفترة</th>
              <th>المستخدم</th><th className="text-left">المبلغ</th><th>الخطورة</th><th>الوصف</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <EmptyState inTable colSpan={8} title="لا توجد أحداث مراجعة" />}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="num text-xs">{r.at.slice(0, 16).replace("T", " ")}</td>
                <td className="text-xs font-medium">{auditKindLabel[r.kind]}</td>
                <td className="font-mono text-xs">{r.entity_ref}</td>
                <td className="text-xs text-muted-foreground">{r.period ?? "—"}</td>
                <td className="text-xs">{r.user}</td>
                <td className="num text-left">{r.amount ? fmtSAR(r.amount) : "—"}</td>
                <td>
                  <Badge variant="outline" className={cn("text-[10px]", auditSeverityTone[r.severity])}>
                    {r.severity === "critical" ? "حرج" : r.severity === "warning" ? "تحذير" : "معلوماتي"}
                  </Badge>
                </td>
                <td className="text-xs">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
