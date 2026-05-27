import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكد", variant: "default" },
  invoiced: { label: "مفوتر", variant: "outline" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

export default function SalesOrders() {
  const [rows, setRows] = useState<any[]>([]);
  const nav = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("sales_orders")
      .select("*, customers(name, code)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const orderNo = "SO-" + Date.now().toString().slice(-8);
    const { data: cust } = await supabase.from("customers").select("id").limit(1).maybeSingle();
    if (!cust) { toast.error("أضف عميلاً أولاً قبل إنشاء أمر بيع"); return; }
    const { data, error } = await supabase.from("sales_orders").insert({
      order_no: orderNo,
      customer_id: cust.id,
      department_code: "vehicles",
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    nav(`/sales-orders/${data.id}`);
  };

  return (
    <div>
      <PageHeader
        title="أوامر البيع"
        subtitle={`${rows.length} أمر بيع`}
        actions={<Button size="sm" onClick={create}><Plus className="h-4 w-4 ml-1" /> أمر بيع جديد</Button>}
      />

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th className="text-left">الإجمالي (ر.س)</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-center text-muted-foreground py-8">لا توجد أوامر بيع</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono">{r.order_no}</td>
                <td className="num">{r.order_date}</td>
                <td>{r.customers?.name ?? "—"}</td>
                <td className="num text-left font-semibold">{Number(r.total).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
                <td><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></td>
                <td><Button variant="ghost" size="sm" onClick={()=>nav(`/sales-orders/${r.id}`)}><Eye className="h-4 w-4" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
