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
import { Trophy, Plus, Pencil, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, fmtSAR, fmtDate,
  type IncentiveProgram, type IncentiveProgramStatus, type IncentiveClaimMode,
} from "@/services/erp/purchasing";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<IncentiveProgramStatus, string> = {
  active: "نشط", closed: "مغلق", achieved: "محقق",
};
const STATUS_TONE: Record<IncentiveProgramStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  closed: "bg-muted text-muted-foreground border border-border",
  achieved: "bg-success/10 text-success border border-success/40",
};

export function IncentivePrograms({ supplierId }: { supplierId: string }) {
  const [tick, setTick] = useState(0);
  const refresh = () => setTick(t => t + 1);
  const [editProgram, setEditProgram] = useState<IncentiveProgram | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [claimProgram, setClaimProgram] = useState<IncentiveProgram | null>(null);

  const programs = useMemo(
    () => purchasingService.listIncentivePrograms(supplierId),
    [supplierId, tick],
  );

  return (
    <Card>
      <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
        <CardTitle className="text-xs flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5 text-warning" /> برامج الحوافز
        </CardTitle>
        <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3 w-3 ml-1" /> برنامج جديد
        </Button>
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
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditProgram(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm(`حذف برنامج "${p.name}"؟`)) {
                        purchasingService.deleteIncentiveProgram(p.id);
                        toast.success("تم حذف البرنامج"); refresh();
                      }
                    }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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

              {/* Earned / Claimed / Remaining */}
              <div className="grid grid-cols-3 gap-1.5 pt-1 border-t border-border">
                <Stat label="حافز مكتسب" value={fmtSAR(perf.earned)} />
                <Stat label="مُطالب به" value={fmtSAR(perf.claimed)} tone="warning" />
                <Stat label="متبقي للمطالبة" value={fmtSAR(perf.remaining_incentive)} tone="success" />
              </div>

              {/* Claim actions — only when eligible and remaining > 0 */}
              {perf.eligible && perf.remaining_incentive > 0 && p.status !== "closed" && (
                <div className="flex items-center gap-2 pt-1">
                  <Button size="sm" className="h-7 text-[11px]" onClick={() => setClaimProgram(p)}>
                    <CheckCircle2 className="h-3 w-3 ml-1" /> إنشاء مطالبة حافز
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

/* ---------- Claim dialog ---------- */
function ClaimDialog({
  program, onOpenChange, onCreated,
}: {
  program: (IncentiveProgram & { notes?: string }) | null;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
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
    });
    if ("error" in r) { toast.error(r.error); return; }
    toast.success(`تم إنشاء المطالبة ${r.code}`);
    onCreated();
  };

  return (
    <Dialog open={!!program} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>مطالبة حافز · {program.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="مكتسب" value={fmtSAR(perf.earned)} tone="success" />
            <Stat label="مُطالب به" value={fmtSAR(perf.claimed)} tone="warning" />
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
          <Button onClick={submit}>تأكيد المطالبة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
