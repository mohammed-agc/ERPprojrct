import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { governanceLogService, type GovernanceEntry } from "@/services/erp/governanceLog";
import { ShieldAlert, Search, ExternalLink, FileText } from "lucide-react";

const fmtDateTime = (s: string) => new Date(s).toLocaleString("ar-SA", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
});
const fmtSAR = (n: any) => n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US") + " ر.س";

const EVENT_LABEL: Record<string, string> = {
  credit_gate_override: "تجاوز ائتماني",
  credit_gate_proceed: "متابعة (ضمن الحد)",
  credit_gate_blocked: "حظر ائتماني",
};
const DECISION_TONE: Record<string, string> = {
  override: "bg-warning/15 text-warning border border-warning/40",
  proceed: "bg-success/15 text-success border border-success/40",
  blocked: "bg-destructive/15 text-destructive border border-destructive/40",
};
const DECISION_LABEL: Record<string, string> = {
  override: "تجاوز مدير", proceed: "متابعة", blocked: "محظور",
};

const DOC_PATH: Record<string, string> = {
  sales_order: "/sales-orders", invoice: "/invoices", delivery: "/deliveries",
};

export default function GovernanceLog() {
  const [rows, setRows] = useState<GovernanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [eventFilter, setEventFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(await governanceLogService.list({ limit: 500 })); }
      catch { setRows([]); }
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => rows.filter(r => {
    if (eventFilter !== "all" && r.event_type !== eventFilter) return false;
    if (!q) return true;
    const hay = `${r.user_name ?? ""} ${r.subject_name ?? ""} ${r.document_code ?? ""} ${r.reason ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [rows, q, eventFilter]);

  const stats = useMemo(() => ({
    total: rows.length,
    overrides: rows.filter(r => r.decision === "override").length,
    blocked: rows.filter(r => r.decision === "blocked").length,
  }), [rows]);

  return (
    <div dir="rtl">
      <PageHeader
        title="سجل الحوكمة — القرارات الائتمانية"
        subtitle="تتبّع كل تجاوز ائتماني: من أقرّه، ولماذا، وعلى أي مستند — للمراجعة والتدقيق"
      />

      <div className="px-4 pb-3 grid grid-cols-3 gap-2 max-w-md">
        <Stat label="إجمالي القرارات" value={String(stats.total)} icon={FileText} />
        <Stat label="تجاوزات المدير" value={String(stats.overrides)} icon={ShieldAlert} tone="warning" />
        <Stat label="حالات حظر" value={String(stats.blocked)} icon={ShieldAlert} tone="destructive" />
      </div>

      <div className="px-4 pb-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: المستخدم، العميل، المستند، السبب..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأحداث</SelectItem>
            <SelectItem value="credit_gate_override">تجاوز ائتماني</SelectItem>
            <SelectItem value="credit_gate_proceed">متابعة ضمن الحد</SelectItem>
            <SelectItem value="credit_gate_blocked">حظر ائتماني</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="px-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>التاريخ والوقت</th>
                <th>الحدث</th>
                <th>القرار</th>
                <th>المستخدم</th>
                <th>الدور</th>
                <th>العميل</th>
                <th>المستند</th>
                <th>المبلغ</th>
                <th>السبب</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">
                  <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  لا توجد قرارات حوكمة مسجّلة بعد.
                </td></tr>
              ) : filtered.map(r => {
                const exposure = (r.details as any)?.additional_exposure;
                const docPath = r.document_type ? DOC_PATH[r.document_type] : null;
                return (
                  <tr key={r.id}>
                    <td className="text-xs whitespace-nowrap num">{fmtDateTime(r.created_at)}</td>
                    <td className="text-xs">{EVENT_LABEL[r.event_type] ?? r.event_type}</td>
                    <td>
                      {r.decision && (
                        <Badge className={DECISION_TONE[r.decision] ?? ""}>{DECISION_LABEL[r.decision] ?? r.decision}</Badge>
                      )}
                    </td>
                    <td className="text-xs font-medium">{r.user_name ?? "—"}</td>
                    <td className="text-xs text-muted-foreground">{r.user_role ?? "—"}</td>
                    <td className="text-xs">
                      {r.subject_id ? (
                        <Link to={`/contacts/${r.subject_id}`} className="hover:underline">{r.subject_name ?? "—"}</Link>
                      ) : (r.subject_name ?? "—")}
                    </td>
                    <td className="text-xs font-mono">
                      {r.document_code && docPath && r.document_id ? (
                        <Link to={`${docPath}/${r.document_id}`} className="text-primary hover:underline inline-flex items-center gap-1">
                          {r.document_code} <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (r.document_code ?? "—")}
                    </td>
                    <td className="text-xs num">{fmtSAR(exposure)}</td>
                    <td className="text-xs max-w-xs">{r.reason ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone = "default" }: any) {
  const c = tone === "warning" ? "text-warning" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="border border-border rounded-lg p-2.5">
      <div className="flex items-center gap-1 text-[12px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`text-lg font-bold num ${c}`}>{value}</div>
    </div>
  );
}
