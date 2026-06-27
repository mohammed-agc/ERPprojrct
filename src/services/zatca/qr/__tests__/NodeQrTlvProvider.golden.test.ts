/**
 * Golden tests for NodeQrTlvProvider — the QR TLV pure encoder.
 *
 * Strategy (no magic constants): decode the QR TLV from the golden signed
 * invoices AT TEST TIME, rebuild a QrInput from the decoded tag values, then
 * assert the provider re-encodes to the EXACT golden base64 string.
 *
 *   build(Standard input,  isSimplified=false) === golden Standard QR (Tags 1–8)
 *   build(Simplified input, isSimplified=true ) === golden Simplified QR (Tags 1–9)
 *
 * This proves the encoder is byte-for-byte correct against the reference, and
 * locks the Tag-9 gate (Standard omits Tag 9 even if certSignatureDer is given).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import {
  NodeQrTlvProvider,
  QrTlvError,
  type QrInput,
} from '../QrTlvProvider';

const GOLDEN_DIR = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');

/** Pull the QR base64 out of a signed invoice (scoped to cbc:ID === 'QR'). */
function extractQrB64(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const refs = Array.from(
    doc.getElementsByTagName('cac:AdditionalDocumentReference') as any
  ) as any[];
  const qrRef = refs.find(
    (el) => el.getElementsByTagName('cbc:ID')[0]?.textContent?.trim() === 'QR'
  );
  if (!qrRef) throw new Error('golden invoice has no QR AdditionalDocumentReference');
  const b64 = qrRef
    .getElementsByTagName('cbc:EmbeddedDocumentBinaryObject')[0]
    ?.textContent?.trim();
  if (!b64) throw new Error('QR AdditionalDocumentReference has no EmbeddedDocumentBinaryObject');
  return b64;
}

/** Decode a ZATCA QR TLV blob (single-byte tag + single-byte length). */
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

/** Rebuild a QrInput from decoded golden tags (Tags 1–7 as ASCII strings, 8–9 raw). */
function inputFromTags(tags: Map<number, Buffer>, isSimplified: boolean): QrInput {
  const str = (t: number): string => {
    const v = tags.get(t);
    if (!v) throw new Error(`golden QR missing tag ${t}`);
    return v.toString('utf-8');
  };
  const t8 = tags.get(8);
  if (!t8) throw new Error('golden QR missing tag 8');
  const t9 = tags.get(9);
  return {
    sellerName: str(1),
    vatNumber: str(2),
    timestamp: str(3),
    taxInclusiveAmount: str(4),
    taxTotal: str(5),
    invoiceHashB64: str(6),
    signatureValueB64: str(7),
    publicKeyDer: Uint8Array.from(t8),
    certSignatureDer: t9 ? Uint8Array.from(t9) : new Uint8Array(0),
    isSimplified,
  };
}

describe('NodeQrTlvProvider', () => {
  const provider = new NodeQrTlvProvider();

  let stdQrB64: string;
  let simpQrB64: string;
  let stdTags: Map<number, Buffer>;
  let simpTags: Map<number, Buffer>;

  beforeAll(async () => {
    const stdXml = await fs.readFile(join(GOLDEN_DIR, 'Standard_Invoice_Signed.xml'), 'utf-8');
    const simpXml = await fs.readFile(join(GOLDEN_DIR, 'Simplified_Invoice_Signed.xml'), 'utf-8');
    stdQrB64 = extractQrB64(stdXml);
    simpQrB64 = extractQrB64(simpXml);
    stdTags = decodeTlv(Buffer.from(stdQrB64, 'base64'));
    simpTags = decodeTlv(Buffer.from(simpQrB64, 'base64'));
  });

  describe('Contract', () => {
    it('declares an implementation name', () => {
      expect(provider.implementationName).toContain('TLV');
    });
  });

  describe('Standard invoice QR (Tags 1–8, byte-for-byte vs golden)', () => {
    it('re-encodes to the exact golden Standard QR base64', () => {
      const out = provider.build(inputFromTags(stdTags, false));
      expect(out).toBe(stdQrB64);
    });

    it('omits Tag 9 even when certSignatureDer is provided (gate locked)', () => {
      const input: QrInput = {
        ...inputFromTags(stdTags, false),
        // a non-empty cert signature must NOT leak into a Standard QR
        certSignatureDer: Uint8Array.from(simpTags.get(9)!),
        isSimplified: false,
      };
      expect(provider.build(input)).toBe(stdQrB64);
    });
  });

  describe('Simplified invoice QR (Tags 1–9, byte-for-byte vs golden)', () => {
    it('re-encodes to the exact golden Simplified QR base64', () => {
      const out = provider.build(inputFromTags(simpTags, true));
      expect(out).toBe(simpQrB64);
    });

    it('includes Tag 9 (decodes back to 9 tags)', () => {
      const out = provider.build(inputFromTags(simpTags, true));
      const tags = decodeTlv(Buffer.from(out, 'base64'));
      expect(tags.has(9)).toBe(true);
      expect(tags.size).toBe(9);
    });
  });

  describe('Encoding errors (QrTlvError — not input validation)', () => {
    it('throws TLV_LENGTH_TOO_LARGE when a value is ≥ 256 bytes', () => {
      const input: QrInput = {
        ...inputFromTags(stdTags, false),
        sellerName: 'x'.repeat(256),
      };
      expect(() => provider.build(input)).toThrow(QrTlvError);
      try {
        provider.build(input);
      } catch (err) {
        expect((err as QrTlvError).code).toBe('TLV_LENGTH_TOO_LARGE');
      }
    });

    it('accepts a value of exactly 255 bytes (boundary)', () => {
      const input: QrInput = {
        ...inputFromTags(stdTags, false),
        sellerName: 'x'.repeat(255),
      };
      expect(() => provider.build(input)).not.toThrow();
    });
  });

  describe('Purity', () => {
    it('produces identical output across repeated calls', () => {
      const input = inputFromTags(simpTags, true);
      expect(provider.build(input)).toBe(provider.build(input));
    });
  });
});
