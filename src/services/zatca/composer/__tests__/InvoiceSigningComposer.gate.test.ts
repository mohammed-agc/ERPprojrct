/**
 * Golden gate for NodeInvoiceSigningComposer (S5.1).
 *
 * Strategy (no magic constants): drive the REAL pure authorities
 * (NodeCryptoCertificateLoader.loadQrFields, NodeQrAssembler, NodeQrTlvProvider,
 * NodeQrInjector) through compose(), with ONLY the XadesSigner stubbed — because
 * signing is proven in its own gate (TA-001) and needs the Vault. The stub
 * returns a SignedXmlResult whose certificateB64 is the REAL golden certificate
 * and whose hash/signature are the golden QR's own Tag 6 / Tag 7, so the QR that
 * compose() rebuilds must equal the golden QR byte-for-byte.
 *
 * Proven here (the composer's OWN responsibility — the wiring):
 *   - standard  → qrBase64 == golden Standard QR  (Tags 1–8, no Tag 9)
 *   - simplified→ qrBase64 == golden Simplified QR (Tags 1–9)
 *   - isSimplified is derived from metadata.dbInvoiceType (the Tag-9 gate)
 *   - signatureValueB64 + certificateB64 are surfaced (SSOT for S5.2/S5.3)
 *   - the QR is injected into the signed XML placeholder
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { DOMParser } from '@xmldom/xmldom';

import { NodeInvoiceSigningComposer } from '../InvoiceSigningComposer';
import { NodeCryptoCertificateLoader } from '../../certificate/NodeCryptoCertificateLoader';
import { NodeQrAssembler } from '../../qr/QrAssembler';
import { NodeQrTlvProvider } from '../../qr/QrTlvProvider';
import { NodeQrInjector } from '../../qr/QrInjector';

import type { XadesSigner, SignXmlRequest, SignedXmlResult } from '../../xades/XadesSigner';
import type { XmlBuildOutput, UblInvoice, DbInvoiceType } from '../../xmlBuilder.types';
import type { InvoiceHashB64 } from '../../hash/HashProvider';
import type {
  CredentialId,
  SignatureValueB64,
  CertificateB64,
} from '../../vault/VaultProvider';

const GOLDEN_DIR = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');

/** PEM → base64 DER (strip header/footer/newlines), matching the cert-loader test. */
function pemToB64(pem: string): CertificateB64 {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/
  );
  if (!match) throw new Error('fixture is not a valid PEM certificate');
  return match[1].replace(/\s+/g, '') as CertificateB64;
}

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
  if (!b64) throw new Error('QR ref has no EmbeddedDocumentBinaryObject');
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

/** A signed XML carrying XmlBuilder's exact QR placeholder shape (so inject works). */
function signedXmlWithPlaceholder(): string {
  const block = [
    '  <cac:AdditionalDocumentReference>',
    '    <cbc:ID>PIH</cbc:ID>',
    '    <cac:Attachment>',
    '      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">NWZlY2ViNjY=</cbc:EmbeddedDocumentBinaryObject>',
    '    </cac:Attachment>',
    '  </cac:AdditionalDocumentReference>',
    '  <cac:AdditionalDocumentReference>',
    '    <cbc:ID>QR</cbc:ID>',
    '    <cac:Attachment>',
    '      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"><!-- QR TLV base64 — يُملأ في S4 QrTlvService --></cbc:EmbeddedDocumentBinaryObject>',
    '    </cac:Attachment>',
    '  </cac:AdditionalDocumentReference>',
  ].join('\n');
  return `<Invoice>\n<ext:UBLExtensions>...sig...</ext:UBLExtensions>\n${block}\n</Invoice>`;
}

/** Minimal UblInvoice carrying only the fields the assembler reads (Tags 1–5). */
function ublFromTags(tags: Map<number, Buffer>): UblInvoice {
  const ts = tags.get(3)!.toString('utf-8');
  return {
    seller: {
      registrationName: tags.get(1)!.toString('utf-8'),
      vatNumber: tags.get(2)!.toString('utf-8'),
    },
    issueDate: ts.slice(0, 10),
    issueTime: ts.slice(11, 19),
    totals: { taxInclusiveAmount: Number(tags.get(4)!.toString('utf-8')) },
    totalTaxAmount: Number(tags.get(5)!.toString('utf-8')),
  } as unknown as UblInvoice;
}

/** XadesSigner stub: returns golden hash/sig + the REAL golden certificate. */
function stubSigner(
  invoiceHashB64: string,
  signatureValueB64: string,
  certificateB64: CertificateB64
): XadesSigner {
  return {
    name: 'StubSigner',
    async signXml(_req: SignXmlRequest): Promise<SignedXmlResult> {
      return {
        signedXml: signedXmlWithPlaceholder(),
        invoiceHashB64: invoiceHashB64 as InvoiceHashB64,
        signatureValueB64: signatureValueB64 as SignatureValueB64,
        certificateB64,
      };
    },
  };
}

