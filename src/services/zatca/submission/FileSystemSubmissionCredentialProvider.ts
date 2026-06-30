/**
 * FileSystemSubmissionCredentialProvider — reads the ZATCA API credential
 * (binarySecurityToken + secret) for a credentialId from the Vault, beside
 * private.pem / certificate.pem:
 *
 *   <vaultRoot>/credentials/<credentialId>/compliance.json
 *     { "binarySecurityToken": "...", "secret": "..." }
 *
 * Mirrors FileSystemVaultProvider's posture: absolute vaultRoot, credentialId
 * is regex-guarded against path traversal, and ABSENCE / malformation is a loud
 * error — never a silent empty credential (No Silent Assumptions).
 */

import { readFile } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import type {
  SubmissionCredentialProvider,
  SubmissionApiCredential,
} from './SubmissionCoordinator';

export interface FileSystemSubmissionCredentialConfig {
  /** Absolute vault root (same root the signing vault uses). */
  readonly vaultRoot: string;
}

const CREDENTIAL_ID_RE = /^[a-zA-Z0-9_-]+$/;

export class FileSystemSubmissionCredentialProvider
  implements SubmissionCredentialProvider
{
  private readonly vaultRoot: string;

  constructor(config: FileSystemSubmissionCredentialConfig) {
    if (!isAbsolute(config.vaultRoot)) {
      throw new Error(
        `SubmissionCredentialProvider: vaultRoot must be absolute, got "${config.vaultRoot}"`
      );
    }
    this.vaultRoot = config.vaultRoot;
  }

  async getApiCredential(
    credentialId: string
  ): Promise<SubmissionApiCredential> {
    if (!CREDENTIAL_ID_RE.test(credentialId)) {
      throw new Error(
        `SubmissionCredentialProvider: invalid credentialId "${credentialId}"`
      );
    }

    const path = join(
      this.vaultRoot,
      'credentials',
      credentialId,
      'compliance.json'
    );

    let raw: string;
    try {
      raw = await readFile(path, 'utf-8');
    } catch {
      throw new Error(
        `SubmissionCredentialProvider: no API credential for "${credentialId}" (${path})`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(
        `SubmissionCredentialProvider: compliance.json is not valid JSON (${path})`
      );
    }

    const o = (parsed ?? {}) as Record<string, unknown>;
    const bst = o.binarySecurityToken;
    const secret = o.secret;

    if (typeof bst !== 'string' || bst.length === 0) {
      throw new Error(
        `SubmissionCredentialProvider: compliance.json missing binarySecurityToken (${path})`
      );
    }
    if (typeof secret !== 'string' || secret.length === 0) {
      throw new Error(
        `SubmissionCredentialProvider: compliance.json missing secret (${path})`
      );
    }

    return { binarySecurityToken: bst, secret };
  }
}
