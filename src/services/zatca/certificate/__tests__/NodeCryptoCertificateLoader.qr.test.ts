/**
 * Tests for NodeCryptoCertificateLoader.loadQrFields — the QR byte-fields.
 *
 * Strategy (no magic constants): load the REAL ZATCA golden certificate
 * (__fixtures__/zatca-golden/zatca_real_certificate.pem) and verify the two
 * extracted QR fields byte-for-byte against the QR TLV decoded AT TEST TIME
 * from the golden signed invoices:
 *
 *   publicKeyDer     == QR Tag 8 of Standard_Invoice_Signed.xml   (88 bytes, 30 56 …)
 *   certSignatureDer == QR Tag 9 of Simplified_Invoice_Signed.xml (71 bytes, 30 45 02 21 …)
 *
 * Golden facts locked by these tests (byte-verified during S3.5 surface read):
 *   - The Standard invoice QR contains Tags 1–8 (NO Tag 9).
 *   - The Simplified invoice QR contains Tags 1–9.
 *   - Tag 8 (public key) is identical across both (same certificate).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { NodeCryptoCertificateLoader } from '../NodeCryptoCertificateLoader';
import { CertificateLoaderError } from '../CertificateLoader';
import { NodeCryptoHashProvider } from '../../hash/NodeCryptoHashProvider';
import type { CertificateB64 } from '../../vault/VaultProvider';

const GOLDEN_DIR = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');

/** Strip PEM markers + whitespace to get base64 (mirrors VaultProvider.getCertificate). */
function pemToB64(pem: string): CertificateB64 {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/
  );
  if (!match) throw new Error('fixture is not a valid PEM certificate');
  return match[1].replace(/\s+/g, '') as CertificateB64;
}

/**
 * Pull the QR base64 out of a signed invoice. Scopes to the
 * cac:AdditionalDocumentReference whose cbc:ID === 'QR' — NOT the first
 * EmbeddedDocumentBinaryObject, because PIH uses the same element and appears
 * earlier in document order. Mirrors the QR-locating pattern in NodeXadesSigner.
 */
function extractQrB64(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const refs = Array.from(
    doc.getElementsByTagName('cac:AdditionalDocumentReference') as any
  ) as any[];
  const qrRef = refs.find(
    (el) => el.getElementsByTagName('cbc:ID')[0]?.textContent?.trim() === 'QR'
  );
  if (!qrRef) {
    throw new Error('golden invoice has no QR AdditionalDocumentReference');
  }
  const b64 = qrRef
    .getElementsByTagName('cbc:EmbeddedDocumentBinaryObject')[0]
    ?.textContent?.trim();
  if (!b64) {
    throw new Error('QR AdditionalDocumentReference has no EmbeddedDocumentBinaryObject');
  }
  return b64;
}

/** Decode a ZATCA QR TLV blob (single-byte tag + single-byte length) into a tag map. */
function decodeTlv(buf: Buffer): Map<number, Buffer> {
  const tags = new Map<number, Buffer>();
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    if (tag === undefined || len === undefined) {
      throw new Error(`malformed TLV near offset ${i}`);
    }
    tags.set(tag, buf.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return tags;
}

describe('NodeCryptoCertificateLoader.loadQrFields', () => {
  const loader = new NodeCryptoCertificateLoader(new NodeCryptoHashProvider());
  let certB64: CertificateB64;
  let goldenTag8: Buffer; // public key, from Standard QR
  let goldenTag9: Buffer; // cert signature, from Simplified QR

  beforeAll(async () => {
    const pem = await fs.readFile(
      join(GOLDEN_DIR, 'zatca_real_certificate.pem'),
      'utf-8'
    );
    certB64 = pemToB64(pem);

    const stdXml = await fs.readFile(
      join(GOLDEN_DIR, 'Standard_Invoice_Signed.xml'),
      'utf-8'
    );
    const simpXml = await fs.readFile(
      join(GOLDEN_DIR, 'Simplified_Invoice_Signed.xml'),
      'utf-8'
    );

    const stdTags = decodeTlv(Buffer.from(extractQrB64(stdXml), 'base64'));
    const simpTags = decodeTlv(Buffer.from(extractQrB64(simpXml), 'base64'));

    const t8 = stdTags.get(8);
    const t9 = simpTags.get(9);
    if (!t8) throw new Error('Standard golden QR is missing Tag 8');
    if (!t9) throw new Error('Simplified golden QR is missing Tag 9');
    goldenTag8 = Buffer.from(t8);
    goldenTag9 = Buffer.from(t9);
  });

  describe('Golden invariants (locked by surface read)', () => {
    it('Standard QR has Tags 1–8 and NO Tag 9', async () => {
      const xml = await fs.readFile(
        join(GOLDEN_DIR, 'Standard_Invoice_Signed.xml'),
        'utf-8'
      );
      const tags = decodeTlv(Buffer.from(extractQrB64(xml), 'base64'));
      expect(tags.has(8)).toBe(true);
      expect(tags.has(9)).toBe(false);
    });

    it('Simplified QR contains Tag 9', async () => {
      const xml = await fs.readFile(
        join(GOLDEN_DIR, 'Simplified_Invoice_Signed.xml'),
        'utf-8'
      );
      const tags = decodeTlv(Buffer.from(extractQrB64(xml), 'base64'));
      expect(tags.has(9)).toBe(true);
    });
  });

  describe('Tag 8 — publicKeyDer (byte-for-byte vs golden QR)', () => {
    it('equals the golden QR Tag 8 exactly', () => {
      const qr = loader.loadQrFields(certB64);
      expect(qr.publicKeyDer.equals(goldenTag8)).toBe(true);
    });

    it('is the 88-byte secp256k1 SubjectPublicKeyInfo (starts 30 56)', () => {
      const qr = loader.loadQrFields(certB64);
      expect(qr.publicKeyDer.length).toBe(88);
      expect(qr.publicKeyDer.subarray(0, 2).toString('hex')).toBe('3056');
    });
  });

  describe('Tag 9 — certSignatureDer (byte-for-byte vs golden QR)', () => {
    it('equals the golden QR Tag 9 exactly', () => {
      const qr = loader.loadQrFields(certB64);
      expect(qr.certSignatureDer.equals(goldenTag9)).toBe(true);
    });

    it('is the raw DER ECDSA signature (starts 30 45 02 21)', () => {
      const qr = loader.loadQrFields(certB64);
      expect(qr.certSignatureDer.length).toBe(71);
      expect(qr.certSignatureDer.subarray(0, 4).toString('hex')).toBe('30450221');
    });
  });

  describe('Error handling', () => {
    it('throws INVALID_CERTIFICATE on unparseable input', () => {
      expect(() =>
        loader.loadQrFields('not-a-real-certificate' as CertificateB64)
      ).toThrow(CertificateLoaderError);
    });

    it('error carries the INVALID_CERTIFICATE code', () => {
      try {
        loader.loadQrFields('@@@bad@@@' as CertificateB64);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(CertificateLoaderError);
        expect((err as CertificateLoaderError).code).toBe('INVALID_CERTIFICATE');
      }
    });
  });

  describe('Purity', () => {
    it('produces identical fields across repeated calls', () => {
      const a = loader.loadQrFields(certB64);
      const b = loader.loadQrFields(certB64);
      expect(a.publicKeyDer.equals(b.publicKeyDer)).toBe(true);
      expect(a.certSignatureDer.equals(b.certSignatureDer)).toBe(true);
    });
  });
});
