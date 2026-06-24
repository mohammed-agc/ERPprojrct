import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { purchasingService, type Urgency } from "@/services/erp/purchasing";
import { LinesEditor, emptyLine, type LineDraft } from "@/components/erp/LinesEditor";
import { categoryFromDepartment, type ProductCategory } from "@/services/erp/masterData";
import { supabase } from "@/integrations/supabase/client";
import { parseContactMeta } from "@/lib/contactMeta";
import { useBranches } from "@/lib/company/useBranches";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}


const DEPARTMENTS = ["المبيعات", "قطع الغيار", "الورشة", "الإدارة", "خدمة العملاء"];

type ContactVendor = {
  id: string; contactId: string; code: string; name: string; country: string;
  credit_limit?: number; payment_terms_days?: number;
};

export function PurchaseRequestDialog({ open, onOpenChange, onCreated }: Props) {
  const suppliers = useMemo(() => purchasingService.listSuppliers(), [open]);
  const [contactVendors, setContactVendors] = useState<ContactVendor[]>([]);
  const [supplierId, setSupplierId] = useState<string>("");
  const [requester, setRequester] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const { branches } = useBranches();
  const [branch, setBranch] = useState<string>("");
  const [urgency, setUrgency] = useState<Urgency>("normal");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<LineDraft[]>([emptyLine()]);

  const allowedCategory: ProductCategory | null = categoryFromDepartment(department);

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
        });
      }
      setContactVendors(out);
    })();
    return () => { cancelled = true; };
  }, [open, suppliers]);

  const reset = () => {
    setSupplierId(""); setRequester(""); setDepartment(DEPARTMENTS[0]); setBranch("");
    setUrgency("normal"); setJustification("");
    setItems([emptyLine()]);
  };

  const submit = (asDraft: boolean) => {
    if (!requester.trim()) return toast.error("يرجى إدخال اسم الطالب");
    if (!supplierId) return toast.error("يرجى اختيار المورد (Vendor)");
    if (!justification.trim()) return toast.error("يرجى إدخال مبرر الطلب");
    const valid = items.filter(i => (i.description.trim() || i.model || i.manufacturer) && i.qty > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل");

    // Resolve contact:* to real supplier
    let finalSupplierId = supplierId;
    if (supplierId.startsWith("contact:")) {
      const v = contactVendors.find(x => x.id === supplierId);
      if (v) finalSupplierId = purchasingService.upsertSupplierFromContact({
        contact_id: v.contactId, code: v.code, name: v.name, country: v.country,
        credit_limit: v.credit_limit, payment_terms_days: v.payment_terms_days,
      });
    }

    const pr = purchasingService.createPR({
      requester, department, branch, urgency, justification,
      supplier_id: finalSupplierId,
      items: valid.map(i => ({
        ...i,
        description: i.description.trim() || [i.manufacturer, i.model, i.trim, i.year].filter(Boolean).join(" "),
      })),
      submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظت المسودة ${pr.code}` : `أُرسل الطلب ${pr.code} للاعتماد`);
    onOpenChange(false); reset(); onCreated?.();
  };

  const supplierIds = new Set(suppliers.map(s => s.id));
  const newContactVendors = contactVendors.filter(v => !supplierIds.has(v.id));

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>طلب شراء جديد</DialogTitle>
          <DialogDescription>أنشئ طلب شراء داخلي للاعتماد قبل تحويله إلى أمر شراء.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">الطالب</Label>
            <Input value={requester} onChange={e => setRequester(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">القسم</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الفرع</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{branches.length === 0 ? <SelectItem value="__none__" disabled>لا توجد فروع. أنشئ فرعاً من الإعدادات.</SelectItem> : branches.map(b => <SelectItem key={b.id} value={b.code}>{b.name_ar}{b.city ? ` / ${b.city}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الأولوية</Label>
            <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">منخفضة</SelectItem>
                <SelectItem value="normal">عادية</SelectItem>
                <SelectItem value="high">عالية</SelectItem>
                <SelectItem value="critical">حرجة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 col-span-4">
            <Label className="text-xs">المورد (Vendor) — يُورث تلقائياً إلى أمر الشراء والتخصيص والفاتورة</Label>
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
        </div>

        {allowedCategory && (
          <div className="text-[12px] text-muted-foreground bg-muted/30 rounded px-2 py-1">
            بناءً على القسم، يُسمح بإضافة: <span className="font-semibold text-foreground">
              {allowedCategory === "vehicle" ? "مركبات" : allowedCategory === "part" ? "قطع غيار" : "خدمات"}
            </span> فقط.
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">مبرر الطلب</Label>
          <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} />
        </div>

        <LinesEditor items={items} onChange={setItems} lockedCategory={allowedCategory} />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
