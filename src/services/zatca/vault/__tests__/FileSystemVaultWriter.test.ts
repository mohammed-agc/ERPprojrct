// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSystemVaultWriter } from '../FileSystemVaultWriter';
import { VaultWriteError } from '../VaultWriter';

const CRED = 'c5215b9e-7fa5-4df5-8b4a-776d3bcd53b6';

let vaultRoot: string;
let writer: FileSystemVaultWriter;

function credPath(file: string): string {
  return join(vaultRoot, 'credentials', CRED, file);
}

beforeEach(async () => {
  vaultRoot = await fs.mkdtemp(join(tmpdir(), 'vault-writer-'));
  writer = new FileSystemVaultWriter({ vaultRoot });
});

afterEach(async () => {
  await fs.rm(vaultRoot, { recursive: true, force: true }).catch(() => undefined);
});

describe('FileSystemVaultWriter — canonical layout', () => {
  it('writes private.pem under credentials/<id>/', async () => {
    await writer.storePrivateKey(CRED, 'PKEY');
    const body = await fs.readFile(credPath('private.pem'), 'utf-8');
    expect(body).toBe('PKEY');
  });

  it('writes certificate.pem', async () => {
    await writer.storeCertificate(CRED, 'CERT');
    expect(await fs.readFile(credPath('certificate.pem'), 'utf-8')).toBe('CERT');
  });

  it('writes compliance.json as valid JSON with both fields', async () => {
    await writer.storeComplianceCredential(CRED, {
      binarySecurityToken: 'BST',
      secret: 'SEC',
    });
    const parsed = JSON.parse(await fs.readFile(credPath('compliance.json'), 'utf-8'));
    expect(parsed).toEqual({ binarySecurityToken: 'BST', secret: 'SEC' });
  });

  it('writes metadata.json from caller-owned content', async () => {
    await writer.storeMetadata(CRED, {
      credentialType: 'CCSID',
      environment: 'sandbox',
    });
    const parsed = JSON.parse(await fs.readFile(credPath('metadata.json'), 'utf-8'));
    expect(parsed.credentialType).toBe('CCSID');
    expect(parsed.environment).toBe('sandbox');
  });

  it('creates the credential directory if missing', async () => {
    // Nothing pre-created; the write must mkdir -p.
    await writer.storePrivateKey(CRED, 'PKEY');
    const stat = await fs.stat(join(vaultRoot, 'credentials', CRED));
    expect(stat.isDirectory()).toBe(true);
  });
});

describe('FileSystemVaultWriter — overwrite policy', () => {
  it('refuses to overwrite an existing file by default', async () => {
    await writer.storePrivateKey(CRED, 'FIRST');
    await expect(writer.storePrivateKey(CRED, 'SECOND')).rejects.toThrow(
      VaultWriteError
    );
    // Original is untouched.
    expect(await fs.readFile(credPath('private.pem'), 'utf-8')).toBe('FIRST');
  });

  it('reports ALREADY_EXISTS as the error code', async () => {
    await writer.storeCertificate(CRED, 'A');
    await expect(writer.storeCertificate(CRED, 'B')).rejects.toMatchObject({
      code: 'ALREADY_EXISTS',
    });
  });

  it('replaces the file when overwrite is set (rotation)', async () => {
    await writer.storeCertificate(CRED, 'OLD');
    await writer.storeCertificate(CRED, 'NEW', { overwrite: true });
    expect(await fs.readFile(credPath('certificate.pem'), 'utf-8')).toBe('NEW');
  });
});

describe('FileSystemVaultWriter — safety', () => {
  it('rejects a path-traversal credentialId', async () => {
    await expect(
      writer.storePrivateKey('../evil', 'x')
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL_ID' });
  });

  it('rejects a credentialId with slashes', async () => {
    await expect(
      writer.storePrivateKey('a/b', 'x')
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIAL_ID' });
  });

  it('leaves no .tmp files behind after a successful write', async () => {
    await writer.storePrivateKey(CRED, 'PKEY');
    const files = await fs.readdir(join(vaultRoot, 'credentials', CRED));
    expect(files.some((f) => f.includes('.tmp'))).toBe(false);
    expect(files).toContain('private.pem');
  });
});
