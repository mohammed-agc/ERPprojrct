import { useState, Fragment } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ShieldCheck, X, CheckCircle2, ChevronDown, ChevronLeft, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import {
  getInspection, setInspectionLineResult, bulkPassInspection,
  approveInspection, rejectInspection,
  INS_LABEL, INS_TONE, INS_RESULT_LABEL, INS_RESULT_TONE, fmtDate,
  type InspectionResult,
} from "@/services/erp/receivingDb";
import { LineChecklistPanel } from "@/components/erp/LineChecklistPanel";

export default function InspectionDetail() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState("");
  const [openLine, setOpenLine] = useState<string | null>(null);

  const q = useQuery({ queryKey: ["inspection", id], queryFn: () => getInspection(id), enabled: !!id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inspection", id] });
    qc.invalidateQueries({ queryKey: ["inspections"] });
    qc.invalidateQueries({ queryKey: ["vehicles"] });
  };

  const lineMut = useMutation({
    mutationFn: ({ lineId, result }: { lineId: string; result: InspectionResult }) =>
      setInspectionLineResult(lineId, result),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkPass = useMutation({
    mutationFn: () => bulkPassInspection(id),
    onSuccess: () => { toast.success("تم اعتماد جميع البنود كناجح"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: () => approveInspection(id),
    onSuccess: (created) => {
      toast.success(`تم اعتماد الفحص — أُنشئت ${created} مركبة`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reject = useMutation({
    mutationFn: () => rejectInspection(id, rejectReason || undefined),
    onSuccess: () => { toast.error("تم رفض الفحص"); setRejectReason(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">جارٍ التحميل...</div>;
  if (!q.data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        سجل الفحص غير موجود — <Link to="/purchasing/inspection" className="text-primary">رجوع</Link>
      </div>
    );
  }

  const { header: ins, lines } = q.data;
  const passed = lines.filter(l => l.result === "passed").length;
  const rejected = lines.filter(l => l.result === "rejected").length;
  const pending = lines.filter(l => l.result === "pending").length;
  const canDecide = ins.status === "pending" || ins.status === "in_progress";
  const created = lines.filter(l => l.vehicle_id).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${ins.insp_no} — سجل فحص`}
        subtitle={
          <div className="flex items-center gap-2 text-xs">
            <Badge className={INS_TONE[ins.status]}>{INS_LABEL[ins.status]}</Badge>
            <span className="text-muted-foreground">GRN:</span>
            <Link to={`/grn/${ins.grn_id}`} className="text-primary font-mono hover:underline">{ins.grn_id.slice(0, 8)}</Link>
          </div>
        }
      />

      <div className="grid grid-cols-5 gap-2">
        <Kpi label="بنود" value={lines.length} tone="primary" />
        <Kpi label="ناجح" value={passed} tone="success" />
        <Kpi label="مرفوض" value={rejected} tone="destructive" />
        <Kpi label="بانتظار" value={pending} tone="warning" />
        <Kpi label="مركبات أُنشئت" value={created} tone="info" />
      </div>

      <Card>
        <CardContent className="p-3 grid grid-cols-3 gap-3 text-xs">
          <div><div className="text-[11.5px] text-muted-foreground">تاريخ البدء</div><div>{fmtDate(ins.started_at)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">انتهى في</div><div>{fmtDate(ins.completed_at)}</div></div>
          <div><div className="text-[11.5px] text-muted-foreground">اعتماد</div><div>{fmtDate(ins.approved_at)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <div className="font-semibold text-sm">نتائج الفحص</div>
            {canDecide && (
              <Button size="sm" variant="outline" onClick={() => bulkPass.mutate()} disabled={bulkPass.isPending}>
                اعتماد الكل كناجح
              </Button>
            )}
          </div>
          <table className="erp-table">
            <thead>
              <tr><th>#</th><th>VIN</th><th>النتيجة</th><th>مركبة المخزون</th><th>إجراءات</th></tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} className="text-center text-muted-foreground py-6 text-xs">لا توجد بنود</td></tr>
              )}
              {lines.map(l => (
                <Fragment key={l.id}>
                <tr>
                  <td className="num text-xs">{l.line_no}</td>
                  <td className="font-mono text-[12px]" dir="ltr">{l.vin}</td>
                  <td>
                    <Badge className={INS_RESULT_TONE[l.result]}>{INS_RESULT_LABEL[l.result]}</Badge>
                  </td>
                  <td className="text-xs">
                    {l.vehicle_id ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <CheckCircle2 className="h-3 w-3" />
                        <span className="font-mono text-[11.5px]">{l.vehicle_id.slice(0, 8)}</span>
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td>
                    {canDecide && (
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-success"
                          onClick={() => lineMut.mutate({ lineId: l.id, result: "passed" })}>
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive"
                          onClick={() => lineMut.mutate({ lineId: l.id, result: "rejected" })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                    <Button size="sm" variant="outline" className="h-7 px-2 mt-1 text-[11.5px]"
                      onClick={() => setOpenLine(openLine === l.id ? null : l.id)}>
                      <ClipboardList className="h-3 w-3 ml-1" /> فحص تفصيلي
                      {openLine === l.id ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronLeft className="h-3 w-3 mr-1" />}
                    </Button>
                  </td>
                </tr>
                {openLine === l.id && (
                  <tr>
                    <td colSpan={5} className="p-0">
                      <LineChecklistPanel inspectionLineId={l.id} readOnly={!canDecide} onFinalized={invalidate} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {canDecide && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-sm font-semibold">قرار الفحص</div>
            <div className="flex gap-2 items-start">
              <Button onClick={() => approve.mutate()} disabled={approve.isPending || passed === 0}
                className="flex-1">
                <ShieldCheck className="h-4 w-4 ml-1" /> اعتماد وإنشاء {passed} مركبة
              </Button>
              <div className="flex-1 space-y-1">
                <Textarea placeholder="سبب الرفض (اختياري)" rows={1}
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="text-xs" />
                <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending} className="w-full">
                  <X className="h-4 w-4 ml-1" /> رفض الفحص
                </Button>
              </div>
            </div>
            {passed === 0 && (
              <div className="text-[12px] text-warning">حدد بنوداً ناجحة قبل الاعتماد لإنشاء سجلات المركبات</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "destructive" | "warning" | "info" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning"
    : tone === "destructive" ? "text-destructive" : tone === "info" ? "text-info" : "text-primary";
  return (
    <div className="border border-border bg-card rounded-lg p-2.5">
      <div className="text-[11.5px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}