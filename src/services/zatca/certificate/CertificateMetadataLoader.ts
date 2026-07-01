/**
 * CertificateMetadataLoader — extracts the REGISTRATION metadata of an X.509
 * certificate: fingerprint, expiry, serial, issuer, subject.
 *
 * Lives in the certificate/ package because it derives NO new fact — it reads
 * the same X509Certificate the signing/QR loaders read, for a different consumer
 * (credential registration). Single Ownership: everything derived from an X.509
 * certificate belongs to this package; the onboarding coordinator asks for
 * metadata the way it asks the signer to "sign" — it does not parse certs itself.
 *
 * This is metadata only (safe, public, indexable). Secrets are never here.
 */

import { X509Certificate } from 'node:crypto';

export interface CertificateMetadata {
  /** SHA-256 fingerprint of the DER certificate, lowercase hex, colon-free. */
  readonly certificateFingerprint: string;
  /** Certificate notAfter as an ISO timestamp. */
  readonly certificateExpiryAt: string;
  /** Certificate serial number (hex as reported by X509). */
  readonly certificateSerial: string;
  /** Certificate subject DN. */
  readonly certificateSubject: string;
  /** Certificate issuer DN. */
  readonly certificateIssuer: string;
}

export class CertificateMetadataError extends Error {
  constructor(message: string, readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'CertificateMetadataError';
  }
}

export interface CertificateMetadataLoader {
  readonly implementationName: string;
  /** @param certificatePem PEM-encoded X.509 certificate. */
  loadMetadata(certificatePem: string): CertificateMetadata;
}

export class NodeCryptoCertificateMetadataLoader
  implements CertificateMetadataLoader
{
  readonly implementationName = 'node:crypto X509Certificate metadata loader';

  loadMetadata(certificatePem: string): CertificateMetadata {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(certificatePem);
    } catch (e) {
      throw new CertificateMetadataError(
        `could not parse certificate: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }

    // fingerprint256 is "AA:BB:..."; normalise to lowercase, colon-free hex.
    const certificateFingerprint = cert.fingerprint256
      .replace(/:/g, '')
      .toLowerCase();

    const expiryDate = new Date(cert.validTo);
    if (Number.isNaN(expiryDate.getTime())) {
      throw new CertificateMetadataError(
        `certificate validTo is unparseable: "${cert.validTo}"`
      );
    }

    return {
      certificateFingerprint,
      certificateExpiryAt: expiryDate.toISOString(),
      certificateSerial: cert.serialNumber,
      certificateSubject: cert.subject,
      certificateIssuer: cert.issuer,
    };
  }
}

export function createCertificateMetadataLoader(): CertificateMetadataLoader {
  return new NodeCryptoCertificateMetadataLoader();
}
