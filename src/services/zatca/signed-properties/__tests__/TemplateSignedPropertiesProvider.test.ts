import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NodeCryptoHashProvider } from '../../hash/NodeCryptoHashProvider';
import { TemplateSignedPropertiesProvider } from '../TemplateSignedPropertiesProvider';
import type { CertificateHashB64 } from '../../hash/HashProvider';

/**
 * S3.2 verification against the ZATCA golden reference.
 *
 * The expected digest and all input values are extracted from the real signed invoice
 * in __fixtures__/zatca-golden, so this test pins S3.2 to an invoice carrying a genuine
 * ZATCA certificate. If the template whitespace, namespaces, or encoding ever drift,
 * this test fails.
 */
const FIXTURES = join(__dirname, '..', '..', '__fixtures__', 'zatca-golden');
const goldenXml = readFileSync(join(FIXTURES, 'Standard_Invoice_Signed.xml'), 'utf8');

function extract(re: RegExp): string {
  const m = goldenXml.match(re);
  if (!m) throw new Error(`fixture missing pattern: ${re}`);
  return m[1].trim();
}

const signingTime = extract(/<xades:SigningTime>(.*?)<\/xades:SigningTime>/s);
const certDigest = extract(/<xades:CertDigest>[\s\S]*?<ds:DigestValue>(.*?)<\/ds:DigestValue>/s);
const issuerName = extract(/<ds:X509IssuerName>(.*?)<\/ds:X509IssuerName>/s);
const serialNumber = extract(/<ds:X509SerialNumber>(.*?)<\/ds:X509SerialNumber>/s);
const expectedDigest = extract(
  /URI="#xadesSignedProperties"[^>]*>\s*<ds:DigestMethod[^>]*\/>\s*<ds:DigestValue>(.*?)<\/ds:DigestValue>/s
);

describe('S3.2 TemplateSignedPropertiesProvider — golden reference', () => {
  const provider = new TemplateSignedPropertiesProvider(new NodeCryptoHashProvider());
  const result = provider.build({
    signingTime,
    certificateDigest: certDigest as CertificateHashB64,
    issuerName,
    serialNumber,
  });

  it('reproduces the Reference#2 digest from the golden invoice', () => {
    expect(result.digest).toBe(expectedDigest);
  });

  it('produces an 88-char base64-of-hex digest', () => {
    expect(result.digest).toHaveLength(88);
  });

  it('uses LF line endings only (no CRLF)', () => {
    expect(result.hashVersionXml.includes('\r')).toBe(false);
  });

  it('keeps DigestMethod self-closing (not C14N-expanded)', () => {
    expect(result.hashVersionXml).toContain(
      'Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>'
    );
  });

  it('declares xmlns:xades on the SignedProperties root', () => {
    expect(
      result.hashVersionXml.startsWith(
        '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#"'
      )
    ).toBe(true);
  });

  it('rejects empty signingTime', () => {
    expect(() =>
      provider.build({
        signingTime: '',
        certificateDigest: certDigest as CertificateHashB64,
        issuerName,
        serialNumber,
      })
    ).toThrow();
  });
});
