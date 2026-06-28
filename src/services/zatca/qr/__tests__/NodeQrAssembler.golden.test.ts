/**
 * Golden integration tests for NodeQrAssembler (+ NodeQrTlvProvider).
 *
 * Strategy (no magic constants): decode the golden QR TLV at test time to get
 * the ground-truth tag values, build a UblInvoice/SignedXmlResult-shaped input
 * from RAW domain values (numbers for amounts, separate date/time), run the
 * assembler, feed its QrInput to the encoder, and assert byte-for-byte equality
 * with the original golden QR base64.
 *
 *   assemble(Standard)  → build → golden Standard QR (Tags 1–8)
 *   assemble(Simplified)→ build → golden Simplified QR (Tags 1–9)
 *
 * Also covers the INPUT-layer guards (ZatcaInputError) the assembler owns.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';
import { NodeQrAssembler, type QrAssemblyInput } from '../QrAssembler';
import { NodeQrTlvProvider } from '../QrTlvProvider';
import { ZatcaInputError } from '../../errors/ZatcaInputError';
import type { UblInvoice } from '../../xmlBuilder.types';
import type { SignedXmlResult } from '../../xades/XadesSigner';
import type { InvoiceHashB64 } from '../../hash/HashProvider';
import type { SignatureValueB64, CertificateB64 } from '../../vault/VaultProvider';

const GOLDEN_DIR = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');

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

function decodeTlv(buf: Buffer): Map<number, Buffer> {
  const tags = new Map<number, Buffer>();
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    if (tag === undefined || len === undefined) throw new Error(`malformed TLV near ${i}`);
    tags.set(tag, buf.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return tags;
}

/**
 * Build a minimal UblInvoice carrying only the fields QrAssembler reads.
 * Amounts are passed as raw numbers (the assembler does the toFixed(2)).
 */
function ublFrom(opts: {
  sellerName: string;
  vatNumber: string | null;
  issueDate: string;
  issueTime: string;
  taxInclusiveAmount: number;
  totalTaxAmount: number;
}): UblInvoice {
  return {
    seller: { registrationName: opts.sellerName, vatNumber: opts.vatNumber },
    issueDate: opts.issueDate,
    issueTime: opts.issueTime,
    totals: { taxInclusiveAmount: opts.taxInclusiveAmount },
    totalTaxAmount: opts.totalTaxAmount,
  } as unknown as UblInvoice;
}

function signedFrom(invoiceHashB64: string, signatureValueB64: string): SignedXmlResult {
  return {
    signedXml: '<signed/>',
    invoiceHashB64: invoiceHashB64 as InvoiceHashB64,
    signatureValueB64: signatureValueB64 as SignatureValueB64,
    certificateB64: '' as CertificateB64,
  };
}

