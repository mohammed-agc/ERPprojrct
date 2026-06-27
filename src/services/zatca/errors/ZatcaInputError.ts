/**
 * ZatcaInputError — a typed INPUT-layer error for the ZATCA pipeline.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * OWNERSHIP (per the S4 responsibility boundaries):
 *
 *   This error belongs to the INPUT layer — the place that assembles and
 *   validates the inputs of a pipeline stage (e.g. the QR assembler). It is
 *   thrown when a required input is missing or malformed BEFORE a pure encoder
 *   (such as QrTlvProvider) runs. Pure encoders never throw this; they assume
 *   their input is already valid and raise only encoding-specific errors.
 *
 *   The error name reflects the PROBLEM and its owner (bad input), not the
 *   consumer that happened to surface it. "Seller VAT missing" is an input
 *   problem whether it is caught while building XML, signed properties, or QR —
 *   so it is ZatcaInputError(SELLER_VAT_MISSING), never QrTlvError(...).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Architectural references:
 * - AD-011 v2: typed errors carry actionable context.
 *
 * FORWARD COMPATIBILITY (deliberately minimal — NOT a partial AD-011):
 *   This is a seed. It carries only { code, layer, retryable } today. When
 *   AD-011 is implemented in full, ZatcaInputError will extend a shared
 *   ZatcaError base (adding severity / correlationId / audit metadata) WITHOUT
 *   any change required in its consumers — they only read `code`/`layer`/
 *   `retryable`, which the base will continue to provide.
 */

/** Stable INPUT-layer error codes. Extend as new assemblers need them. */
export type ZatcaInputErrorCode =
  | 'SELLER_VAT_MISSING'
  | 'SELLER_NAME_MISSING'
  | 'TIMESTAMP_MISSING'
  | 'AMOUNT_MISSING'
  | 'INVOICE_HASH_MISSING'
  | 'SIGNATURE_VALUE_MISSING'
  | 'CERTIFICATE_MISSING';

export class ZatcaInputError extends Error {
  /** Stable, machine-readable cause. */
  public readonly code: ZatcaInputErrorCode;

  /** The pipeline layer that owns this error class. */
  public readonly layer = 'INPUT' as const;

  /** INPUT errors are never retryable — the caller must fix the data. */
  public readonly retryable = false as const;

  /** Optional structured context for diagnostics (no PII). */
  public readonly context?: Record<string, unknown>;

  constructor(
    code: ZatcaInputErrorCode,
    message: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ZatcaInputError';
    this.code = code;
    this.context = context;

    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (t: object, c: unknown) => void })
        .captureStackTrace(this, ZatcaInputError);
    }
  }
}
