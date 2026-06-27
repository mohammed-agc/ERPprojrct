import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { XmlCryptoCanonicalizationProvider } from './canonicalization/XmlCryptoCanonicalizationProvider';
import { NodeCryptoHashProvider } from './hash/NodeCryptoHashProvider';

const GOLDEN_REF1 = 'w3MZKM0CTHawhhST7Q2qD0mi9Dc/Xc2pD1ASiXFwpJY=';
const FIXTURE = 'src/services/zatca/__fixtures__/zatca-golden/Standard_Invoice_Unsigned.xml';

function stripReference1Exclusions(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const removeByTag = (qname: string, pred?: (el: any) => boolean) => {
    const els = Array.from(doc.getElementsByTagName(qname) as any) as any[];
    let removed = 0;
    for (const el of els) {
      if (pred && !pred(el)) continue;
      el.parentNode?.removeChild(el);
      removed++;
    }
    return removed;
  };
  const a = removeByTag('ext:UBLExtensions');
  const b = removeByTag('cac:Signature');
  const c = removeByTag('cac:AdditionalDocumentReference', (el) => {
    const id = el.getElementsByTagName('cbc:ID')[0]?.textContent?.trim();
    return id === 'QR';
  });
  // eslint-disable-next-line no-console
  console.log('stripped counts -> UBLExtensions:', a, 'cac:Signature:', b, 'QR-ADR:', c);
  return new XMLSerializer().serializeToString(doc);
}

describe('Reference#1 derivation gate (golden)', () => {
  it('strip(3) + C14N + SHA-256 reproduces golden invoice hash', () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const stripped = stripReference1Exclusions(xml);
    const canonical = new XmlCryptoCanonicalizationProvider().canonicalize(stripped);
    const digest = new NodeCryptoHashProvider().computeRawDigest(canonical);
    // eslint-disable-next-line no-console
    console.log('actual digest:', digest);
    expect(digest).toBe(GOLDEN_REF1);
  });
});