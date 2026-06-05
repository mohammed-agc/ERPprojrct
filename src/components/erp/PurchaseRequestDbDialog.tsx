import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { createPurchaseRequest, listActiveSuppliers, type PRLineInput } from "@/services/erp/purchasingDb";
import { LinesEditor, emptyLine, type LineDraft } from "@/components/erp/LinesEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];
const DEPARTMENTS: { code: string; label: string }[] = [
  { code: "vehicles", label: "المركبات" },
  { code: "spare_parts", label: "قطع الغيار" },
  { code: "workshop", label: "الورشة" },
  { code: "sales", label: "المبيعات" },
  { code: "accounting", label: "المحاسبة" },
  { code: "inventory", label: "المخزون" },
  { code: "purchasing", label: "المشتريات" },
  { code: "crm", label: "خدمة العملاء" },
];
const URGENCY: { value: string; label: string }[] = [
  { value: "low", label: "منخفضة" },
  { value: "normal", label: "عادية" },
  { value: "high", label: "عالية" },
  { value: "critical", label: "حرجة" },
];

export function PurchaseRequestDbDialog({ open, onOpenChange, onCreated }: Props) {
  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers-selector"],
    queryFn: listActiveSuppliers,
    enabled: open,
  });

  const [requester, setRequester] = useState("");
  const [department, setDepartment] = useState("vehicles");
  const [branch, setBranch] = useState(BRANCHES[0]);
  const [urgency, setUrgency] = useState("normal");
  const [supplierId, setSupplierId] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setRequester(""); setDepartment("vehicles"); setBranch(BRANCHES[0]);
    setUrgency("normal"); setSupplierId(""); setJustification("");
    setLines([emptyLine()]);
  };

  const toPRLine = (l: LineDraft): PRLineInput => ({
    brand: l.manufacturer || l.brand || "",
    manufacturer: l.manufacturer || l.brand || null,
    model: l.model || "",
    trim: l.trim || null,
    year: l.year ?? null,
    color: l.color_name || null,
    quantity: l.qty || 0,
    estimated_unit_cost: l.unit_cost || 0,
    notes: null,
  });

  const submit = async (asDraft: boolean) => {
    if (!requester.trim()) return toast.error("يرجى إدخال اسم الطالب");
    if (!justification.trim()) return toast.error("يرجى إدخال مبرر الطلب");
    const valid = lines
      .filter(l => (l.manufacturer || l.brand) && l.model && (l.qty || 0) > 0)
      .map(toPRLine);
    if (!valid.length) return toast.error("أضِف صنفاً واحداً على الأقل (الصانع + الموديل + الكمية)");

    setSaving(true);
    try {
      const pr = await createPurchaseRequest({
        notes: justification.trim(),
        department_code: department,
        requester_name: requester.trim(),
        branch,
        urgency,
        suggested_supplier_id: supplierId || null,
        lines: valid,
        submit: !asDraft,
      });
      toast.success(asDraft ? `حُفظت المسودة ${pr.pr_no}` : `أُرسل الطلب ${pr.pr_no} للاعتماد`);
      onOpenChange(false); reset(); onCreated?.();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر إنشاء الطلب");
    } finally {
      setSaving(false);
    }
  };

  const realSuppliers = suppliers.filter(s => s.source === "supplier");
  const contactVendors = suppliers.filter(s => s.source === "contact");

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
              <SelectContent>{DEPARTMENTS.map(d => <SelectItem key={d.code} value={d.code}>{d.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الفرع</Label>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">الأولوية</Label>
            <Select value={urgency} onValueChange={setUrgency}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{URGENCY.map(u => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 col-span-4">
            <Label className="text-xs">المورد المقترح (يُورث إلى أمر الشراء عند التحويل)</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختياري — اختر مورّداً" /></SelectTrigger>
              <SelectContent>
                {realSuppliers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">الموردون المعتمدون</SelectLabel>
                    {realSuppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` — ${s.code}` : ""}</SelectItem>)}
                  </SelectGroup>
                )}
                {contactVendors.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-[10px]">جهات اتصال بدور مورّد</SelectLabel>
                    {contactVendors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.code ? ` — ${s.code}` : ""}</SelectItem>)}
                  </SelectGroup>
                )}
                {suppliers.length === 0 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground">لا يوجد موردون نشطون</div>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">مبرر الطلب</Label>
          <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} />
        </div>

        <LinesEditor items={lines} onChange={setLines} lockedCategory="vehicle" showTotals />

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button variant="outline" onClick={() => submit(true)} disabled={saving}>حفظ كمسودة</Button>
          <Button onClick={() => submit(false)} disabled={saving}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
