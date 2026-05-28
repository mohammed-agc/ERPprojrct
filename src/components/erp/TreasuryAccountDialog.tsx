import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { treasuryService, type TreasuryAccount, type TreasuryAccountType, type Currency, accountTypeLabel } from "@/services/erp/treasury";

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void;
  edit?: TreasuryAccount | null; onSaved?: () => void;
}

export function TreasuryAccountDialog({ open, onOpenChange, edit, onSaved }: Props) {
  const [form, setForm] = useState<Partial<TreasuryAccount>>({});

  useEffect(() => {
    if (open) {
      setForm(edit ?? {
        code: "", name_ar: "", type: "cash_main" as TreasuryAccountType,
        currency: "SAR" as Currency, opening_balance: 0, active: true,
      });
    }
  }, [open, edit]);

  const submit = async () => {
    if (!form.code || !form.name_ar) { toast.error("الحقول المطلوبة غير مكتملة"); return; }
    await treasuryService.saveAccount(form as any);
    toast.success(edit ? "تم تحديث الحساب" : "تم إنشاء الحساب");
    onOpenChange(false); onSaved?.();
  };

  const u = (k: keyof TreasuryAccount, v: any) => setForm(p => ({ ...p, [k]: v }));
  const isBank = form.type === "bank";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{edit ? "تعديل حساب خزينة" : "حساب خزينة جديد"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الكود *</Label>
            <Input className="h-8" value={form.code ?? ""} onChange={e => u("code", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">النوع *</Label>
            <Select value={form.type} onValueChange={v => u("type", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(accountTypeLabel).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 col-span-2">
            <Label className="text-xs">الاسم *</Label>
            <Input className="h-8" value={form.name_ar ?? ""} onChange={e => u("name_ar", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">العملة</Label>
            <Select value={form.currency} onValueChange={v => u("currency", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي</SelectItem>
                <SelectItem value="USD">دولار أمريكي</SelectItem>
                <SelectItem value="EUR">يورو</SelectItem>
                <SelectItem value="AED">درهم إماراتي</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الفرع</Label>
            <Input className="h-8" value={form.branch ?? ""} onChange={e => u("branch", e.target.value)} />
          </div>
          {isBank && (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">اسم البنك</Label>
                <Input className="h-8" value={form.bank_name ?? ""} onChange={e => u("bank_name", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">IBAN</Label>
                <Input className="h-8" dir="ltr" value={form.iban ?? ""} onChange={e => u("iban", e.target.value)} />
              </div>
            </>
          )}
          <div className="flex flex-col gap-1">
            <Label className="text-xs">المسؤول</Label>
            <Input className="h-8" value={form.responsible ?? ""} onChange={e => u("responsible", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">الرصيد الافتتاحي</Label>
            <Input type="number" step="0.01" className="h-8" value={form.opening_balance ?? 0} onChange={e => u("opening_balance", Number(e.target.value))} />
          </div>
          <div className="flex items-center gap-2 col-span-2">
            <Switch checked={form.active ?? true} onCheckedChange={v => u("active", v)} />
            <Label className="text-xs">نشط</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
