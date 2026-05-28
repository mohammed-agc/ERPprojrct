import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowRight, Save, Copy, MapPin, Plus, Trash2, ShieldCheck, Wallet,
  Building2, Users, Landmark, Truck, Phone, Mail, Globe, FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  ContactMeta, ContactRole, ContactType, AddressEntry, RelatedContact,
  CONTACT_TYPE_LABELS, ROLE_LABELS, ROLE_CLASSES, RISK_LABELS, RISK_CLASSES,
  ADDRESS_KIND_LABELS, parseContactMeta, serializeContactMeta,
  formatSaudiAddress, hasRole, toggleRole, complianceScore,
} from "@/lib/contactMeta";
import { cn } from "@/lib/utils";

const TYPE_ICONS: Record<ContactType, any> = {
  individual: Users, company: Building2, government: Landmark,
  insurance: ShieldCheck, fleet: Truck,
};

export default function ContactDetail() {
  const { id } = useParams();
  const [row, setRow] = useState<any>(null);
  const [meta, setMeta] = useState<ContactMeta>({});
  const [freeText, setFreeText] = useState("");
  const [tab, setTab] = useState("overview");
  const [saving, setSaving] = useState(false);

  // related ERP data
  const [orders, setOrders] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  const load = async () => {
    if (!id) return;
    const { data: c } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
    if (!c) return;
    const { meta: m, freeText: ft } = parseContactMeta(c.notes);
    setRow(c); setMeta(m); setFreeText(ft);

    const [{ data: so }, { data: inv }] = await Promise.all([
      supabase.from("sales_orders").select("id,order_no,order_date,status,total").eq("customer_id", id).order("order_date", { ascending: false }).limit(50),
      supabase.from("invoices").select("id,invoice_no,invoice_date,status,total").eq("customer_id", id).order("invoice_date", { ascending: false }).limit(50),
    ]);
    setOrders(so ?? []); setInvoices(inv ?? []);
  };
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!row) return;
    setSaving(true);
    const { error } = await supabase.from("customers").update({
      name: row.name, vat_number: row.vat_number, phone: row.phone, email: row.email,
      city: row.city, address: row.address,
      notes: serializeContactMeta(meta, freeText),
    }).eq("id", row.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("تم الحفظ");
    load();
  };

  const score = useMemo(() => complianceScore(meta), [meta]);
  const TypeIcon = TYPE_ICONS[meta.contact_type ?? "company"];

  const timeline = useMemo(() => {
    const items: { date: string; kind: string; title: string; ref?: string; href?: string; amount?: number }[] = [];
    orders.forEach(o => items.push({
      date: o.order_date, kind: "أمر بيع", title: `أمر بيع #${o.order_no} — ${o.status}`,
      ref: o.order_no, href: `/sales-orders/${o.id}`, amount: Number(o.total),
    }));
    invoices.forEach(i => items.push({
      date: i.invoice_date, kind: "فاتورة", title: `فاتورة #${i.invoice_no} — ${i.status}`,
      ref: i.invoice_no, amount: Number(i.total),
    }));
    return items.sort((a,b) => b.date.localeCompare(a.date));
  }, [orders, invoices]);

  if (!row) {
    return <div className="p-6 text-center text-muted-foreground text-sm">جارٍ التحميل...</div>;
  }

  const copyAddress = () => {
    const txt = formatSaudiAddress(meta.primary_address);
    if (!txt) return;
    navigator.clipboard.writeText(txt);
    toast.success("تم نسخ العنوان");
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-primary" />
            {row.name}
          </span> as any
        }
        subtitle={
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">{row.code}</span>
            <span>·</span>
            <span>{CONTACT_TYPE_LABELS[meta.contact_type ?? "company"]}</span>
            {(meta.roles ?? []).map(r => (
              <span key={r} className={cn("px-1.5 py-0.5 rounded border text-[10px]", ROLE_CLASSES[r])}>
                {ROLE_LABELS[r]}
              </span>
            ))}
            {meta.risk_class && (
              <span className={cn("px-1.5 py-0.5 rounded border text-[10px]", RISK_CLASSES[meta.risk_class as keyof typeof RISK_CLASSES])}>
                مخاطر: {RISK_LABELS[meta.risk_class as keyof typeof RISK_LABELS]}
              </span>
            )}
            <span className="text-muted-foreground">· اكتمال الملف: <b className={cn(score >= 80 ? "text-success" : score >= 50 ? "text-warning-foreground" : "text-destructive")}>{score}%</b></span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/contacts"><ArrowRight className="h-4 w-4 ml-1" /> رجوع</Link>
            </Button>
            <Button size="sm" onClick={save} disabled={saving}>
              <Save className="h-4 w-4 ml-1" /> {saving ? "..." : "حفظ"}
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-9">
          <TabsTrigger value="overview" className="text-xs">نظرة عامة</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs">الأدوار والتصنيف</TabsTrigger>
          <TabsTrigger value="address" className="text-xs">العنوان الوطني</TabsTrigger>
          <TabsTrigger value="addresses" className="text-xs">العناوين المتعددة</TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs">الامتثال والوثائق</TabsTrigger>
          <TabsTrigger value="financial" className="text-xs">المالي والائتمان</TabsTrigger>
          <TabsTrigger value="related" className="text-xs">جهات مرتبطة</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">السجل ERP</TabsTrigger>
        </TabsList>

        {/* ---------- Overview ---------- */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> الاتصال</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 space-y-2 text-xs">
                <Field label="الجوال" value={row.phone} onChange={v=>setRow({...row, phone:v})} ltr />
                <Field label="واتساب" value={meta.whatsapp} onChange={v=>setMeta({...meta, whatsapp:v})} ltr />
                <Field label="البريد" value={row.email} onChange={v=>setRow({...row, email:v})} ltr icon={Mail} />
                <Field label="الموقع" value={meta.website} onChange={v=>setMeta({...meta, website:v})} ltr icon={Globe} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> الأرصدة (محاسبياً)</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 text-xs space-y-1.5">
                <KV k="ذمم مدينة" v={fmtMoney(totalInv(invoices))} />
                <KV k="حد الائتمان" v={fmtMoney(meta.credit_limit)} />
                <KV k="مهلة السداد" v={meta.payment_terms_days ? `${meta.payment_terms_days} يوم` : "—"} />
                <KV k="الرصيد الافتتاحي" v={fmtMoney(meta.opening_balance)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> الامتثال</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 text-xs space-y-1.5">
                <KV k="الرقم الضريبي" v={row.vat_number} mono />
                <KV k="السجل التجاري" v={meta.cr_number} mono />
                <KV k="رقم الهوية" v={meta.national_id} mono />
                <KV k="مسجل ض.ق.م" v={meta.vat_registered ? "نعم" : "لا"} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">ملاحظات تشغيلية</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1">
              <Textarea value={freeText} onChange={e=>setFreeText(e.target.value)} rows={3} className="text-xs" placeholder="ملاحظات تشغيلية لجهة الاتصال..." />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Roles ---------- */}
        <TabsContent value="roles">
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">نوع الجهة والأدوار</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1 space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label className="text-xs">نوع الجهة</Label>
                  <Select value={meta.contact_type ?? "company"} onValueChange={(v)=>setMeta({...meta, contact_type:v as ContactType})}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CONTACT_TYPE_LABELS).map(([k,v])=> <SelectItem key={k} value={k}>{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs mb-1.5 block">الأدوار التشغيلية (يمكن اختيار أكثر من دور)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(ROLE_LABELS) as ContactRole[]).map(r => {
                    const on = hasRole(meta, r);
                    return (
                      <button key={r} type="button"
                        onClick={()=>setMeta({...meta, roles: toggleRole(meta, r)})}
                        className={cn(
                          "px-2.5 py-1 text-xs rounded border transition-colors",
                          on ? ROLE_CLASSES[r] : "bg-muted/40 text-muted-foreground border-border hover:bg-muted"
                        )}>
                        {ROLE_LABELS[r]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  جهة واحدة قد تكون عميلًا ومورّدًا في نفس الوقت — الأدوار توجّه السلوك التشغيلي في باقي وحدات النظام.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Primary Saudi address ---------- */}
        <TabsContent value="address">
          <Card>
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
              <CardTitle className="text-xs flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> العنوان الوطني السعودي</CardTitle>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={copyAddress}>
                <Copy className="h-3.5 w-3.5 ml-1" /> نسخ العنوان
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <Field label="المدينة" value={meta.primary_address?.city} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, city:v}})} />
                <Field label="الحي" value={meta.primary_address?.district} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, district:v}})} />
                <Field label="الشارع" value={meta.primary_address?.street} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, street:v}})} />
                <Field label="رقم المبنى" value={meta.primary_address?.building_number} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, building_number:v}})} ltr placeholder="4 أرقام" />
                <Field label="الرقم الإضافي" value={meta.primary_address?.additional_number} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, additional_number:v}})} ltr placeholder="4 أرقام" />
                <Field label="الرمز البريدي" value={meta.primary_address?.postal_code} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, postal_code:v}})} ltr placeholder="5 أرقام" />
                <Field label="رقم الوحدة" value={meta.primary_address?.unit_number} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, unit_number:v}})} ltr />
                <Field label="العنوان المختصر" value={meta.primary_address?.short_address} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, short_address:v?.toUpperCase()}})} ltr placeholder="مثال: RRRD2929" />
                <Field label="ص.ب" value={meta.primary_address?.po_box} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, po_box:v}})} ltr />
                <Field label="الدولة" value={meta.primary_address?.country ?? "SA"} onChange={v=>setMeta({...meta, primary_address:{...meta.primary_address, country:v}})} ltr />
              </div>
              <div className="bg-muted/40 rounded border border-dashed border-border p-3 text-xs">
                <div className="text-[10px] text-muted-foreground mb-1">معاينة العنوان المنسق</div>
                <div className="font-medium">{formatSaudiAddress(meta.primary_address) || "—"}</div>
              </div>
              <div className="bg-muted/30 rounded border border-border h-32 flex items-center justify-center text-xs text-muted-foreground">
                <MapPin className="h-4 w-4 ml-1" /> موضع الخريطة (placeholder)
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Multiple addresses ---------- */}
        <TabsContent value="addresses">
          <Card>
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
              <CardTitle className="text-xs">دفتر العناوين</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>{
                const next: AddressEntry = { id: crypto.randomUUID(), label: "عنوان جديد", kind: "branch", address: { country: "SA" } };
                setMeta({...meta, addresses: [...(meta.addresses ?? []), next]});
              }}>
                <Plus className="h-3.5 w-3.5 ml-1" /> عنوان
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-1 space-y-2">
              {(meta.addresses ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6">لا توجد عناوين إضافية</div>
              )}
              {(meta.addresses ?? []).map((a, idx) => (
                <div key={a.id} className="border border-border rounded p-2 grid grid-cols-12 gap-2 items-start text-xs">
                  <div className="col-span-3">
                    <Label className="text-[10px]">التسمية</Label>
                    <Input value={a.label} className="h-7 text-xs" onChange={e=>{
                      const arr = [...(meta.addresses ?? [])]; arr[idx] = {...a, label: e.target.value};
                      setMeta({...meta, addresses: arr});
                    }} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px]">النوع</Label>
                    <Select value={a.kind} onValueChange={(v)=>{
                      const arr = [...(meta.addresses ?? [])]; arr[idx] = {...a, kind: v as any};
                      setMeta({...meta, addresses: arr});
                    }}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ADDRESS_KIND_LABELS).map(([k,v])=> <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-6 text-xs text-muted-foreground pt-4">{formatSaudiAddress(a.address) || "— عنوان غير مكتمل —"}</div>
                  <div className="col-span-1 flex justify-end pt-4">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>{
                      const arr = (meta.addresses ?? []).filter(x => x.id !== a.id);
                      setMeta({...meta, addresses: arr});
                    }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="col-span-12 grid grid-cols-5 gap-2 mt-1">
                    {(["city","district","street","building_number","additional_number","postal_code","unit_number","short_address","po_box"] as const).map(field => (
                      <div key={field}>
                        <Label className="text-[10px]">{ADDR_FIELD_LABELS[field]}</Label>
                        <Input className="h-7 text-xs" value={(a.address as any)[field] ?? ""} dir={field === "city" || field === "district" || field === "street" ? "rtl" : "ltr"}
                          onChange={e=>{
                            const arr = [...(meta.addresses ?? [])]; arr[idx] = {...a, address: {...a.address, [field]: e.target.value}};
                            setMeta({...meta, addresses: arr});
                          }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Compliance ---------- */}
        <TabsContent value="compliance">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">الهوية / الوثائق</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <Field label="رقم الهوية الوطنية" value={meta.national_id} onChange={v=>setMeta({...meta, national_id:v})} ltr />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="تاريخ الإصدار" value={meta.id_issue_date} onChange={v=>setMeta({...meta, id_issue_date:v})} type="date" />
                  <Field label="تاريخ الانتهاء" value={meta.id_expiry_date} onChange={v=>setMeta({...meta, id_expiry_date:v})} type="date" />
                </div>
                <Field label="السجل التجاري" value={meta.cr_number} onChange={v=>setMeta({...meta, cr_number:v})} ltr />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="إصدار السجل" value={meta.cr_issue_date} onChange={v=>setMeta({...meta, cr_issue_date:v})} type="date" />
                  <Field label="انتهاء السجل" value={meta.cr_expiry_date} onChange={v=>setMeta({...meta, cr_expiry_date:v})} type="date" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">الضريبة</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <Field label="الرقم الضريبي" value={row.vat_number} onChange={v=>setRow({...row, vat_number:v})} ltr />
                <div className="flex items-center justify-between border border-border rounded px-3 py-2">
                  <Label className="text-xs">مسجل في ضريبة القيمة المضافة</Label>
                  <Switch checked={!!meta.vat_registered} onCheckedChange={v=>setMeta({...meta, vat_registered:v})} />
                </div>
                <div className="flex items-center justify-between border border-border rounded px-3 py-2">
                  <Label className="text-xs">معفى من الضريبة</Label>
                  <Switch checked={!!meta.tax_exempt} onCheckedChange={v=>setMeta({...meta, tax_exempt:v})} />
                </div>
                <p className="text-[10px] text-muted-foreground">يستخدم في فواتير ZATCA لتحديد طبيعة العميل ونوع الفاتورة (B2B / B2C).</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- Financial ---------- */}
        <TabsContent value="financial">
          <div className="grid grid-cols-2 gap-3">
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">شروط الدفع والائتمان</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="مهلة السداد (يوم)" value={meta.payment_terms_days?.toString()} onChange={v=>setMeta({...meta, payment_terms_days: v ? Number(v) : undefined})} ltr type="number" />
                  <Field label="حد الائتمان" value={meta.credit_limit?.toString()} onChange={v=>setMeta({...meta, credit_limit: v ? Number(v) : undefined})} ltr type="number" />
                </div>
                <div>
                  <Label className="text-xs">طريقة الدفع المفضلة</Label>
                  <Select value={meta.preferred_payment ?? ""} onValueChange={(v)=>setMeta({...meta, preferred_payment: v as any})}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدًا</SelectItem>
                      <SelectItem value="bank">تحويل بنكي</SelectItem>
                      <SelectItem value="card">بطاقة</SelectItem>
                      <SelectItem value="cheque">شيك</SelectItem>
                      <SelectItem value="credit">آجل</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="الرصيد الافتتاحي" value={meta.opening_balance?.toString()} onChange={v=>setMeta({...meta, opening_balance: v ? Number(v) : undefined})} ltr type="number" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">تصنيف المخاطر</CardTitle></CardHeader>
              <CardContent className="p-3 pt-1 space-y-2">
                <div>
                  <Label className="text-xs">درجة المخاطر</Label>
                  <Select value={meta.risk_class ?? ""} onValueChange={(v)=>setMeta({...meta, risk_class: v as any})}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">منخفض</SelectItem>
                      <SelectItem value="medium">متوسط</SelectItem>
                      <SelectItem value="high">مرتفع</SelectItem>
                      <SelectItem value="blocked">محظور</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="bg-muted/40 rounded p-2 text-xs space-y-1">
                  <KV k="إجمالي الفواتير" v={fmtMoney(totalInv(invoices))} />
                  <KV k="عدد الفواتير" v={String(invoices.length)} />
                  <KV k="عدد أوامر البيع" v={String(orders.length)} />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------- Related contacts ---------- */}
        <TabsContent value="related">
          <Card>
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
              <CardTitle className="text-xs">جهات اتصال مرتبطة</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={()=>{
                const next: RelatedContact = { id: crypto.randomUUID(), name: "", role: "" };
                setMeta({...meta, related: [...(meta.related ?? []), next]});
              }}>
                <Plus className="h-3.5 w-3.5 ml-1" /> شخص
              </Button>
            </CardHeader>
            <CardContent className="p-3 pt-1">
              {(meta.related ?? []).length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6">لا توجد جهات مرتبطة</div>
              )}
              <div className="space-y-2">
                {(meta.related ?? []).map((p, idx) => (
                  <div key={p.id} className="grid grid-cols-12 gap-2 items-end border border-border rounded p-2">
                    <div className="col-span-3"><Label className="text-[10px]">الاسم</Label>
                      <Input className="h-7 text-xs" value={p.name} onChange={e=>{
                        const arr=[...(meta.related ?? [])]; arr[idx]={...p, name:e.target.value}; setMeta({...meta, related:arr});
                      }} />
                    </div>
                    <div className="col-span-2"><Label className="text-[10px]">الدور</Label>
                      <Input className="h-7 text-xs" value={p.role} placeholder="محاسب / سائق ..." onChange={e=>{
                        const arr=[...(meta.related ?? [])]; arr[idx]={...p, role:e.target.value}; setMeta({...meta, related:arr});
                      }} />
                    </div>
                    <div className="col-span-2"><Label className="text-[10px]">الجوال</Label>
                      <Input className="h-7 text-xs" dir="ltr" value={p.phone ?? ""} onChange={e=>{
                        const arr=[...(meta.related ?? [])]; arr[idx]={...p, phone:e.target.value}; setMeta({...meta, related:arr});
                      }} />
                    </div>
                    <div className="col-span-2"><Label className="text-[10px]">البريد</Label>
                      <Input className="h-7 text-xs" dir="ltr" value={p.email ?? ""} onChange={e=>{
                        const arr=[...(meta.related ?? [])]; arr[idx]={...p, email:e.target.value}; setMeta({...meta, related:arr});
                      }} />
                    </div>
                    <div className="col-span-2"><Label className="text-[10px]">ملاحظة</Label>
                      <Input className="h-7 text-xs" value={p.note ?? ""} onChange={e=>{
                        const arr=[...(meta.related ?? [])]; arr[idx]={...p, note:e.target.value}; setMeta({...meta, related:arr});
                      }} />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={()=>{
                        setMeta({...meta, related: (meta.related ?? []).filter(x => x.id !== p.id)});
                      }}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Timeline ---------- */}
        <TabsContent value="timeline">
          <Card>
            <CardHeader className="p-3 pb-1"><CardTitle className="text-xs">السجل الموحّد عبر النظام</CardTitle></CardHeader>
            <CardContent className="p-3 pt-1">
              {timeline.length === 0 && <div className="text-xs text-muted-foreground text-center py-6">لا يوجد نشاط بعد</div>}
              <div className="divide-y divide-border">
                {timeline.map((t, i) => (
                  <div key={i} className="py-2 flex items-center gap-3 text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-[10px] text-muted-foreground w-24">{t.date}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground border border-border">{t.kind}</span>
                    {t.href ? <Link to={t.href} className="hover:text-primary flex-1">{t.title}</Link> : <span className="flex-1">{t.title}</span>}
                    {t.amount !== undefined && <span className="num font-mono">{fmtMoney(t.amount)}</span>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

const ADDR_FIELD_LABELS: Record<string, string> = {
  city: "المدينة", district: "الحي", street: "الشارع",
  building_number: "رقم المبنى", additional_number: "الرقم الإضافي",
  postal_code: "الرمز البريدي", unit_number: "رقم الوحدة",
  short_address: "العنوان المختصر", po_box: "ص.ب",
};

function Field({ label, value, onChange, ltr, type, placeholder, icon: Icon }: {
  label: string; value: any; onChange: (v: string) => void;
  ltr?: boolean; type?: string; placeholder?: string; icon?: any;
}) {
  return (
    <div>
      <Label className="text-[10px] flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />} {label}</Label>
      <Input value={value ?? ""} onChange={e=>onChange(e.target.value)} dir={ltr ? "ltr" : "rtl"}
        type={type} placeholder={placeholder} className="h-8 text-xs" />
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: any; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className={cn(mono && "font-mono", "text-foreground")} dir={mono ? "ltr" : undefined}>{v || "—"}</span>
    </div>
  );
}

function fmtMoney(n?: number | null) {
  if (n === null || n === undefined || n === 0) return "—";
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 2 }).format(n);
}

function totalInv(arr: any[]) {
  return arr.reduce((s, r) => s + Number(r.total ?? 0), 0);
}
