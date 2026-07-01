/**
 * FileSystemVaultWriter — the on-disk VaultWriter.
 *
 * Writes durable credential assets into the single canonical layout that the
 * signing/submission providers read:
 *   <vaultRoot>/credentials/<credentialId>/{private.pem,certificate.pem,
 *                                           compliance.json,metadata.json}
 *
 * Every write is:
 *   - path-safe: credentialId is regex-guarded against traversal, vaultRoot is
 *     absolute (mirrors FileSystemVaultProvider's posture);
 *   - directory-creating: the credential dir is created (0700) if missing;
 *   - atomic: content is written to a temp file in the same dir, fsync'd, then
 *     renamed over the target — a reader never sees a half-written file;
 *   - permissioned: secrets 0600, public assets 0644 (best-effort on Windows,
 *     effective on the Linux production target);
 *   - overwrite-guarded: an existing target is a loud ALREADY_EXISTS error unless
 *     options.overwrite is set. The writer executes; the caller decides policy.
 */

import { promises as fs } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import {
  VaultWriteError,
  type VaultWriter,
  type WriteOptions,
  type ComplianceCredentialMaterial,
  type CredentialMetadata,
} from './VaultWriter';

const CREDENTIAL_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** File permission modes (octal). Secrets are owner-only. */
const MODE_SECRET = 0o600;
const MODE_PUBLIC = 0o644;
const MODE_DIR = 0o700;

export interface FileSystemVaultWriterConfig {
  /** Absolute vault root — the SAME root the signing/submission providers use. */
  readonly vaultRoot: string;
}

export class FileSystemVaultWriter implements VaultWriter {
  readonly implementationName = 'FileSystemVaultWriter';
  private readonly vaultRoot: string;

  constructor(config: FileSystemVaultWriterConfig) {
    const resolved = resolve(config.vaultRoot);
    if (!isAbsolute(resolved)) {
      throw new VaultWriteError(
        'WRITE_FAILED',
        `vaultRoot must be absolute, got "${config.vaultRoot}"`
      );
    }
    this.vaultRoot = resolved;
  }

  storePrivateKey(
    credentialId: string,
    privateKeyPem: string,
    options?: WriteOptions
  ): Promise<void> {
    return this.writeFile(
      credentialId,
      'private.pem',
      privateKeyPem,
      MODE_SECRET,
      options
    );
  }

  storeCertificate(
    credentialId: string,
    certificatePem: string,
    options?: WriteOptions
  ): Promise<void> {
    return this.writeFile(
      credentialId,
      'certificate.pem',
      certificatePem,
      MODE_PUBLIC,
      options
    );
  }

  storeComplianceCredential(
    credentialId: string,
    credential: ComplianceCredentialMaterial,
    options?: WriteOptions
  ): Promise<void> {
    const body = JSON.stringify(
      {
        binarySecurityToken: credential.binarySecurityToken,
        secret: credential.secret,
      },
      null,
      2
    );
    return this.writeFile(
      credentialId,
      'compliance.json',
      body,
      MODE_SECRET,
      options
    );
  }

  storeMetadata(
    credentialId: string,
    metadata: CredentialMetadata,
    options?: WriteOptions
  ): Promise<void> {
    return this.writeFile(
      credentialId,
      'metadata.json',
      JSON.stringify(metadata, null, 2),
      MODE_PUBLIC,
      options
    );
  }

  /** Shared invariant: validate → mkdir → guard overwrite → atomic write → chmod. */
  private async writeFile(
    credentialId: string,
    fileName: string,
    content: string,
    mode: number,
    options?: WriteOptions
  ): Promise<void> {
    if (!CREDENTIAL_ID_RE.test(credentialId)) {
      throw new VaultWriteError(
        'INVALID_CREDENTIAL_ID',
        `invalid credentialId "${credentialId}"`
      );
    }

    const dir = join(this.vaultRoot, 'credentials', credentialId);
    const target = join(dir, fileName);

    await fs.mkdir(dir, { recursive: true, mode: MODE_DIR });

    if (!options?.overwrite) {
      const exists = await fs
        .access(target)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        throw new VaultWriteError(
          'ALREADY_EXISTS',
          `${fileName} already exists for "${credentialId}" — pass overwrite to replace`,
          { target }
        );
      }
    }

    // Atomic: write to a temp file in the same dir, then rename over the target.
    const tmp = join(dir, `.${fileName}.tmp-${process.pid}-${Date.now()}`);
    try {
      const handle = await fs.open(tmp, 'w', mode);
      try {
        await handle.writeFile(content, 'utf-8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(tmp, target);
      // Re-assert mode after rename (umask may have masked the open mode).
      await fs.chmod(target, mode).catch(() => undefined);
    } catch (err) {
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      throw new VaultWriteError(
        'WRITE_FAILED',
        `failed to write ${fileName} for "${credentialId}": ${
          err instanceof Error ? err.message : String(err)
        }`,
        { target }
      );
    }
  }
}

export function createVaultWriter(
  config: FileSystemVaultWriterConfig
): VaultWriter {
  return new FileSystemVaultWriter(config);
}
