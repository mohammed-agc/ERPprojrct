import { supabase } from "@/integrations/supabase/client";

/**
 * Credit Notes service — formal reversal documents for posted sales invoices.
 *
 * Cancelling a draft invoice is destructive (status flip). Cancelling a
 * posted/partially_paid/paid invoice must NEVER simply flip status, since
 * the GL has already been impacted. Instead we issue a credit note for the
 * net outstanding (total - already credited) and let the DB trigger update
 * `invoices.credited_amount` and set status to `cancelled` once fully credited.
 */
export const creditNotesService = {
  /**
   * Issue a credit note that fully reverses the remaining exposure of an invoice.
   * Returns the created credit note id, or null if invoice is already fully credited.
   */
  async issueFullReversal(invoiceId: string, reason = "invoice_cancellation", notes?: string) {
    const { data: inv, error: invErr } = await supabase
      .from("invoices")
      .select("id, customer_id, total, vat_amount, subtotal, credited_amount, status, invoice_no")
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

    await supabase.from("credit_note_lines").insert({
      credit_note_id: cn.id,
      line_no: 1,
      description: `عكس قيمة الفاتورة ${inv.invoice_no}`,
      quantity: 1,
      unit_price: cnSubtotal,
      vat_pct: 15,
      line_total: remaining,
    });

    return cn.id as string;
  },

  /**
   * Create a credit note from caller-provided lines (custom reason / partial / line-level CN).
   * Lines are { description, quantity, unit_price, vat_pct }. Totals are computed here.
   */
  async issueFromLines(args: {
    invoiceId: string;
    customerId: string;
    reason: string;
    notes?: string;
    lines: Array<{ description: string; quantity: number; unit_price: number; vat_pct: number }>;
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
      })),
    );
    return cn.id as string;
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

