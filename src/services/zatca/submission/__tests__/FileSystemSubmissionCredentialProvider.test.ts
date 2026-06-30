import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileSystemSubmissionCredentialProvider } from '../FileSystemSubmissionCredentialProvider';

let root: string;
const CRED = 'cred-abc_123';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'zatca-vault-'));
  const dir = join(root, 'credentials', CRED);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'compliance.json'),
    JSON.stringify({ binarySecurityToken: 'BST123', secret: 'SEC456' }),
    'utf-8'
  );
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('FileSystemSubmissionCredentialProvider', () => {
  it('reads binarySecurityToken + secret from compliance.json', async () => {
    const p = new FileSystemSubmissionCredentialProvider({ vaultRoot: root });
    const c = await p.getApiCredential(CRED);
    expect(c).toEqual({ binarySecurityToken: 'BST123', secret: 'SEC456' });
  });

  it('throws loudly when the credential has no compliance.json', async () => {
    const p = new FileSystemSubmissionCredentialProvider({ vaultRoot: root });
    await expect(p.getApiCredential('no-such-cred')).rejects.toThrow(
      /no API credential/
    );
  });

  it('rejects an invalid credentialId (path-traversal guard)', async () => {
    const p = new FileSystemSubmissionCredentialProvider({ vaultRoot: root });
    await expect(p.getApiCredential('../../etc')).rejects.toThrow(
      /invalid credentialId/
    );
  });

  it('throws when a required field is missing', async () => {
    const dir = join(root, 'credentials', 'partial');
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'compliance.json'),
      JSON.stringify({ binarySecurityToken: 'only-bst' }),
      'utf-8'
    );
    const p = new FileSystemSubmissionCredentialProvider({ vaultRoot: root });
    await expect(p.getApiCredential('partial')).rejects.toThrow(/secret/);
  });

  it('throws on malformed JSON', async () => {
    const dir = join(root, 'credentials', 'badjson');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'compliance.json'), '{ not json', 'utf-8');
    const p = new FileSystemSubmissionCredentialProvider({ vaultRoot: root });
    await expect(p.getApiCredential('badjson')).rejects.toThrow(/valid JSON/);
  });

  it('requires an absolute vaultRoot', () => {
    expect(
      () =>
        new FileSystemSubmissionCredentialProvider({
          vaultRoot: 'relative/path',
        })
    ).toThrow(/absolute/);
  });
});
