/**
 * SubmissionStatusPolicy — the DOMAIN POLICY that answers one question:
 *
 *   "Given the facts of a ZATCA submission, what is the correct projected
 *    zatca_status?"
 *
 * This is NOT owned by any Writer. The SubmissionProjectionWriter writes
 * invoices.zatca_status; the ProjectionReconciler derives the EXPECTED status
 * from the latest submission. Both ask THIS policy — neither imports the other,
 * and neither re-implements the rules. (Same discipline as CredentialResolver
 * not owning lifecycle, ProjectionWriter not owning the chain, append not owning
 * retry: here, no Writer owns status derivation.)
 *
 * Pure: no DB, no I/O. Operates on neutral SubmissionFacts so it is coupled to
 * neither the HTTP response shape nor the submission_log table shape — each
 * caller maps its own source into SubmissionFacts.
 */

/** CHECK-constrained domain of invoices.zatca_status that a submission can set. */
export type SubmissionDerivedStatus = 'reported' | 'cleared' | 'rejected';

/**
 * Neutral facts of one submission outcome. Optional throughout: absence means
 * "this dimension was not reported", never "false".
 */
export interface SubmissionFacts {
  readonly validationStatus?: string; // PASS | WARNING | ERROR | ...
  readonly clearanceStatus?: string | null; // CLEARED | NOT_CLEARED | ...
  readonly reportingStatus?: string | null; // REPORTED | NOT_REPORTED | ...
}

/**
 * The richer result, so callers gain fields without a contract break when ZATCA
 * rules grow (warningCount, responseCode, …). `status` is null for an
 * indeterminate disposition — callers must NOT force a value in that case.
 */
export interface SubmissionProjectionResult {
  /** The derived read-model status, or null when indeterminate (do not write). */
  readonly status: SubmissionDerivedStatus | null;
}

/**
 * Derive the submission projection from neutral facts.
 *
 * Order matters: a validation ERROR is 'rejected' regardless of any clearance
 * value; otherwise CLEARED → cleared, REPORTED → reported; anything else is
 * indeterminate (null → leave the read-model untouched).
 */
export function deriveSubmissionProjection(
  facts: SubmissionFacts
): SubmissionProjectionResult {
  if (facts.validationStatus === 'ERROR') return { status: 'rejected' };
  if (facts.clearanceStatus === 'CLEARED') return { status: 'cleared' };
  if (facts.reportingStatus === 'REPORTED') return { status: 'reported' };
  return { status: null };
}

/**
 * Convenience accessor for the common case (callers that only need the status).
 * Identical rules as deriveSubmissionProjection — same single source.
 */
export function deriveSubmissionStatus(
  facts: SubmissionFacts
): SubmissionDerivedStatus | null {
  return deriveSubmissionProjection(facts).status;
}

/**
 * Map a zatca_submission_log row into neutral SubmissionFacts. The log stores
 * the disposition in zatca_status (validation) + zatca_response_code (the
 * CLEARED/REPORTED code) rather than separate clearance/reporting columns, so
 * the Reconciler reconstructs the facts from those.
 */
export interface SubmissionLogFactsRow {
  readonly zatca_status?: string | null; // validation status (PASS/WARNING/ERROR)
  readonly zatca_response_code?: string | null; // CLEARED | REPORTED | NOT_CLEARED | ...
  readonly success?: boolean | null;
}

export function submissionFactsFromLogRow(
  row: SubmissionLogFactsRow
): SubmissionFacts {
  const code = row.zatca_response_code ?? undefined;
  return {
    validationStatus: row.zatca_status ?? undefined,
    clearanceStatus: code === 'CLEARED' ? 'CLEARED' : undefined,
    reportingStatus: code === 'REPORTED' ? 'REPORTED' : undefined,
  };
}
