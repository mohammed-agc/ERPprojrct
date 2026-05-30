import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Trophy, Plus, Pencil, Trash2, CheckCircle2, Sparkles, Clock, X, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, fmtSAR, fmtDate,
  type IncentiveProgram, type IncentiveProgramStatus, type IncentiveClaimMode, type IncentiveClaim,
} from "@/services/erp/purchasing";
import { cn } from "@/lib/utils";
import { useIncentivePermissions } from "@/lib/incentivePermissions";
import { ensureIncentiveAccess } from "@/lib/incentiveAuthzApi";
import { useAuth } from "@/contexts/AuthContext";

const STATUS_LABEL: Record<IncentiveProgramStatus, string> = {
  active: "نشط", closed: "مغلق", achieved: "محقق",
};
const STATUS_TONE: Record<IncentiveProgramStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  closed: "bg-muted text-muted-foreground border border-border",
  achieved: "bg-success/10 text-success border border-success/40",
};

export function IncentivePrograms({ supplierId }: { supplierId: string }) {
  const perms = useIncentivePermissions();
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [editProgram, setEditProgram] = useState<IncentiveProgram | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [claimProgram, setClaimProgram] = useState<IncentiveProgram | null>(null);
  const [rejectClaim, setRejectClaim] = useState<IncentiveClaim | null>(null);

  const programs = useMemo(
    () => purchasingService.listIncentivePrograms(supplierId),
    [supplierId, tick],
  );

  if (!perms.canView) {
    return (
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-xs flex items-center gap-1">
            <Trophy className="h-3.5 w-3.5 text-warning" /> برامج الحوافز
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-1">
          <div className="text-[11px] text-muted-foreground text-center py-4">
            لا تملك صلاحية عرض برامج الحوافز.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
        <CardTitle className="text-xs flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5 text-warning" /> برامج الحوافز
        </CardTitle>
        {perms.canManage && (
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3 w-3 ml-1" /> برنامج جديد
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-3 pt-1 space-y-2">
        {programs.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-4">
            لا توجد برامج حوافز بعد. أنشئ برنامجًا لتتبع الأهداف والحوافز المستحقة من فواتير الشراء المعتمدة.
          </div>
        )}
        {programs.map(p => {
          const perf = purchasingService.programPerformance(p);
          const pct = Math.min(100, perf.achievement);
          return (
            <div key={p.id} className="border border-border rounded-md p-2.5 space-y-2 bg-card/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold flex items-center gap-1.5">
                    {p.name}
                    <Badge className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                    {perf.eligible && (
                      <Badge className="bg-amber-500/15 text-amber-700 border border-amber-400/50 gap-1">
                        <Sparkles className="h-3 w-3" /> مؤهل للمطالبة
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">
                    {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                    {p.brand && <> · العلامة: <b>{p.brand}</b></>}
                    {p.model && <> · الموديل: <b>{p.model}</b></>}
                  </div>
                </div>
                {perms.canManage && (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={async () => {
                      try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
                      setEditProgram(p);
                    }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                      onClick={async () => {
                        try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
                        if (confirm(`حذف برنامج "${p.name}"؟`)) {
                          purchasingService.deleteIncentiveProgram(p.id);
                          toast.success("تم حذف البرنامج"); refresh();
                        }
                      }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Live performance grid */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-1.5">
                <Stat label="الهدف" value={`${perf.target}`} sub="مركبة" />
                <Stat label="المُشترى" value={`${perf.purchased}`} sub="مركبة" tone={perf.eligible ? "success" : "warning"} />
                <Stat label="المتبقي" value={`${perf.remaining}`} sub="مركبة" />
                <Stat label="نسبة التحقق" value={`${perf.achievement.toFixed(0)}%`}
                  tone={perf.eligible ? "success" : pct > 70 ? "warning" : "default"} />
                <Stat label="الحافز المتوقع" value={fmtSAR(perf.earned)} tone="success" />
              </div>

              <div className="h-1.5 bg-muted rounded overflow-hidden">
                <div className={cn("h-full", perf.eligible ? "bg-success" : "bg-primary")}
                  style={{ width: `${pct}%` }} />
              </div>

              {/* Earned / Approved / Pending / Remaining */}
              <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-border">
                <Stat label="حافز مكتسب" value={fmtSAR(perf.earned)} />
                <Stat label="مُعتمد" value={fmtSAR(perf.claimed)} tone="success" />
                <Stat label="قيد الاعتماد" value={fmtSAR(perf.pending)} tone="warning" />
                <Stat label="متبقي" value={fmtSAR(perf.remaining_incentive)} />
              </div>

              {/* Pending approval queue */}
              {perf.pendingClaims.length > 0 && (
                <div className="border border-warning/40 bg-warning/5 rounded p-2 space-y-1.5">
                  <div className="text-[10.5px] font-semibold text-warning flex items-center gap-1">
                    <Clock className="h-3 w-3" /> مطالبات بانتظار اعتماد المدير
                    ({perf.pendingClaims.length})
                  </div>
                  {perf.pendingClaims.map(c => (
                    <PendingClaimRow
                      key={c.id}
                      claim={c}
                      canApprove={perms.canApprove}
                      onApproved={() => { toast.success(`تم اعتماد ${c.code}`); refresh(); }}
                      onReject={() => setRejectClaim(c)}
                    />
                  ))}
                </div>
              )}

              {/* Submit-claim actions — only when eligible and remaining > 0 */}
              {perms.canManage && perf.eligible && perf.remaining_incentive > 0 && p.status !== "closed" && (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => setClaimProgram(p)}>
                    <CheckCircle2 className="h-3 w-3 ml-1" /> تقديم مطالبة للاعتماد
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => setClaimProgram({ ...p, notes: "credit" })}>
                    خصم من الحد الائتماني
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>

      <ProgramFormDialog
        open={createOpen || !!editProgram}
        onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditProgram(null); } }}
        supplierId={supplierId}
        program={editProgram}
        onSaved={() => { refresh(); setCreateOpen(false); setEditProgram(null); }}
      />
      <ClaimDialog
        program={claimProgram}
        onOpenChange={(v) => !v && setClaimProgram(null)}
        onCreated={() => { refresh(); setClaimProgram(null); }}
      />
      <RejectDialog
        claim={rejectClaim}
        onOpenChange={(v) => !v && setRejectClaim(null)}
        onRejected={() => { refresh(); setRejectClaim(null); }}
      />
    </Card>
  );
}

function Stat({ label, value, sub, tone = "default" }: {
  label: string; value: string; sub?: string;
  tone?: "default" | "success" | "warning" | "destructive";
}) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-muted/40 rounded p-1.5">
      <div className="text-[9.5px] text-muted-foreground">{label}</div>
      <div className={cn("text-xs font-bold num tabular-nums", c)}>{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ---------- Pending claim row ---------- */
function PendingClaimRow({
  claim, canApprove, onApproved, onReject,
}: {
  claim: IncentiveClaim;
  canApprove: boolean;
  onApproved: () => void;
  onReject: () => void;
}) {
  const { profile } = useAuth();
  const approver = profile?.full_name || "مدير المشتريات";
  return (
    <div className="flex items-center gap-2 text-[11px] bg-background/60 rounded px-2 py-1.5">
      <div className="flex-1 min-w-0">
        <div className="font-mono font-semibold">{claim.code}</div>
        <div className="text-[10px] text-muted-foreground truncate">
          {claim.mode === "credit" ? "خصم من الحد الائتماني" : "مطالبة حافز (ذمم)"}
          {claim.requested_by ? ` · طلب: ${claim.requested_by}` : ""}
        </div>
      </div>
      <div className="num tabular-nums font-semibold">{fmtSAR(claim.amount)}</div>
      {canApprove ? (
        <>
          <Button
            size="sm" className="h-6 px-2 text-[10px]"
            onClick={() => {
              const r = purchasingService.approveIncentiveClaim(claim.id, approver);
              if ("error" in r) { toast.error(r.error); return; }
              onApproved();
            }}>
            <ShieldCheck className="h-3 w-3 ml-0.5" /> اعتماد
          </Button>
          <Button size="sm" variant="outline" className="h-6 px-2 text-[10px] text-destructive border-destructive/40"
            onClick={onReject}>
            <X className="h-3 w-3" /> رفض
          </Button>
        </>
      ) : (
        <Badge variant="outline" className="text-[10px] gap-1">
          <Clock className="h-2.5 w-2.5" /> بانتظار المدير
        </Badge>
      )}
    </div>
  );
}

/* ---------- Program form ---------- */
function ProgramFormDialog({
  open, onOpenChange, supplierId, program, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  supplierId: string;
  program: IncentiveProgram | null;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d: number) => {
    const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10);
  };
  const [form, setForm] = useState({
    name: "", start_date: today, end_date: plus(30),
    target_vehicles: 10, incentive_per_vehicle: 1000,
    brand: "", model: "", status: "active" as IncentiveProgramStatus, notes: "",
  });

  // Reset when opening
  const seedFrom = program?.id ?? "__new__";
  useMemo(() => {
    if (program) {
      setForm({
        name: program.name, start_date: program.start_date, end_date: program.end_date,
        target_vehicles: program.target_vehicles, incentive_per_vehicle: program.incentive_per_vehicle,
        brand: program.brand ?? "", model: program.model ?? "",
        status: program.status, notes: program.notes ?? "",
      });
    } else {
      setForm(f => ({ ...f, name: "", brand: "", model: "", notes: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFrom, open]);

  const submit = () => {
    if (!form.name.trim()) { toast.error("اسم البرنامج مطلوب"); return; }
    if (form.target_vehicles <= 0) { toast.error("الهدف يجب أن يكون أكبر من صفر"); return; }
    if (form.end_date < form.start_date) { toast.error("تاريخ النهاية قبل تاريخ البداية"); return; }
    purchasingService.upsertIncentiveProgram({
      id: program?.id,
      supplier_id: supplierId,
      name: form.name.trim(),
      start_date: form.start_date, end_date: form.end_date,
      target_vehicles: Number(form.target_vehicles),
      incentive_per_vehicle: Number(form.incentive_per_vehicle),
      brand: form.brand.trim() || undefined,
      model: form.model.trim() || undefined,
      status: form.status,
      notes: form.notes.trim() || undefined,
    });
    toast.success(program ? "تم تحديث البرنامج" : "تم إنشاء البرنامج");
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{program ? "تعديل برنامج حافز" : "برنامج حافز جديد"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="col-span-2">
            <Label className="text-xs">اسم البرنامج</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: Q2 2026 Hilux Push" className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">تاريخ البداية</Label>
            <Input type="date" value={form.start_date}
              onChange={e => setForm({ ...form, start_date: e.target.value })} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">تاريخ النهاية</Label>
            <Input type="date" value={form.end_date}
              onChange={e => setForm({ ...form, end_date: e.target.value })} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">الهدف (عدد المركبات)</Label>
            <Input type="number" min={1} value={form.target_vehicles}
              onChange={e => setForm({ ...form, target_vehicles: Number(e.target.value) })} className="h-9 text-sm num" />
          </div>
          <div>
            <Label className="text-xs">حافز لكل مركبة (ر.س)</Label>
            <Input type="number" min={0} value={form.incentive_per_vehicle}
              onChange={e => setForm({ ...form, incentive_per_vehicle: Number(e.target.value) })} className="h-9 text-sm num" />
          </div>
          <div>
            <Label className="text-xs">العلامة التجارية (اختياري)</Label>
            <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })}
              placeholder="Toyota / Hyundai..." className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">الموديل (اختياري)</Label>
            <Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })}
              placeholder="Camry / Hilux..." className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-xs">الحالة</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as IncentiveProgramStatus })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="achieved">محقق</SelectItem>
                <SelectItem value="closed">مغلق</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>{program ? "حفظ التغييرات" : "إنشاء البرنامج"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Claim dialog (submit for approval) ---------- */
function ClaimDialog({
  program, onOpenChange, onCreated,
}: {
  program: (IncentiveProgram & { notes?: string }) | null;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const perf = program ? purchasingService.programPerformance(program) : null;
  const defaultMode: IncentiveClaimMode = program?.notes === "credit" ? "credit" : "claim";
  const [mode, setMode] = useState<IncentiveClaimMode>(defaultMode);
  const [amount, setAmount] = useState<number>(perf?.remaining_incentive ?? 0);
  const [reference, setReference] = useState("");

  useMemo(() => {
    setMode(defaultMode);
    setAmount(perf?.remaining_incentive ?? 0);
    setReference("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id]);

  if (!program || !perf) return null;

  const submit = () => {
    const r = purchasingService.createIncentiveClaim({
      program_id: program.id, amount: Number(amount), mode, reference: reference || undefined,
      requested_by: profile?.full_name || undefined,
    });
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(`تم إرسال المطالبة ${r.code} بانتظار اعتماد المدير`);
    onCreated();
  };

  return (
    <Dialog open={!!program} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مطالبة حافز · {program.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="bg-warning/10 border border-warning/40 rounded p-2 text-[11px] text-warning-foreground">
            <b>سياسة الاعتماد:</b> المطالبة تُسجَّل بحالة <b>بانتظار اعتماد المدير</b>.
            لن يتم ترحيل قيد دفتر المورد ولا تحرير الحد الائتماني إلا بعد اعتماد المدير.
          </div>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <Stat label="مكتسب" value={fmtSAR(perf.earned)} tone="success" />
            <Stat label="معتمد" value={fmtSAR(perf.claimed)} tone="success" />
            <Stat label="معلّق" value={fmtSAR(perf.pending)} tone="warning" />
            <Stat label="المتبقي" value={fmtSAR(perf.remaining_incentive)} />
          </div>
          <div>
            <Label className="text-xs">نوع المطالبة</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as IncentiveClaimMode)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claim">إنشاء مطالبة حافز (تسوية بالذمم)</SelectItem>
                <SelectItem value="credit">خصم من الحد الائتماني للمورد</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">المبلغ (ر.س)</Label>
            <Input type="number" min={0} max={perf.remaining_incentive}
              value={amount} onChange={e => setAmount(Number(e.target.value))} className="h-9 text-sm num" />
          </div>
          <div>
            <Label className="text-xs">المرجع (اختياري)</Label>
            <Input value={reference} onChange={e => setReference(e.target.value)} className="h-9 text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit}>إرسال للاعتماد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Reject dialog ---------- */
function RejectDialog({
  claim, onOpenChange, onRejected,
}: {
  claim: IncentiveClaim | null;
  onOpenChange: (v: boolean) => void;
  onRejected: () => void;
}) {
  const { profile } = useAuth();
  const [reason, setReason] = useState("");
  useMemo(() => { setReason(""); }, [claim?.id]);
  if (!claim) return null;

  return (
    <Dialog open={!!claim} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>رفض المطالبة {claim.code}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-xs">سبب الرفض</Label>
          <Input value={reason} onChange={e => setReason(e.target.value)}
            placeholder="مطلوب لتوثيق سبب الرفض" className="h-9 text-sm" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="destructive" onClick={() => {
            if (!reason.trim()) { toast.error("سبب الرفض مطلوب"); return; }
            const r = purchasingService.rejectIncentiveClaim(
              claim.id, profile?.full_name || "مدير المشتريات", reason.trim(),
            );
            if ("error" in r) { toast.error(r.error); return; }
            toast.success(`تم رفض المطالبة ${claim.code}`);
            onRejected();
          }}>تأكيد الرفض</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
