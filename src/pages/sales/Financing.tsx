import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, CheckCircle, XCircle, Plus, Pencil, Trash2, Landmark } from "lucide-react";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US") + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_MAP: Record<string, { label: string; variant: any }> = {
  draft:        { label: "مسودة",        variant: "secondary" },
  submitted:    { label: "مُقدّم",        variant: "default" },
  under_review: { label: "قيد الدراسة",   variant: "outline" },
  approved:     { label: "معتمد",         variant: "default" },
  rejected:     { label: "مرفوض",         variant: "destructive" },
  disbursed:    { label: "تم الصرف",      variant: "default" },
  cancelled:    { label: "ملغي",          variant: "destructive" },
};

const BANKS = ["الراجحي", "الأهلي السعودي", "الرياض", "البلاد", "الإنماء", "ساب", "الجزيرة", "الفرنسي", "العربي الوطني", "أخرى"];

interface FormState {
  id?: string;
  customer_id: string;
  order_id: string;
  customer_name: string;
  vehicle_desc: string;
  bank_name: string;
  vehicle_price: string;
  down_payment: string;
  loan_amount: string;
  tenor_months: string;
  interest_rate: string;
  status: string;
  notes: string;
}

const emptyForm: FormState = {
  customer_id: "", order_id: "", customer_name: "", vehicle_desc: "",
  bank_name: "الراجحي", vehicle_price: "", down_payment: "", loan_amount: "",
  tenor_months: "60", interest_rate: "0", status: "submitted", notes: "",
};

// قسط شهري تقريبي (نظام تناقص بسيط): (مبلغ + فائدة كلية) / عدد الأشهر
function calcMonthly(loan: number, months: number, ratePct: number): number {
  if (!loan || !months) return 0;
  const totalInterest = loan * (ratePct / 100) * (months / 12);
  return Math.round((loan + totalInterest) / months);
}

