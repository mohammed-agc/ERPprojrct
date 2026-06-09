/**
 * Supplier Incentives — Supabase-backed service.
 *
 * نظام حوافز الموردين: اتفاقية شهرية بهدف عدد مركبات؛ عند تحققه يُستحق
 * حافز لكل مركبة. نمطان للحساب:
 *   - accumulative : الحافز على كل المركبات المشتراة (عند بلوغ الهدف)
 *   - target_based : الحافز على المركبات الزائدة عن الهدف فقط
 *
 * الدورة شهرية (تتجدد تلقائياً)؛ الأداء يُحتسب ضمن نافذة الشهر الحالي.
 * ربط المشتريات الفعلية بفواتير الشراء يُضاف لاحقاً عند اكتمال قسم المشتريات؛
 * حتى ذلك الحين نقرأ المُحقق من purchasingService (مؤقتاً) أو 0.
 */
import { supabase } from "@/integrations/supabase/client";

export type IncentiveProgramStatus = "active" | "closed" | "achieved";
export type IncentiveProgramType = "accumulative" | "target_based";
export type IncentiveClaimMode = "claim" | "credit";
export type IncentiveClaimStatus = "pending_approval" | "approved" | "rejected";

export interface IncentiveProgram {
  id: string;
  supplier_id: string;
  name: string;
  start_date: string;
  end_date: string;
  target_vehicles: number;
  incentive_per_vehicle: number;
  program_type: IncentiveProgramType;
  brand?: string;
  model?: string;
  status: IncentiveProgramStatus;
  notes?: string;
  created_at: string;
}

export interface IncentiveClaim {
  id: string;
  code: string;
  program_id: string;
  supplier_id: string;
  amount: number;
  mode: IncentiveClaimMode;
  reference?: string;
  notes?: string;
  status: IncentiveClaimStatus;
  requested_by?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  created_at: string;
}

export interface IncentivePerformance {
  program_type: IncentiveProgramType;
  achieved: number;            // عدد المركبات المشتراة في الشهر
  target: number;
  target_met: boolean;
  eligible_vehicles: number;   // المركبات المؤهّلة للحافز حسب النمط
  earned: number;              // إجمالي الحافز المستحق
  claimed: number;             // ما طُولب به (معتمد + قيد الاعتماد)
  remaining_incentive: number; // المتبقي القابل للمطالبة
  progress_pct: number;
}

// ─────────── helpers ───────────
const toProgram = (r: any): IncentiveProgram => ({
  id: r.id, supplier_id: r.supplier_id, name: r.name,
  start_date: r.start_date, end_date: r.end_date,
  target_vehicles: Number(r.target_vehicles), incentive_per_vehicle: Number(r.incentive_per_vehicle),
  program_type: (r.program_type ?? "accumulative") as IncentiveProgramType,
  brand: r.brand ?? undefined, model: r.model ?? undefined,
  status: r.status as IncentiveProgramStatus, notes: r.notes ?? undefined,
  created_at: r.created_at,
});

const toClaim = (r: any): IncentiveClaim => ({
  id: r.id, code: r.code, program_id: r.program_id, supplier_id: r.supplier_id,
  amount: Number(r.amount), mode: r.mode as IncentiveClaimMode,
  reference: r.reference ?? undefined, notes: r.notes ?? undefined,
  status: r.status as IncentiveClaimStatus,
  requested_by: r.requested_by ?? undefined,
  approved_by: r.approved_by ?? undefined, approved_at: r.approved_at ?? undefined,
  rejected_by: r.rejected_by ?? undefined, rejected_at: r.rejected_at ?? undefined,
  rejection_reason: r.rejection_reason ?? undefined,
  created_at: r.created_at,
});

/** نافذة الشهر الحالي (بداية/نهاية) بصيغة ISO date. */
function currentMonthWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/**
 * عدد المركبات المشتراة من المورد ضمن الشهر الحالي.
 * مؤقتاً: حتى يكتمل ربط فواتير الشراء، نُرجع 0 (يُحدّث لاحقاً ليقرأ من
 * purchase_invoices / purchase_orders المعتمدة ضمن النافذة الشهرية).
 */
async function purchasedVehiclesThisMonth(_supplierId: string, _brand?: string, _model?: string): Promise<number> {
  // TODO(purchasing): اقرأ من فواتير الشراء المعتمدة ضمن currentMonthWindow()
  return 0;
}

