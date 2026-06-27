/**
 * QrTlvProvider — the ZATCA Phase 2 QR code authority.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ONE AUTHORITY PER CONCERN (AD-009A v2):
 *
 *   This is a PURE ENCODER. Its only concern is:  QrInput → TLV bytes → base64.
 *   It does NOT know about UBL, XmlBuilder, signing, the database, Supabase, or
 *   any invoice entity. It performs NO business derivation: every field of
 *   QrInput is already the FINAL representation required by its TLV tag.
 *
 *   Input validation (missing VAT, missing seller name, missing hash, …) is the
 *   concern of the INPUT layer (the QR assembler), which throws ZatcaInputError
 *   BEFORE calling build(). This provider assumes its input is valid and raises
 *   only encoding-specific errors (QrTlvError).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Architectural references:
 * - AD-009A v2: One Authority Per Concern
 * - AD-012 v2: Provider pattern for DI + direct golden-testability
 *
 * THE TLV ENCODING (golden-verified, byte-for-byte vs the reference QR):
 *
 *   Each entry is  [tag:1 byte][length:1 byte][value:`length` bytes],
 *   concatenated in tag order, then base64-encoded.
 *
 *   Tags 1–7 carry the ASCII bytes of a STRING:
 *     1 sellerName        2 vatNumber         3 timestamp (YYYY-MM-DDTHH:mm:ssZ)
 *     4 taxInclusiveAmount (e.g. "4.60")      5 taxTotal (e.g. "0.60")
 *     6 invoiceHashB64    — the 44-char base64 hash STRING (NOT raw hash bytes)
 *     7 signatureValueB64 — the 96-char base64 signature STRING (NOT raw bytes)
 *
 *   Tags 8–9 carry RAW DER bytes (NOT base64 text):
 *     8 publicKeyDer      — SubjectPublicKeyInfo DER (88 bytes, secp256k1)
 *     9 certSignatureDer  — certificate signature value, raw DER ECDSA (71 bytes)
 *
 *   Tag gating by invoice type (golden-verified):
 *     Standard  (isSimplified = false) ⇒ Tags 1–8 (NO Tag 9).
 *     Simplified(isSimplified = true ) ⇒ Tags 1–9.
 *
 *   Length is a SINGLE byte: every value is < 256. A value ≥ 256 cannot be
 *   length-encoded and is a QrTlvError('TLV_LENGTH_TOO_LARGE').
 */

/**
 * The FINAL representation of every QR tag. No raw/derivable fields:
 * strings are already formatted; DER fields are already raw bytes.
 */
export interface QrInput {
  /** Tag 1 — seller registration name (ASCII string). */
  readonly sellerName: string;
  /** Tag 2 — seller VAT registration number (ASCII string). */
  readonly vatNumber: string;
  /** Tag 3 — issue timestamp, "YYYY-MM-DDTHH:mm:ssZ" (UTC, no milliseconds). */
  readonly timestamp: string;
  /** Tag 4 — invoice total incl. VAT, formatted exactly as in the XML (toFixed(2)). */
  readonly taxInclusiveAmount: string;
  /** Tag 5 — total VAT, formatted exactly as in the XML (toFixed(2)). */
  readonly taxTotal: string;
  /** Tag 6 — invoice hash, the base64 STRING (44 chars). */
  readonly invoiceHashB64: string;
  /** Tag 7 — ECDSA signature, the base64 STRING (96 chars). */
  readonly signatureValueB64: string;
  /** Tag 8 — SubjectPublicKeyInfo DER, raw bytes. */
  readonly publicKeyDer: Uint8Array;
  /** Tag 9 — certificate signature value, raw DER bytes (used only when simplified). */
  readonly certSignatureDer: Uint8Array;
  /** Tag gate — SSOT is the domain invoice type (metadata.dbInvoiceType === 'simplified'). */
  readonly isSimplified: boolean;
}

/** Errors raised by QrTlvProvider — ENCODING concerns only (never input validation). */
export class QrTlvError extends Error {
  public readonly code: QrTlvErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(code: QrTlvErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'QrTlvError';
    this.code = code;
    this.context = context;

    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (t: object, c: unknown) => void })
        .captureStackTrace(this, QrTlvError);
    }
  }
}

export type QrTlvErrorCode =
  | 'TLV_LENGTH_TOO_LARGE' // a value is ≥ 256 bytes and cannot fit a single length byte
  | 'QR_ENCODING_FAILED';  // unexpected failure while encoding

/**
 * QrTlvProvider interface.
 *
 * MUST:
 * 1. Be pure: same QrInput in → same base64 out.
 * 2. Perform NO business derivation and NO input validation.
 * 3. Raise only QrTlvError (encoding concerns).
 */
export interface QrTlvProvider {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Encode QrInput as a ZATCA QR TLV blob and return its base64 string,
   * ready to embed in <cbc:EmbeddedDocumentBinaryObject>.
   *
   * @throws QrTlvError on an un-encodable input (e.g. a value ≥ 256 bytes).
   */
  build(input: QrInput): string;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type QrTlvProviderFactory = () => QrTlvProvider;

/**
 * NodeQrTlvProvider — TLV encoder over Node Buffers.
 */
export class NodeQrTlvProvider implements QrTlvProvider {
  readonly implementationName = 'node Buffer TLV encoder';

  build(input: QrInput): string {
    try {
      const enc = new TextEncoder();

      // Tags 1–7 are the ASCII/UTF-8 bytes of their string value.
      // Tags 8–9 are raw DER bytes already.
      const entries: Array<{ tag: number; value: Uint8Array }> = [
        { tag: 1, value: enc.encode(input.sellerName) },
        { tag: 2, value: enc.encode(input.vatNumber) },
        { tag: 3, value: enc.encode(input.timestamp) },
        { tag: 4, value: enc.encode(input.taxInclusiveAmount) },
        { tag: 5, value: enc.encode(input.taxTotal) },
        { tag: 6, value: enc.encode(input.invoiceHashB64) },
        { tag: 7, value: enc.encode(input.signatureValueB64) },
        { tag: 8, value: input.publicKeyDer },
      ];

      // Tag 9 (certificate signature stamp) is present for SIMPLIFIED invoices only.
      if (input.isSimplified) {
        entries.push({ tag: 9, value: input.certSignatureDer });
      }

      const chunks: Buffer[] = [];
      for (const { tag, value } of entries) {
        if (value.length > 0xff) {
          throw new QrTlvError(
            'TLV_LENGTH_TOO_LARGE',
            `QR TLV value for tag ${tag} is ${value.length} bytes; single-byte length supports max 255`,
            { tag, length: value.length }
          );
        }
        chunks.push(Buffer.from([tag, value.length]));
        chunks.push(Buffer.from(value));
      }

      return Buffer.concat(chunks).toString('base64');
    } catch (err) {
      if (err instanceof QrTlvError) throw err;
      throw new QrTlvError('QR_ENCODING_FAILED', 'QR TLV encoding failed', {
        cause: (err as Error).message,
      });
    }
  }
}
