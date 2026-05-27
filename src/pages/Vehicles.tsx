import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

const statusMap: Record<string, { label: string; variant: any }> = {
  available: { label: "متوفر", variant: "default" },
  reserved: { label: "محجوز", variant: "secondary" },
  sold: { label: "مُباع", variant: "outline" },
};

export default function Vehicles() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({
    code: "", name: "", brand: "", model: "", year: new Date().getFullYear(),
    vin: "", color: "", mileage: 0, cost_price: 0, sale_price: 0, status: "available",
  });

  const load = async () => {
    const { data } = await supabase.from("vehicles").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code || !form.name || !form.brand) { toast.error("الكود والاسم والصانع مطلوبة"); return; }
    const { error } = await supabase.from("vehicles").insert({
      ...form,
      year: Number(form.year), mileage: Number(form.mileage),
      cost_price: Number(form.cost_price), sale_price: Number(form.sale_price),
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة المركبة");
    setOpen(false);
    load();
  };

  const filtered = rows.filter(r =>
    !q || r.name.includes(q) || r.code.includes(q) || (r.vin ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <div>
      <PageHeader
        title="المركبات"
        subtitle={`${rows.length} مركبة في المعرض`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> مركبة جديدة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>مركبة جديدة</DialogTitle></DialogHeader>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>الكود *</Label><Input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} /></div>
                <div className="col-span-2"><Label>الاسم *</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="مثال: تويوتا كامري 2024 فل كامل" /></div>
                <div><Label>الصانع *</Label><Input value={form.brand} onChange={e=>setForm({...form, brand:e.target.value})} /></div>
                <div><Label>الموديل</Label><Input value={form.model} onChange={e=>setForm({...form, model:e.target.value})} /></div>
                <div><Label>السنة</Label><Input type="number" value={form.year} onChange={e=>setForm({...form, year:e.target.value})} dir="ltr" /></div>
                <div className="col-span-2"><Label>رقم الهيكل (VIN)</Label><Input value={form.vin} onChange={e=>setForm({...form, vin:e.target.value})} dir="ltr" /></div>
                <div><Label>اللون</Label><Input value={form.color} onChange={e=>setForm({...form, color:e.target.value})} /></div>
                <div><Label>الممشى (كم)</Label><Input type="number" value={form.mileage} onChange={e=>setForm({...form, mileage:e.target.value})} dir="ltr" /></div>
                <div><Label>التكلفة (ر.س)</Label><Input type="number" value={form.cost_price} onChange={e=>setForm({...form, cost_price:e.target.value})} dir="ltr" /></div>
                <div><Label>سعر البيع (ر.س)</Label><Input type="number" value={form.sale_price} onChange={e=>setForm({...form, sale_price:e.target.value})} dir="ltr" /></div>
                <div>
                  <Label>الحالة</Label>
                  <Select value={form.status} onValueChange={v=>setForm({...form, status:v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">متوفر</SelectItem>
                      <SelectItem value="reserved">محجوز</SelectItem>
                      <SelectItem value="sold">مُباع</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>حفظ المركبة</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث بالاسم، الكود، أو VIN..." value={q} onChange={e=>setQ(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الصانع/الموديل</th>
              <th>السنة</th>
              <th>VIN</th>
              <th>اللون</th>
              <th className="text-left">السعر (ر.س)</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-muted-foreground py-8">لا توجد مركبات</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.code}</td>
                <td className="font-medium">{r.name}</td>
                <td className="text-muted-foreground">{r.brand} {r.model}</td>
                <td className="num">{r.year}</td>
                <td className="font-mono text-[11px]" dir="ltr">{r.vin || "—"}</td>
                <td>{r.color || "—"}</td>
                <td className="num text-left font-semibold">{Number(r.sale_price).toLocaleString("ar-SA")}</td>
                <td><Badge variant={statusMap[r.status]?.variant}>{statusMap[r.status]?.label}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
