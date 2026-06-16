/**
 * SequenceService — طبقة خدمة محرّك الترقيم المركزي.
 *
 * يستدعي الدالة atomic get_next_document_number() في DB.
 * company-aware عبر companyContext (لا UUID مكتوب).
 *
 * المسؤوليات: توليد رقم، معاينة التالي، تحميل التكوين، تعديل، إعادة ضبط، السجلّ.
 */

import { supabase } from "@/integrations/supabase/client";
import { companyContext } from "./companyContext";

// أنواع المستندات المعروفة (تتوسّع مع التعميم)
export type DocumentType =
  | "SALES_INVOICE" | "PURCHASE_INVOICE" | "JOURNAL_ENTRY"
  | "CUSTOMER_RECEIPT" | "VENDOR_PAYMENT"
  | string;

export interface DocumentSequence {
  id: string;
  company_id: string;
  branch_id: string | null;
  document_type: string;
  document_name: string;
  prefix: string;
  suffix: string;
  current_number: number;
  number_length: number;
  yearly_reset: boolean;
  monthly_reset: boolean;
  include_year: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SequenceLog {
  id: string;
  generated_number: string;
  document_type: string;
  document_id: string | null;
  generated_by: string | null;
  generated_at: string;
  status: string;
}

export const sequenceService = {
  /**
   * توليد الرقم التالي لمستند (atomic، عبر دالة DB).
   * هذا هو المدخل الوحيد الذي يجب أن تستخدمه كل الوحدات.
   */
  async generate(
    documentType: DocumentType,
    opts?: { branchId?: string | null; documentDate?: string; documentId?: string }
  ): Promise<string> {
    const companyId = await companyContext.getCompanyId();
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.rpc("get_next_document_number", {
      p_company_id: companyId,
      p_document_type: documentType,
      p_branch_id: opts?.branchId ?? null,
      p_document_date: opts?.documentDate ?? new Date().toISOString().slice(0, 10),
      p_generated_by: userData?.user?.id ?? null,
      p_document_id: opts?.documentId ?? null,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * معاينة الرقم التالي دون استهلاكه (للعرض فقط — لا يحدّث العدّاد).
   * يبني الرقم محلياً من التكوين الحالي.
   */
  async preview(documentType: DocumentType, opts?: { branchId?: string | null }): Promise<string> {
    const seq = await this.getConfig(documentType, opts?.branchId ?? null);
    if (!seq) throw new Error(`لا يوجد تسلسل للنوع ${documentType}`);
    const year = new Date().getFullYear();
    const next = seq.current_number + 1;
    const numText = String(next).padStart(seq.number_length, "0");
    return seq.include_year
      ? `${seq.prefix}-${year}-${numText}${seq.suffix}`
      : `${seq.prefix}-${numText}${seq.suffix}`;
  },

  /** تكوين تسلسل نوع معيّن */
  async getConfig(documentType: DocumentType, branchId: string | null = null): Promise<DocumentSequence | null> {
    const companyId = await companyContext.getCompanyId();
    let q = supabase
      .from("document_sequences")
      .select("*")
      .eq("company_id", companyId)
      .eq("document_type", documentType);
    q = branchId ? q.eq("branch_id", branchId) : q.is("branch_id", null);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return (data as DocumentSequence) ?? null;
  },

  /** كل تسلسلات الشركة الحالية */
  async list(): Promise<DocumentSequence[]> {
    const companyId = await companyContext.getCompanyId();
    const { data, error } = await supabase
      .from("document_sequences")
      .select("*")
      .eq("company_id", companyId)
      .order("document_type", { ascending: true });
    if (error) throw error;
    return (data ?? []) as DocumentSequence[];
  },

  /** تعديل تكوين تسلسل (البادئة، الطول، التصفير...) */
  async updateConfig(id: string, patch: Partial<DocumentSequence>): Promise<DocumentSequence> {
    const payload = { ...patch, updated_at: new Date().toISOString() };
    delete (payload as any).id;
    delete (payload as any).company_id;
    delete (payload as any).current_number; // لا يُعدّل العدّاد عبر هذا المسار
    const { data, error } = await supabase
      .from("document_sequences")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data as DocumentSequence;
  },

  /**
   * إعادة ضبط العدّاد (إجراء حسّاس — للمسؤول فقط).
   * يُستخدم بحذر شديد (قد يسبّب تكرار أرقام إن وُجدت مستندات سابقة).
   */
  async resetCounter(id: string, toValue: number = 0): Promise<void> {
    const { error } = await supabase
      .from("document_sequences")
      .update({ current_number: toValue, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
  },

  /** سجلّ الأرقام المُولّدة لنوع معيّن */
  async getLogs(documentType?: DocumentType, limit = 50): Promise<SequenceLog[]> {
    const companyId = await companyContext.getCompanyId();
    let q = supabase
      .from("document_sequence_logs")
      .select("id, generated_number, document_type, document_id, generated_by, generated_at, status")
      .eq("company_id", companyId)
      .order("generated_at", { ascending: false })
      .limit(limit);
    if (documentType) q = q.eq("document_type", documentType);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SequenceLog[];
  },
};
