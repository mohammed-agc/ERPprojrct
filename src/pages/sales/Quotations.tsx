import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Check, X, ArrowRight, AlertTriangle, Plus, Percent } from "lucide-react";
import { toast } from "sonner";
import {
  salesService, QUOTE_LABEL, QUOTE_TONE, fmtSAR, fmtRelative, fmtDate,
  type QuoteStatus,
} from "@/services/erp/sales";

const OPTS: { value: QuoteStatus | "all" | "open"; label: string }[] = [
  { value: "open", label: "العروض النشطة" },
  { value: "all", label: "كل الحالات" },
  { value: "draft", label: QUOTE_LABEL.draft },
  { value: "sent", label: QUOTE_LABEL.sent },
  { value: "negotiated", label: QUOTE_LABEL.negotiated },
  { value: "approved", label: QUOTE_LABEL.approved },
  { value: "expired", label: QUOTE_LABEL.expired },
  { value: "converted", label: QUOTE_LABEL.converted },
];

export default function SalesQuotations() {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<QuoteStatus | "all" | "open">("open");
  const all = useMemo(() => salesService.listQuotations(), [tick]);
  const sps = useMemo(() => salesService.listSalespeople(), []);

  const filtered = useMemo(() => {
    const qv = q.trim().toLowerCase();
    const open: QuoteStatus[] = ["draft", "sent", "negotiated", "approved"];
    return all.filter(x => {
      if (status === "open" && !open.includes(x.status)) return false;
      if (status !== "all" && status !== "open" && x.status !== status) return false;
      if (!qv) return true;
      const hay = `${x.code} ${x.customer} ${x.vehicle} ${x.branch}`.toLowerCase();
      return hay.includes(qv);
    });
  }, [all, q, status]);

  const totals = useMemo(() => ({
    count: filtered.length,
    value: filtered.reduce((s, x) => s + x.net_price, 0),
    expiring: filtered.filter(x => {
      const h = (new Date(x.valid_until).getTime() - Date.now()) / 3600_000;
      return (x.status === "sent" || x.status === "negotiated") && h >= 0 && h < 72;
    }).length,
  }), [filtered]);

  const onApprove = (id: string) => { salesService.approveQuotation(id); toast.success("تم اعتماد العرض"); refresh(); };
  const onReject = (id: string) => { salesService.rejectQuotation(id); toast.error("تم رفض العرض"); refresh(); };
  const onConvert = (id: string) => { salesService.convertQuotationToSO(id); toast.success("تم تحويل العرض إلى أمر بيع"); refresh(); };

  return (
    <div>
      <PageHeader
        title="عروض الأسعار"
        subtitle={`${totals.count} عرض · إجمالي ${fmtSAR(totals.value)} · ${totals.expiring} قارب الانتهاء`}
        actions={<Button size="sm"><Plus className="h-4 w-4 ml-1" /> عرض جديد</Button>}
      />

      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border border-border rounded-lg p-3 mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pr-9 h-9" placeholder="بحث: رقم، عميل، مركبة، فرع..." value={q} onChange={e => setQ(e.target.value)} />
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
              <th>العميل / المركبة</th>
              <th>المندوب</th>
              <th>السعر</th>
              <th>الخصم</th>
              <th>الصافي</th>
              <th>الهامش</th>
              <th>الصلاحية</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && <tr><td colSpan={10} className="text-center text-muted-foreground py-8">لا توجد عروض مطابقة</td></tr>}
            {filtered.map(x => {
              const sp = sps.find(s => s.id === x.salesperson_id);
              const margin = x.net_price > 0 ? ((x.net_price - x.est_cost) / x.net_price) * 100 : 0;
              const hLeft = (new Date(x.valid_until).getTime() - Date.now()) / 3600_000;
              const soon = (x.status === "sent" || x.status === "negotiated") && hLeft >= 0 && hLeft < 72;
              return (
                <tr key={x.id}>
                  <td className="font-mono text-[11px]">
                    {x.code}
                    {x.negotiation_notes && <div className="text-[9px] text-muted-foreground mt-0.5 max-w-[140px] truncate" title={x.negotiation_notes}>{x.negotiation_notes}</div>}
                  </td>
                  <td>
                    <div className="text-sm">{x.customer}</div>
                    <div className="text-[10px] text-muted-foreground">{x.vehicle}</div>
                  </td>
                  <td className="text-xs">
                    <div>{sp?.name ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{x.branch}</div>
                  </td>
                  <td className="num text-xs">{fmtSAR(x.list_price)}</td>
                  <td className="num text-xs">
                    <div>{fmtSAR(x.discount)}</div>
                    <div className={`text-[10px] flex items-center gap-0.5 ${x.discount_requires_approval ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                      <Percent className="h-2.5 w-2.5" />{x.discount_pct.toFixed(1)}
                      {x.discount_requires_approval && <span>· يحتاج اعتماد</span>}
                    </div>
                  </td>
                  <td className="num text-xs font-semibold">{fmtSAR(x.net_price)}</td>
                  <td className={`num text-xs ${margin > 10 ? "text-success" : margin > 5 ? "text-warning" : "text-destructive"}`}>{margin.toFixed(1)}%</td>
                  <td className="text-xs">
                    <div>{fmtDate(x.valid_until)}</div>
                    <div className={`text-[10px] flex items-center gap-0.5 ${soon ? "text-warning" : "text-muted-foreground"}`}>
                      {soon && <AlertTriangle className="h-2.5 w-2.5" />} {fmtRelative(x.valid_until)}
                    </div>
                  </td>
                  <td><Badge className={QUOTE_TONE[x.status]}>{QUOTE_LABEL[x.status]}</Badge></td>
                  <td className="whitespace-nowrap">
                    {(x.status === "sent" || x.status === "negotiated") && (
                      <div className="flex gap-1">
                        {x.discount_requires_approval && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-success" onClick={() => onApprove(x.id)} title="اعتماد الخصم">
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => onReject(x.id)} title="رفض">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    {x.status === "approved" && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-primary" onClick={() => onConvert(x.id)} title="تحويل إلى أمر بيع">
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
