import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Eye, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " SAR";

const STATUS_MAP: Record<string, { label: string; variant: any }> = {
  draft:       { label: "مسودة",   variant: "secondary" },
  sent:        { label: "مُرسل",   variant: "default" },
  negotiating: { label: "تفاوض",  variant: "outline" },
  approved:    { label: "معتمدة",  variant: "default" },
  rejected:    { label: "مرفوضة", variant: "destructive" },
  expired:     { label: "منتهية", variant: "secondary" },
  converted:   { label: "محوّلة", variant: "outline" },
};

export default function Quotations() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select("*, contact:contacts(name), lines:quotation_lines(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotations").update({ status: "approved" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم اعتماد العرض"); qc.invalidateQueries({ queryKey: ["quotations"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quotations").update({ status: "rejected" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.error("تم رفض العرض"); qc.invalidateQueries({ queryKey: ["quotations"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // ملاحظة: التحويل لأمر بيع يتم من صفحة العرض فقط — هناك يتم التحقق من توفر
  // المركبات في المخزون قبل الإنشاء وربط vehicle_id. أزلنا التحويل المباشر هنا
  // لأنه كان يتجاوز هذا التحقق.

  const filtered = quotes.filter(r => {
    const matchQ = !q || r.quote_no?.includes(q) || (r.contact?.name || r.customer_name || "").includes(q);
    const matchS = statusFilter === "all" || r.status === statusFilter;
    return matchQ && matchS;
  });

  const totalVal = filtered.reduce((s, r) => s + Number(r.total || 0), 0);
  const expiring = filtered.filter(r => {
    if (!r.valid_until) return false;
    const h = (new Date(r.valid_until).getTime() - Date.now()) / 3600000;
    return h < 48 && h >= 0 && (r.status === "sent" || r.status === "negotiating");
  }).length;

  return (
    <div dir="rtl">
      <PageHeader
        title="عروض الأسعار"
        subtitle={`${filtered.length} عرض · إجمالي ${fmtSAR(totalVal)} · ${expiring} قارب الانتهاء`}
        actions={
          <Button size="sm" onClick={() => nav("/sales/quotations/new")}>
            <Plus className="h-4 w-4 ml-1" /> عرض جديد
          </Button>
        }
      />

      <div className="flex gap-2 px-4 pb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: رقم، عميل..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="h-9 px-3 border border-border rounded-md text-sm bg-background"
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">كل الحالات</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div className="px-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-right px-3 py-2 font-medium">الرقم</th>
                <th className="text-right px-3 py-2 font-medium">العميل / المركبة</th>
                <th className="text-right px-3 py-2 font-medium">المندوب</th>
                <th className="text-right px-3 py-2 font-medium">الإجمالي</th>
                <th className="text-right px-3 py-2 font-medium">الصلاحية</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
                <th className="text-right px-3 py-2 font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد عروض</td></tr>
              ) : filtered.map(r => {
                const veh = r.lines?.[0];
                const custName = r.contact?.name || r.customer_name || "—";
                const sm = STATUS_MAP[r.status] ?? { label: r.status, variant: "secondary" };
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">{r.quote_no}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-sm">{custName}</div>
                      {veh && <div className="text-xs text-muted-foreground">{veh.brand} {veh.model} {veh.year}</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.sales_rep_name || "—"}</td>
                    <td className="px-3 py-2 font-medium text-sm">{fmtSAR(Number(r.total))}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.valid_until || "—"}</td>
                    <td className="px-3 py-2"><Badge variant={sm.variant}>{sm.label}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        {(r.status === "sent" || r.status === "negotiating") && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                              onClick={() => approveMut.mutate(r.id)} title="اعتماد">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                              onClick={() => rejectMut.mutate(r.id)} title="رفض">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-primary"
                            onClick={() => nav(`/sales/quotations/${r.id}`)} title="تحويل لأمر بيع (مع التحقق من المخزون)">
                            <ArrowRight className="h-3 w-3 ml-1" /> تحويل
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => nav(`/sales/quotations/${r.id}`)} title="عرض">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
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
