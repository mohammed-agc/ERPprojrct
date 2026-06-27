/**
 * XadesSigner — S3.3 — ZATCA XAdES signature assembler.
 *
 * Architectural role (AD-002): PURE COMPOSER. Zero cryptographic logic.
 * It orchestrates already-proven authorities and splices the result into the
 * UBLExtensions stub left by XmlBuilder (S2.1). It does NOT call XmlBuilder
 * (Reference#1 circularity); the orchestrator (S5) calls XmlBuilder, then this.
 *
 * Input  : unsigned UBL XML string (with ext:UBLExtensions / cac:Signature /
 *          QR AdditionalDocumentReference present — exactly the Reference#1
 *          transform exclusions).
 * Output : SignedXmlResult (signed XML + the three QR-bound values, ready for S4).
 *
 * SSOT discipline:
 *   - invoiceHashBytes / invoiceHashB64 : HashProvider (AD-009A)
 *   - certificate fields                : CertificateLoader (S3.4)
 *   - SignedProperties bytes + digest   : SignedPropertiesProvider (S3.2)
 *   - SignatureValue (DER, base64)      : VaultProvider (ADR-024/025)
 *
 * TD-012-001: signingTime is supplied by the caller until AD-012 (ClockProvider)
 * is implemented. XadesSigner intentionally does NOT own time generation.
 */

import type { InvoiceHashB64 } from '../hash/HashProvider';
import type { SignatureValueB64, CertificateB64, CredentialId } from '../vault/VaultProvider';

/**
 * Transitional ISO-8601 signing-time type. EGS clock instant, NO timezone suffix,
 * e.g. "2025-02-27T20:52:40". Becomes `IsoDateTime` once AD-012 lands — a one-line
 * change here leaves every consumer untouched.
 */
export type SigningTimeIso = string;

export interface SignXmlRequest {
  /** Unsigned UBL XML string from XmlBuilder (S2.1). */
  readonly unsignedXml: string;
  /** Vault credential reference for the signing key/cert. */
  readonly credentialId: CredentialId;
  /** EGS signing instant (TD-012-001). */
  readonly signingTime: SigningTimeIso;
}

export interface SignedXmlResult {
  /** Signed UBL XML — signature block spliced into the UBLExtensions stub. */
  readonly signedXml: string;
  /** Reference#1 invoice hash, base64 44ch — QR Tag 6. */
  readonly invoiceHashB64: InvoiceHashB64;
  /** ECDSA(DER) signature, base64 — QR Tag 7. */
  readonly signatureValueB64: SignatureValueB64;
  /** Signing certificate, base64 (DER, no PEM markers) — QR Tag 8. */
  readonly certificateB64: CertificateB64;
}

export type XadesSignerErrorCode =
  | 'REFERENCE1_MISMATCH'   // derived invoice hash failed the golden-shape invariant
  | 'STUB_NOT_FOUND'        // UBLExtensions stub absent in unsigned XML
  | 'SIGNING_FAILED';       // vault sign failed

export class XadesSignerError extends Error {
  constructor(
    public readonly code: XadesSignerErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'XadesSignerError';
  }
}

export interface XadesSigner {
  readonly name: string;
  signXml(request: SignXmlRequest): Promise<SignedXmlResult>;
}