import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

export default function Journals() {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => {
    const { data } = await supabase
      .from("journal_entries")
      .select("*, journal_entry_lines(debit, credit)")
      .order("entry_date", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <PageHeader
        title="قيود اليومية"
        subtitle="قيود مزدوجة القيد — يجب أن يساوي المدين الدائن قبل الترحيل"
      />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>رقم القيد</th>
              <th>التاريخ</th>
              <th>المرجع</th>
              <th>البيان</th>
              <th className="text-left">إجمالي مدين</th>
              <th className="text-left">إجمالي دائن</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-8">لا توجد قيود بعد — سيتم إنشاؤها تلقائياً عند ترحيل الفواتير</td></tr>
            )}
            {rows.map(r => {
              const debit = (r.journal_entry_lines ?? []).reduce((s: number, l: any) => s + Number(l.debit), 0);
              const credit = (r.journal_entry_lines ?? []).reduce((s: number, l: any) => s + Number(l.credit), 0);
              return (
                <tr key={r.id}>
                  <td className="font-mono">{r.entry_no}</td>
                  <td className="num">{r.entry_date}</td>
                  <td className="text-xs">{r.reference || "—"}</td>
                  <td>{r.description || "—"}</td>
                  <td className="num text-left font-semibold">{debit.toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td className="num text-left font-semibold">{credit.toLocaleString("ar-SA", {minimumFractionDigits:2})}</td>
                  <td>{r.is_posted
                    ? <Badge className="gap-1"><Lock className="h-3 w-3" /> مُرحَّل</Badge>
                    : <Badge variant="secondary">مسودة</Badge>}
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
