/**
 * NodeXadesSigner — S3.3 golden gate.
 *
 * Proves XadesSigner end-to-end with the REAL providers + FileSystemVaultProvider
 * over the TA-001 test identity. Asserts everything XadesSigner owns:
 *   1. Reference#1 invoice hash === golden (byte-exact)
 *   2. injection happened (ds:Signature present, signedXml changed)
 *   3. SignatureValue verifies via ECDSA against invoiceHashBytes (ADR-025 shape)
 *   4. result fields are wired (QR Tags 6/7/8)
 *
 * NOT asserted: signedXml === golden byte-for-byte (different cert/key than the
 * php-zatca golden; SignatureValue is non-deterministic). ZATCA acceptance is a
 * Layer-4 Contract Test concern (AD-012).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, createVerify, X509Certificate } from 'node:crypto';

import { XmlCryptoCanonicalizationProvider } from '../canonicalization/XmlCryptoCanonicalizationProvider';
import { NodeCryptoHashProvider } from '../hash/NodeCryptoHashProvider';
import { NodeCryptoCertificateLoader } from '../certificate/NodeCryptoCertificateLoader';
import { TemplateSignedPropertiesProvider } from '../signed-properties/TemplateSignedPropertiesProvider';
import { FileSystemVaultProvider } from '../vault/FileSystemVaultProvider';
import type { CredentialId } from '../vault/VaultProvider';
import { NodeXadesSigner } from './NodeXadesSigner';

const GOLDEN_REF1 = 'w3MZKM0CTHawhhST7Q2qD0mi9Dc/Xc2pD1ASiXFwpJY=';
const TA001 = 'src/services/zatca/__fixtures__/ta-001';
const UNSIGNED = 'src/services/zatca/__fixtures__/zatca-golden/Standard_Invoice_Unsigned.xml';

describe('S3.3 XadesSigner — golden gate (TA-001)', () => {
  let vaultRoot: string;
  let signer: NodeXadesSigner;
  const credentialId = 'ta-001' as CredentialId;

  beforeAll(async () => {
    vaultRoot = resolve(join(tmpdir(), `xades-test-${randomBytes(8).toString('hex')}`));
    const credDir = join(vaultRoot, 'credentials', credentialId);
    await fs.mkdir(credDir, { recursive: true });
    await fs.copyFile(`${TA001}/private.pem`, join(credDir, 'private.pem'));
    await fs.copyFile(`${TA001}/certificate.pem`, join(credDir, 'certificate.pem'));

    const hash = new NodeCryptoHashProvider();
    const vault = new FileSystemVaultProvider({
      vaultRoot,
      enforcePermissions: process.platform !== 'win32',
    });

    signer = new NodeXadesSigner(
      new XmlCryptoCanonicalizationProvider(),
      hash,
      new NodeCryptoCertificateLoader(hash),
      new TemplateSignedPropertiesProvider(hash),
      vault,
    );
  });

  afterAll(async () => {
    try { await fs.rm(vaultRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('signs end-to-end and satisfies all four invariants', async () => {
    const unsignedXml = readFileSync(UNSIGNED, 'utf8');
    const result = await signer.signXml({
      unsignedXml,
      credentialId,
      signingTime: '2025-02-27T20:52:40',
    });

    // 1. Reference#1 byte-exact vs golden.
    expect(result.invoiceHashB64).toBe(GOLDEN_REF1);

    // 2. Injection happened.
    expect(result.signedXml).not.toBe(unsignedXml);
    expect(result.signedXml).toContain('<ds:Signature');
    expect(result.signedXml).toContain('<xades:SignedProperties');
    expect(result.signedXml).not.toContain('XAdES Signature placeholder');

    // 3. SignatureValue verifies (ADR-025: over invoiceHashBytes).
    const certPem = readFileSync(`${TA001}/certificate.pem`, 'utf8');
    const pub = new X509Certificate(certPem).publicKey;
    const invoiceHashBytes = Buffer.from(result.invoiceHashB64, 'base64');
    const ok = createVerify('sha256')
      .update(invoiceHashBytes)
      .verify({ key: pub, dsaEncoding: 'der' }, Buffer.from(result.signatureValueB64, 'base64'));
    expect(ok).toBe(true);

    // 4. Result fields wired.
    expect(result.invoiceHashB64.length).toBe(44);
    expect(result.certificateB64.length).toBeGreaterThan(0);
    expect(result.signedXml).toContain(result.signatureValueB64);
    expect(result.signedXml).toContain(result.certificateB64);
  });
});