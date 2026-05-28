import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Search, Users, Building2, Landmark, ShieldCheck, Truck, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  parseContactMeta, serializeContactMeta, ContactMeta, ContactType, ContactRole,
  CONTACT_TYPE_LABELS, ROLE_LABELS, ROLE_CLASSES,
} from "@/lib/contactMeta";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  code: string;
  name: string;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  _meta: ContactMeta;
};

const TYPE_ICONS: Record<ContactType, any> = {
  individual: Users,
  company: Building2,
  government: Landmark,
  insurance: ShieldCheck,
  fleet: Truck,
};

export default function Contacts() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", contact_type: "company" as ContactType,
    vat_number: "", cr_number: "", phone: "", email: "", city: "",
    roles: [] as ContactRole[],
  });

  const load = async () => {
    const { data } = await supabase
      .from("customers")
      .select("id,code,name,vat_number,phone,email,city,address,notes,created_at")
      .order("created_at", { ascending: false });
    const mapped: Row[] = (data ?? []).map((r: any) => ({
      ...r,
      _meta: parseContactMeta(r.notes).meta,
    }));
    setRows(mapped);
  };
  useEffect(() => { load(); }, []);

  const cities = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.city) s.add(r.city); r._meta.primary_address?.city && s.add(r._meta.primary_address.city); });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    const m = r._meta;
    if (typeFilter !== "all" && m.contact_type !== typeFilter) return false;
    if (roleFilter !== "all" && !(m.roles ?? []).includes(roleFilter as ContactRole)) return false;
    if (cityFilter !== "all" && r.city !== cityFilter && m.primary_address?.city !== cityFilter) return false;
    if (!q) return true;
    const hay = [
      r.name, r.code, r.vat_number, m.cr_number, r.phone, m.mobile,
      r.email, r.city, m.primary_address?.city, m.national_id,
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }), [rows, q, typeFilter, roleFilter, cityFilter]);

  const counts = useMemo(() => {
    const c = { total: rows.length, customers: 0, vendors: 0, gov: 0, fleet: 0 };
    rows.forEach(r => {
      const m = r._meta;
      const roles = m.roles ?? [];
      if (roles.some(x => x.endsWith("_customer") || x === "fleet_customer")) c.customers += 1;
      if (roles.includes("vendor")) c.vendors += 1;
      if (m.contact_type === "government") c.gov += 1;
      if (m.contact_type === "fleet" || roles.includes("fleet_customer")) c.fleet += 1;
    });
    return c;
  }, [rows]);

  const save = async () => {
    if (!form.code || !form.name) { toast.error("الكود والاسم مطلوبان"); return; }
    const meta: ContactMeta = {
      contact_type: form.contact_type,
      roles: form.roles,
      cr_number: form.cr_number || undefined,
      vat_registered: !!form.vat_number,
    };
    const { error } = await supabase.from("customers").insert({
      code: form.code, name: form.name,
      vat_number: form.vat_number || null,
      phone: form.phone || null, email: form.email || null,
      city: form.city || null,
      notes: serializeContactMeta(meta),
      created_by: (await supabase.auth.getUser()).data.user?.id,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("تم إنشاء جهة الاتصال");
    setOpen(false);
    setForm({ code: "", name: "", contact_type: "company", vat_number: "", cr_number: "", phone: "", email: "", city: "", roles: [] });
    load();
  };

  const toggleFormRole = (r: ContactRole) => {
    setForm(f => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter(x => x !== r) : [...f.roles, r] }));
  };

  return (
    <div>
      <PageHeader
        title="جهات الاتصال"
        subtitle={
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>الإجمالي: <b className="text-foreground">{counts.total}</b></span>
            <span>عملاء: <b className="text-foreground">{counts.customers}</b></span>
            <span>موردون: <b className="text-foreground">{counts.vendors}</b></span>
            <span>جهات حكومية: <b className="text-foreground">{counts.gov}</b></span>
            <span>أساطيل: <b className="text-foreground">{counts.fleet}</b></span>
          </div>
        }
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> جهة اتصال جديدة</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>جهة اتصال جديدة</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>الكود *</Label><Input value={form.code} onChange={e=>setForm({...form, code:e.target.value})} /></div>
                <div><Label>الاسم *</Label><Input value={form.name} onChange={e=>setForm({...form, name:e.target.value})} /></div>
                <div>
                  <Label>نوع الجهة</Label>
                  <Select value={form.contact_type} onValueChange={(v)=>setForm({...form, contact_type:v as ContactType})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONTACT_TYPE_LABELS).map(([k,v])=> <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>المدينة</Label><Input value={form.city} onChange={e=>setForm({...form, city:e.target.value})} /></div>
                <div><Label>الرقم الضريبي</Label><Input value={form.vat_number} onChange={e=>setForm({...form, vat_number:e.target.value})} dir="ltr" /></div>
                <div><Label>السجل التجاري</Label><Input value={form.cr_number} onChange={e=>setForm({...form, cr_number:e.target.value})} dir="ltr" /></div>
                <div><Label>الجوال</Label><Input value={form.phone} onChange={e=>setForm({...form, phone:e.target.value})} dir="ltr" /></div>
                <div><Label>البريد</Label><Input value={form.email} onChange={e=>setForm({...form, email:e.target.value})} dir="ltr" /></div>
                <div className="col-span-2">
                  <Label className="mb-1.5 block">الأدوار</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(ROLE_LABELS) as ContactRole[]).map(r => (
                      <button key={r} type="button" onClick={()=>toggleFormRole(r)}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded border transition-colors",
                          form.roles.includes(r) ? ROLE_CLASSES[r] : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                        )}>
                        {ROLE_LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter><Button onClick={save}>حفظ</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {/* Sticky filters */}
      <div className="sticky top-[60px] z-10 bg-background/95 backdrop-blur border-b border-border -mx-6 px-6 py-2 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pr-8 h-8 text-sm" placeholder="بحث: اسم، كود، ض.ر، س.ت، جوال، هوية..." value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأنواع</SelectItem>
              {Object.entries(CONTACT_TYPE_LABELS).map(([k,v])=> <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الأدوار</SelectItem>
              {Object.entries(ROLE_LABELS).map(([k,v])=> <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المدن</SelectItem>
              {cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="text-xs text-muted-foreground mr-auto">عرض {filtered.length} من {rows.length}</div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table">
          <thead>
            <tr>
              <th className="w-24">الكود</th>
              <th className="w-8"></th>
              <th>الاسم</th>
              <th>الأدوار</th>
              <th className="w-32">الرقم الضريبي</th>
              <th className="w-32">س. تجاري</th>
              <th className="w-32">الجوال</th>
              <th className="w-28">المدينة</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="text-center text-muted-foreground py-8">لا توجد بيانات</td></tr>
            )}
            {filtered.map(r => {
              const m = r._meta;
              const Icon = TYPE_ICONS[m.contact_type ?? "company"];
              return (
                <tr key={r.id}>
                  <td className="font-mono text-xs">{r.code}</td>
                  <td><Icon className="h-3.5 w-3.5 text-muted-foreground" /></td>
                  <td>
                    <Link to={`/contacts/${r.id}`} className="font-medium hover:text-primary">{r.name}</Link>
                    {m.contact_type && (
                      <div className="text-[10px] text-muted-foreground">{CONTACT_TYPE_LABELS[m.contact_type]}</div>
                    )}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(m.roles ?? []).slice(0, 3).map(role => (
                        <span key={role} className={cn("px-1.5 py-0.5 text-[10px] rounded border", ROLE_CLASSES[role])}>
                          {ROLE_LABELS[role]}
                        </span>
                      ))}
                      {(m.roles ?? []).length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{(m.roles ?? []).length - 3}</span>
                      )}
                      {!(m.roles ?? []).length && <span className="text-[10px] text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="num text-xs" dir="ltr">{r.vat_number || "—"}</td>
                  <td className="num text-xs" dir="ltr">{m.cr_number || "—"}</td>
                  <td className="num text-xs" dir="ltr">{r.phone || m.mobile || "—"}</td>
                  <td className="text-xs">{r.city || m.primary_address?.city || "—"}</td>
                  <td>
                    <Link to={`/contacts/${r.id}`} className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
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
