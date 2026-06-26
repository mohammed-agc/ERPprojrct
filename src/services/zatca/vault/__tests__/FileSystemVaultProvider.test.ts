/**
 * Tests for FileSystemVaultProvider.
 *
 * Per AD-012 v2 Layer 2 (Unit Tests).
 *
 * Cross-platform: works on Windows / Linux / Mac without openssl in PATH.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  generateKeyPairSync,
  createPublicKey,
  createVerify,
  randomBytes,
  X509Certificate,
} from 'node:crypto';
import { FileSystemVaultProvider } from '../FileSystemVaultProvider';
import type { CredentialId } from '../VaultProvider';
import { VaultError } from '../VaultProvider';

const TEST_CERTIFICATE_PEM = `-----BEGIN CERTIFICATE-----
MIIBtzCCAV2gAwIBAgIUV8V8FVpxEjv+kTS4dkUfTkmmgNYwCgYIKoZIzj0EAwIw
MTETMBEGA1UEAwwKWkFUQ0EtVGVzdDENMAsGA1UECgwEVGVzdDELMAkGA1UEBhMC
U0EwHhcNMjYwNjI2MDY1OTAwWhcNMzYwNjIzMDY1OTAwWjAxMRMwEQYDVQQDDApa
QVRDQS1UZXN0MQ0wCwYDVQQKDARUZXN0MQswCQYDVQQGEwJTQTBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABG/2fgRJst14KxtOqK3lFls8lQce2RmjlQRdMk8d0Gbg
fXor4euOEJzwVHduK4U/DbI/FjmlMUycnpAM1azx/k+jUzBRMB0GA1UdDgQWBBSM
QThUwxW2RS13J0r2h4583AvksDAfBgNVHSMEGDAWgBSMQThUwxW2RS13J0r2h458
3AvksDAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIGA5VyBM7gBL
9SeRXFd/Rf/5MfIA0EZe35iKQzlUwTVaAiEA4YQCosEUOKR/rA7y95Gv0iWPFVF8
7Up1HISeFGnR+A0=
-----END CERTIFICATE-----
`;

describe('FileSystemVaultProvider', () => {
  let vaultRoot: string;
  let provider: FileSystemVaultProvider;
  const testCredentialId = 'test-cred-001' as CredentialId;
  let publicKeyPem: string;

  beforeAll(async () => {
    vaultRoot = await fs.mkdtemp(join(tmpdir(), 'zatca-vault-test-'));
    vaultRoot = resolve(vaultRoot);

    const credDir = join(vaultRoot, 'credentials', testCredentialId);
    await fs.mkdir(credDir, { recursive: true });

    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'P-256',
    });

    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    await fs.writeFile(join(credDir, 'private.pem'), privateKeyPem, { mode: 0o400 });
    await fs.writeFile(join(credDir, 'certificate.pem'), TEST_CERTIFICATE_PEM, { mode: 0o444 });

    provider = new FileSystemVaultProvider({
      vaultRoot,
      enforcePermissions: process.platform !== 'win32',
    });
  });

  afterAll(async () => {
    await fs.rm(vaultRoot, { recursive: true, force: true });
  });

  describe('sign()', () => {
    it('produces a 64-byte raw ECDSA P-256 signature (base64-encoded)', async () => {
      const data = randomBytes(32);
      const signatureB64 = await provider.sign(testCredentialId, data, 'ECDSA_P256_SHA256');

      expect(signatureB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
      const sigBytes = Buffer.from(signatureB64, 'base64');
      expect(sigBytes.length).toBe(64);
    });

    it('produces a signature that verifies against the public key', async () => {
      const data = Buffer.from('zatca-test-payload-for-verification', 'utf-8');
      const signatureB64 = await provider.sign(testCredentialId, data, 'ECDSA_P256_SHA256');

      const sigBytes = Buffer.from(signatureB64, 'base64');
      const publicKey = createPublicKey(publicKeyPem);

      const verifier = createVerify('sha256');
      verifier.update(data);
      verifier.end();

      const verified = verifier.verify(
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        sigBytes
      );

      expect(verified).toBe(true);
    });

    it('rejects unsupported algorithms with UNSUPPORTED_ALGORITHM', async () => {
      const data = randomBytes(32);
      await expect(
        provider.sign(testCredentialId, data, 'RSA_SHA256' as never)
      ).rejects.toThrow(VaultError);
    });

    it('throws CREDENTIAL_NOT_FOUND for missing credential', async () => {
      const data = randomBytes(32);
      try {
        await provider.sign('nonexistent' as CredentialId, data, 'ECDSA_P256_SHA256');
        expect.fail('Expected VaultError');
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
        expect((err as VaultError).code).toBe('CREDENTIAL_NOT_FOUND');
      }
    });

    it('rejects credential IDs with invalid characters (path traversal defense)', async () => {
      const data = randomBytes(32);
      try {
        await provider.sign('../escape' as CredentialId, data, 'ECDSA_P256_SHA256');
        expect.fail('Expected VaultError');
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
        expect((err as VaultError).code).toBe('CREDENTIAL_NOT_FOUND');
      }
    });

    it('produces different signatures for different inputs', async () => {
      const data1 = Buffer.from('payload-1');
      const data2 = Buffer.from('payload-2');

      const sig1 = await provider.sign(testCredentialId, data1, 'ECDSA_P256_SHA256');
      const sig2 = await provider.sign(testCredentialId, data2, 'ECDSA_P256_SHA256');

      expect(sig1).not.toBe(sig2);
    });

    it('produces different signatures for the same input (ECDSA randomness)', async () => {
      const data = Buffer.from('same-payload');

      const sig1 = await provider.sign(testCredentialId, data, 'ECDSA_P256_SHA256');
      const sig2 = await provider.sign(testCredentialId, data, 'ECDSA_P256_SHA256');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('getCertificate()', () => {
    it('returns a base64-encoded certificate body (no PEM markers)', async () => {
      const certB64 = await provider.getCertificate(testCredentialId);
      expect(certB64).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(certB64).not.toContain('BEGIN');
      expect(certB64).not.toContain('END');
    });

    it('returned certificate is parseable by X509Certificate', async () => {
      const certB64 = await provider.getCertificate(testCredentialId);
      const certDer = Buffer.from(certB64, 'base64');
      const cert = new X509Certificate(certDer);
      expect(cert.subject).toBeTruthy();
      expect(cert.subject).toContain('ZATCA-Test');
    });

    it('throws CREDENTIAL_NOT_FOUND for missing certificate', async () => {
      try {
        await provider.getCertificate('nonexistent' as CredentialId);
        expect.fail('Expected VaultError');
      } catch (err) {
        expect(err).toBeInstanceOf(VaultError);
        expect((err as VaultError).code).toBe('CREDENTIAL_NOT_FOUND');
      }
    });
  });

  describe('isAccessible()', () => {
    it('returns true for an existing accessible credential', async () => {
      const accessible = await provider.isAccessible(testCredentialId);
      expect(accessible).toBe(true);
    });

    it('returns false for a missing credential', async () => {
      const accessible = await provider.isAccessible('nonexistent' as CredentialId);
      expect(accessible).toBe(false);
    });

    it('returns false for invalid credential ID format (does not throw)', async () => {
      const accessible = await provider.isAccessible('../etc' as CredentialId);
      expect(accessible).toBe(false);
    });
  });

  describe('error sanitization', () => {
    it('does not leak file paths in error messages', async () => {
      try {
        await provider.sign('nonexistent' as CredentialId, randomBytes(32), 'ECDSA_P256_SHA256');
      } catch (err) {
        const message = (err as Error).message;
        expect(message).not.toContain(vaultRoot);
      }
    });
  });
});