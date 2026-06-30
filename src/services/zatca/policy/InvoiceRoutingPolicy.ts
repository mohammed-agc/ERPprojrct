/**
 * InvoiceRoutingPolicy — the DOMAIN POLICY that answers one question:
 *
 *   "Which ZATCA submission path does this invoice take?"
 *
 *     standard   (B2B) → clearance   (ZATCA validates AND returns the invoice
 *                                     before it may be issued to the buyer)
 *     simplified (B2C) → reporting   (issued immediately, reported within 24h)
 *
 * This is NOT owned by the SubmissionCoordinator — the coordinator EXECUTES a
 * target, it never CHOOSES one (same discipline as CredentialResolver not
 * choosing a credential type, ProjectionWriter not deriving status). The
 * controller / application service composes this policy BEFORE the coordinator.
 *
 * Pure: no DB, no I/O. An unknown invoice type RAISES — never a silent default,
 * because routing the wrong path (reporting a B2B invoice that must be cleared)
 * is a compliance error, not a cosmetic one.
 */

import type { ComplianceTarget } from '../submission/SubmissionCoordinator';

/** The invoice types this policy routes (matches invoices.invoice_type). */
export type InvoiceType = 'standard' | 'simplified';

export class InvoiceRoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceRoutingError';
  }
}

/**
 * Map an invoice type to its live submission target.
 * @throws InvoiceRoutingError for any unrecognized type (no silent default).
 */
export function deriveSubmissionTarget(invoiceType: string): ComplianceTarget {
  switch (invoiceType) {
    case 'standard':
      return 'clearance';
    case 'simplified':
      return 'reporting';
    default:
      throw new InvoiceRoutingError(
        `InvoiceRoutingPolicy: cannot route unknown invoice_type "${invoiceType}" ` +
          `(expected 'standard' or 'simplified')`
      );
  }
}
