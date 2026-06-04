import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Check, X, FileText } from "lucide-react";
import {
  getPurchaseRequest, setPurchaseRequestStatus, convertPRtoPO, listActiveSuppliers,
  PR_STATUS_LABEL, PR_STATUS_TONE, fmtSAR, fmtDate,
} from "@/services/erp/purchasingDb";

export default function PurchaseRequestDetail() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const [convertOpen, setConvertOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["pr", id],
    queryFn: () => getPurchaseRequest(id),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">جاري التحميل...</div>;
  if (!data) return <div className="p-6 text-sm text-muted-foreground">طلب الشراء غير موجود</div>;

  const { header: pr, lines } = data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["pr", id] });

  const onStatus = async (s: any, label: string) => {
    try {
      await setPurchaseRequestStatus(id, s);
      toast.success(label);
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "تعذّر التحديث"); }
  };

  return (
    <div className="p-4 lg:p-6 space-y-4" dir="rtl">
      <PageHeader title={`طلب شراء ${pr.pr_no}`} subtitle={fmtDate(pr.request_date)} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-card border border-border rounded-lg p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="text-base font-bold">{pr.pr_no}</div>
                <div className="text-muted-foreground">{pr.department_code}</div>
              </div>
              <Badge className={PR_STATUS_TONE[pr.status]}>{PR_STATUS_LABEL[pr.status]}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-border">
              <div><div className="text-[10px] text-muted-foreground">التاريخ</div><div>{fmtDate(pr.request_date)}</div></div>
              <div><div className="text-[10px] text-muted-foreground">عدد البنود</div><div>{lines.length}</div></div>
              <div><div className="text-[10px] text-muted-foreground">إجمالي تقديري</div><div className="font-bold">{fmtSAR(Number(pr.total_estimated))}</div></div>
              <div><div className="text-[10px] text-muted-foreground">آخر تحديث</div><div>{fmtDate(pr.updated_at)}</div></div>
            </div>
            {pr.notes && (
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">ملاحظات</div>
                <div className="bg-muted/30 rounded p-2">{pr.notes}</div>
              </div>
            )}
            {pr.rejected_reason && (
              <div>
                <div className="text-[10px] text-destructive mb-1">سبب الرفض</div>
                <div className="bg-destructive/5 border border-destructive/30 rounded p-2">{pr.rejected_reason}</div>
              </div>
            )}
          </div>

          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-border font-semibold text-xs">البنود</div>
            <table className="erp-table text-xs">
              <thead>
                <tr><th>#</th><th>الماركة</th><th>الموديل</th><th>السنة</th><th>اللون</th><th>الكمية</th><th>سعر تقديري</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id}>
                    <td>{l.line_no}</td>
                    <td>{l.brand}</td>
                    <td>{l.model}</td>
                    <td>{l.year ?? "—"}</td>
                    <td>{l.color ?? "—"}</td>
                    <td className="num">{Number(l.quantity)}</td>
                    <td className="num">{fmtSAR(Number(l.estimated_unit_cost))}</td>
                    <td className="num font-semibold">{fmtSAR(Number(l.quantity) * Number(l.estimated_unit_cost))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-2">
          {pr.status === "draft" && (
            <Button className="w-full" onClick={() => onStatus("submitted", "أُرسل للاعتماد")}>
              إرسال للاعتماد
            </Button>
          )}
          {pr.status === "submitted" && (
            <>
              <Button className="w-full" onClick={() => onStatus("approved", "تم الاعتماد")}>
                <Check className="h-4 w-4 ml-1" /> اعتماد
              </Button>
              <Button variant="destructive" className="w-full" onClick={() => onStatus("rejected", "تم الرفض")}>
                <X className="h-4 w-4 ml-1" /> رفض
              </Button>
            </>
          )}
          {pr.status === "approved" && (
            <Button className="w-full" onClick={() => setConvertOpen(true)}>
              <FileText className="h-4 w-4 ml-1" /> تحويل لأمر شراء
            </Button>
          )}
          {(pr.status === "draft" || pr.status === "submitted" || pr.status === "approved") && (
            <Button variant="outline" className="w-full"
              onClick={() => onStatus("cancelled", "تم الإلغاء")}>إلغاء الطلب</Button>
          )}
        </div>
      </div>

      <ConvertDialog open={convertOpen} onOpenChange={setConvertOpen} prId={id} onDone={(poId) => {
        toast.success("تم إنشاء أمر الشراء");
        refresh();
        nav(`/purchasing/orders/${poId}`);
      }} />
    </div>
  );
}

function ConvertDialog({
  open, onOpenChange, prId, onDone,
}: { open: boolean; onOpenChange: (v: boolean) => void; prId: string; onDone: (poId: string) => void }) {
  const { data: suppliers = [] } = useQuery({ queryKey: ["active-suppliers"], queryFn: listActiveSuppliers, enabled: open });
  const [supplierId, setSupplierId] = useState("");
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!supplierId) return toast.error("اختر المورد");
    setSaving(true);
    try {
      const po = await convertPRtoPO(prId, supplierId, expected || null);
      onOpenChange(false);
      onDone(po.id);
    } catch (e: any) {
      toast.error(e?.message ?? "تعذّر التحويل");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تحويل لأمر شراء</DialogTitle>
          <DialogDescription>اختر المورد ليُنشأ أمر شراء يحتوي نفس بنود الطلب.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">المورد</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">تاريخ الوصول المتوقع</Label>
            <Input type="date" className="h-9" value={expected} onChange={e => setExpected(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>إنشاء أمر الشراء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
