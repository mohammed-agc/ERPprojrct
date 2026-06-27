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
 *
 * THE QR BYTE-FIELDS (loadQrFields, golden-verified — separate from load()):
 *   publicKeyDer     = cert.publicKey.export({ format: 'der', type: 'spki' }),
 *                      88 bytes (30 56 …) for the golden secp256k1 cert — QR Tag 8.
 *   certSignatureDer = the content of the certificate's final BIT STRING minus
 *                      the unused-bits byte: the raw DER ECDSA signature
 *                      (30 45 02 21 …), 71 bytes for the golden cert — QR Tag 9.
 *   Both verified byte-for-byte against the golden QR (Standard Tag 8 / Simplified
 *   Tag 9). Lengths are curve-/signature-dependent and intentionally not asserted
 *   here; the golden test locks the golden values.
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
  type QrCertificateFields,
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

  loadQrFields(certificateB64: CertificateB64): QrCertificateFields {
    const cert = this.parse(certificateB64);

    const publicKeyDer = this.extractPublicKeyDer(cert);
    const certSignatureDer = this.extractCertSignatureDer(cert);

    return {
      publicKeyDer,
      certSignatureDer,
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

  /**
   * Extract the SubjectPublicKeyInfo DER (QR Tag 8) via Node's KeyObject export.
   * For the golden secp256k1 cert this is 88 bytes (30 56 …). Length is curve-
   * dependent and intentionally NOT asserted here; the golden test locks it.
   */
  private extractPublicKeyDer(cert: X509Certificate): Buffer {
    try {
      return cert.publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
    } catch (err) {
      throw new CertificateLoaderError(
        'EXTRACTION_FAILED',
        'Certificate public key (SPKI DER) could not be exported',
        { cause: (err as Error).message }
      );
    }
  }

  /**
   * Extract the raw certificate signature value (QR Tag 9) from the cert DER.
   *
   * An X.509 certificate is SEQUENCE { tbsCertificate, signatureAlgorithm,
   * signatureValue BIT STRING }. We walk past the first two SEQUENCEs to the
   * final BIT STRING and return its content minus the leading unused-bits byte.
   * For an ECDSA cert that content is the DER signature (30 45 02 21 …), 70–72
   * bytes; the golden cert yields 71. Length is NOT asserted here (it varies);
   * the golden test locks the golden value.
   */
  private extractCertSignatureDer(cert: X509Certificate): Buffer {
    try {
      const der = cert.raw; // full certificate DER (Buffer)
      let p = 0;

      const seq = (what: string): { length: number; valueStart: number } => {
        if (der[p] !== 0x30) {
          throw new Error(
            `expected ${what} SEQUENCE (0x30) at offset ${p}, got 0x${der[p]?.toString(16)}`
          );
        }
        p += 1;
        return this.readDerLength(der, p);
      };

      const outer = seq('outer');
      p = outer.valueStart; // descend into the certificate's content

      const tbs = seq('tbsCertificate');
      p = tbs.valueStart + tbs.length; // skip the entire tbsCertificate

      const alg = seq('signatureAlgorithm');
      p = alg.valueStart + alg.length; // skip the entire signatureAlgorithm

      if (der[p] !== 0x03) {
        throw new Error(
          `expected signatureValue BIT STRING (0x03) at offset ${p}, got 0x${der[p]?.toString(16)}`
        );
      }
      p += 1;
      const bits = this.readDerLength(der, p);
      // First content byte is the unused-bits count (0 for byte-aligned signatures);
      // the remainder is the raw DER ECDSA signature.
      const sig = der.subarray(bits.valueStart + 1, bits.valueStart + bits.length);
      return Buffer.from(sig);
    } catch (err) {
      throw new CertificateLoaderError(
        'EXTRACTION_FAILED',
        'Certificate signature value (DER) could not be extracted',
        { cause: (err as Error).message }
      );
    }
  }

  /**
   * Read a DER definite-length octet sequence at `pos`.
   * Returns the decoded length and the offset where the value begins.
   * Supports short form and long form up to 4 length-bytes.
   */
  private readDerLength(
    buf: Buffer,
    pos: number
  ): { length: number; valueStart: number } {
    const first = buf[pos++];
    if (first === undefined) {
      throw new Error(`DER length byte missing at offset ${pos - 1}`);
    }
    if (first < 0x80) {
      return { length: first, valueStart: pos };
    }
    const numBytes = first & 0x7f;
    if (numBytes === 0 || numBytes > 4) {
      throw new Error(
        `unsupported DER length form (${numBytes} length-bytes) at offset ${pos - 1}`
      );
    }
    let len = 0;
    for (let i = 0; i < numBytes; i++) {
      const nb = buf[pos++];
      if (nb === undefined) {
        throw new Error(`truncated DER length at offset ${pos - 1}`);
      }
      len = (len << 8) | nb;
    }
    return { length: len, valueStart: pos };
  }
}