export default function Financing() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [customers, setCustomers] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["financing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financing_applications")
        .select("*, contact:contacts(name), order:sales_orders(order_no)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // تحميل العملاء وأوامر البيع للنموذج
  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: cs }, { data: os }] = await Promise.all([
        supabase.from("contacts").select("id, name").eq("is_customer", true).order("name"),
        supabase.from("sales_orders").select("id, order_no, customer_id, total").order("created_at", { ascending: false }).limit(200),
      ]);
      setCustomers(cs ?? []);
      setOrders(os ?? []);
    })();
  }, [open]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const patch: any = { status };
      if (status === "approved") patch.approved_at = new Date().toISOString();
      const { error } = await supabase.from("financing_applications").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم تحديث الحالة"); qc.invalidateQueries({ queryKey: ["financing"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("financing_applications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حذف الطلب"); qc.invalidateQueries({ queryKey: ["financing"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (r: any) => {
    setForm({
      id: r.id, customer_id: r.customer_id ?? "", order_id: r.order_id ?? "",
      customer_name: r.contact?.name ?? r.customer_name ?? "", vehicle_desc: r.vehicle_desc ?? "",
      bank_name: r.bank_name ?? "الراجحي",
      vehicle_price: String(r.vehicle_price ?? ""), down_payment: String(r.down_payment ?? ""),
      loan_amount: String(r.loan_amount ?? ""), tenor_months: String(r.tenor_months ?? "60"),
      interest_rate: String(r.interest_rate ?? "0"), status: r.status ?? "submitted",
      notes: r.notes ?? "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.customer_id && !form.customer_name) { toast.error("اختر العميل"); return; }
    if (!form.loan_amount) { toast.error("أدخل مبلغ التمويل"); return; }
    const loan = Number(form.loan_amount);
    const months = Number(form.tenor_months) || 0;
    const rate = Number(form.interest_rate) || 0;
    const monthly = calcMonthly(loan, months, rate);
    const cust = customers.find(c => c.id === form.customer_id);

    const payload: any = {
      customer_id: form.customer_id || null,
      order_id: form.order_id || null,
      customer_name: cust?.name ?? form.customer_name ?? null,
      vehicle_desc: form.vehicle_desc || null,
      bank_name: form.bank_name || null,
      vehicle_price: form.vehicle_price ? Number(form.vehicle_price) : null,
      down_payment: form.down_payment ? Number(form.down_payment) : null,
      loan_amount: loan,
      tenor_months: months,
      interest_rate: rate,
      monthly_payment: monthly,
      status: form.status,
      notes: form.notes || null,
    };

    if (form.id) {
      const { error } = await supabase.from("financing_applications").update(payload).eq("id", form.id);
      if (error) { toast.error(error.message); return; }
      toast.success("تم تحديث الطلب");
    } else {
      payload.app_no = "FIN-" + Date.now().toString().slice(-8);
      payload.submitted_at = new Date().toISOString();
      payload.created_by = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("financing_applications").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("تم إنشاء طلب التمويل");
    }
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["financing"] });
  };

  const filtered = apps.filter(r => {
    const matchQ = !q || r.app_no?.includes(q) || (r.contact?.name || r.customer_name || "").includes(q) || (r.bank_name || "").includes(q);
    const matchS = statusFilter === "all" || r.status === statusFilter;
    return matchQ && matchS;
  });

  const underReview = filtered.filter(r => r.status === "under_review" || r.status === "submitted").length;
  const approved = filtered.filter(r => r.status === "approved").length;
  const totalFinanced = filtered.reduce((s, r) => s + Number(r.loan_amount || 0), 0);

  const previewMonthly = calcMonthly(Number(form.loan_amount), Number(form.tenor_months), Number(form.interest_rate));

  return (
    <div dir="rtl">
      <PageHeader
        title="التمويل والتقسيط"
        subtitle={`${apps.length} طلب · ${underReview} قيد الدراسة · ${approved} معتمد · إجمالي ${fmtSAR(totalFinanced)}`}
        actions={<Button size="sm" onClick={openNew}><Plus className="h-4 w-4 ml-1" /> طلب تمويل</Button>}
      />

      <div className="flex gap-2 px-4 pb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: رقم، عميل، بنك..." value={q} onChange={e => setQ(e.target.value)} />
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
                <th className="text-right px-3 py-2 font-medium">العميل / أمر البيع</th>
                <th className="text-right px-3 py-2 font-medium">الجهة الممولة</th>
                <th className="text-right px-3 py-2 font-medium">مبلغ التمويل</th>
                <th className="text-right px-3 py-2 font-medium">المدة / القسط</th>
                <th className="text-right px-3 py-2 font-medium">تاريخ التقديم</th>
                <th className="text-right px-3 py-2 font-medium">الحالة</th>
                <th className="text-right px-3 py-2 font-medium w-40">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">
                  <Landmark className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  لا توجد طلبات تمويل. اضغط "طلب تمويل" لإضافة طلب.
                </td></tr>
              ) : filtered.map(r => {
                const custName = r.contact?.name || r.customer_name || "—";
                const sm = STATUS_MAP[r.status] ?? { label: r.status, variant: "secondary" };
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 font-mono text-xs">{r.app_no}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{custName}</div>
                      {r.order?.order_no && <div className="text-xs text-muted-foreground font-mono">{r.order.order_no}</div>}
                      {r.vehicle_desc && <div className="text-xs text-muted-foreground">{r.vehicle_desc}</div>}
                    </td>
                    <td className="px-3 py-2 text-sm">{r.bank_name || "—"}</td>
                    <td className="px-3 py-2 font-medium text-sm">{fmtSAR(Number(r.loan_amount))}</td>
                    <td className="px-3 py-2 text-xs">
                      <div>{r.tenor_months} شهر</div>
                      {r.monthly_payment > 0 && <div className="text-muted-foreground">{fmtSAR(Number(r.monthly_payment))}/شهر</div>}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{fmtDate(r.submitted_at || r.created_at)}</td>
                    <td className="px-3 py-2"><Badge variant={sm.variant}>{sm.label}</Badge></td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5 items-center">
                        {(r.status === "submitted" || r.status === "under_review") && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600"
                              onClick={() => updateStatus.mutate({ id: r.id, status: "approved" })} title="اعتماد">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                              onClick={() => updateStatus.mutate({ id: r.id, status: "rejected" })} title="رفض">
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                            onClick={() => updateStatus.mutate({ id: r.id, status: "disbursed" })}>
                            صرف
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(r)} title="تعديل">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                          onClick={() => { if (confirm(`حذف طلب التمويل ${r.app_no}؟`)) delMut.mutate(r.id); }} title="حذف">
                          <Trash2 className="h-3.5 w-3.5" />
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

      {/* نموذج إضافة/تعديل */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-primary" /> {form.id ? "تعديل طلب تمويل" : "طلب تمويل جديد"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">العميل *</Label>
              <Select value={form.customer_id} onValueChange={v => {
                const c = customers.find(x => x.id === v);
                setForm(f => ({ ...f, customer_id: v, customer_name: c?.name ?? "" }));
              }}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">أمر البيع المرتبط (اختياري)</Label>
              <Select value={form.order_id || "none"} onValueChange={v => {
                if (v === "none") { setForm(f => ({ ...f, order_id: "" })); return; }
                const o = orders.find(x => x.id === v);
                setForm(f => ({
                  ...f, order_id: v,
                  vehicle_price: o?.total ? String(o.total) : f.vehicle_price,
                }));
              }}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="بدون أمر بيع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون أمر بيع</SelectItem>
                  {orders.map(o => <SelectItem key={o.id} value={o.id}>{o.order_no} — {fmtSAR(Number(o.total ?? 0))}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">وصف المركبة</Label>
              <Input className="h-9 mt-1" value={form.vehicle_desc} onChange={e => setForm(f => ({ ...f, vehicle_desc: e.target.value }))} placeholder="مثال: Toyota Land Cruiser 2026" />
            </div>

            <div>
              <Label className="text-xs">الجهة الممولة</Label>
              <Select value={form.bank_name} onValueChange={v => setForm(f => ({ ...f, bank_name: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">الحالة</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">سعر المركبة</Label>
              <Input className="h-9 mt-1" type="number" dir="ltr" value={form.vehicle_price} onChange={e => setForm(f => ({ ...f, vehicle_price: e.target.value }))} />
            </div>
            <div>
              <Label className="text-xs">الدفعة الأولى</Label>
              <Input className="h-9 mt-1" type="number" dir="ltr" value={form.down_payment} onChange={e => setForm(f => ({ ...f, down_payment: e.target.value }))} />
            </div>

            <div>
              <Label className="text-xs">مبلغ التمويل *</Label>
              <Input className="h-9 mt-1" type="number" dir="ltr" value={form.loan_amount} onChange={e => setForm(f => ({ ...f, loan_amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">المدة (شهر)</Label>
                <Input className="h-9 mt-1" type="number" dir="ltr" value={form.tenor_months} onChange={e => setForm(f => ({ ...f, tenor_months: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">الفائدة %</Label>
                <Input className="h-9 mt-1" type="number" dir="ltr" value={form.interest_rate} onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))} />
              </div>
            </div>

            <div className="col-span-2 bg-muted/40 rounded p-2 text-sm flex items-center justify-between">
              <span className="text-muted-foreground text-xs">القسط الشهري التقديري</span>
              <span className="font-bold num">{fmtSAR(previewMonthly)}</span>
            </div>

            <div className="col-span-2">
              <Label className="text-xs">ملاحظات</Label>
              <Textarea className="mt-1" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={save}>{form.id ? "حفظ التعديلات" : "إنشاء الطلب"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
