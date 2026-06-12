import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { purchasingService, type PaymentTerm, fmtSAR } from "@/services/erp/purchasing";
import { supabase } from "@/integrations/supabase/client";
import { parseContactMeta } from "@/lib/contactMeta";
import { LinesEditor, emptyLine, type LineDraft } from "@/components/erp/LinesEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];

type ContactVendor = {
  id: string; contactId: string; code: string; name: string; country: string;
  credit_limit?: number; payment_terms_days?: number; alreadyProvisioned: boolean;
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
  const [items, setItems] = useState<LineDraft[]>([emptyLine()]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("customers").select("id,code,name,city,notes")
        .order("name", { ascending: true }).limit(500);
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
            : provisioned ? provisionedId : `contact:${c.id}`,
          contactId: c.id, code: c.code ?? "", name: c.name ?? "—", country: c.city ?? "SA",
          credit_limit: meta.credit_limit, payment_terms_days: meta.payment_terms_days,
          alreadyProvisioned: provisioned,
        });
      }
      setContactVendors(out);
    })();
    return () => { cancelled = true; };
  }, [open, suppliers]);

  useEffect(() => {
    if (!open) return;
    if (!supplierId) setSupplierId(suppliers[0]?.id ?? contactVendors[0]?.id ?? "");
  }, [open, suppliers, contactVendors, supplierId]);

  const selectedContact = contactVendors.find(v => v.id === supplierId);
  const supplier = suppliers.find(s => s.id === supplierId);

  const subtotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_cost || 0), 0);
  const vatTotal = items.reduce((s, i) => s + (i.qty || 0) * (i.unit_cost || 0) * ((i.vat_pct || 0) / 100), 0);
  const grand = subtotal + vatTotal;
  const credit = supplier ? purchasingService.creditSummary(supplier) : null;
  const overCredit = supplier ? supplier.utilized + grand > supplier.credit_limit
    : selectedContact?.credit_limit ? grand > selectedContact.credit_limit : false;

  const reset = () => {
    setSupplierId(suppliers[0]?.id ?? contactVendors[0]?.id ?? "");
    setBranch(BRANCHES[0]); setPaymentTerm("net_30"); setAgreementType("framework");
    setItems([emptyLine()]);
  };

  const submit = (asDraft: boolean) => {
    if (!supplierId) return toast.error("يرجى اختيار المورد");
    const valid = items.filter(i => (i.description.trim() || i.model || i.manufacturer) && i.qty > 0 && i.unit_cost > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة سطر واحد على الأقل بسعر صحيح");

    let finalSupplierId = supplierId;
    if (supplierId.startsWith("contact:") && selectedContact) {
      finalSupplierId = purchasingService.upsertSupplierFromContact({
        contact_id: selectedContact.contactId, code: selectedContact.code,
        name: selectedContact.name, country: selectedContact.country,
        credit_limit: selectedContact.credit_limit, payment_terms_days: selectedContact.payment_terms_days,
      });
    }

    const po = purchasingService.createPO({
      supplier_id: finalSupplierId, branch_destination: branch, expected_delivery: eta,
      payment_term: paymentTerm, agreement_type: agreementType,
      items: valid.map(i => ({
        ...i,
        description: i.description.trim() || [i.manufacturer, i.model, i.trim, i.year].filter(Boolean).join(" "),
      })),
      submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظ الأمر ${po.code} كمسودة` : `تم اعتماد الأمر ${po.code}`);
    onOpenChange(false); reset(); onCreated?.();
  };

  const supplierIds = new Set(suppliers.map(s => s.id));
  const newContactVendors = contactVendors.filter(v => !supplierIds.has(v.id));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>إنشاء أمر شراء مباشر باستخدام الأصناف الرئيسية.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر مورّداً" /></SelectTrigger>
              <SelectContent>
                {suppliers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[11.5px]">الموردون المعتمدون</SelectLabel>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name} — {s.country}</SelectItem>)}
                  </SelectGroup>
                )}
                {newContactVendors.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[11.5px] flex items-center gap-1">
                      <UserPlus className="h-3 w-3" /> جهات اتصال بدور مورّد
                    </SelectLabel>
                    {newContactVendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}{v.code ? ` — ${v.code}` : ""}</SelectItem>)}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
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

        <LinesEditor items={items} onChange={setItems} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)} disabled={overCredit}>اعتماد الأمر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