describe('NodeQrAssembler (+ NodeQrTlvProvider) — golden integration', () => {
  const assembler = new NodeQrAssembler();
  const encoder = new NodeQrTlvProvider();

  let stdQrB64: string;
  let simpQrB64: string;
  let stdTags: Map<number, Buffer>;
  let simpTags: Map<number, Buffer>;
  let stdInput: QrAssemblyInput;
  let simpInput: QrAssemblyInput;

  beforeAll(async () => {
    const stdXml = await fs.readFile(join(GOLDEN_DIR, 'Standard_Invoice_Signed.xml'), 'utf-8');
    const simpXml = await fs.readFile(join(GOLDEN_DIR, 'Simplified_Invoice_Signed.xml'), 'utf-8');
    stdQrB64 = extractQrB64(stdXml);
    simpQrB64 = extractQrB64(simpXml);
    stdTags = decodeTlv(Buffer.from(stdQrB64, 'base64'));
    simpTags = decodeTlv(Buffer.from(simpQrB64, 'base64'));

    // Standard golden amounts: Tag4 "4.60", Tag5 "0.60"
    stdInput = {
      ubl: ublFrom({
        sellerName: stdTags.get(1)!.toString('utf-8'),
        vatNumber: stdTags.get(2)!.toString('utf-8'),
        issueDate: stdTags.get(3)!.toString('utf-8').slice(0, 10),
        issueTime: stdTags.get(3)!.toString('utf-8').slice(11, 19),
        taxInclusiveAmount: Number(stdTags.get(4)!.toString('utf-8')),
        totalTaxAmount: Number(stdTags.get(5)!.toString('utf-8')),
      }),
      signed: signedFrom(
        stdTags.get(6)!.toString('utf-8'),
        stdTags.get(7)!.toString('utf-8')
      ),
      publicKeyDer: Uint8Array.from(stdTags.get(8)!),
      certSignatureDer: new Uint8Array(0),
      isSimplified: false,
    };

    simpInput = {
      ubl: ublFrom({
        sellerName: simpTags.get(1)!.toString('utf-8'),
        vatNumber: simpTags.get(2)!.toString('utf-8'),
        issueDate: simpTags.get(3)!.toString('utf-8').slice(0, 10),
        issueTime: simpTags.get(3)!.toString('utf-8').slice(11, 19),
        taxInclusiveAmount: Number(simpTags.get(4)!.toString('utf-8')),
        totalTaxAmount: Number(simpTags.get(5)!.toString('utf-8')),
      }),
      signed: signedFrom(
        simpTags.get(6)!.toString('utf-8'),
        simpTags.get(7)!.toString('utf-8')
      ),
      publicKeyDer: Uint8Array.from(simpTags.get(8)!),
      certSignatureDer: Uint8Array.from(simpTags.get(9)!),
      isSimplified: true,
    };
  });

  describe('Contract', () => {
    it('declares an implementation name', () => {
      expect(assembler.implementationName).toContain('assembler');
    });
  });

  describe('Byte-for-byte vs golden (assemble → build)', () => {
    it('Standard invoice produces the exact golden QR (Tags 1–8)', () => {
      const out = encoder.build(assembler.assemble(stdInput));
      expect(out).toBe(stdQrB64);
    });

    it('Simplified invoice produces the exact golden QR (Tags 1–9)', () => {
      const out = encoder.build(assembler.assemble(simpInput));
      expect(out).toBe(simpQrB64);
    });
  });

  describe('Derivations', () => {
    it('builds Tag 3 as `${issueDate}T${issueTime}Z`', () => {
      expect(assembler.assemble(stdInput).timestamp).toBe('2024-09-07T17:41:08Z');
    });

    it('formats amounts with toFixed(2) (matches XML fmt)', () => {
      const qi = assembler.assemble(stdInput);
      expect(qi.taxInclusiveAmount).toBe('4.60');
      expect(qi.taxTotal).toBe('0.60');
    });
  });

  describe('INPUT guards (ZatcaInputError)', () => {
    it('throws SELLER_VAT_MISSING when vatNumber is null', () => {
      const input: QrAssemblyInput = {
        ...stdInput,
        ubl: ublFrom({
          sellerName: 'X',
          vatNumber: null,
          issueDate: '2024-09-07',
          issueTime: '17:41:08',
          taxInclusiveAmount: 4.6,
          totalTaxAmount: 0.6,
        }),
      };
      expect(() => assembler.assemble(input)).toThrow(ZatcaInputError);
      try {
        assembler.assemble(input);
      } catch (e) {
        expect((e as ZatcaInputError).code).toBe('SELLER_VAT_MISSING');
        expect((e as ZatcaInputError).layer).toBe('INPUT');
        expect((e as ZatcaInputError).retryable).toBe(false);
      }
    });

    it('throws INVOICE_HASH_MISSING when invoiceHashB64 is empty', () => {
      const input: QrAssemblyInput = { ...stdInput, signed: signedFrom('', 'sig') };
      try {
        assembler.assemble(input);
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ZatcaInputError).code).toBe('INVOICE_HASH_MISSING');
      }
    });

    it('throws CERTIFICATE_MISSING when publicKeyDer is empty', () => {
      const input: QrAssemblyInput = { ...stdInput, publicKeyDer: new Uint8Array(0) };
      try {
        assembler.assemble(input);
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ZatcaInputError).code).toBe('CERTIFICATE_MISSING');
      }
    });

    it('throws CERTIFICATE_MISSING when simplified but certSignatureDer is empty', () => {
      const input: QrAssemblyInput = { ...simpInput, certSignatureDer: new Uint8Array(0) };
      try {
        assembler.assemble(input);
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ZatcaInputError).code).toBe('CERTIFICATE_MISSING');
      }
    });

    it('throws AMOUNT_MISSING when a total is not finite', () => {
      const input: QrAssemblyInput = {
        ...stdInput,
        ubl: ublFrom({
          sellerName: 'X',
          vatNumber: '399999999900003',
          issueDate: '2024-09-07',
          issueTime: '17:41:08',
          taxInclusiveAmount: Number.NaN,
          totalTaxAmount: 0.6,
        }),
      };
      try {
        assembler.assemble(input);
        throw new Error('should have thrown');
      } catch (e) {
        expect((e as ZatcaInputError).code).toBe('AMOUNT_MISSING');
      }
    });
  });

  describe('Purity', () => {
    it('produces identical QrInput across repeated calls', () => {
      expect(assembler.assemble(simpInput)).toEqual(assembler.assemble(simpInput));
    });
  });
});
