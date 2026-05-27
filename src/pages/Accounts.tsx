import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";

const typeLabel: Record<string, string> = {
  asset: "أصل", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف"
};
const typeColor: Record<string, any> = {
  asset: "default", liability: "secondary", equity: "outline", revenue: "default", expense: "destructive"
};

export default function Accounts() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    supabase.from("accounts").select("*").order("code").then(({ data }) => setRows(data ?? []));
  }, []);
  return (
    <div>
      <PageHeader title="دليل الحسابات" subtitle={`${rows.length} حساب — مُهيَّأ للسوق السعودي`} />
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr><th>الكود</th><th>الاسم</th><th>الاسم بالإنجليزية</th><th>النوع</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono">{r.code}</td>
                <td className="font-medium">{r.name_ar}</td>
                <td className="text-muted-foreground text-xs" dir="ltr">{r.name_en}</td>
                <td><Badge variant={typeColor[r.type]}>{typeLabel[r.type]}</Badge></td>
                <td>{r.is_active ? <span className="text-success text-xs">نشط</span> : <span className="text-muted-foreground text-xs">غير نشط</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