function xmlBuildOutputFor(
  ubl: UblInvoice,
  dbInvoiceType: DbInvoiceType
): XmlBuildOutput {
  return {
    xml: '<unsigned/>',
    ubl,
    metadata: { dbInvoiceType } as XmlBuildOutput['metadata'],
    warnings: [],
  } as unknown as XmlBuildOutput;
}

describe('NodeInvoiceSigningComposer — golden gate (S5.1 wiring)', () => {
  const certLoader = new NodeCryptoCertificateLoader();
  const assembler = new NodeQrAssembler();
  const tlv = new NodeQrTlvProvider();
  const injector = new NodeQrInjector();

  const CRED = 'gate-credential' as CredentialId;
  const SIGNING_TIME = '2024-09-07T17:41:08Z';

  let certB64: CertificateB64;
  let stdQrB64: string;
  let simpQrB64: string;
  let stdTags: Map<number, Buffer>;
  let simpTags: Map<number, Buffer>;

  beforeAll(async () => {
    const pem = await fs.readFile(join(GOLDEN_DIR, 'zatca_real_certificate.pem'), 'utf-8');
    certB64 = pemToB64(pem);

    const stdXml = await fs.readFile(join(GOLDEN_DIR, 'Standard_Invoice_Signed.xml'), 'utf-8');
    const simpXml = await fs.readFile(join(GOLDEN_DIR, 'Simplified_Invoice_Signed.xml'), 'utf-8');
    stdQrB64 = extractQrB64(stdXml);
    simpQrB64 = extractQrB64(simpXml);
    stdTags = decodeTlv(Buffer.from(stdQrB64, 'base64'));
    simpTags = decodeTlv(Buffer.from(simpQrB64, 'base64'));
  });

  function composerFor(tags: Map<number, Buffer>): NodeInvoiceSigningComposer {
    const signer = stubSigner(
      tags.get(6)!.toString('utf-8'),
      tags.get(7)!.toString('utf-8'),
      certB64
    );
    return new NodeInvoiceSigningComposer(signer, certLoader, assembler, tlv, injector);
  }

  describe('Contract', () => {
    it('declares an implementation name', () => {
      const c = composerFor(stdTags);
      expect(c.name).toBe('NodeInvoiceSigningComposer');
    });
  });

  describe('Byte-for-byte QR vs golden (full compose chain)', () => {
    it('Standard invoice composes the exact golden QR (Tags 1–8)', async () => {
      const c = composerFor(stdTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(stdTags), 'standard'),
        CRED,
        SIGNING_TIME
      );
      expect(out.qrBase64).toBe(stdQrB64);
    });

    it('Simplified invoice composes the exact golden QR (Tags 1–9)', async () => {
      const c = composerFor(simpTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(simpTags), 'simplified'),
        CRED,
        SIGNING_TIME
      );
      expect(out.qrBase64).toBe(simpQrB64);
    });
  });

  describe('Tag-9 gate is driven by metadata.dbInvoiceType', () => {
    it('standard QR carries Tag 8 but NOT Tag 9', async () => {
      const c = composerFor(stdTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(stdTags), 'standard'),
        CRED,
        SIGNING_TIME
      );
      const tags = decodeTlv(Buffer.from(out.qrBase64, 'base64'));
      expect(tags.has(8)).toBe(true);
      expect(tags.has(9)).toBe(false);
    });

    it('simplified QR carries Tag 9', async () => {
      const c = composerFor(simpTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(simpTags), 'simplified'),
        CRED,
        SIGNING_TIME
      );
      const tags = decodeTlv(Buffer.from(out.qrBase64, 'base64'));
      expect(tags.has(9)).toBe(true);
    });
  });

  describe('SSOT by-products surfaced for S5.2 / S5.3', () => {
    it('returns the golden hash, signature and certificate without re-parsing', async () => {
      const c = composerFor(simpTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(simpTags), 'simplified'),
        CRED,
        SIGNING_TIME
      );
      expect(out.invoiceHashB64).toBe(simpTags.get(6)!.toString('utf-8'));
      expect(out.signatureValueB64).toBe(simpTags.get(7)!.toString('utf-8'));
      expect(out.certificateB64).toBe(certB64);
    });
  });

  describe('QR is injected into the signed XML', () => {
    it('places the composed QR into the placeholder and removes the stub comment', async () => {
      const c = composerFor(simpTags);
      const out = await c.compose(
        xmlBuildOutputFor(ublFromTags(simpTags), 'simplified'),
        CRED,
        SIGNING_TIME
      );
      expect(out.signedXml).toContain(simpQrB64);
      expect(out.signedXml).not.toContain('QR TLV base64');
      // PIH content must be untouched by the QR injection.
      expect(out.signedXml).toContain('NWZlY2ViNjY=');
    });
  });
});
