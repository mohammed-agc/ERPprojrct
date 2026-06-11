import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookUser, Search } from "lucide-react";
import {
  listPartners, getPartnerSubledger, fmtSAR, fmtDate, DOC_TYPE_LABEL,
} from "@/services/erp/partnerLedger";

export default function PartnerLedger() {
  const [kind, setKind] = useState<"all" | "customer" | "supplier">("all");
  const [partnerId, setPartnerId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [pSearch, setPSearch] = useState("");

  const { data: partners = [] } = useQuery({
    queryKey: ["partners", kind],
    queryFn: () => listPartners(kind === "all" ? undefined : kind),
  });

  const filteredPartners = useMemo(() =>
    partners.filter(p => !pSearch || p.name.toLowerCase().includes(pSearch.toLowerCase()) || (p.code ?? "").includes(pSearch)),
    [partners, pSearch]
  );

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["partner-subledger", partnerId, from, to, kind],
    queryFn: () => getPartnerSubledger(partnerId, from || undefined, to || undefined, kind === "all" ? undefined : kind),
    enabled: !!partnerId,
  });

  const partner = partners.find(p => p.id === partnerId);
  const totalDebit = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  const closing = rows.length > 0 ? Number(rows[rows.length - 1].running_balance) : 0;

  return (
    <div className="space-y-3" dir="rtl">
      <PageHeader
        title="دفتر الأستاذ المساعد للطرف"
        subtitle="كشف حركات العميل أو المورد مع الرصيد الجاري — من حسابات المراقبة"
      />

      {/* أدوات الاختيار */}
      <div className="bg-card border border-border rounded-lg p-3 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div>
          <Label className="text-xs">النوع</Label>
          <Select value={kind} onValueChange={v => { setKind(v as any); setPartnerId(""); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="customer">عملاء</SelectItem>
              <SelectItem value="supplier">موردون</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-1">
          <Label className="text-xs">الطرف</Label>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="اختر طرفاً" /></SelectTrigger>
            <SelectContent>
              <div className="p-1.5 sticky top-0 bg-popover z-10">
                <div className="relative">
                  <Search className="absolute right-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input value={pSearch} onChange={e => setPSearch(e.target.value)}
                    placeholder="بحث…" className="h-7 pr-7 text-xs" onClick={e => e.stopPropagation()} />
                </div>
              </div>
              {filteredPartners.length === 0 && <div className="p-2 text-xs text-muted-foreground">لا نتائج</div>}
              {filteredPartners.map(p => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} {p.code ? `(${p.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">من تاريخ</Label>
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} dir="ltr" className="h-9" />
        </div>
        <div>
          <Label className="text-xs">إلى تاريخ</Label>
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} dir="ltr" className="h-9" />
        </div>
      </div>

      {!partnerId && (
        <div className="text-center text-muted-foreground py-16">
          <BookUser className="h-10 w-10 mx-auto mb-2 opacity-40" />
          اختر طرفاً لعرض كشف حسابه
        </div>
      )}

      {partnerId && (
        <>
          {/* الملخّص */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="الطرف" valueNode={
              <span className="text-sm font-bold">{partner?.name ?? "—"}</span>
            } />
            <Stat label="إجمالي مدين" value={fmtSAR(totalDebit)} tone="text-info" />
            <Stat label="إجمالي دائن" value={fmtSAR(totalCredit)} tone="text-success" />
            <Stat label="الرصيد الختامي" value={fmtSAR(Math.abs(closing))}
              tone={closing >= 0 ? "text-warning" : "text-destructive"}
              hint={closing >= 0 ? "مستحق علينا/له" : "مستحق لنا"} />
          </div>

          {/* الحركات */}
          <div className="border border-border rounded-lg overflow-x-auto">
            <table className="erp-table">
              <thead>
                <tr>
                  <th>التاريخ</th><th>القيد</th><th>المستند</th><th>المرجع</th>
                  <th>الوصف</th><th>مدين</th><th>دائن</th><th>الرصيد الجاري</th>
                </tr>
              </thead>
              <tbody>
                {isFetching && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground py-6">جارٍ التحميل…</td></tr>
                )}
                {!isFetching && rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground py-8">
                    لا توجد حركات لهذا الطرف في الفترة المحددة
                  </td></tr>
                )}
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="text-xs whitespace-nowrap">{fmtDate(r.entry_date)}</td>
                    <td className="font-mono text-[10px]" dir="ltr">{r.entry_no}</td>
                    <td className="text-xs">
                      {r.document_type
                        ? <Badge className="bg-muted text-foreground text-[10px]">{DOC_TYPE_LABEL[r.document_type] ?? r.document_type}</Badge>
                        : "—"}
                    </td>
                    <td className="font-mono text-[10px]" dir="ltr">{r.reference_number ?? "—"}</td>
                    <td className="text-xs text-muted-foreground max-w-[200px] truncate">{r.description ?? "—"}</td>
                    <td className="num text-xs text-info">{Number(r.debit) > 0 ? fmtSAR(r.debit) : "—"}</td>
                    <td className="num text-xs text-success">{Number(r.credit) > 0 ? fmtSAR(r.credit) : "—"}</td>
                    <td className="num text-xs font-bold">{fmtSAR(r.running_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, valueNode, tone, hint }:
  { label: string; value?: string; valueNode?: React.ReactNode; tone?: string; hint?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-[10px] text-muted-foreground mb-1">{label}</div>
      {valueNode ?? <div className={`text-sm font-bold num ${tone ?? ""}`}>{value}</div>}
      {hint && <div className="text-[9px] text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}