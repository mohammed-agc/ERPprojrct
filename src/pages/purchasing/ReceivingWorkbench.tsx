import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, PackageCheck, ShieldCheck, AlertTriangle, CheckCircle2, XCircle,
  ArrowRight, ArrowLeft, Loader2, Car, FileText, Wallet, Link2,
} from "lucide-react";
import { toast } from "sonner";
import {
  purchasingService, PINV_LABEL, PINV_TONE, fmtSAR,
  type PurchaseOrder, type PurchaseInvoice, type Supplier,
} from "@/services/erp/purchasing";
import { getPoVehicleUnits, type PoVehicleUnit } from "@/lib/poVehicleUnits";
import { getVinChain, VIN_STAGE_LABEL } from "@/lib/vinChain";
import { VehicleIntakeDialog } from "@/components/erp/VehicleIntakeDialog";

type Step = 1 | 2 | 3;
type Condition = "ok" | "minor_damage" | "damaged";
type Result = "passed" | "rejected" | "pending";

interface InspectRow {
  unit: PoVehicleUnit;
  vinOk: boolean;
  engineOk: boolean;
  identityOk: boolean;   // model/trim/color
  condition: Condition;
  result: Result;
  remarks: string;
}

const COND_LABEL: Record<Condition, string> = {
  ok: "سليم", minor_damage: "خدوش طفيفة", damaged: "تضرر",
};
const RESULT_TONE: Record<Result, string> = {
  passed: "bg-success/10 text-success border-success/30",
  rejected: "bg-destructive/10 text-destructive border-destructive/30",
  pending: "bg-muted text-muted-foreground border-border",
};
const RESULT_LABEL: Record<Result, string> = {
  passed: "ناجح", rejected: "مرفوض", pending: "بانتظار",
};

