import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, PackageCheck, FileSearch, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { GRNDbCreateDialog } from "@/components/erp/GRNDbCreateDialog";
import {
  createInspectionFromGRN, approveInspection,
} from "@/services/erp/receivingDb";

/**
 * Phase 13c — Receiving Workbench
 * Lean, DB-backed: select a shipment → create GRN → auto-create inspection → bulk-pass + approve.
 * The full granular inspection lives at /purchasing/inspection/:id.
 */
export default function ReceivingWorkbench() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [grnId, setGrnId] = useState<string | null>(null);
  const [inspId, setInspId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleCreated = async (gid: string) => {
    setGrnId(gid);
    try {
      setBusy(true);
      const ins = await createInspectionFromGRN(gid);
      setInspId(ins.id);
      toast.success("تم إنشاء سجل الفحص");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "تعذر إنشاء سجل الفحص");
    } finally {
      setBusy(false);
    }
  };

  const approve = useMutation({
    mutationFn: async () => {
      if (!inspId) throw new Error("لا يوجد سجل فحص");
      // mark all lines passed via direct call
      const { bulkPassInspection } = await import("@/services/erp/receivingDb");
      await bulkPassInspection(inspId);
      return approveInspection(inspId);
    },
    onSuccess: (n) => {
      toast.success(`تم الاعتماد — أُنشئت ${n} مركبة في المخزون`);
      qc.invalidateQueries({ queryKey: ["vehicles"] });
      qc.invalidateQueries({ queryKey: ["grns"] });
      qc.invalidateQueries({ queryKey: ["inspections"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="ورشة الاستلام والفحص"
        subtitle="تدفّق سريع: شحنة → مذكرة استلام → فحص → اعتماد → مركبات في المخزون"
      />

      <Card className="mb-3">
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Step n={1} active={!grnId} done={!!grnId} icon={PackageCheck} label="مذكرة استلام" />
            <Step n={2} active={!!grnId && !approve.isSuccess} done={approve.isSuccess} icon={FileSearch} label="فحص" />
            <Step n={3} active={false} done={approve.isSuccess} icon={CheckCircle2} label="إنشاء مركبات" />
          </div>

          {!grnId && (
            <Button onClick={() => setOpen(true)} disabled={busy}>
              <PackageCheck className="h-4 w-4 ml-1" /> ابدأ — إنشاء مذكرة استلام
            </Button>
          )}

          {grnId && !approve.isSuccess && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                تم إنشاء مذكرة الاستلام وسجل الفحص.
                اضغط "اعتماد الجميع" لتمرير كل البنود واعتمادها — سيتم إنشاء المركبات تلقائياً في المخزون.
              </div>
              <div className="flex gap-2">
                <Button onClick={() => approve.mutate()} disabled={!inspId || approve.isPending}>
                  <CheckCircle2 className="h-4 w-4 ml-1" /> اعتماد الجميع وإنشاء المركبات
                </Button>
                {inspId && (
                  <Button variant="outline" onClick={() => nav(`/purchasing/inspection/${inspId}`)}>
                    فحص تفصيلي <ArrowLeft className="h-4 w-4 mr-1" />
                  </Button>
                )}
              </div>
            </div>
          )}

          {approve.isSuccess && (
            <div className="flex items-center gap-2 text-xs bg-success/5 text-success border border-success/30 rounded p-3">
              <CheckCircle2 className="h-4 w-4" />
              <span>تم بنجاح. المركبات متاحة في المخزون.</span>
              <Button size="sm" variant="ghost" className="mr-auto" onClick={() => { setGrnId(null); setInspId(null); approve.reset(); }}>
                بدء جلسة جديدة
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <GRNDbCreateDialog open={open} onOpenChange={setOpen} onCreated={handleCreated} />
    </div>
  );
}

function Step({ n, label, icon: Icon, active, done }: { n: number; label: string; icon: any; active: boolean; done: boolean }) {
  const tone = done ? "text-success border-success/40 bg-success/5"
    : active ? "text-primary border-primary/40 bg-primary/5"
    : "text-muted-foreground border-border bg-muted/20";
  return (
    <div className={`border rounded-lg p-3 ${tone}`}>
      <div className="flex items-center gap-2">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border ${tone}`}>{n}</div>
        <Icon className="h-4 w-4" />
        <span className="text-sm font-semibold">{label}</span>
      </div>
    </div>
  );
}
