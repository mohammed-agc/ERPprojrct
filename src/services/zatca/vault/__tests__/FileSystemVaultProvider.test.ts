/**
 * Tests for FileSystemVaultProvider (Phase 2 Refactored).
 *
 * Per AI-001 Phase 2 Refactoring.
 * Per AD-012 v2 Layer 2 (Unit Tests).
 *
 * KEY ADDITIONS (vs v1.24 tests):
 *   - Test that the Vault accepts ANY EC curve (curve-agnostic)
 *   - Test that the SigningAlgorithm has been widened to 'ECDSA_SHA256'
 *   - Removed assertions about "must be P-256 / 64 bytes"
 *
 * Strategy:
 *   - Cert: embedded test fixture (real ECDSA P-256 self-signed cert)
 *   - Key:  ephemeral, generated per test run via Node crypto
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

describe('FileSystemVaultProvider (Phase 2 Refactored)', () => {
  let vaultRoot: string;
  let provider: FileSystemVaultProvider;
  const credentialId = 'test-cred-001' as CredentialId;

  beforeAll(async () => {
    // Setup vault directory in OS temp folder
    vaultRoot = resolve(
      join(tmpdir(), `vault-test-${randomBytes(8).toString('hex')}`)
    );
    await fs.mkdir(vaultRoot, { recursive: true });

    const credDir = join(vaultRoot, 'credentials', credentialId);
    await fs.mkdir(credDir, { recursive: true });

    // Generate ephemeral prime256v1 (P-256) key
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const privateKeyPem = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;

    await fs.writeFile(join(credDir, 'private.pem'), privateKeyPem, {
      mode: 0o400,
    });
    await fs.writeFile(join(credDir, 'certificate.pem'), TEST_CERTIFICATE_PEM, {
      mode: 0o444,
    });

    provider = new FileSystemVaultProvider({
      vaultRoot,
      enforcePermissions: process.platform !== 'win32',
    });
  });

  afterAll(async () => {
    try {
      await fs.rm(vaultRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  describe('Phase 2 refactoring contract', () => {
    it('accepts the algorithm string "ECDSA_SHA256" (widened, curve-agnostic)', async () => {
      const data = Buffer.from('hello phase 2');
      const signature = await provider.sign(
        credentialId,
        data,
        'ECDSA_SHA256'
      );
      expect(signature).toBeTruthy();
      expect(typeof signature).toBe('string');
    });

    it('does NOT throw when key is prime256v1 (no curve enforcement)', async () => {
      // This test exists to lock the behavior change: pre-refactor, the Vault
      // enforced curve. Post-refactor, it does not.
      const data = Buffer.from('phase 2 curve check removed');
      await expect(
        provider.sign(credentialId, data, 'ECDSA_SHA256')
      ).resolves.toBeTruthy();
    });

    it('would also sign with secp256k1 key (curve-agnostic)', async () => {
      // Setup a credential with secp256k1 key — proves Vault no longer enforces P-256
      const secp256k1CredId = 'test-cred-secp256k1' as CredentialId;
      const credDir = join(vaultRoot, 'credentials', secp256k1CredId);
      await fs.mkdir(credDir, { recursive: true });

      const { privateKey } = generateKeyPairSync('ec', {
        namedCurve: 'secp256k1',
      });
      const privateKeyPem = privateKey.export({
        type: 'pkcs8',
        format: 'pem',
      }) as string;
      await fs.writeFile(join(credDir, 'private.pem'), privateKeyPem, {
        mode: 0o400,
      });
      await fs.writeFile(
        join(credDir, 'certificate.pem'),
        TEST_CERTIFICATE_PEM, // certificate content irrelevant for sign() test
        { mode: 0o444 }
      );

      const data = Buffer.from('curve-agnostic test');
      const signature = await provider.sign(
        secp256k1CredId,
        data,
        'ECDSA_SHA256'
      );

      // Sign succeeded (would have thrown in v1.24!)
      expect(signature).toBeTruthy();

      // Decode to check signature length (256-bit curve raw = 64 bytes)
      const sigBuf = Buffer.from(signature, 'base64');
      expect(sigBuf.length).toBe(64);
    });

    it('rejects an unsupported algorithm string', async () => {
      const data = Buffer.from('test');
      // @ts-expect-error — intentional bad value to test runtime guard
      await expect(provider.sign(credentialId, data, 'RSA_SHA256')).rejects.toThrow(
        VaultError
      );
    });
  });

  describe('basic Vault operations (unchanged from v1.24)', () => {
    it('returns the certificate as base64 (DER, no PEM markers)', async () => {
      const cert = await provider.getCertificate(credentialId);
      expect(cert).not.toContain('BEGIN CERTIFICATE');
      expect(cert).not.toContain('-----');
      // Should be valid base64
      expect(cert).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it('isAccessible returns true for existing credential', async () => {
      const accessible = await provider.isAccessible(credentialId);
      expect(accessible).toBe(true);
    });

    it('isAccessible returns false for missing credential', async () => {
      const accessible = await provider.isAccessible(
        'nonexistent' as CredentialId
      );
      expect(accessible).toBe(false);
    });

    it('sign throws CREDENTIAL_NOT_FOUND for missing credential', async () => {
      const data = Buffer.from('test');
      await expect(
        provider.sign('nonexistent' as CredentialId, data, 'ECDSA_SHA256')
      ).rejects.toMatchObject({
        code: 'CREDENTIAL_NOT_FOUND',
      });
    });

    it('getCertificate throws CREDENTIAL_NOT_FOUND for missing credential', async () => {
      await expect(
        provider.getCertificate('nonexistent' as CredentialId)
      ).rejects.toMatchObject({
        code: 'CREDENTIAL_NOT_FOUND',
      });
    });

    it('rejects credentialId with path traversal characters', async () => {
      const data = Buffer.from('test');
      await expect(
        provider.sign('../etc/passwd' as CredentialId, data, 'ECDSA_SHA256')
      ).rejects.toMatchObject({
        code: 'CREDENTIAL_NOT_FOUND',
      });
    });
  });

  describe('signature properties (with prime256v1 fixture key)', () => {
    it('produces a 64-byte raw signature for 256-bit curves', async () => {
      const data = Buffer.from('verify length');
      const signature = await provider.sign(
        credentialId,
        data,
        'ECDSA_SHA256'
      );
      const sigBuf = Buffer.from(signature, 'base64');
      // For prime256v1 (256-bit), raw r||s = 64 bytes
      expect(sigBuf.length).toBe(64);
    });

    it('signature is verifiable with the corresponding public key', async () => {
      // Read the actual private key we wrote, derive public, verify
      const privateKeyPem = await fs.readFile(
        join(vaultRoot, 'credentials', credentialId, 'private.pem'),
        'utf-8'
      );
      const { createPrivateKey } = await import('node:crypto');
      const privateKey = createPrivateKey({ key: privateKeyPem, format: 'pem' });
      const publicKey = createPublicKey(privateKey);

      const data = Buffer.from('verify me');
      const signature = await provider.sign(
        credentialId,
        data,
        'ECDSA_SHA256'
      );

      const verifier = createVerify('sha256');
      verifier.update(data);
      verifier.end();
      const verified = verifier.verify(
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64')
      );
      expect(verified).toBe(true);
    });

    it('two signatures of the same data are different (ECDSA is non-deterministic)', async () => {
      const data = Buffer.from('repeated data');
      const sig1 = await provider.sign(credentialId, data, 'ECDSA_SHA256');
      const sig2 = await provider.sign(credentialId, data, 'ECDSA_SHA256');
      // ECDSA uses a random nonce by default; two signatures over the same data
      // will differ. (This is by design — RFC 6979 deterministic ECDSA is a
      // separate variant Node does not produce by default.)
      expect(sig1).not.toBe(sig2);
    });
  });

  describe('absolute path enforcement', () => {
    it('constructor rejects non-absolute vaultRoot', () => {
      expect(
        () =>
          new FileSystemVaultProvider({
            vaultRoot: 'relative/path',
            enforcePermissions: false,
          })
      ).toThrow(VaultError);
    });
  });
});
