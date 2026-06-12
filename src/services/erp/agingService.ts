// خدمة تقرير أعمار الديون (Aging) — معيار SAP Open Items
import { supabase } from "@/integrations/supabase/client";

export interface AgingRow {
  partner_id: string;
  partner_code: string | null;
  partner_name: string;
  current_amount: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_120: number;
  over_120: number;
  total_outstanding: number;
  open_items_count: number;
}

export async function getAging(
  kind: "vendor" | "customer", asOf?: string
): Promise<AgingRow[]> {
  const { data, error } = await supabase.rpc("partner_aging" as any, {
    p_kind: kind,
    p_as_of: asOf || null,
  });
  if (error) { console.error(error); return []; }
  return (data ?? []) as AgingRow[];
}

export const fmtSAR = (n: number) =>
  new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(n || 0);