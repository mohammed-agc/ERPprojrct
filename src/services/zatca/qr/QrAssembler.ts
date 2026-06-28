/**
 * QrAssembler — the INPUT layer that derives a QrInput for the QR encoder.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ONE AUTHORITY PER CONCERN (AD-009A v2):
 *
 *   This is a PURE TRANSFORM with ZERO external dependencies. It maps already-
 *   available values into the final QrInput shape and validates their presence.
 *   It does NOT parse certificates, does NOT call the signer, does NOT read the
 *   database, does NOT touch UBL XML, and does NOT know invoice-type codes.
 *
 *   Certificate byte-fields (publicKeyDer, certSignatureDer) arrive ALREADY
 *   EXTRACTED in the input — promoted from CertificateLoader once, upstream
 *   (Parse Once, Consume Many). This assembler never re-parses the certificate.
 *
 *   The Tag-9 gate (isSimplified) is passed in by the caller (S5) from the
 *   domain invoice type (metadata.dbInvoiceType === 'simplified'); this
 *   assembler does not derive it.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Responsibility split (locked):
 *   - Missing/blank inputs → ZatcaInputError (this layer owns input validation).
 *   - Encoding concerns     → QrTlvProvider raises QrTlvError (separate authority).
 *
 * Derivations (each verified byte-for-byte against the golden QR):
 *   Tag 1 sellerName         = ubl.seller.registrationName
 *   Tag 2 vatNumber          = ubl.seller.vatNumber            (guarded: not null)
 *   Tag 3 timestamp          = `${ubl.issueDate}T${ubl.issueTime}Z`
 *   Tag 4 taxInclusiveAmount = ubl.totals.taxInclusiveAmount.toFixed(2)
 *   Tag 5 taxTotal           = ubl.totalTaxAmount.toFixed(2)
 *   Tag 6 invoiceHashB64     = signed.invoiceHashB64
 *   Tag 7 signatureValueB64  = signed.signatureValueB64
 *   Tag 8 publicKeyDer       = input.publicKeyDer             (raw, from CertificateInfo)
 *   Tag 9 certSignatureDer   = input.certSignatureDer         (raw, simplified only)
 *
 * Architectural references:
 * - AD-009A v2: One Authority Per Concern
 * - AD-011 v2: typed INPUT errors (ZatcaInputError)
 * - AD-012 v2: testable in isolation with explicit values
 * - TD-013: certificate fields are promoted (not re-parsed) — honoured here by
 *           accepting publicKeyDer/certSignatureDer in the input.
 */

import type { UblInvoice } from '../xmlBuilder.types';
import type { SignedXmlResult } from '../xades/XadesSigner';
import { ZatcaInputError, type ZatcaInputErrorCode } from '../errors/ZatcaInputError';
import type { QrInput } from './QrTlvProvider';

/**
 * Everything QrAssembler needs, with certificate byte-fields already extracted.
 */
export interface QrAssemblyInput {
  /** Mapped UBL invoice (source of Tags 1–5). */
  readonly ubl: UblInvoice;
  /** Result of signing (source of Tags 6–7). */
  readonly signed: SignedXmlResult;
  /** Tag 8 — SubjectPublicKeyInfo DER, raw bytes (from CertificateInfo, upstream). */
  readonly publicKeyDer: Uint8Array;
  /** Tag 9 — certificate signature value, raw DER bytes (used only when simplified). */
  readonly certSignatureDer: Uint8Array;
  /** Tag-9 gate — passed by S5 from metadata.dbInvoiceType === 'simplified'. */
  readonly isSimplified: boolean;
}

export interface QrAssembler {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Derive a fully-formed QrInput from the assembly input.
   *
   * @throws ZatcaInputError when a required input is missing or blank.
   */
  assemble(input: QrAssemblyInput): QrInput;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type QrAssemblerFactory = () => QrAssembler;

/**
 * NodeQrAssembler — the default pure transform.
 */
export class NodeQrAssembler implements QrAssembler {
  readonly implementationName = 'pure QrInput assembler';

  assemble(input: QrAssemblyInput): QrInput {
    const { ubl, signed, publicKeyDer, certSignatureDer, isSimplified } = input;

    const sellerName = this.requireString(
      ubl.seller.registrationName,
      'SELLER_NAME_MISSING',
      'Seller registration name (QR Tag 1) is missing'
    );
    const vatNumber = this.requireString(
      ubl.seller.vatNumber,
      'SELLER_VAT_MISSING',
      'Seller VAT number (QR Tag 2) is missing'
    );

    const issueDate = this.requireString(
      ubl.issueDate,
      'TIMESTAMP_MISSING',
      'Invoice issue date (QR Tag 3) is missing'
    );
    const issueTime = this.requireString(
      ubl.issueTime,
      'TIMESTAMP_MISSING',
      'Invoice issue time (QR Tag 3) is missing'
    );
    const timestamp = `${issueDate}T${issueTime}Z`;

    const taxInclusiveAmount = this.requireAmount(
      ubl.totals.taxInclusiveAmount,
      'Invoice total incl. VAT (QR Tag 4)'
    );
    const taxTotal = this.requireAmount(
      ubl.totalTaxAmount,
      'Invoice total VAT (QR Tag 5)'
    );

    const invoiceHashB64 = this.requireString(
      signed.invoiceHashB64,
      'INVOICE_HASH_MISSING',
      'Invoice hash (QR Tag 6) is missing'
    );
    const signatureValueB64 = this.requireString(
      signed.signatureValueB64,
      'SIGNATURE_VALUE_MISSING',
      'Signature value (QR Tag 7) is missing'
    );

    if (!publicKeyDer || publicKeyDer.length === 0) {
      throw new ZatcaInputError(
        'CERTIFICATE_MISSING',
        'Certificate public key (QR Tag 8) is missing'
      );
    }
    // certSignatureDer is only consumed for simplified invoices; require it then.
    if (isSimplified && (!certSignatureDer || certSignatureDer.length === 0)) {
      throw new ZatcaInputError(
        'CERTIFICATE_MISSING',
        'Certificate signature (QR Tag 9) is required for simplified invoices'
      );
    }

    return {
      sellerName,
      vatNumber,
      timestamp,
      taxInclusiveAmount,
      taxTotal,
      invoiceHashB64,
      signatureValueB64,
      publicKeyDer,
      certSignatureDer,
      isSimplified,
    };
  }

  /** Require a non-empty string, else ZatcaInputError. */
  private requireString(
    value: string | null | undefined,
    code: ZatcaInputErrorCode,
    message: string
  ): string {
    if (value === null || value === undefined || value.length === 0) {
      throw new ZatcaInputError(code, message);
    }
    return value;
  }

  /**
   * Require a finite number and return it formatted as toFixed(2) — identical to
   * the XML's fmt(). NaN/Infinity would silently produce "NaN"/"Infinity" and
   * corrupt the QR, so they are rejected (No Silent Assumptions).
   */
  private requireAmount(value: number, label: string): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ZatcaInputError('AMOUNT_MISSING', `${label} is missing or not a finite number`, {
        value,
      });
    }
    return value.toFixed(2);
  }
}
