import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  customerSettlementService, SETTLEMENT_LABEL, fmtSAR, fmtDate,
  type SettlementPolicy, type CustomerCreditRow,
} from "@/services/erp/customerSettlement";
import { AmountInput } from "@/components/erp/AmountInput";

/**
 * Customer Credit Policy Dialog — full parity with SupplierPolicyDialog.
 *
 * Edits: credit_limit, settlement_policy, grace_days, payment_terms_days,
 * is_active. Changes are logged automatically in audit_log via the service.
 */
export function CustomerPolicyDialog({
  customer, open, onOpenChange, onSaved,
}: {
  customer: CustomerCreditRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const [policy, setPolicy] = useState<SettlementPolicy>("net_30");
  const [customDays, setCustomDays] = useState<number>(30);
  const [grace, setGrace] = useState<number>(0);
  const [limit, setLimit] = useState<number>(0);
  const [terms, setTerms] = useState<number>(30);
  const [active, setActive] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (customer) {
      setPolicy(customer.settlement_policy);
      setCustomDays(customer.payment_terms_days || 30);
      setGrace(customer.grace_days ?? 0);
      setLimit(customer.credit_limit);
      setTerms(customer.payment_terms_days);
      setActive(customer.is_active);
    }
  }, [customer?.id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!customer) return null;

  const save = async () => {
    if (limit < 0) { toast.error("الحد الائتماني لا يمكن أن يكون سالبًا"); return; }
    if (policy === "custom" && customDays <= 0) {
      toast.error("أيام السداد المخصصة يجب أن تكون أكبر من صفر"); return;
    }
    if (grace < 0) { toast.error("أيام السماح لا يمكن أن تكون سالبة"); return; }
    setSaving(true);
    try {
      await customerSettlementService.updateCustomerPolicy(customer.id, {
        credit_limit: Number(limit),
        settlement_policy: policy,
        grace_days: Number(grace),
        payment_terms_days: policy === "custom" ? Number(customDays) : Number(terms),
        is_active: active,
      });
      toast.success("تم تحديث سياسة العميل — أُعيد احتساب التقادم تلقائيًا");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر حفظ السياسة");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>سياسة الائتمان والسداد · {customer.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2 bg-muted/40 border border-border rounded p-2 text-[12px] space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">القيم الحالية</span>
              <span className="font-mono text-[11.5px] text-muted-foreground">{customer.code}</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <span>الحد الحالي: <b className="num">{fmtSAR(customer.credit_limit)} ر.س</b></span>
              <span>المستخدم: <b className="num">{fmtSAR(customer.utilized)} ر.س</b></span>
              <span>المتبقي: <b className="num">{fmtSAR(customer.remaining)} ر.س</b></span>
            </div>
            <div>
              سياسة السداد الحالية: <b>{SETTLEMENT_LABEL[customer.settlement_policy]}</b>
              {" · "}سماح: <b>{customer.grace_days} يوم</b>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5">
              <span>رصيد مستحق: <b className="num">{fmtSAR(customer.due_balance)} ر.س</b></span>
              <span>متأخر: <b className="num">{fmtSAR(customer.overdue_balance)} ر.س</b></span>
              {customer.next_due_date ? <span>أقرب استحقاق: <b>{fmtDate(customer.next_due_date)}</b></span> : null}
            </div>
          </div>

          <div className="col-span-2">
            <Label className="text-xs">الحد الائتماني (ر.س)</Label>
            <AmountInput value={limit} onChange={(v) => setLimit(v ?? 0)} min={0} className="h-9" />
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
            <Input type="number" min={1} value={customDays} disabled={policy !== "custom"}
              onChange={e => setCustomDays(Number(e.target.value))} className="h-9 text-sm num" />
            <p className="text-[11.5px] text-muted-foreground mt-1">تُستخدم فقط عند اختيار "مخصّص".</p>
          </div>
          <div>
            <Label className="text-xs">أيام السماح (Grace)</Label>
            <Input type="number" min={0} value={grace}
              onChange={e => setGrace(Number(e.target.value))} className="h-9 text-sm num" />
            <p className="text-[11.5px] text-muted-foreground mt-1">فترة سماح قبل اعتبار الفاتورة متأخرة.</p>
          </div>

          <div className="col-span-2 flex items-center justify-between border border-border rounded p-2.5">
            <div>
              <div className="text-xs font-semibold">حساب نشط</div>
              <div className="text-[11.5px] text-muted-foreground">إيقاف الحساب يمنع إصدار أوامر بيع/فواتير جديدة (يتطلب تجاوز مدير).</div>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>

          <div className="col-span-2 text-[12px] bg-primary/5 border border-primary/30 rounded p-2">
            أي تغيير في السياسة يُسجَّل تلقائيًا في سجل التدقيق ويُعيد احتساب تواريخ الاستحقاق والتقادم لكل الفواتير المفتوحة.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ السياسة"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
