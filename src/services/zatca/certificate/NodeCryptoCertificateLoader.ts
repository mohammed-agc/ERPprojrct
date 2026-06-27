/**
 * NodeCryptoCertificateLoader — CertificateLoader via Node's X509Certificate.
 *
 * Uses the SAME parsing tool as NodeCryptoCertificatePolicyValidator
 * (node:crypto X509Certificate) — shared tool, separate concern. This loader
 * extracts XAdES fields for signing; it does not judge policy.
 *
 * All four fields are reproduced byte-for-byte against the golden reference
 * (src/services/zatca/__fixtures__/zatca-golden/Standard_Invoice_Signed.xml):
 *   issuerName    = "CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local"
 *   serialNumber  = "379112742831380471835263969587287663520528387"
 *
 * Architectural references:
 * - AD-009A v2: One Authority Per Concern
 * - ADR-025 / ADR-026: signing pipeline
 *
 * THE CERTIFICATE-DIGEST RULE (subtle, golden-verified):
 *   certificateDigest = computeHexDigest( certificateB64 STRING as ASCII )
 *   NOT computeHexDigest( DER bytes ). ZATCA hashes the base64 text of the
 *   certificate, then encodes base64-of-hex (88 chars). The HashProvider type
 *   comment for CertificateHashB64 still says "DER bytes" — that comment is
 *   inaccurate; this loader deliberately hashes the base64 string per the
 *   golden reference.
 */

import { X509Certificate } from 'node:crypto';
import type { CertificateB64 } from '../vault/VaultProvider';
import {
  type HashProvider,
  asCertificateHash,
} from '../hash/HashProvider';
import {
  type CertificateLoader,
  type CertificateFields,
  CertificateLoaderError,
} from './CertificateLoader';

export class NodeCryptoCertificateLoader implements CertificateLoader {
  readonly implementationName = 'node:crypto X509Certificate loader';

  constructor(private readonly hash: HashProvider) {}

  load(certificateB64: CertificateB64): CertificateFields {
    const cert = this.parse(certificateB64);

    const certificateDigest = asCertificateHash(
      // ⚠️ Hash the base64 STRING (ASCII), not the DER bytes (golden-verified).
      this.hash.computeHexDigest(certificateB64)
    );

    const issuerName = this.toZatcaIssuerName(cert.issuer);
    const serialNumber = this.toDecimalSerial(cert.serialNumber);

    return {
      certificateB64,
      certificateDigest,
      issuerName,
      serialNumber,
    };
  }

  // ─── Private helpers ───

  /**
   * Parse the base64 (DER) certificate. Throws CertificateLoaderError on failure.
   */
  private parse(certificateB64: CertificateB64): X509Certificate {
    try {
      const der = Buffer.from(certificateB64, 'base64');
      return new X509Certificate(der);
    } catch (err) {
      throw new CertificateLoaderError(
        'INVALID_CERTIFICATE',
        'Certificate could not be parsed from base64 (DER)',
        { cause: (err as Error).message }
      );
    }
  }

  /**
   * Convert Node's issuer DN to ZATCA's X509IssuerName form.
   *
   * Node's X509Certificate.issuer returns one RDN per line, root-to-leaf:
   *   "DC=local\nDC=gov\nDC=extgazt\nCN=PRZEINVOICESCA4-CA"
   *
   * ZATCA's <ds:X509IssuerName> wants RFC 2253 leaf-to-root, comma+space joined:
   *   "CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local"
   *
   * We split on newlines (robust to Node versions), trim, reverse, and join.
   */
  private toZatcaIssuerName(nodeIssuer: string): string {
    const rdns = nodeIssuer
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (rdns.length === 0) {
      throw new CertificateLoaderError(
        'EXTRACTION_FAILED',
        'Certificate issuer is empty',
        { nodeIssuer }
      );
    }

    return rdns.reverse().join(', ');
  }

  /**
   * Convert the hex serial number to a decimal string via BigInt.
   *
   * Node's X509Certificate.serialNumber is an uppercase hex string (no 0x,
   * no colons), e.g. "1100003803C5F74023B3FC5C5F000100003803". ZATCA's
   * <ds:X509SerialNumber> wants the decimal value, which exceeds
   * Number.MAX_SAFE_INTEGER — so BigInt is required.
   */
  private toDecimalSerial(hexSerial: string): string {
    const clean = hexSerial.trim();
    if (!/^[0-9a-fA-F]+$/.test(clean)) {
      throw new CertificateLoaderError(
        'EXTRACTION_FAILED',
        'Certificate serial number is not valid hex',
        { hexSerial }
      );
    }
    try {
      return BigInt('0x' + clean).toString(10);
    } catch (err) {
      throw new CertificateLoaderError(
        'EXTRACTION_FAILED',
        'Certificate serial number could not be converted to decimal',
        { hexSerial, cause: (err as Error).message }
      );
    }
  }
}
