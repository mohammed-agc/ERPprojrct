/**
 * CertificateLoader — extracts the certificate-derived fields that the XAdES
 * signature needs, from a base64-encoded X.509 certificate.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * SCOPE — what this is, and what it is NOT (per One Authority Per Concern):
 *
 *   This loader EXTRACTS fields for SIGNING. It does NOT judge the certificate.
 *   Whether a certificate is policy-acceptable (curve, expiry, key size) is the
 *   concern of CertificatePolicyValidator, a SEPARATE authority. The two share
 *   the same parsing tool (node:crypto X509Certificate) but not their purpose.
 *
 *   - CertificatePolicyValidator: "is this certificate allowed?"  → PolicyResult
 *   - CertificateLoader:          "give me its XAdES fields"       → CertificateFields
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Architectural references:
 * - AD-009A v2: One Authority Per Concern
 * - AD-012 v2: Provider pattern for DI
 * - ADR-025 / ADR-026: signing pipeline (this feeds SignedProperties → XadesSigner)
 *
 * The four fields, each verified byte-for-byte against the golden reference
 * (Standard_Invoice_Signed.xml, issuer CN=PRZEINVOICESCA4-CA):
 *
 *   certificateB64    — the certificate as base64 (DER, no PEM markers), passed
 *                       through unchanged. Used in <ds:X509Certificate> (KeyInfo).
 *
 *   certificateDigest — SHA-256 of the certificateB64 STRING (as ASCII bytes),
 *                       base64-of-hex encoded (88 chars). Used in
 *                       <xades:CertDigest><ds:DigestValue>.
 *                       ⚠️ This hashes the base64 STRING, NOT the DER bytes.
 *                       Verified against the golden reference. (HashProvider's
 *                       CertificateHashB64 comment still says "DER bytes" — that
 *                       comment is wrong; see ADR. This loader does the correct
 *                       thing regardless of the stale comment.)
 *
 *   issuerName        — RFC 2253 / 4514 form, leaf-to-root, comma+space joined,
 *                       no spaces around '='. For the golden cert:
 *                       "CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local"
 *                       Used in <ds:X509IssuerName>.
 *
 *   serialNumber      — the certificate serial as a DECIMAL string (via BigInt;
 *                       the value exceeds Number.MAX_SAFE_INTEGER). For the
 *                       golden cert: "379112742831380471835263969587287663520528387"
 *                       Used in <ds:X509SerialNumber>.
 */

import type { CertificateB64 } from '../vault/VaultProvider';
import type { CertificateHashB64 } from '../hash/HashProvider';

/**
 * The certificate-derived fields required to assemble the XAdES signature.
 */
export interface CertificateFields {
  /** Certificate as base64 (DER, no PEM markers) — passthrough for KeyInfo. */
  readonly certificateB64: CertificateB64;

  /** SHA-256 of the base64 string (as ASCII), base64-of-hex (88 chars). */
  readonly certificateDigest: CertificateHashB64;

  /** Issuer DN, RFC 2253 leaf-to-root, comma+space joined. */
  readonly issuerName: string;

  /** Certificate serial number as a decimal string (BigInt-derived). */
  readonly serialNumber: string;
}

/**
 * Errors raised by CertificateLoader.
 */
export class CertificateLoaderError extends Error {
  constructor(
    public readonly code: CertificateLoaderErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CertificateLoaderError';
  }
}

export type CertificateLoaderErrorCode =
  | 'INVALID_CERTIFICATE'   // certificate could not be parsed
  | 'EXTRACTION_FAILED';    // parsed, but a required field could not be derived

/**
 * CertificateLoader interface.
 *
 * MUST:
 * 1. Use the same X.509 parsing tool as the policy validator (node:crypto).
 * 2. Be pure: same certificate in → same fields out.
 * 3. Delegate all hashing to the injected HashProvider (no inline crypto.createHash).
 * 4. Throw CertificateLoaderError on unparseable input or a field that cannot be derived.
 */
export interface CertificateLoader {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Extract the XAdES certificate fields from a base64 certificate.
   *
   * @param certificateB64 - Certificate as base64 (DER, no PEM markers), as
   *                          returned by VaultProvider.getCertificate().
   * @returns CertificateFields (all four fields, golden-verified).
   * @throws CertificateLoaderError on parse failure or extraction failure.
   */
  load(certificateB64: CertificateB64): CertificateFields;
}

/**
 * Factory function signature for dependency injection (per AD-012 v2).
 */
export type CertificateLoaderFactory = () => CertificateLoader;
