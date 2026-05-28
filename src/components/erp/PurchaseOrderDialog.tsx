import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, type ItemKind, type PaymentTerm, fmtSAR,
} from "@/services/erp/purchasing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: () => void;
}

type Draft = { kind: ItemKind; description: string; qty: number; unit_cost: number };
const BRANCHES = ["الرياض الرئيسي", "جدة", "الدمام", "مكة", "المدينة"];

export function PurchaseOrderDialog({ open, onOpenChange, onCreated }: Props) {
  const suppliers = useMemo(() => purchasingService.listSuppliers(), [open]);
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

  const supplier = suppliers.find(s => s.id === supplierId);
  const total = items.reduce((s, i) => s + i.qty * i.unit_cost, 0);
  const credit = supplier ? purchasingService.creditSummary(supplier) : null;
  const overCredit = supplier ? supplier.utilized + total > supplier.credit_limit : false;

  const update = (idx: number, patch: Partial<Draft>) =>
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const reset = () => {
    setSupplierId(suppliers[0]?.id ?? ""); setBranch(BRANCHES[0]);
    setPaymentTerm("net_30"); setAgreementType("framework");
    setItems([{ kind: "vehicle", description: "", qty: 1, unit_cost: 0 }]);
  };

  const submit = (asDraft: boolean) => {
    if (!supplierId) return toast.error("يرجى اختيار المورد");
    const valid = items.filter(i => i.description.trim() && i.qty > 0 && i.unit_cost > 0);
    if (valid.length === 0) return toast.error("يرجى إضافة صنف واحد على الأقل بسعر صحيح");

    const po = purchasingService.createPO({
      supplier_id: supplierId, branch_destination: branch, expected_delivery: eta,
      payment_term: paymentTerm, agreement_type: agreementType,
      items: valid, submit: !asDraft,
    });
    toast.success(asDraft ? `حُفظ الأمر ${po.code} كمسودة` : `تم اعتماد الأمر ${po.code}`);
    onOpenChange(false); reset(); onCreated?.();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أمر شراء جديد</DialogTitle>
          <DialogDescription>إنشاء أمر شراء مباشر لمورد معتمد.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs">المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {s.country}</SelectItem>
                ))}
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
