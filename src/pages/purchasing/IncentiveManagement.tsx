import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  incentiveEngine, computeIncentive,
  PERIOD_LABEL, CALC_LABEL, BASIS_LABEL, PAYOUT_LABEL, STAGE_LABEL,
  type IncentiveProgram, type IncentiveType, type IncentiveTier,
  type CalcMethod, type PeriodKind, type AccrualBasis, type PayoutMethod, type ProgramStatus,
} from "@/services/erp/incentiveEngine";
import { ensureIncentiveAccess } from "@/lib/incentiveAuthzApi";
import { useIncentivePermissions } from "@/lib/incentivePermissions";
import { Trophy, Plus, Pencil, Trash2, Search, Building2, BookOpen, Calculator, Coins } from "lucide-react";

const fmtSAR = (n: number) => Number(n || 0).toLocaleString("en-US") + " ر.س";
const fmtDate = (s?: string) => s ? new Date(s).toLocaleDateString("ar-SA") : "—";

const STATUS_TONE: Record<ProgramStatus, string> = {
  active: "bg-primary/10 text-primary border border-primary/30",
  closed: "bg-muted text-muted-foreground border border-border",
  achieved: "bg-success/10 text-success border border-success/40",
};
const STATUS_LABEL: Record<ProgramStatus, string> = { active: "نشط", closed: "مغلق", achieved: "محقق" };

