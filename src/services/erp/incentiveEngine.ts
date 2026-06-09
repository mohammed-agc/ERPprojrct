/**
 * Supplier Incentive Engine — Rule-Based, Supabase-backed.
 *
 * محرّك حوافز الموردين القائم على القواعد. يدعم:
 *  - أنواع متعددة (حجم مشتريات/مبيعات، نمو، دعم تسويقي، CSI...) عبر كتالوج incentive_types
 *  - طرق حساب: fixed | percentage | tiered | per_unit
 *  - أساس الاستحقاق: all_units (تراكمي) | above_target (الزائد عن الهدف)
 *  - دورة حياة: expected → earned → approved → received → utilized
 *  - دفتر أستاذ حوافز (مدين/دائن) لكل حركة
 *
 * ملاحظة: قياس الكمية الفعلية (المشتريات/المبيعات) يُربط بالمشتريات لاحقاً؛
 * حتى ذلك الحين يُمرّر يدوياً عند إنشاء الاستحقاق (measured_qty).
 */
import { supabase } from "@/integrations/supabase/client";

// ─────────── الأنواع ───────────
export type PeriodKind = "monthly" | "quarterly" | "semi_annual" | "annual" | "custom";
export type CalcMethod = "fixed" | "percentage" | "tiered" | "per_unit";
export type AccrualBasis = "all_units" | "above_target";
export type PayoutMethod =
  | "cash" | "bank_transfer" | "credit_note" | "future_invoice_discount"
  | "supplier_credit" | "free_vehicles" | "free_parts" | "marketing_support";
export type ProgramStatus = "active" | "closed" | "achieved";
export type AccrualStage =
  | "expected" | "earned" | "approved" | "received" | "utilized" | "rejected" | "cancelled";
export type LedgerMovement =
  | "earned" | "approved" | "received" | "utilized" | "adjustment" | "reversal";

export interface IncentiveType {
  code: string;
  name_ar: string;
  measure_basis: string;
  active: boolean;
  sort_order: number;
}

export interface IncentiveTier {
  id?: string;
  program_id?: string;
  from_qty: number;
  to_qty: number | null;
  is_pct: boolean;
  rate: number;
  sort_order: number;
}

export interface IncentiveProgram {
  id: string;
  supplier_id: string;
  name: string;
  type_code: string;
  period_kind: PeriodKind;
  start_date: string;
  end_date: string;
  calc_method: CalcMethod;
  target_qty: number;
  fixed_amount: number;
  percentage: number;
  per_unit_amount: number;
  accrual_basis: AccrualBasis;
  brand?: string;
  model?: string;
  payout_method: PayoutMethod;
  status: ProgramStatus;
  auto_renew: boolean;
  notes?: string;
  created_at: string;
  // معطيات مُحمّلة اختيارياً
  type_name?: string;
  supplier_name?: string;
  tiers?: IncentiveTier[];
}

export interface IncentiveAccrual {
  id: string;
  code: string;
  program_id: string;
  supplier_id: string;
  period_from: string;
  period_to: string;
  measured_qty: number;
  expected_amount: number;
  earned_amount: number;
  approved_amount: number;
  received_amount: number;
  utilized_amount: number;
  stage: AccrualStage;
  payout_method?: PayoutMethod;
  reference?: string;
  notes?: string;
  approved_at?: string;
  received_at?: string;
  utilized_at?: string;
  rejection_reason?: string;
  created_at: string;
}

export interface LedgerEntry {
  id: string;
  supplier_id: string;
  program_id?: string;
  accrual_id?: string;
  entry_date: string;
  movement: LedgerMovement;
  reference?: string;
  description?: string;
  debit: number;
  credit: number;
  created_at: string;
}

// ─────────── التسميات ───────────
export const PERIOD_LABEL: Record<PeriodKind, string> = {
  monthly: "شهري", quarterly: "ربع سنوي", semi_annual: "نصف سنوي", annual: "سنوي", custom: "مخصص",
};
export const CALC_LABEL: Record<CalcMethod, string> = {
  fixed: "مبلغ ثابت", percentage: "نسبة مئوية", tiered: "شرائح", per_unit: "لكل وحدة",
};
export const BASIS_LABEL: Record<AccrualBasis, string> = {
  all_units: "كل الوحدات (تراكمي)", above_target: "الزائد عن الهدف",
};
export const PAYOUT_LABEL: Record<PayoutMethod, string> = {
  cash: "نقداً", bank_transfer: "تحويل بنكي", credit_note: "إشعار دائن",
  future_invoice_discount: "خصم من فاتورة مستقبلية", supplier_credit: "رصيد لدى الوكيل",
  free_vehicles: "سيارات مجانية", free_parts: "قطع غيار مجانية", marketing_support: "دعم تسويقي",
};
export const STAGE_LABEL: Record<AccrualStage, string> = {
  expected: "متوقّع", earned: "مستحق", approved: "معتمد", received: "مستلم",
  utilized: "مستخدَم", rejected: "مرفوض", cancelled: "ملغى",
};

