import { supabase } from "@/integrations/supabase/client";
import { salesVehicleStatus } from "@/services/erp/salesVehicleStatus";

/**
 * Credit Notes service — formal reversal documents for posted sales invoices.
 *
 * On post, in addition to inserting the CN header + lines, the service:
 *   1. Calls the `post_credit_note_journal` RPC to create an authoritative
 *      journal entry (debit returns/output VAT, credit AR) so customer
 *      balances are sourced from the GL rather than derived.
 *   2. Calls `salesVehicleStatus.releaseForCreditNote` to revert reserved/sold
 *      vehicles back to `available` (delivered units require a separate
 *      goods-return workflow and are NOT silently re-entered into stock).
 */

export type CnType = "cancellation" | "return" | "price_adjustment" | "discount";

type CnLineInput = {
  description: string;
  quantity: number;
  unit_price: number;
  vat_pct: number;
  vehicle_id?: string | null;
};

async function finalizeCreditNote(cnId: string) {
  let journalEntryId: string | null = null;
  try {
    const { data, error } = await supabase.rpc("post_credit_note_journal" as any, { p_cn_id: cnId });
    if (error) throw error;
    journalEntryId = (data as string) ?? null;
  } catch (e) {
    // Re-throw so the caller can surface the failure; CN exists but JE failed
    throw new Error(
      `تم إنشاء الإشعار الدائن لكنّ ترحيل القيد فشل: ${(e as any)?.message ?? e}`,
    );
  }

  const inventory = await salesVehicleStatus.releaseForCreditNote(cnId).catch(() => ({
    released: [] as string[],
    blockedDelivered: [] as string[],
  }));

  return { journalEntryId, inventory };
}

export const creditNotesService = {
  /**
   * Issue a credit note that fully reverses the remaining exposure of an invoice.
   * Returns the created credit note id, or null if invoice is already fully credited.
   */
  async issueFullReversal(
    invoiceId: string,
    reason = "invoice_cancellation",
    notes?: string,
    cnType: CnType = "cancellation",
  ) {
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, customer_id, total, vat_amount, subtotal, credited_amount, status, invoice_no, sales_order_id")
      .eq("id", invoiceId)
      .single();
    if (invErr) throw invErr;
    if (!inv) throw new Error("الفاتورة غير موجودة");

    const total = Number(inv.total);
    const credited = Number(inv.credited_amount ?? 0);
    const remaining = Number((total - credited).toFixed(2));
    if (remaining <= 0) return null;

    const ratio = total > 0 ? remaining / total : 1;
    const cnSubtotal = Number((Number(inv.subtotal) * ratio).toFixed(2));
    const cnVat = Number((Number(inv.vat_amount) * ratio).toFixed(2));

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const cnNo = "CN-" + Date.now().toString().slice(-10);

    const { data: cn, error } = await supabase
      .from("credit_notes")
      .insert({
        credit_note_no: cnNo,
        invoice_id: invoiceId,
        customer_id: inv.customer_id,
        reason,
        notes: notes ?? `إلغاء الفاتورة ${inv.invoice_no}`,
        subtotal: cnSubtotal,
        vat_amount: cnVat,
        total: remaining,
        status: "posted",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    // Pull vehicle ids from the originating SO so each credited "line" can carry one.
    let soVehicles: Array<{ vehicle_id: string | null }> = [];
    if (inv.sales_order_id) {
      const { data } = await supabase
        .from("sales_order_lines")
        .select("vehicle_id, line_no")
        .eq("order_id", inv.sales_order_id)
        .order("line_no");
      soVehicles = data ?? [];
    }

    if (soVehicles.length > 0) {
      await supabase.from("credit_note_lines").insert(
        soVehicles.map((sv, i) => ({
          credit_note_id: cn.id,
          line_no: i + 1,
          description: `عكس قيمة الفاتورة ${inv.invoice_no} — مركبة`,
          quantity: 1,
          unit_price: Number((cnSubtotal / soVehicles.length).toFixed(2)),
          vat_pct: 15,
          line_total: Number((remaining / soVehicles.length).toFixed(2)),
          vehicle_id: sv.vehicle_id,
        })),
      );
    } else {
      await supabase.from("credit_note_lines").insert({
        credit_note_id: cn.id,
        line_no: 1,
        description: `عكس قيمة الفاتورة ${inv.invoice_no}`,
        quantity: 1,
        unit_price: cnSubtotal,
        vat_pct: 15,
        line_total: remaining,
      });
    }

    await finalizeCreditNote(cn.id);
    return cn.id as string;
  },

  /**
   * Create a credit note from caller-provided lines (custom reason / partial / line-level CN).
   * Lines accept an optional `vehicle_id` for inventory release.
   */
  async issueFromLines(args: {
    invoiceId: string;
    customerId: string;
    reason: string;
    notes?: string;
    lines: CnLineInput[];
  }) {
    const subtotal = args.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const vat = args.lines.reduce(
      (s, l) => s + l.quantity * l.unit_price * (l.vat_pct / 100),
      0,
    );
    const total = Number((subtotal + vat).toFixed(2));
    if (total <= 0) throw new Error("إجمالي الإشعار الدائن يجب أن يكون أكبر من صفر");

    const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
    const cnNo = "CN-" + Date.now().toString().slice(-10);
    const { data: cn, error } = await supabase
      .from("credit_notes")
      .insert({
        credit_note_no: cnNo,
        invoice_id: args.invoiceId,
        customer_id: args.customerId,
        reason: args.reason,
        notes: args.notes ?? null,
        subtotal: Number(subtotal.toFixed(2)),
        vat_amount: Number(vat.toFixed(2)),
        total,
        status: "posted",
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;

    await supabase.from("credit_note_lines").insert(
      args.lines.map((l, i) => ({
        credit_note_id: cn.id,
        line_no: i + 1,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        vat_pct: l.vat_pct,
        line_total: Number((l.quantity * l.unit_price * (1 + l.vat_pct / 100)).toFixed(2)),
        vehicle_id: l.vehicle_id ?? null,
      })),
    );

    const finalize = await finalizeCreditNote(cn.id);
    return {
      cnId: cn.id as string,
      journalEntryId: finalize.journalEntryId,
      inventory: finalize.inventory,
    };
  },

  async listForInvoice(invoiceId: string) {
    const { data, error } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("cn_date", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
};
