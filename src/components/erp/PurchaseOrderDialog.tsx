import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, type ItemKind, type PaymentTerm, fmtSAR,
} from "@/services/erp/purchasing";
import { supabase } from "@/integrations/supabase/client";
import { parseContactMeta } from "@/lib/contactMeta";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

type Draft = { kind: ItemKind; description: string; qty: number; unit_cost: number };
const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];

type ContactVendor = {
  id: string;          // value used in Select: either supplier.id (if linked) or `contact:<uuid>`
  contactId: string;
  code: string;
  name: string;
  country: string;
  credit_limit?: number;
  payment_terms_days?: number;
  alreadyProvisioned: boolean;
};

export function PurchaseOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const suppliers = useMemo(() => purchasingService.listSuppliers(), [open]);
  const [contactVendors, setContactVendors] = useState<ContactVendor[]>([]);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [eta, setEta] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 14); return d.toISOString().slice(0, 10);
  });
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm>("net_30");
  const [agreementType, setAgreementType] = useState<"spot" | "framework" | "consignment">("framework");
  const [items, setItems] = useState<Draft[]>([
    { kind: "vehicle", description: "", qty: 1, unit_cost: 0 },
  ]);

  // Load vendor-role contacts from the unified Contacts module on open
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("customers")
        .select("id,code,name,city,notes")
        .order("name", { ascending: true })
        .limit(500);
      if (cancelled || !data) return;
      const out: ContactVendor[] = [];
      for (const c of data) {
        const { meta } = parseContactMeta(c.notes);
        if (!meta.roles?.includes("vendor")) continue;
        const linkedId = meta.supplier_link_id;
        const provisionedId = `contact_${c.id}`;
        const provisioned = suppliers.some(s => s.id === linkedId || s.id === provisionedId);
        out.push({
          id: linkedId && suppliers.some(s => s.id === linkedId) ? linkedId
            : provisioned ? provisionedId
            : `contact:${c.id}`,
          contactId: c.id,
          code: c.code ?? "",
          name: c.name ?? "—",
          country: c.city ?? "SA",
          credit_limit: meta.credit_limit,
          payment_terms_days: meta.payment_terms_days,
          alreadyProvisioned: provisioned,
        });
      }
      setContactVendors(out);
    })();
    return () => { cancelled = true; };
  }, [open, suppliers]);

  // Default selection: first existing supplier, otherwise first contact-vendor
  useEffect(() => {
    if (!open) return;
    if (!supplierId) {
      setSupplierId(suppliers[0]?.id ?? contactVendors[0]?.id ?? "");
    }
  }, [open, suppliers, contactVendors, supplierId]);

  // Resolve the currently selected entry for credit display
  const selectedContact = contactVendors.find(v => v.id === supplierId);
  const supplier = suppliers.find(s => s.id === supplierId);
  const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const credit = supplier ? purchasingService.creditSummary(supplier) : null;
  const overCredit = supplier ? supplier.utilized + total > supplier.credit_limit
    : selectedContact?.credit_limit ? total > selectedContact.credit_limit : false;

  const update = (idx: number, patch: Partial<Draft>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const reset = () => {
    setSupplierId(suppliers[0]?.id ?? contactVendors[0]?.id ?? "");
    setBranch(BRANCHES[0]); setPaymentTerm("net_30"); setAgreementType("framework");
    setItems([{ kind: "vehicle", description: "", qty: 1, unit_cost: 0 }]);
  };

  const submit = (asDraft: boolean) => {
    if (!supplierId) return toast.error("يرجى اختيار المورد");
    const valid = items.filter(i => i.description.trim() && i.qty > 0 && i.unit_cost > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل بسعر صحيح");

    // If a contact-vendor was selected, provision a supplier record first
    let finalSupplierId = supplierId;
    if (supplierId.startsWith("contact:") && selectedContact) {
      finalSupplierId = purchasingService.upsertSupplierFromContact({
        contact_id: selectedContact.contactId,
        code: selectedContact.code,
        name: selectedContact.name,
        country: selectedContact.country,
        credit_limit: selectedContact.credit_limit,
        payment_terms_days: selectedContact.payment_terms_days,
      });
    }

    const po = purchasingService.createPO({
      supplier_id: finalSupplierId, branch_destination: branch, expected_delivery: eta,
      payment_term: paymentTerm, agreement_type: agreementType,
      items: valid, submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظ الأمر ${po.code} كمسودة` : `تم اعتماد الأمر ${po.code}`);
    onOpenChange(false); reset(); onCreated?.();
  };

  // Hide contact-vendors that are already represented by a linked supplier
  const supplierIds = new Set(suppliers.map(s => s.id));
  const newContactVendors = contactVendors.filter(v => !supplierIds.has(v.id));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>إنشاء أمر شراء مباشر لمورد معتمد أو لجهة اتصال بدور مورّد.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر مورّداً" /></SelectTrigger>
              <SelectContent>
                {suppliers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">الموردون المعتمدون</SelectLabel>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — {s.country}</SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {newContactVendors.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px] flex items-center gap-1">
                      <UserPlus className="h-3 w-3" /> جهات اتصال بدور مورّد
                    </SelectLabel>
                    {newContactVendors.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}{v.code ? ` — ${v.code}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {suppliers.length === 0 && newContactVendors.length === 0 && (
                  <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                    لا يوجد موردون. أضف جهة اتصال بدور "مورّد" من وحدة جهات الاتصال.
                  </div>
                )}
              </SelectContent>
            </Select>
            {selectedContact && !supplier && (
              <div className="text-[11px] text-muted-foreground">
                سيتم إنشاء سجل مورد تلقائياً من جهة الاتصال عند اعتماد الأمر.
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الفرع الوجهة</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الوصول المتوقع</Label>
            <Input type="date" className="h-9" value={eta} onChange={e => setEta(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">شروط الدفع</Label>
            <Select value={paymentTerm} onValueChange={(v) => setPaymentTerm(v as PaymentTerm)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="net_30">30 يوم</SelectItem>
                <SelectItem value="net_60">60 يوم</SelectItem>
                <SelectItem value="net_90">90 يوم</SelectItem>
                <SelectItem value="credit_line">حد ائتماني</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">نوع الاتفاقية</Label>
            <Select value={agreementType} onValueChange={(v) => setAgreementType(v as any)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="framework">إطارية</SelectItem>
                <SelectItem value="spot">فورية</SelectItem>
                <SelectItem value="consignment">أمانة</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {supplier && credit && (
          <div className={`text-xs rounded-md border p-2 ${overCredit ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-muted/30"}`}>
            الحد الائتماني: <span className="num">{fmtSAR(supplier.credit_limit)}</span> ·
            مستخدم: <span className="num">{fmtSAR(supplier.utilized)}</span> ·
            متبقي: <span className="num">{fmtSAR(credit.remaining)}</span>
            {overCredit && <span className="font-semibold"> — هذا الأمر سيتجاوز الحد المتاح</span>}
          </div>
        )}
        {selectedContact && !supplier && selectedContact.credit_limit ? (
          <div className={`text-xs rounded-md border p-2 ${overCredit ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-border bg-muted/30"}`}>
            حد ائتماني مقترح من ملف جهة الاتصال: <span className="num">{fmtSAR(selectedContact.credit_limit)}</span>
            {overCredit && <span className="font-semibold"> — هذا الأمر سيتجاوز الحد</span>}
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label className="text-xs">الأصناف</Label>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setItems([...items, { kind: "vehicle", description: "", qty: 1, unit_cost: 0 }])}>
              <Plus className="h-3.5 w-3.5 ml-1" /> إضافة صنف
            </Button>
          </div>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="erp-table">
              <thead>
                <tr><th className="w-[100px]">النوع</th><th>الوصف</th><th className="w-[80px]">الكمية</th><th className="w-[130px]">سعر الوحدة</th><th className="w-[130px]">الإجمالي</th><th className="w-[40px]"></th></tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx}>
                    <td>
                      <Select value={it.kind} onValueChange={(v) => update(idx, { kind: v as ItemKind })}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vehicle">مركبة</SelectItem>
                          <SelectItem value="part">قطعة غيار</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td><Input className="h-8" value={it.description} onChange={e => update(idx, { description: e.target.value })} placeholder="وصف الصنف" /></td>
                    <td><Input className="h-8 num" type="number" min={1} value={it.qty} onChange={e => update(idx, { qty: Number(e.target.value) })} /></td>
                    <td><Input className="h-8 num" type="number" min={0} value={it.unit_cost} onChange={e => update(idx, { unit_cost: Number(e.target.value) })} /></td>
                    <td className="num text-xs font-semibold">{fmtSAR(it.qty * it.unit_cost)}</td>
                    <td>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-left mt-2 text-sm">الإجمالي: <span className="font-semibold num">{fmtSAR(total)}</span></div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)} disabled={overCredit}>اعتماد الأمر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
