import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", vat_number: "", phone: "", email: "", city: "", address: "" });

  const load = async () => {
    const { data } = await supabase.from("customers").select("*").order("created_at", { ascending: false });
    setRows(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.code || !form.name) { toast.error("الكود والاسم مطلوبان"); return; }
    const { error } = await supabase.from("customers").insert({
      ...form,
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إضافة العميل");
    setOpen(false);
    setForm({ code: "", name: "", vat_number: "", phone: "", email: "", city: "", address: "" });
    load();
  };

  const filtered = rows.filter(r =>
    !q || r.name.includes(q) || r.code.includes(q) || (r.phone ?? "").includes(q)
  );

  return (
    <div>
      <PageHeader
        title="العملاء"
        subtitle={`${rows.length} عميل`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> عميل جديد</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>عميل جديد</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>كود العميل *</Label><Input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} /></div>
                <div><Label>الاسم *</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} /></div>
                <div><Label>الرقم الضريبي</Label><Input value={form.vat_number} onChange={e=>setForm({...form, vat_number:e.target.value})} dir="ltr" /></div>
                <div><Label>الجوال</Label><Input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} dir="ltr" /></div>
                <div><Label>البريد</Label><Input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} dir="ltr" /></div>
                <div><Label>المدينة</Label><Input value={form.city} onChange={e=>setForm({...form, city:e.target.value})} /></div>
                <div className="col-span-2"><Label>العنوان</Label><Input value={form.address} onChange={e=>setForm({...form, address:e.target.value})} /></div>
              </div>
              <DialogFooter><Button onClick={save}>حفظ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="relative mb-3 max-w-sm">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pr-9" placeholder="بحث بالاسم، الكود، الجوال..." value={q} onChange={e=>setQ(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الرقم الضريبي</th>
              <th>الجوال</th>
              <th>المدينة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground py-8">لا توجد بيانات</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.id}>
                <td className="font-mono text-xs">{r.code}</td>
                <td className="font-medium">{r.name}</td>
                <td className="num text-xs">{r.vat_number || "—"}</td>
                <td className="num text-xs" dir="ltr">{r.phone || "—"}</td>
                <td>{r.city || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