export default function IncentiveManagement() {
  const perms = useIncentivePermissions();
  const [programs, setPrograms] = useState<IncentiveProgram[]>([]);
  const [types, setTypes] = useState<IncentiveType[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editProgram, setEditProgram] = useState<IncentiveProgram | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [progs, tps] = await Promise.all([incentiveEngine.listPrograms(), incentiveEngine.listTypes()]);
    setPrograms(progs);
    setTypes(tps);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("contacts").select("id, name").eq("is_supplier", true).order("name");
      setSuppliers(data ?? []);
    })();
  }, []);

  const filtered = useMemo(() => programs.filter(p => {
    if (!q) return true;
    return `${p.name} ${p.supplier_name ?? ""} ${p.type_name ?? ""}`.toLowerCase().includes(q.toLowerCase());
  }), [programs, q]);

  const stats = useMemo(() => ({
    total: programs.length,
    active: programs.filter(p => p.status === "active").length,
    suppliers: new Set(programs.map(p => p.supplier_id)).size,
  }), [programs]);

  const openNew = async () => {
    try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
    setCreateOpen(true);
  };
  const openEdit = async (p: IncentiveProgram) => {
    try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
    const full = await incentiveEngine.getProgram(p.id);
    setEditProgram(full);
  };
  const del = async (p: IncentiveProgram) => {
    try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
    if (!confirm(`حذف برنامج "${p.name}"؟`)) return;
    const { error } = await incentiveEngine.deleteProgram(p.id);
    if (error) { toast.error(error); return; }
    toast.success("تم الحذف"); refresh();
  };

  // احتساب الحافز: يقيس المشتريات المؤكّدة هذا الشهر ثم يُنشئ استحقاقاً (earned)
  const accrue = async (p: IncentiveProgram) => {
    try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    const { data: invs } = await supabase
      .from("purchase_invoices").select("id")
      .eq("supplier_id", p.supplier_id)
      .in("status", ["confirmed", "partially_paid", "paid"])
      .gte("invoice_date", from).lte("invoice_date", to);
    const ids = (invs ?? []).map((r: any) => r.id);
    let measured = 0;
    if (ids.length > 0) {
      let q = supabase.from("purchase_invoice_lines").select("id", { count: "exact", head: true }).in("invoice_id", ids);
      if (p.brand) q = q.or(`brand.eq.${p.brand},manufacturer.eq.${p.brand}`);
      if (p.model) q = q.eq("model", p.model);
      const { count } = await q;
      measured = count ?? 0;
    }
    if (measured === 0) { toast.error("لا مشتريات مؤكّدة لهذا المورد في الشهر الحالي"); return; }
    const { data, error } = await incentiveEngine.createAccrual({
      program_id: p.id, period_from: from, period_to: to, measured_qty: measured,
    });
    if (error) { toast.error(error); return; }
    toast.success(`تم احتساب الحافز: ${data?.code ?? ""} (${measured} مركبة)`); refresh();
  };

  return (
    <div dir="rtl">
      <PageHeader
        title="إدارة حوافز الموردين"
        subtitle="محرّك حوافز مرن — برامج لكل الوكلاء بأنواع وطرق حساب متعددة"
        actions={perms.canManage ? <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 ml-1" /> برنامج حافز</Button> : undefined}
      />

      <div className="px-4 pb-3 grid grid-cols-3 gap-2 max-w-md">
        <Stat label="إجمالي البرامج" value={String(stats.total)} icon={Trophy} />
        <Stat label="نشطة" value={String(stats.active)} icon={Calculator} tone="success" />
        <Stat label="موردون" value={String(stats.suppliers)} icon={Building2} />
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="h-9 pr-8" placeholder="بحث: برنامج، مورد، نوع..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Link to="/incentives/ledger" className="text-xs text-primary hover:underline flex items-center gap-1">
          <BookOpen className="h-3.5 w-3.5" /> دفتر أستاذ الحوافز
        </Link>
      </div>

      <div className="px-4">
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="erp-table">
            <thead>
              <tr>
                <th>البرنامج</th>
                <th>المورد</th>
                <th>النوع</th>
                <th>الفترة</th>
                <th>طريقة الحساب</th>
                <th>الهدف</th>
                <th>السداد</th>
                <th>الحالة</th>
                {perms.canManage && <th className="text-left">إجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-muted-foreground text-xs">جاري التحميل...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">
                  <Trophy className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  لا توجد برامج حوافز. اضغط "برنامج حافز" لإضافة برنامج.
                </td></tr>
              ) : filtered.map(p => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-xs">
                    <Link to={`/contacts/${p.supplier_id}`} className="hover:underline">{p.supplier_name ?? "—"}</Link>
                  </td>
                  <td className="text-xs">{p.type_name ?? p.type_code}</td>
                  <td className="text-xs">{PERIOD_LABEL[p.period_kind]}</td>
                  <td className="text-xs">{CALC_LABEL[p.calc_method]}</td>
                  <td className="text-xs num">{p.target_qty || "—"}</td>
                  <td className="text-xs">{PAYOUT_LABEL[p.payout_method]}</td>
                  <td><Badge className={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge></td>
                  {perms.canManage && (
                    <td className="text-left">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-success border-success/40 hover:bg-success/10 gap-1" onClick={() => accrue(p)} title="احتساب الحافز المستحق">
                          <Coins className="h-3.5 w-3.5" /> <span className="text-[12px]">احتساب</span>
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(p)} title="تعديل">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => del(p)} title="حذف">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ProgramDialog
        open={createOpen || !!editProgram}
        onOpenChange={(v) => { if (!v) { setCreateOpen(false); setEditProgram(null); } }}
        program={editProgram}
        types={types}
        suppliers={suppliers}
        onSaved={() => { refresh(); setCreateOpen(false); setEditProgram(null); }}
      />
    </div>
  );
}

function Stat({ label, value, icon: Icon, tone = "default" }: any) {
  const c = tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="border border-border rounded-lg p-2.5">
      <div className="flex items-center gap-1 text-[12px] text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className={`text-lg font-bold num ${c}`}>{value}</div>
    </div>
  );
}

// ─────────── نموذج البرنامج (المحرّك المرن) ───────────
function ProgramDialog({ open, onOpenChange, program, types, suppliers, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  program: IncentiveProgram | null; types: IncentiveType[]; suppliers: any[]; onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const plus = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };

  const empty = {
    supplier_id: "", name: "", type_code: "PURCHASE_VOLUME",
    period_kind: "monthly" as PeriodKind, start_date: today, end_date: plus(30),
    calc_method: "per_unit" as CalcMethod, target_qty: 10,
    fixed_amount: 0, percentage: 0, per_unit_amount: 1000,
    accrual_basis: "all_units" as AccrualBasis,
    brand: "", model: "", payout_method: "credit_note" as PayoutMethod,
    status: "active" as ProgramStatus, auto_renew: false, notes: "",
  };
  const [form, setForm] = useState(empty);
  const [tiers, setTiers] = useState<IncentiveTier[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (program) {
      setForm({
        supplier_id: program.supplier_id, name: program.name, type_code: program.type_code,
        period_kind: program.period_kind, start_date: program.start_date, end_date: program.end_date,
        calc_method: program.calc_method, target_qty: program.target_qty,
        fixed_amount: program.fixed_amount, percentage: program.percentage, per_unit_amount: program.per_unit_amount,
        accrual_basis: program.accrual_basis, brand: program.brand ?? "", model: program.model ?? "",
        payout_method: program.payout_method, status: program.status, auto_renew: program.auto_renew,
        notes: program.notes ?? "",
      });
      setTiers(program.tiers ?? []);
    } else {
      setForm(empty); setTiers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, open]);

  const addTier = () => setTiers(t => [...t, { from_qty: 0, to_qty: null, is_pct: false, rate: 0, sort_order: t.length }]);
  const updTier = (i: number, patch: Partial<IncentiveTier>) => setTiers(t => t.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delTier = (i: number) => setTiers(t => t.filter((_, j) => j !== i));

  // معاينة الحساب
  const preview = useMemo(() => {
    const sample = form.target_qty || 10;
    return computeIncentive(form, sample, tiers);
  }, [form, tiers]);

  const submit = async () => {
    if (!form.supplier_id) { toast.error("اختر المورد"); return; }
    if (!form.name.trim()) { toast.error("اسم البرنامج مطلوب"); return; }
    if (form.end_date < form.start_date) { toast.error("تاريخ النهاية قبل البداية"); return; }
    if (form.calc_method === "tiered" && tiers.length === 0) { toast.error("أضف شريحة واحدة على الأقل"); return; }
    try { await ensureIncentiveAccess("manage"); } catch (e) { toast.error((e as Error).message); return; }
    setSaving(true);
    const { error } = await incentiveEngine.upsertProgram(
      { id: program?.id, ...form, brand: form.brand || undefined, model: form.model || undefined },
      tiers,
    );
    setSaving(false);
    if (error) { toast.error(error); return; }
    toast.success(program ? "تم تحديث البرنامج" : "تم إنشاء البرنامج");
    onSaved();
  };

  const measureBasis = types.find(t => t.code === form.type_code)?.measure_basis ?? "";
  const isValueBased = measureBasis === "purchase_value" || measureBasis === "sales_value";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-warning" /> {program ? "تعديل برنامج حافز" : "برنامج حافز جديد"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">المورد *</Label>
            <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="اختر المورد" /></SelectTrigger>
              <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">اسم البرنامج *</Label>
            <Input className="h-9 mt-1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="مثال: حافز مشتريات 2026" />
          </div>

          <div>
            <Label className="text-xs">نوع الحافز</Label>
            <Select value={form.type_code} onValueChange={v => setForm(f => ({ ...f, type_code: v }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{types.map(t => <SelectItem key={t.code} value={t.code}>{t.name_ar}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الفترة</Label>
            <Select value={form.period_kind} onValueChange={v => setForm(f => ({ ...f, period_kind: v as PeriodKind }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PERIOD_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">تاريخ البداية</Label>
            <Input type="date" className="h-9 mt-1" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
          </div>
          <div>
            <Label className="text-xs">تاريخ النهاية</Label>
            <Input type="date" className="h-9 mt-1" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
          </div>

          {/* طريقة الحساب */}
          <div className="col-span-2 border-t border-border pt-3 mt-1">
            <Label className="text-xs font-semibold">طريقة الحساب</Label>
            <Select value={form.calc_method} onValueChange={v => setForm(f => ({ ...f, calc_method: v as CalcMethod }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(CALC_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{isValueBased ? "الهدف (قيمة)" : "الهدف (عدد)"}</Label>
            <Input type="number" className="h-9 mt-1 num" value={form.target_qty} onChange={e => setForm(f => ({ ...f, target_qty: Number(e.target.value) }))} />
          </div>
          <div>
            <Label className="text-xs">أساس الاستحقاق</Label>
            <Select value={form.accrual_basis} onValueChange={v => setForm(f => ({ ...f, accrual_basis: v as AccrualBasis }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(BASIS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {/* الحقول حسب طريقة الحساب */}
          {form.calc_method === "fixed" && (
            <div className="col-span-2">
              <Label className="text-xs">المبلغ الثابت (ر.س)</Label>
              <Input type="number" className="h-9 mt-1 num" value={form.fixed_amount} onChange={e => setForm(f => ({ ...f, fixed_amount: Number(e.target.value) }))} />
            </div>
          )}
          {form.calc_method === "per_unit" && (
            <div className="col-span-2">
              <Label className="text-xs">المبلغ لكل وحدة (ر.س)</Label>
              <Input type="number" className="h-9 mt-1 num" value={form.per_unit_amount} onChange={e => setForm(f => ({ ...f, per_unit_amount: Number(e.target.value) }))} />
            </div>
          )}
          {form.calc_method === "percentage" && (
            <div className="col-span-2">
              <Label className="text-xs">النسبة المئوية (%)</Label>
              <Input type="number" className="h-9 mt-1 num" value={form.percentage} onChange={e => setForm(f => ({ ...f, percentage: Number(e.target.value) }))} />
            </div>
          )}
          {form.calc_method === "tiered" && (
            <div className="col-span-2 border border-border rounded p-2 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">الشرائح</Label>
                <Button size="sm" variant="outline" className="h-7 text-[12px]" onClick={addTier}><Plus className="h-3 w-3 ml-1" /> شريحة</Button>
              </div>
              {tiers.length === 0 && <p className="text-[12px] text-muted-foreground">أضف شرائح: من — إلى — نسبة/مبلغ</p>}
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Input type="number" className="h-8 num" placeholder="من" value={t.from_qty} onChange={e => updTier(i, { from_qty: Number(e.target.value) })} />
                  <Input type="number" className="h-8 num" placeholder="إلى (فارغ=∞)" value={t.to_qty ?? ""} onChange={e => updTier(i, { to_qty: e.target.value ? Number(e.target.value) : null })} />
                  <Select value={t.is_pct ? "pct" : "amt"} onValueChange={v => updTier(i, { is_pct: v === "pct" })}>
                    <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amt">مبلغ</SelectItem>
                      <SelectItem value="pct">نسبة %</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" className="h-8 num" placeholder="القيمة" value={t.rate} onChange={e => updTier(i, { rate: Number(e.target.value) })} />
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => delTier(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          )}

          {/* معاينة الحساب */}
          <div className="col-span-2 bg-muted/40 rounded p-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground text-xs">معاينة: عند {form.target_qty || 10} وحدة</span>
            <span className="font-bold num">{preview.eligible ? fmtSAR(preview.amount) : "لم يتحقق الهدف"}</span>
          </div>

          <div>
            <Label className="text-xs">طريقة السداد</Label>
            <Select value={form.payout_method} onValueChange={v => setForm(f => ({ ...f, payout_method: v as PayoutMethod }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PAYOUT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">الحالة</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as ProgramStatus }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="achieved">محقق</SelectItem>
                <SelectItem value="closed">مغلق</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">العلامة التجارية (اختياري)</Label>
            <Input className="h-9 mt-1" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Toyota..." />
          </div>
          <div>
            <Label className="text-xs">الموديل (اختياري)</Label>
            <Input className="h-9 mt-1" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} placeholder="Camry..." />
          </div>

          <div className="col-span-2 flex items-center gap-2">
            <input type="checkbox" id="autorenew" checked={form.auto_renew} onChange={e => setForm(f => ({ ...f, auto_renew: e.target.checked }))} />
            <Label htmlFor="autorenew" className="text-xs cursor-pointer">تجديد تلقائي للدورة عند انتهائها</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-xs">ملاحظات</Label>
            <Input className="h-9 mt-1" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={submit} disabled={saving}>{program ? "حفظ التغييرات" : "إنشاء البرنامج"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}