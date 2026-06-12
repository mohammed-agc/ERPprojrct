import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Eye, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";

const statusMap: Record<string, { label: string; variant: any }> = {
  draft: { label: "مسودة", variant: "secondary" },
  confirmed: { label: "مؤكد", variant: "default" },
  invoiced: { label: "مفوتر", variant: "outline" },
  cancelled: { label: "ملغي", variant: "destructive" },
};

const DEPT_OPTIONS = [
  { code: "vehicles", label: "المركبات" },
  { code: "spare_parts", label: "قطع الغيار" },
];

export default function SalesOrders() {
  const { department, isManager } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [custId, setCustId] = useState<string>("");
  const [deptCode, setDeptCode] = useState<string>("vehicles");
  const nav = useNavigate();

  const load = async () => {
    const { data } = await supabase
      .from("sales_orders")
      .select("*, contact:contacts(name, code)")
      .order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const openDialog = async () => {
    const uid = (await supabase.auth.getUser()).data.user?.id;
    const { data: prof } = await supabase.from("profiles").select("department_code").eq("id", uid ?? "").maybeSingle();
    const dept = prof?.department_code ?? "VEH";
    const deptCode = dept === "VEH" ? "vehicles" : dept === "PARTS" ? "spare_parts" : "vehicles";
    const orderNo = "SO-" + new Date().getFullYear() + "-" + String(Math.floor(Math.random()*9000)+1000);
    const { data, error } = await supabase.from("sales_orders").insert({ order_no: orderNo, department_code: deptCode, created_by: uid }).select().single();
    if (error) { toast.error(error.message); return; }
    nav(`/sales-orders/${data.id}`);
  };

  const create = async () => {
    if (!custId) { toast.error("اختر العميل أولاً"); return; }
    if (!isManager && department?.code && department.code !== deptCode) {
      toast.error("لا يمكنك إنشاء أمر بيع لقسم غير قسمك");
      return;
    }
    setCreating(true);
    const orderNo = "SO-" + Date.now().toString().slice(-8);
    const { data, error } = await supabase.from("sales_orders").insert({
      order_no: orderNo,
      customer_id: custId,
      department_code: deptCode as any,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    }).select().single();
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    setOpen(false);
    nav(`/sales-orders/${data.id}`);
  };

  const filteredCust = customers.filter(c =>
    !q || c.name.includes(q) || (c.code ?? "").includes(q)
  );

  // restrict dept options for non-managers
  const availableDepts = isManager
    ? DEPT_OPTIONS
    : DEPT_OPTIONS.filter(d => d.code === department?.code);

  return (
    <div>
      <PageHeader
        title="أوامر البيع"
        subtitle={`${rows.length} أمر بيع`}
        actions={<Button size="sm" onClick={openDialog}><Plus className="h-4 w-4 ml-1" /> أمر بيع جديد</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>أمر بيع جديد</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>القسم</Label>
              <Select value={deptCode} onValueChange={setDeptCode} disabled={availableDepts.length <= 1}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableDepts.map(d => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>العميل</Label>
              <div className="relative mt-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pr-9" placeholder="بحث بالاسم أو الكود..." value={q} onChange={e=>setQ(e.target.value)} />
              </div>
              <div className="mt-2 max-h-60 overflow-y-auto border border-border rounded-md">
                {filteredCust.length === 0 && (
                  <div className="px-3 py-6 text-center text-sm text-muted-foreground">لا يوجد عملاء</div>
                )}
                {filteredCust.map(c => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setCustId(c.id)}
                    className={`w-full text-right px-3 py-2 text-sm border-b border-border last:border-b-0 hover:bg-accent ${custId === c.id ? "bg-accent text-accent-foreground font-medium" : ""}`}
                  >
                    <div>{c.name}</div>
                    <div className="text-[12px] text-muted-foreground font-mono">{c.code}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={()=>setOpen(false)}>إلغاء</Button>
            <Button onClick={create} disabled={!custId || creating}>{creating ? "جاري الإنشاء..." : "إنشاء"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>العميل</th>
              <th>القسم</th>
              <th className="text-right">الإجمالي (ر.س)</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={7} className="text-center text-muted-foreground py-8">لا توجد أوامر بيع</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id}>
                <td className="font-mono" dir="ltr">{r.order_no}</td>
                <td className="num">{r.order_date}</td>
                <td>{r.customer_name ?? (r as any).contact?.name ?? "—"}</td>
                <td className="text-xs text-muted-foreground">{r.department_code === "spare_parts" ? "قطع الغيار" : "المركبات"}</td>
                <td className="num text-right font-semibold">{Number(r.total).toLocaleString("ar-SA", { minimumFractionDigits: 2 })}</td>
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