// ─────────── محرّك الحساب ───────────
/**
 * يحسب قيمة الحافز بناءً على طريقة الحساب وقاعدة الاستحقاق.
 * @param qty الكمية/القيمة المقاسة (عدد سيارات أو قيمة مشتريات حسب النوع)
 */
export function computeIncentive(
  program: Pick<IncentiveProgram, "calc_method" | "target_qty" | "fixed_amount" | "percentage" | "per_unit_amount" | "accrual_basis">,
  qty: number,
  tiers: IncentiveTier[] = [],
): { eligible: boolean; base: number; amount: number } {
  const target = Number(program.target_qty) || 0;
  const targetMet = target <= 0 ? qty > 0 : qty >= target;

  // الأساس: كل الكمية أم الزائد عن الهدف
  const base = program.accrual_basis === "above_target"
    ? Math.max(0, qty - target)
    : qty;

  if (!targetMet) return { eligible: false, base: 0, amount: 0 };

  let amount = 0;
  switch (program.calc_method) {
    case "fixed":
      amount = Number(program.fixed_amount) || 0;
      break;
    case "per_unit":
      amount = base * (Number(program.per_unit_amount) || 0);
      break;
    case "percentage":
      // النسبة من قيمة الأساس (qty هنا قيمة نقدية)
      amount = base * ((Number(program.percentage) || 0) / 100);
      break;
    case "tiered": {
      // إيجاد الشريحة المطابقة للكمية، وتطبيق نسبتها/مبلغها على الأساس
      const sorted = [...tiers].sort((a, b) => a.from_qty - b.from_qty);
      const tier = sorted.find(t =>
        qty >= t.from_qty && (t.to_qty == null || qty <= t.to_qty));
      if (tier) {
        amount = tier.is_pct ? base * (tier.rate / 100) : base * tier.rate;
      }
      break;
    }
  }
  return { eligible: true, base, amount: Math.round(amount * 100) / 100 };
}

// ─────────── محوّلات ───────────
const toTier = (r: any): IncentiveTier => ({
  id: r.id, program_id: r.program_id,
  from_qty: Number(r.from_qty), to_qty: r.to_qty == null ? null : Number(r.to_qty),
  is_pct: !!r.is_pct, rate: Number(r.rate), sort_order: Number(r.sort_order ?? 0),
});
const toProgram = (r: any): IncentiveProgram => ({
  id: r.id, supplier_id: r.supplier_id, name: r.name, type_code: r.type_code,
  period_kind: r.period_kind, start_date: r.start_date, end_date: r.end_date,
  calc_method: r.calc_method, target_qty: Number(r.target_qty ?? 0),
  fixed_amount: Number(r.fixed_amount ?? 0), percentage: Number(r.percentage ?? 0),
  per_unit_amount: Number(r.per_unit_amount ?? 0), accrual_basis: r.accrual_basis,
  brand: r.brand ?? undefined, model: r.model ?? undefined,
  payout_method: r.payout_method, status: r.status, auto_renew: !!r.auto_renew,
  notes: r.notes ?? undefined, created_at: r.created_at,
  type_name: r.incentive_types?.name_ar, supplier_name: r.contacts?.name,
});
const toAccrual = (r: any): IncentiveAccrual => ({
  id: r.id, code: r.code, program_id: r.program_id, supplier_id: r.supplier_id,
  period_from: r.period_from, period_to: r.period_to,
  measured_qty: Number(r.measured_qty), expected_amount: Number(r.expected_amount),
  earned_amount: Number(r.earned_amount), approved_amount: Number(r.approved_amount),
  received_amount: Number(r.received_amount), utilized_amount: Number(r.utilized_amount),
  stage: r.stage, payout_method: r.payout_method ?? undefined,
  reference: r.reference ?? undefined, notes: r.notes ?? undefined,
  approved_at: r.approved_at ?? undefined, received_at: r.received_at ?? undefined,
  utilized_at: r.utilized_at ?? undefined, rejection_reason: r.rejection_reason ?? undefined,
  created_at: r.created_at,
});

