import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Banknote, Check, X, FileText } from "lucide-react";
import {
  salesService, FIN_LABEL, FIN_TONE, fmtSAR, fmtDate,
  type FinancingStatus,
} from "@/services/erp/sales";

const OPTS: { value: FinancingStatus | "all"; label: string }[] = [
  { value: "all", label: "كل الحالات" },
  { value: "submitted", label: FIN_LABEL.submitted },
  { value: "under_review", label: FIN_LABEL.under_review },
  { value: "approved", label: FIN_LABEL.approved },
  { value: "disbursed", label: FIN_LABEL.disbursed },
  { value: "rejected", label: FIN_LABEL.rejected },
];

export default function SalesFinancing() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<FinancingStatus | "all">("all");
  const all = useMemo(() => salesService.listFinancings(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    return all.filter(f => {
      if (status !== "all" && f.status !== status) return false;
      if (!qv) return true;
      return `${f.code} ${f.customer} ${f.provider} ${f.so_code}`.toLowerCase().includes(qv);
    });
  }, [all, q, status]);

  const totals = useMemo(() => ({
    total: all.length,
    pending: all.filter(f => f.status === "submitted" || f.status === "under_review").length,
    approved: all.filter(f => f.status === "approved" || f.status === "disbursed").length,
    volume: all.filter(f => f.status === "approved" || f.status === "disbursed").reduce((s, f) => s + f.amount, 0),
  }), [all]);

  return (
    <div>
      <PageHeader
        title="التمويل والتقسيط"
        subtitle={`${totals.total} طلب · ${totals.pending} قيد الدراسة · ${totals.approved} معتمد · إجمالي ${fmtSAR(totals.volume)}`}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، بنك، أمر بيع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{OPTS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
        </Select>
        <div className="text-xs text-muted-foreground ml-auto">{filtered.length} نتيجة</div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>العميل / أمر البيع</th>
              <th>الجهة الممولة</th>
              <th>المبلغ</th>
              <th>المدة</th>
              <th>القسط</th>
              <th>المستندات</th>
              <th>تاريخ التقديم</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد طلبات تمويل مطابقة</td></tr>}
            {filtered.map(f => {
              const got = f.required_docs.filter(d => d.received).length;
              const complete = got === f.required_docs.length;
              return (
                <tr key={f.id}>
                  <td className="font-mono text-[11px]">{f.code}</td>
                  <td>
                    <div className="text-sm">{f.customer}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{f.so_code}</div>
                  </td>
                  <td className="text-xs flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-primary" />{f.provider}</td>
                  <td className="num text-xs font-semibold">{fmtSAR(f.amount)}</td>
                  <td className="text-xs"><span className="num">{f.tenure_months}</span> شهر</td>
                  <td className="num text-xs">{fmtSAR(f.installment)}</td>
                  <td className="text-xs">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className={complete ? "text-success" : "text-warning"}>{got}/{f.required_docs.length}</span>
                    </div>
                    <div className="flex flex-wrap gap-0.5 mt-0.5">
                      {f.required_docs.map((d, i) => (
                        <span key={i} title={d.label} className={`inline-block h-1.5 w-3 rounded ${d.received ? "bg-success" : "bg-muted"}`} />
                      ))}
                    </div>
                  </td>
                  <td className="text-xs">{fmtDate(f.submitted_at)}</td>
                  <td>
                    <Badge className={FIN_TONE[f.status]}>{FIN_LABEL[f.status]}</Badge>
                    {f.status === "approved" && <div className="text-[9px] text-success flex items-center gap-0.5 mt-0.5"><Check className="h-2.5 w-2.5" />{fmtDate(f.decided_at)}</div>}
                    {f.status === "rejected" && <div className="text-[9px] text-destructive flex items-center gap-0.5 mt-0.5"><X className="h-2.5 w-2.5" />{f.notes}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