export const incentivesService = {
  // ─────────── Programs ───────────
  async listPrograms(supplierId?: string): Promise<IncentiveProgram[]> {
    let q = supabase.from("incentive_programs").select("*").order("created_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data ?? []).map(toProgram);
  },

  async getProgram(id: string): Promise<IncentiveProgram | null> {
    const { data } = await supabase.from("incentive_programs").select("*").eq("id", id).maybeSingle();
    return data ? toProgram(data) : null;
  },

  async upsertProgram(input: {
    id?: string; supplier_id: string; name: string;
    start_date: string; end_date: string;
    target_vehicles: number; incentive_per_vehicle: number;
    program_type: IncentiveProgramType;
    brand?: string; model?: string;
    status?: IncentiveProgramStatus; notes?: string;
  }): Promise<{ data?: IncentiveProgram; error?: string }> {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const payload: any = {
      supplier_id: input.supplier_id, name: input.name,
      start_date: input.start_date, end_date: input.end_date,
      target_vehicles: input.target_vehicles, incentive_per_vehicle: input.incentive_per_vehicle,
      program_type: input.program_type,
      brand: input.brand || null, model: input.model || null,
      status: input.status ?? "active", notes: input.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (input.id) {
      const { data, error } = await supabase.from("incentive_programs").update(payload).eq("id", input.id).select().maybeSingle();
      if (error) return { error: error.message };
      return { data: data ? toProgram(data) : undefined };
    }
    payload.created_by = userId;
    const { data, error } = await supabase.from("incentive_programs").insert(payload).select().maybeSingle();
    if (error) return { error: error.message };
    return { data: data ? toProgram(data) : undefined };
  },

  async setProgramStatus(id: string, status: IncentiveProgramStatus): Promise<{ error?: string }> {
    const { error } = await supabase.from("incentive_programs")
      .update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    return { error: error?.message };
  },

  async deleteProgram(id: string): Promise<{ error?: string }> {
    const { error } = await supabase.from("incentive_programs").delete().eq("id", id);
    return { error: error?.message };
  },

  // ─────────── Performance (الحساب المرن) ───────────
  async performance(program: IncentiveProgram): Promise<IncentivePerformance> {
    const achieved = await purchasedVehiclesThisMonth(program.supplier_id, program.brand, program.model);
    const target = program.target_vehicles;
    const target_met = achieved >= target && target > 0;

    // النمط يحدّد المركبات المؤهّلة للحافز
    let eligible_vehicles = 0;
    if (program.program_type === "target_based") {
      // الحافز على الزائد عن الهدف فقط (وبشرط بلوغ الهدف)
      eligible_vehicles = target_met ? Math.max(0, achieved - target) : 0;
    } else {
      // accumulative: الحافز على كل المركبات عند بلوغ الهدف
      eligible_vehicles = target_met ? achieved : 0;
    }
    const earned = eligible_vehicles * program.incentive_per_vehicle;

    // المطالبات (معتمدة + قيد الاعتماد) تخصم من المتاح
    const { data: claims } = await supabase
      .from("incentive_claims").select("amount, status")
      .eq("program_id", program.id).neq("status", "rejected");
    const claimed = (claims ?? []).reduce((s: number, c: any) => s + Number(c.amount), 0);
    const remaining_incentive = Math.max(0, earned - claimed);

    return {
      program_type: program.program_type, achieved, target, target_met,
      eligible_vehicles, earned, claimed, remaining_incentive,
      progress_pct: target > 0 ? Math.min(100, (achieved / target) * 100) : 0,
    };
  },

  // ─────────── Claims ───────────
  async listClaims(supplierId?: string): Promise<IncentiveClaim[]> {
    let q = supabase.from("incentive_claims").select("*").order("created_at", { ascending: false });
    if (supplierId) q = q.eq("supplier_id", supplierId);
    const { data, error } = await q;
    if (error) { console.error(error); return []; }
    return (data ?? []).map(toClaim);
  },

  async createClaim(input: {
    program_id: string; amount: number; mode: IncentiveClaimMode;
    reference?: string; notes?: string;
  }): Promise<{ data?: IncentiveClaim; error?: string }> {
    const program = await this.getProgram(input.program_id);
    if (!program) return { error: "البرنامج غير موجود" };

    const perf = await this.performance(program);
    if (program.program_type === "target_based" && !perf.target_met) {
      return { error: "لم يتحقق الهدف بعد — لا يمكن المطالبة" };
    }
    if (input.amount <= 0) return { error: "مبلغ المطالبة غير صالح" };
    if (input.amount > perf.remaining_incentive + 0.01) {
      return { error: `المبلغ يتجاوز المتبقي القابل للمطالبة (${perf.remaining_incentive.toLocaleString("en-US")} ر.س)` };
    }

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const code = "INC-" + new Date().getFullYear() + "-" + Date.now().toString().slice(-6);
    const { data, error } = await supabase.from("incentive_claims").insert({
      code, program_id: input.program_id, supplier_id: program.supplier_id,
      amount: input.amount, mode: input.mode,
      reference: input.reference || null, notes: input.notes || null,
      status: "pending_approval", requested_by: userId,
    }).select().maybeSingle();
    if (error) return { error: error.message };
    return { data: data ? toClaim(data) : undefined };
  },

  async approveClaim(id: string): Promise<{ error?: string }> {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("incentive_claims")
      .update({ status: "approved", approved_by: userId, approved_at: new Date().toISOString() })
      .eq("id", id);
    return { error: error?.message };
  },

  async rejectClaim(id: string, reason?: string): Promise<{ error?: string }> {
    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const { error } = await supabase.from("incentive_claims")
      .update({ status: "rejected", rejected_by: userId, rejected_at: new Date().toISOString(), rejection_reason: reason || null })
      .eq("id", id);
    return { error: error?.message };
  },
};
