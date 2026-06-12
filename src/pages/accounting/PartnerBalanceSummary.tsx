import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Scale, Search, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import {
  getPartnerBalances, createPartnerSettlement, fmtSAR, type PartnerBalance,
} from "@/services/erp/partnerLedger";

export default function PartnerBalanceSummary() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [settleTarget, setSettleTarget] = useState<PartnerBalance | null>(null);
  const [settleAmount, setSettleAmount] = useState<number | undefined>(undefined);
  const [reason, setReason] = useState("");

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ["partner-balances"],
    queryFn: getPartnerBalances,
  });

  const filtered = rows.filter(r =>
    !q || r.partner_name.toLowerCase().includes(q.toLowerCase()) ||
    (r.partner_code ?? "").toLowerCase().includes(q.toLowerCase())
  );

  // مرشّح المقاصّة: له رصيد عميل ومورد معاً
  const canSettle = (r: PartnerBalance) => r.customer_balance > 0.01 && r.vendor_balance > 0.01;
  const maxSettle = (r: PartnerBalance) => Math.min(r.customer_balance, r.vendor_balance);

  const settleMutation = useMutation({
    mutationFn: () =>
      createPartnerSettlement(settleTarget!.partner_id, settleAmount ?? null, reason || "مقاصّة عميل/مورد"),
    onSuccess: (res) => {
      toast.success(
        `تمت المقاصّة — قيد ${res.entry_no}، المبلغ ${fmtSAR(res.settled_amount)}، ${res.allocations_created} تخصيص`
      );
      setSettleTarget(null);
      setSettleAmount(undefined);
      setReason("");
      qc.invalidateQueries({ queryKey: ["partner-balances"] });
    },
    onError: (e: any) => toast.error(e.message ?? "فشلت المقاصّة"),
  });

  const openSettle = (r: PartnerBalance) => {
    setSettleTarget(r);
    setSettleAmount(maxSettle(r));
    setReason("");
  };

  const totals = filtered.reduce(
    (s, r) => ({
      customer: s.customer + r.customer_balance,
      vendor: s.vendor + r.vendor_balance,
    }),
    { customer: 0, vendor: 0 }
  );

  return (
    <div>
      <PageHeader
        title="ملخّص أرصدة الأطراف"
        subtitle="الأرصدة المفتوحة لكل طرف كعميل ومورد — مع المقاصّة (Netting) للأطراف ذوي الصفة المزدوجة"
      />

      <div className="relative mb-3 max-w-md">
        <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pr-9 h-9"
          placeholder="بحث: اسم الطرف أو الكود..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <table className="erp-table w-full">
          <thead>
            <tr>
              <th>الطرف</th>
              <th>الصفة</th>
              <th className="text-left">رصيد كعميل (مدين)</th>
              <th className="text-left">رصيد كمورد (دائن)</th>
              <th className="text-left">الصافي</th>
              <th className="text-center">المقاصّة</th>
            </tr>
          </thead>
          <tbody>
            {isFetching && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">جارٍ التحميل…</td></tr>
            )}
            {!isFetching && filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">لا توجد أرصدة مفتوحة</td></tr>
            )}
            {filtered.map(r => (
              <tr key={r.partner_id}>
                <td>
                  <div className="font-medium">{r.partner_name}</div>
                  <div className="text-[11.5px] text-muted-foreground font-mono">{r.partner_code}</div>
                </td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {r.is_customer && <Badge variant="secondary" className="text-[11.5px]">عميل</Badge>}
                    {r.is_supplier && <Badge variant="outline" className="text-[11.5px]">مورد</Badge>}
                  </div>
                </td>
                <td className="num text-left">{r.customer_balance > 0.01 ? fmtSAR(r.customer_balance) : "—"}</td>
                <td className="num text-left">{r.vendor_balance > 0.01 ? fmtSAR(r.vendor_balance) : "—"}</td>
                <td className={`num text-left font-bold ${r.net_position >= 0 ? "text-success" : "text-warning"}`}>
                  {fmtSAR(Math.abs(r.net_position))} {r.net_position >= 0 ? "مدين" : "دائن"}
                </td>
                <td className="text-center">
                  {canSettle(r) ? (
                    <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => openSettle(r)}>
                      <ArrowLeftRight className="h-3 w-3" /> مقاصّة
                    </Button>
                  ) : (
                    <span className="text-[11.5px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {filtered.length > 0 && (
            <tfoot>
              <tr className="font-bold bg-muted/40">
                <td colSpan={2}>الإجمالي</td>
                <td className="num text-left">{fmtSAR(totals.customer)}</td>
                <td className="num text-left">{fmtSAR(totals.vendor)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* نافذة المقاصّة */}
      <Dialog open={!!settleTarget} onOpenChange={o => !o && setSettleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5" /> مقاصّة عميل/مورد — {settleTarget?.partner_name}
            </DialogTitle>
          </DialogHeader>
          {settleTarget && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-muted/40 rounded-lg">
                  <div className="text-muted-foreground text-xs">رصيده كعميل (مدين)</div>
                  <div className="num font-bold text-success">{fmtSAR(settleTarget.customer_balance)}</div>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg">
                  <div className="text-muted-foreground text-xs">رصيده كمورد (دائن)</div>
                  <div className="num font-bold text-warning">{fmtSAR(settleTarget.vendor_balance)}</div>
                </div>
              </div>

              <div className="p-3 border border-primary/30 rounded-lg bg-primary/5 text-sm">
                <div className="text-muted-foreground text-xs mb-1">أقصى مبلغ مقاصّة ممكن (الأقل)</div>
                <div className="num font-bold text-lg">{fmtSAR(maxSettle(settleTarget))}</div>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">مبلغ المقاصّة</label>
                <Input
                  type="number"
                  value={settleAmount ?? ""}
                  max={maxSettle(settleTarget)}
                  onChange={e => setSettleAmount(e.target.value ? Number(e.target.value) : undefined)}
                  className="num"
                />
                <p className="text-[12px] text-muted-foreground mt-1">
                  افتراضياً المبلغ الأقصى. القيد: مدين ذمم دائنة (مورد) / دائن ذمم مدينة (عميل).
                </p>
              </div>

              <div>
                <label className="text-sm font-medium mb-1 block">السبب / ملاحظة</label>
                <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="مقاصّة عميل/مورد" />
              </div>

              <div className="p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
                ستُنشأ: قيد محاسبي (GL) + تخصيصات تسوية (Open Items) على فواتير الطرف (FIFO) — دون لمس المدفوعات النقدية.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleTarget(null)} disabled={settleMutation.isPending}>
              إلغاء
            </Button>
            <Button
              onClick={() => settleMutation.mutate()}
              disabled={
                settleMutation.isPending ||
                !settleAmount ||
                settleAmount <= 0 ||
                (settleTarget ? settleAmount > maxSettle(settleTarget) + 0.01 : true)
              }
            >
              {settleMutation.isPending ? "جارٍ المقاصّة…" : "تنفيذ المقاصّة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
