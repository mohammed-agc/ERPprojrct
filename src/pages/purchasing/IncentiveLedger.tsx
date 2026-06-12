import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Movement = "earned" | "approved" | "received" | "utilized" | "adjustment" | "reversal";

const MOVE_LABEL: Record<string, string> = {
  earned: "استحقاق", approved: "اعتماد", received: "استلام",
  utilized: "استخدام", adjustment: "تسوية", reversal: "عكس",
};
const MOVE_TONE: Record<string, string> = {
  earned: "bg-primary/10 text-primary border border-primary/30",
  approved: "bg-info/10 text-info border border-info/30",
  received: "bg-success/10 text-success border border-success/30",
  utilized: "bg-warning/10 text-warning border border-warning/30",
  adjustment: "bg-muted text-muted-foreground",
  reversal: "bg-destructive/10 text-destructive border border-destructive/30",
};

interface LedgerRow {
  id: string;
  entry_date: string;
  movement: string;
  reference: string | null;
  description: string | null;
  debit: number;
  credit: number;
  supplier_id: string | null;
  supplier_name?: string;
}

const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n || 0);
const fmtDate = (s?: string | null) =>
  s ? new Intl.DateTimeFormat("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "—";

async function fetchLedger(): Promise<LedgerRow[]> {
  const { data, error } = await supabase
    .from("incentive_ledger")
    .select("id, entry_date, movement, reference, description, debit, credit, supplier_id")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as LedgerRow[];
  // أسماء الموردين
  const ids = [...new Set(rows.map(r => r.supplier_id).filter(Boolean))] as string[];
  if (ids.length > 0) {
    const { data: contacts } = await supabase.from("contacts").select("id, name").in("id", ids);
    const nameMap = new Map((contacts ?? []).map((c: any) => [c.id, c.name]));
    rows.forEach(r => { if (r.supplier_id) r.supplier_name = nameMap.get(r.supplier_id) ?? "—"; });
  }
  return rows;
}

export default function IncentiveLedger() {
  const [q, setQ] = useState("");
  const [move, setMove] = useState<string>("all");

  const { data: rows = [] } = useQuery({ queryKey: ["incentive-ledger"], queryFn: fetchLedger });

  const filtered = useMemo(() => rows.filter(r => {
    if (move !== "all" && r.movement !== move) return false;
    if (q) {
      const hay = `${r.reference ?? ""} ${r.description ?? ""} ${r.supplier_name ?? ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [rows, q, move]);

  const totalDebit = filtered.reduce((s, r) => s + Number(r.debit), 0);
  const totalCredit = filtered.reduce((s, r) => s + Number(r.credit), 0);
  const balance = totalDebit - totalCredit;

  return (
    <div className="space-y-3" dir="rtl">
      <PageHeader
        title="دفتر أستاذ الحوافز"
        subtitle={`${filtered.length} حركة · الرصيد المستحق: ${fmtSAR(balance)}`}
      />

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث: مرجع، وصف، مورد…" className="pr-8" />
        </div>
        <Select value={move} onValueChange={setMove}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحركات</SelectItem>
            {Object.keys(MOVE_LABEL).map(m => <SelectItem key={m} value={m}>{MOVE_LABEL[m]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="إجمالي المستحق (مدين)" value={fmtSAR(totalDebit)} tone="text-primary" />
        <Stat label="إجمالي المصروف (دائن)" value={fmtSAR(totalCredit)} tone="text-success" />
        <Stat label="الرصيد المتبقّي" value={fmtSAR(balance)} tone={balance > 0 ? "text-warning" : "text-muted-foreground"} />
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="erp-table">
          <thead>
            <tr>
              <th>التاريخ</th><th>الحركة</th><th>المورد</th><th>المرجع</th>
              <th>الوصف</th><th>مدين</th><th>دائن</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-8">
                <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
                لا توجد حركات حوافز بعد
              </td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="text-xs whitespace-nowrap">{fmtDate(r.entry_date)}</td>
                <td><Badge className={MOVE_TONE[r.movement] ?? "bg-muted"}>{MOVE_LABEL[r.movement] ?? r.movement}</Badge></td>
                <td className="text-xs">{r.supplier_name ?? "—"}</td>
                <td className="font-mono text-[11.5px]" dir="ltr">{r.reference ?? "—"}</td>
                <td className="text-xs text-muted-foreground">{r.description ?? "—"}</td>
                <td className="num text-xs text-primary">{Number(r.debit) > 0 ? fmtSAR(r.debit) : "—"}</td>
                <td className="num text-xs text-success">{Number(r.credit) > 0 ? fmtSAR(r.credit) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-[11.5px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-sm font-bold num ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