// ─────────── الخدمة ───────────
export const incentiveEngine = {
  async listTypes(): Promise<IncentiveType[]> {
    const { data } = await supabase.from("incentive_types").select("*").eq("active", true).order("sort_order");
    return (data ?? []) as IncentiveType[];
  },

  async listPrograms(supplierId?: string): Promise<IncentiveProgram[]> {
    let q = supabase.from("incentive_programs")
      .select("*, incentive_types(name_ar), contacts:supplier_id(name)")
      .order("created_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data ?? []).map(toProgram);
  },

  async getProgram(id: string): Promise<IncentiveProgram | null> {
    const { data } = await supabase.from("incentive_programs")
      .select("*, incentive_types(name_ar), contacts:supplier_id(name)").eq("id", id).maybeSingle();
    if (!data) return null;
    const program = toProgram(data);
    const { data: tiers } = await supabase.from("incentive_tiers").select("*").eq("program_id", id).order("sort_order");
    program.tiers = (tiers ?? []).map(toTier);
    return program;
  },

  async upsertProgram(
    input: Partial<IncentiveProgram> & { supplier_id: string; name: string; type_code: string },
    tiers: IncentiveTier[] = [],
  ): Promise<{ data?: IncentiveProgram; error?: string }> {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const payload: any = {
      supplier_id: input.supplier_id, name: input.name, type_code: input.type_code,
      period_kind: input.period_kind ?? "monthly",
      start_date: input.start_date, end_date: input.end_date,
      calc_method: input.calc_method ?? "fixed",
      target_qty: input.target_qty ?? 0, fixed_amount: input.fixed_amount ?? 0,
      percentage: input.percentage ?? 0, per_unit_amount: input.per_unit_amount ?? 0,
      accrual_basis: input.accrual_basis ?? "all_units",
      brand: input.brand || null, model: input.model || null,
      payout_method: input.payout_method ?? "credit_note",
      status: input.status ?? "active", auto_renew: input.auto_renew ?? false,
      notes: input.notes || null, updated_at: new Date().toISOString(),
    };

    let programId = input.id;
    if (input.id) {
      const { error } = await supabase.from("incentive_programs").update(payload).eq("id", input.id);
      if (error) return { error: error.message };
    } else {
      payload.created_by = userId;
      const { data, error } = await supabase.from("incentive_programs").insert(payload).select("id").maybeSingle();
      if (error) return { error: error.message };
      programId = data?.id;
    }

    // الشرائح: نحذف القديمة ونعيد الإدراج (إن كانت الطريقة tiered)
    if (programId) {
      await supabase.from("incentive_tiers").delete().eq("program_id", programId);
      if (payload.calc_method === "tiered" && tiers.length) {
        const rows = tiers.map((t, i) => ({
          program_id: programId, from_qty: t.from_qty, to_qty: t.to_qty,
          is_pct: t.is_pct, rate: t.rate, sort_order: i,
        }));
        const { error } = await supabase.from("incentive_tiers").insert(rows);
        if (error) return { error: error.message };
      }
    }

    const saved = programId ? await this.getProgram(programId) : null;
    return { data: saved ?? undefined };
  },

  async setProgramStatus(id: string, status: ProgramStatus): Promise<{ error?: string }> {
    const { error } = await supabase.from("incentive_programs")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    return { error: error?.message };
  },

  async deleteProgram(id: string): Promise<{ error?: string }> {
    const { error } = await supabase.from("incentive_programs").delete().eq("id", id);
    return { error: error?.message };
  },

  // ─────────── الاستحقاقات ───────────
  async listAccruals(filter?: { supplierId?: string; programId?: string }): Promise<IncentiveAccrual[]> {
    let q = supabase.from("incentive_accruals").select("*").order("created_at", { ascending: false });
    if (filter?.supplierId) q = q.eq("supplier_id", filter.supplierId);
    if (filter?.programId) q = q.eq("program_id", filter.programId);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data ?? []).map(toAccrual);
  },

  /** إنشاء استحقاق: يقيس الكمية، يحسب القيمة، ويسجّله بمرحلة "مستحق" (earned). */
  async createAccrual(input: {
    program_id: string; period_from: string; period_to: string;
    measured_qty: number; payout_method?: PayoutMethod; reference?: string; notes?: string;
  }): Promise<{ data?: IncentiveAccrual; error?: string }> {
    const program = await this.getProgram(input.program_id);
    if (!program) return { error: "البرنامج غير موجود" };

    const calc = computeIncentive(program, input.measured_qty, program.tiers ?? []);
    if (!calc.eligible) return { error: "لم يتحقق الهدف — لا استحقاق" };
    if (calc.amount <= 0) return { error: "قيمة الحافز المحسوبة صفر" };

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const code = "INC-" + new Date().getFullYear() + "-" + Date.now().toString().slice(-6);

    const { data, error } = await supabase.from("incentive_accruals").insert({
      code, program_id: program.id, supplier_id: program.supplier_id,
      period_from: input.period_from, period_to: input.period_to,
      measured_qty: input.measured_qty,
      expected_amount: calc.amount, earned_amount: calc.amount,
      stage: "earned", earned_at: new Date().toISOString(),
      payout_method: input.payout_method ?? program.payout_method,
      reference: input.reference || null, notes: input.notes || null, created_by: userId,
    }).select().maybeSingle();
    if (error) return { error: error.message };

    // قيد الدفتر: مدين (استحقاق على الوكيل)
    await supabase.from("incentive_ledger").insert({
      supplier_id: program.supplier_id, program_id: program.id, accrual_id: data.id,
      movement: "earned", reference: code, description: `استحقاق حافز — ${program.name}`,
      debit: calc.amount, credit: 0, created_by: userId,
    });

    return { data: toAccrual(data) };
  },

  /** نقل الاستحقاق عبر المراحل: approved / received / utilized / rejected */
  async advanceAccrual(
    id: string, toStage: AccrualStage, opts?: { amount?: number; reason?: string },
  ): Promise<{ error?: string }> {
    const { data: a } = await supabase.from("incentive_accruals").select("*").eq("id", id).maybeSingle();
    if (!a) return { error: "الاستحقاق غير موجود" };
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const now = new Date().toISOString();
    const amount = opts?.amount ?? Number(a.earned_amount);

    const patch: any = { stage: toStage, updated_at: now };
    let movement: LedgerMovement | null = null;
    let debit = 0, credit = 0;

    if (toStage === "approved") {
      patch.approved_amount = amount; patch.approved_by = userId; patch.approved_at = now;
      movement = "approved";
    } else if (toStage === "received") {
      patch.received_amount = amount; patch.received_at = now;
      movement = "received"; credit = amount; // الاستلام يخفض المستحق
    } else if (toStage === "utilized") {
      patch.utilized_amount = amount; patch.utilized_at = now;
      movement = "utilized"; credit = amount;
    } else if (toStage === "rejected") {
      patch.rejected_by = userId; patch.rejected_at = now; patch.rejection_reason = opts?.reason ?? null;
      movement = "reversal"; credit = Number(a.earned_amount); // عكس الاستحقاق
    }

    const { error } = await supabase.from("incentive_accruals").update(patch).eq("id", id);
    if (error) return { error: error.message };

    if (movement) {
      await supabase.from("incentive_ledger").insert({
        supplier_id: a.supplier_id, program_id: a.program_id, accrual_id: id,
        movement, reference: a.code,
        description: `${STAGE_LABEL[toStage]} — ${a.code}`,
        debit, credit, created_by: userId,
      });
    }
    return {};
  },

  // ─────────── الدفتر ───────────
  async ledger(supplierId?: string): Promise<LedgerEntry[]> {
    let q = supabase.from("incentive_ledger").select("*").order("entry_date", { ascending: false }).order("created_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data ?? []) as LedgerEntry[];
  },

  /** ملخص رصيد الحوافز للمورد: مستحق - مستلم - مستخدَم = المتبقي */
  async supplierBalance(supplierId: string): Promise<{ earned: number; received: number; utilized: number; outstanding: number }> {
    const entries = await this.ledger(supplierId);
    const debit = entries.reduce((s, e) => s + Number(e.debit), 0);
    const credit = entries.reduce((s, e) => s + Number(e.credit), 0);
    const earned = entries.filter(e => e.movement === "earned").reduce((s, e) => s + Number(e.debit), 0);
    const received = entries.filter(e => e.movement === "received").reduce((s, e) => s + Number(e.credit), 0);
    const utilized = entries.filter(e => e.movement === "utilized").reduce((s, e) => s + Number(e.credit), 0);
    return { earned, received, utilized, outstanding: debit - credit };
  },
};
