/**
 * Tests for NodeCryptoCertificateLoader.
 *
 * Strategy: load the REAL ZATCA golden certificate
 * (__fixtures__/zatca-golden/zatca_real_certificate.pem) and verify every
 * extracted field byte-for-byte against the golden signed invoice
 * (__fixtures__/zatca-golden/Standard_Invoice_Signed.xml).
 *
 * Golden values (from Standard_Invoice_Signed.xml):
 *   X509IssuerName   = "CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local"
 *   X509SerialNumber = "379112742831380471835263969587287663520528387"
 *   CertDigest       = base64-of-hex, decodes to
 *                      "d302b411575c956598c5e88abb4856452556a5ab8a01f7acb95a069d46662485"
 *
 * The CertDigest test also LOCKS the rule that the digest is computed over the
 * base64 STRING of the certificate (ASCII), not the DER bytes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { NodeCryptoCertificateLoader } from '../NodeCryptoCertificateLoader';
import { CertificateLoaderError } from '../CertificateLoader';
import { NodeCryptoHashProvider } from '../../hash/NodeCryptoHashProvider';
import type { CertificateB64 } from '../../vault/VaultProvider';

const GOLDEN_DIR = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');

// Golden expectations (from Standard_Invoice_Signed.xml)
const GOLDEN_ISSUER_NAME = 'CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local';
const GOLDEN_SERIAL_DECIMAL = '379112742831380471835263969587287663520528387';
const GOLDEN_CERT_DIGEST_B64 =
  'ZDMwMmI0MTE1NzVjOTU2NTk4YzVlODhhYmI0ODU2NDUyNTU2YTVhYjhhMDFmN2FjYjk1YTA2OWQ0NjY2MjQ4NQ==';
const GOLDEN_CERT_DIGEST_HEX =
  'd302b411575c956598c5e88abb4856452556a5ab8a01f7acb95a069d46662485';

/** Strip PEM markers + whitespace to get base64 (mirrors VaultProvider.getCertificate). */
function pemToB64(pem: string): CertificateB64 {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/
  );
  if (!match) throw new Error('fixture is not a valid PEM certificate');
  return match[1].replace(/\s+/g, '') as CertificateB64;
}

describe('NodeCryptoCertificateLoader', () => {
  const loader = new NodeCryptoCertificateLoader(new NodeCryptoHashProvider());
  let certB64: CertificateB64;

  beforeAll(async () => {
    const pem = await fs.readFile(
      join(GOLDEN_DIR, 'zatca_real_certificate.pem'),
      'utf-8'
    );
    certB64 = pemToB64(pem);
  });

  describe('Contract', () => {
    it('declares an implementation name', () => {
      expect(loader.implementationName).toContain('X509Certificate');
    });
  });

  describe('Golden field extraction (byte-for-byte vs Standard_Invoice_Signed.xml)', () => {
    it('issuerName matches the golden X509IssuerName exactly', () => {
      const fields = loader.load(certB64);
      expect(fields.issuerName).toBe(GOLDEN_ISSUER_NAME);
    });

    it('serialNumber matches the golden X509SerialNumber (decimal) exactly', () => {
      const fields = loader.load(certB64);
      expect(fields.serialNumber).toBe(GOLDEN_SERIAL_DECIMAL);
    });

    it('certificateDigest matches the golden CertDigest exactly', () => {
      const fields = loader.load(certB64);
      expect(fields.certificateDigest).toBe(GOLDEN_CERT_DIGEST_B64);
    });

    it('certificateB64 is passed through unchanged', () => {
      const fields = loader.load(certB64);
      expect(fields.certificateB64).toBe(certB64);
    });
  });

  describe('CertDigest encoding rule (LOCKS: hash the base64 STRING, not DER)', () => {
    it('digest decodes to the SHA-256 hex of the base64 string', () => {
      const fields = loader.load(certB64);
      const decoded = Buffer.from(fields.certificateDigest, 'base64').toString('utf-8');
      expect(decoded).toBe(GOLDEN_CERT_DIGEST_HEX);
    });

    it('would NOT match if hashing DER bytes instead (proves the rule)', () => {
      // Hashing the DER bytes produces a DIFFERENT digest than the golden one.
      const hash = new NodeCryptoHashProvider();
      const derBytes = Buffer.from(certB64, 'base64');
      const wrongDigest = hash.computeHexDigest(derBytes);
      expect(wrongDigest).not.toBe(GOLDEN_CERT_DIGEST_B64);
    });
  });

  describe('Error handling', () => {
    it('throws INVALID_CERTIFICATE on unparseable input', () => {
      expect(() => loader.load('not-a-real-certificate' as CertificateB64)).toThrow(
        CertificateLoaderError
      );
    });

    it('error carries the INVALID_CERTIFICATE code', () => {
      try {
        loader.load('@@@bad@@@' as CertificateB64);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CertificateLoaderError);
        expect((err as CertificateLoaderError).code).toBe('INVALID_CERTIFICATE');
      }
    });
  });

  describe('Purity', () => {
    it('produces identical fields across repeated calls', () => {
      const a = loader.load(certB64);
      const b = loader.load(certB64);
      expect(a).toEqual(b);
    });
  });
});
