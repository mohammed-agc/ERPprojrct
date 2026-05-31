import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  purchasingService, fmtSAR, fmtDate, SETTLEMENT_LABEL,
  type Supplier, type SettlementPolicy,
} from "@/services/erp/purchasing";
import { AmountInput } from "@/components/erp/AmountInput";

export function SupplierPolicyDialog({
  supplier, open, onOpenChange, onSaved,
}: {
  supplier: Supplier | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState<SettlementPolicy>("net_30");
  const [customDays, setCustomDays] = useState<number>(30);
  const [grace, setGrace] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);

  useEffect(() => {
    if (supplier) {
      setPolicy(supplier.settlement_policy ?? "net_30");
      setCustomDays(supplier.custom_settlement_days ?? 30);
      setGrace(supplier.grace_days ?? 0);
      setLimit(supplier.credit_limit);
    }
  }, [supplier?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supplier) return null;

  const aging = purchasingService.supplierAging(supplier.id);

  const save = () => {
    if (limit < 0) { toast.error("الحد الائتماني لا يمكن أن يكون سالبًا"); return; }
    if (policy === "custom" && customDays <= 0) {
      toast.error("أيام السداد المخصصة يجب أن تكون أكبر من صفر"); return;
    }
    if (grace < 0) { toast.error("أيام السماح لا يمكن أن تكون سالبة"); return; }

    purchasingService.updateSupplier(supplier.id, {
      credit_limit: Number(limit),
      settlement_policy: policy,
      custom_settlement_days: policy === "custom" ? Number(customDays) : undefined,
      grace_days: Number(grace),
    });
    toast.success("تم تحديث سياسة المورد — سيتم إعادة حساب التقادم والاستحقاق تلقائيًا");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>سياسة الائتمان والسداد · {supplier.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 bg-muted/40 border border-border rounded p-2 text-[11px] space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">القيم الحالية</span>
              <span className="font-mono text-[10px] text-muted-foreground">{supplier.code}</span>
            </div>
            <div>الحد الائتماني الحالي: <b className="num">{fmtSAR(supplier.credit_limit)}</b></div>
            <div>المستخدم: <b className="num">{fmtSAR(supplier.utilized)}</b></div>
            <div>
              سياسة السداد الحالية: <b>{SETTLEMENT_LABEL[supplier.settlement_policy ?? "net_30"]}</b>
              {supplier.settlement_policy === "custom" && supplier.custom_settlement_days
                ? ` (${supplier.custom_settlement_days} يوم)` : ""}
              {" · "}سماح: <b>{supplier.grace_days ?? 0} يوم</b>
            </div>
            <div>
              رصيد مستحق: <b className="num">{fmtSAR(aging.due_balance)}</b> ·
              متأخر: <b className="num">{fmtSAR(aging.overdue_balance)}</b>
              {aging.next_due_date ? <> · أقرب استحقاق: <b>{fmtDate(aging.next_due_date)}</b></> : null}
            </div>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">الحد الائتماني (ر.س)</Label>
            <Input type="number" min={0} value={limit}
              onChange={e => setLimit(Number(e.target.value))} className="h-9 text-sm num" />
          </div>

          <div className="col-span-2">
            <Label className="text-xs">سياسة السداد</Label>
            <Select value={policy} onValueChange={(v) => setPolicy(v as SettlementPolicy)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">{SETTLEMENT_LABEL.cash}</SelectItem>
                <SelectItem value="eom">{SETTLEMENT_LABEL.eom}</SelectItem>
                <SelectItem value="net_30">{SETTLEMENT_LABEL.net_30}</SelectItem>
                <SelectItem value="net_45">{SETTLEMENT_LABEL.net_45}</SelectItem>
                <SelectItem value="net_60">{SETTLEMENT_LABEL.net_60}</SelectItem>
                <SelectItem value="net_90">{SETTLEMENT_LABEL.net_90}</SelectItem>
                <SelectItem value="custom">{SETTLEMENT_LABEL.custom}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">أيام السداد المخصصة</Label>
            <Input type="number" min={1} value={customDays}
              disabled={policy !== "custom"}
              onChange={e => setCustomDays(Number(e.target.value))}
              className="h-9 text-sm num" />
            <p className="text-[10px] text-muted-foreground mt-1">
              تُستخدم فقط عندما تكون السياسة "مخصصة".
            </p>
          </div>
          <div>
            <Label className="text-xs">أيام السماح (Grace)</Label>
            <Input type="number" min={0} value={grace}
              onChange={e => setGrace(Number(e.target.value))}
              className="h-9 text-sm num" />
            <p className="text-[10px] text-muted-foreground mt-1">
              فترة سماح قبل احتساب الفاتورة كمتأخرة.
            </p>
          </div>

          <div className="col-span-2 text-[11px] bg-primary/5 border border-primary/30 rounded p-2">
            أي تغيير في السياسة يُعيد احتساب تواريخ الاستحقاق والتقادم وكشف الحساب تلقائيًا لكل الفواتير المفتوحة.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save}>حفظ السياسة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
