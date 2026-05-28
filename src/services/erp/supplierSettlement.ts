/**
 * Supplier Settlement — RESERVED ARCHITECTURE (v1.3 placeholder)
 * --------------------------------------------------------------
 * This module is intentionally a skeleton. Per Governance v1.3 the workflow
 * reserves space for a future Supplier Settlement engine that consolidates:
 *
 *   - Opening Balance
 *   - Supplier Invoices
 *   - Payments
 *   - Credit Utilization
 *   - Earned Incentives
 *   - Used Incentives
 *   - Closing Balance
 *
 * No implementation now. Do NOT import these functions from feature code
 * until the real backend lands.
 */

export interface SupplierSettlementLine {
  at: string;
  kind:
    | "opening"
    | "invoice"
    | "payment"
    | "credit_used"
    | "incentive_earned"
    | "incentive_used"
    | "adjustment";
  reference?: string;
  debit: number;
  credit: number;
  notes?: string;
}

export interface SupplierSettlementSnapshot {
  supplier_id: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  invoices_total: number;
  payments_total: number;
  credit_used: number;
  incentives_earned: number;
  incentives_used: number;
  closing_balance: number;
  lines: SupplierSettlementLine[];
}

const NOT_IMPLEMENTED = "Supplier Settlement engine is reserved for future implementation.";

export const supplierSettlementService = {
  snapshot(_supplierId: string, _from?: string, _to?: string): SupplierSettlementSnapshot {
    throw new Error(NOT_IMPLEMENTED);
  },
  recordIncentiveEarned(_supplierId: string, _amount: number, _ref?: string) {
    throw new Error(NOT_IMPLEMENTED);
  },
  applyIncentiveOffset(_supplierId: string, _invoiceId: string, _amount: number) {
    throw new Error(NOT_IMPLEMENTED);
  },
};