export default function ReceivingWorkbench() {
  const [step, setStep] = useState<Step>(1);
  const [code, setCode] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
  const [units, setUnits] = useState<PoVehicleUnit[]>([]);
  const [rows, setRows] = useState<InspectRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [warehouse] = useState("المستودع الرئيسي - الرياض");
  const [grnId, setGrnId] = useState<string | null>(null);
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);

  /* ---------------- Step 1 — Load ---------------- */
  const handleLoad = () => {
    const q = code.trim();
    if (!q) { toast.error("أدخل رقم فاتورة أو أمر شراء"); return; }
    const r = purchasingService.findInvoiceOrPoByCode(q);
    if (!r.po) { toast.error("لا يوجد أمر شراء/فاتورة بهذا الرقم"); return; }
    const u = getPoVehicleUnits(r.po.id);
    if (u.length === 0) {
      toast.error("لا توجد تخصيصات مؤكدة (VIN) مرتبطة بهذا الأمر — أكمل التخصيص أولاً");
      return;
    }
    setSupplier(r.supplier ?? null);
    setPo(r.po);
    setInvoice(r.invoice ?? null);
    setUnits(u);
    setRows(u.map(unit => ({
      unit, vinOk: false, engineOk: false, identityOk: false,
      condition: "ok", result: "pending", remarks: "",
    })));
  };

  const invoiceReady = invoice?.status === "paid";
  const proceedToStep2 = () => {
    if (!invoiceReady) {
      toast.error("الفاتورة غير مدفوعة — يجب اكتمال السداد قبل الاستلام");
      return;
    }
    setStep(2);
  };

  /* ---------------- Step 2 — Receive + Inspect ---------------- */
  const updateRow = (idx: number, patch: Partial<InspectRow>) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const bulkVerify = () => {
    setRows(prev => prev.map(r => ({ ...r, vinOk: true, engineOk: true, identityOk: true })));
    toast.success("تم تأكيد التحقق من جميع المركبات");
  };
  const bulkPass = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      vinOk: true, engineOk: true, identityOk: true,
      condition: "ok", result: "passed",
    })));
    toast.success("تم اعتماد جميع المركبات");
  };

  const passedCount = rows.filter(r => r.result === "passed").length;
  const rejectedCount = rows.filter(r => r.result === "rejected").length;
  const pendingCount = rows.filter(r => r.result === "pending").length;

  const handleConfirmReceiveInspect = async () => {
    if (!po) return;
    if (pendingCount > 0) {
      toast.error(`${pendingCount} مركبة لم تُعتمد نتيجتها بعد`);
      return;
    }
    setSubmitting(true);
    try {
      // 1. Create GRN
      const grn = purchasingService.createGRN({
        po_id: po.id, invoice_id: invoice?.id,
        warehouse, receiver: "مسؤول الاستلام",
        notes: `ورشة الاستلام — ${rows.length} مركبة`,
      });
      if (!grn) { toast.error("تعذر إنشاء مذكرة الاستلام"); return; }

      // 2. Record receipt: aggregate qty per PO line
      const byLine = new Map<string, { qty: number; damaged: number }>();
      rows.forEach(r => {
        const k = r.unit.po_line_id || "_unlinked";
        const e = byLine.get(k) || { qty: 0, damaged: 0 };
        e.qty += 1;
        if (r.condition !== "ok") e.damaged += 1;
        byLine.set(k, e);
      });
      const items = Array.from(byLine.entries())
        .filter(([k]) => k !== "_unlinked")
        .flatMap(([line_id, v]) => {
          const out: any[] = [];
          const okQty = v.qty - v.damaged;
          if (okQty > 0) out.push({ line_id, qty: okQty, condition: "ok", vin_pending: false, chassis_verified: true });
          if (v.damaged > 0) out.push({ line_id, qty: v.damaged, condition: "damaged", vin_pending: false });
          return out;
        });
      purchasingService.recordReceipt(grn.id, items);
      purchasingService.completeGRN(grn.id);
      purchasingService.handoffToInspection(grn.id, "مفتش الجودة");

      // 3. Update inspection items with passed/failed and approve
      const insp = purchasingService.getInspectionByGRN(grn.id);
      if (!insp) { toast.error("تعذر إنشاء سجل الفحص"); return; }
      const inspByLine = new Map<string, { passed: number; failed: number }>();
      rows.forEach(r => {
        const k = r.unit.po_line_id || "_unlinked";
        if (k === "_unlinked") return;
        const e = inspByLine.get(k) || { passed: 0, failed: 0 };
        if (r.result === "passed") e.passed += 1;
        else if (r.result === "rejected") e.failed += 1;
        inspByLine.set(k, e);
      });
      purchasingService.updateInspectionItems(
        insp.id,
        Array.from(inspByLine.entries()).map(([line_id, c]) => ({ line_id, ...c })),
      );
      purchasingService.setInspectionStatus(insp.id, "approved");

      setGrnId(grn.id);
      setInspectionId(insp.id);
      toast.success(`تم إنشاء ${grn.code} واعتماد الفحص — ${passedCount} مركبة جاهزة للإدخال`);
      setStep(3);
    } finally { setSubmitting(false); }
  };

  /* ---------------- Step 3 — Inventory ---------------- */
  const passedRows = rows.filter(r => r.result === "passed");
  const inspectionForIntake = inspectionId ? purchasingService.listInspections().find(i => i.id === inspectionId) ?? null : null;

  const reset = () => {
    setStep(1); setCode(""); setSupplier(null); setPo(null); setInvoice(null);
    setUnits([]); setRows([]); setGrnId(null); setInspectionId(null);
  };

  return (
    <div>
      <PageHeader
        title="ورشة الاستلام والفحص"
        subtitle="تدفّق موحّد مدفوع برقم الفاتورة/الأمر — لا إعادة إدخال للبيانات"
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-4 bg-card border border-border rounded-lg p-3">
        <StepPill n={1} label="تحميل المستند" active={step === 1} done={step > 1} />
        <Sep />
        <StepPill n={2} label="استلام وفحص" active={step === 2} done={step > 2} />
        <Sep />
        <StepPill n={3} label="إدخال المخزون" active={step === 3} done={false} />
        {step > 1 && (
          <Button variant="ghost" size="sm" className="ml-auto h-7" onClick={reset}>
            بدء جلسة جديدة
          </Button>
        )}
      </div>

      {step === 1 && (
        <Card className="p-5 space-y-4">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> ابحث برقم الفاتورة أو أمر الشراء
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="مثال: PINV-2026-0001 أو PO-2026-0042"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && handleLoad()}
              className="font-mono"
              dir="ltr"
            />
            <Button onClick={handleLoad}><Search className="h-4 w-4 ml-1" /> تحميل</Button>
          </div>

          {po && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2">
                <InfoTile label="المورد" value={supplier?.name ?? "—"} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
                <InfoTile label="أمر الشراء" value={po.code} mono icon={<FileText className="h-3.5 w-3.5" />} />
                <InfoTile
                  label="الفاتورة"
                  value={invoice?.code ?? "—"}
                  mono
                  icon={<Wallet className="h-3.5 w-3.5" />}
                  trailing={invoice && <Badge className={PINV_TONE[invoice.status]}>{PINV_LABEL[invoice.status]}</Badge>}
                />
                <InfoTile label="عدد المركبات" value={String(units.length)} icon={<Car className="h-3.5 w-3.5" />} />
              </div>

              {invoice && !invoiceReady ? (
                <div className="flex items-center gap-2 text-xs text-warning bg-warning/5 border border-warning/30 rounded p-3">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  الفاتورة <b className="mx-1 font-mono">{invoice.code}</b> غير مدفوعة بالكامل (الحالة: {PINV_LABEL[invoice.status]}).
                  يجب إتمام السداد قبل الانتقال للاستلام. متبقي: <b className="num mx-1">{fmtSAR(invoice.total - invoice.paid)}</b>
                </div>
              ) : invoice ? (
                <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/30 rounded p-3">
                  <CheckCircle2 className="h-4 w-4" />
                  الفاتورة مدفوعة — جاهز للاستلام
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded p-3">
                  لا توجد فاتورة مصدّرة لهذا الأمر بعد
                </div>
              )}

              <div className="border border-border rounded overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-xs font-semibold">المركبات المحمَّلة تلقائياً من التخصيص</div>
                <table className="erp-table text-xs">
                  <thead>
                    <tr>
                      <th>#</th><th>VIN</th><th>المحرك</th><th>الصانع</th><th>الموديل</th>
                      <th>الفئة</th><th>السنة</th><th>اللون</th><th className="text-left">التكلفة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u, i) => (
                      <tr key={u.alloc_line_id}>
                        <td className="num text-muted-foreground">{i + 1}</td>
                        <td className="font-mono text-[11px]" dir="ltr">{u.vin}</td>
                        <td className="font-mono text-[11px]" dir="ltr">{u.engine_no}</td>
                        <td>{u.manufacturer}</td>
                        <td>{u.model}</td>
                        <td>{u.trim ?? "—"}</td>
                        <td className="num">{u.year}</td>
                        <td>{u.color}</td>
                        <td className="num text-left">{fmtSAR(u.cost ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <Button onClick={proceedToStep2} disabled={!invoiceReady}>
                  متابعة إلى الاستلام والفحص <ArrowLeft className="h-4 w-4 mr-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && po && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-primary" />
              تحقّق من كل مركبة — VIN، المحرك، الهوية، الحالة الفعلية
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={bulkVerify}>تأكيد التحقق للجميع</Button>
              <Button size="sm" variant="outline" onClick={bulkPass}>اعتماد الجميع كناجح</Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            <Kpi label="إجمالي" value={rows.length} />
            <Kpi label="ناجح" value={passedCount} tone="success" />
            <Kpi label="مرفوض" value={rejectedCount} tone="destructive" />
            <Kpi label="بانتظار" value={pendingCount} tone="warning" />
          </div>

          <div className="border border-border rounded overflow-x-auto">
            <table className="erp-table text-xs">
              <thead>
                <tr>
                  <th>#</th><th>VIN</th><th>المحرك</th>
                  <th>الموديل/الفئة/اللون</th>
                  <th>تحقق VIN</th><th>تحقق المحرك</th><th>تحقق الهوية</th>
                  <th>الحالة الفعلية</th><th>النتيجة</th>
                  <th>ملاحظات</th><th>سلسلة VIN</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const chain = getVinChain(r.unit.vin);
                  return (
                    <tr key={r.unit.alloc_line_id}>
                      <td className="num text-muted-foreground">{idx + 1}</td>
                      <td className="font-mono text-[11px]" dir="ltr">{r.unit.vin}</td>
                      <td className="font-mono text-[11px]" dir="ltr">{r.unit.engine_no}</td>
                      <td>
                        <div className="font-medium">{r.unit.manufacturer} {r.unit.model} <span className="num">{r.unit.year}</span></div>
                        <div className="text-[10px] text-muted-foreground">{r.unit.trim ?? "—"} · {r.unit.color}</div>
                      </td>
                      <td className="text-center"><Checkbox checked={r.vinOk} onCheckedChange={(v) => updateRow(idx, { vinOk: !!v })} /></td>
                      <td className="text-center"><Checkbox checked={r.engineOk} onCheckedChange={(v) => updateRow(idx, { engineOk: !!v })} /></td>
                      <td className="text-center"><Checkbox checked={r.identityOk} onCheckedChange={(v) => updateRow(idx, { identityOk: !!v })} /></td>
                      <td>
                        <Select value={r.condition} onValueChange={v => updateRow(idx, { condition: v as Condition })}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(COND_LABEL) as Condition[]).map(k => (
                              <SelectItem key={k} value={k}>{COND_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Select value={r.result} onValueChange={v => updateRow(idx, { result: v as Result })}>
                          <SelectTrigger className={`h-7 text-xs border ${RESULT_TONE[r.result]}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(RESULT_LABEL) as Result[]).map(k => (
                              <SelectItem key={k} value={k}>{RESULT_LABEL[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <Textarea
                          value={r.remarks}
                          onChange={e => updateRow(idx, { remarks: e.target.value })}
                          rows={1}
                          className="text-xs resize-none min-h-7 h-7"
                          placeholder="—"
                        />
                      </td>
                      <td>
                        <div className="flex items-center gap-1 text-[10px]" title={chain.stages.map(s => VIN_STAGE_LABEL[s]).join(" → ")}>
                          <Link2 className="h-3 w-3 text-muted-foreground" />
                          <span className="font-mono">{chain.stages.length}</span>
                          {chain.intact && <CheckCircle2 className="h-3 w-3 text-success" />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowRight className="h-4 w-4 ml-1" /> رجوع
            </Button>
            <Button onClick={handleConfirmReceiveInspect} disabled={submitting || pendingCount > 0}>
              {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
              تأكيد الاستلام والفحص <ArrowLeft className="h-4 w-4 mr-1" />
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && po && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Car className="h-4 w-4 text-primary" /> إدخال المركبات المعتمدة للمخزون
          </div>

          <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/30 rounded p-3">
            <CheckCircle2 className="h-4 w-4" />
            تم تسجيل الاستلام والفحص بنجاح — <span className="font-mono mx-1">{passedRows.length}</span>
            مركبة معتمدة جاهزة للإدخال. جميع بيانات VIN/المحرك/الموديل/اللون منسوخة تلقائياً من التخصيص.
          </div>

          <div className="border border-border rounded overflow-hidden">
            <table className="erp-table text-xs">
              <thead>
                <tr><th>#</th><th>VIN</th><th>المحرك</th><th>الموديل</th><th>اللون</th><th>التكلفة</th></tr>
              </thead>
              <tbody>
                {passedRows.map((r, i) => (
                  <tr key={r.unit.alloc_line_id}>
                    <td className="num text-muted-foreground">{i + 1}</td>
                    <td className="font-mono text-[11px]" dir="ltr">{r.unit.vin}</td>
                    <td className="font-mono text-[11px]" dir="ltr">{r.unit.engine_no}</td>
                    <td>{r.unit.manufacturer} {r.unit.model} <span className="num">{r.unit.year}</span> {r.unit.trim ?? ""}</td>
                    <td>{r.unit.color}</td>
                    <td className="num">{fmtSAR(r.unit.cost ?? 0)}</td>
                  </tr>
                ))}
                {rejectedCount > 0 && (
                  <tr><td colSpan={6} className="text-[11px] text-muted-foreground bg-muted/20 py-2">
                    <XCircle className="h-3 w-3 inline ml-1 text-destructive" />
                    {rejectedCount} مركبة مرفوضة لن تُدخل للمخزون
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>بدء جلسة جديدة</Button>
            <Button onClick={() => setIntakeOpen(true)} disabled={passedRows.length === 0}>
              <Car className="h-4 w-4 ml-1" /> إدخال {passedRows.length} مركبة للمخزون
            </Button>
          </div>

          <VehicleIntakeDialog
            open={intakeOpen}
            onOpenChange={setIntakeOpen}
            inspection={inspectionForIntake}
            po={po}
            onCreated={() => { toast.success("تم الإدخال للمخزون"); reset(); }}
          />
        </Card>
      )}
    </div>
  );
}

function StepPill({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs ${
      done ? "bg-success/10 text-success border-success/30"
      : active ? "bg-primary/10 text-primary border-primary/30 font-semibold"
      : "bg-muted/30 text-muted-foreground border-border"
    }`}>
      <span className={`w-5 h-5 rounded-full grid place-items-center text-[10px] font-bold ${
        done ? "bg-success text-success-foreground"
        : active ? "bg-primary text-primary-foreground" : "bg-muted-foreground/20"
      }`}>
        {done ? <CheckCircle2 className="h-3 w-3" /> : n}
      </span>
      {label}
    </div>
  );
}
function Sep() { return <div className="h-px flex-1 bg-border" />; }

function InfoTile({ label, value, mono, icon, trailing }: {
  label: string; value: string; mono?: boolean; icon?: React.ReactNode; trailing?: React.ReactNode;
}) {
  return (
    <div className="bg-muted/40 border border-border rounded p-2.5">
      <div className="text-[10px] text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <div className={`text-sm font-semibold ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
        {trailing}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" | "destructive" }) {
  const c = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" :
    tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="bg-card border border-border rounded p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold num ${c}`}>{value}</div>
    </div>
  );
}
