/**
 * FileSystemVaultProvider — Filesystem-backed implementation of VaultProvider.
 *
 * Architectural references:
 * - AD-004 v2: Hybrid Vault Strategy (FS for keys, DB for metadata)
 * - AD-014 v2: Security Constitution (file permissions, no logging of sensitive data)
 *
 * Layout:
 *   <vaultRoot>/
 *     credentials/
 *       <credentialId>/
 *         private.pem     (PEM-encoded EC P-256 private key — 0400 permissions)
 *         certificate.pem (PEM-encoded X.509 certificate — 0444 permissions)
 *
 * IMPORTANT:
 * - This is the development/on-premise implementation.
 * - For production cloud deployments, use AzureKeyVaultProvider or AwsKmsVaultProvider (future).
 * - Private keys NEVER leave this module — signing happens in-process via Node crypto.
 *
 * Permissions:
 * - private.pem: 0400 (read by owner only). Enforced at file write; verified at read.
 * - vaultRoot directory: 0700 minimum.
 *
 * Errors:
 * - All errors typed as VaultError (per AD-011 v2).
 * - Error messages contain no sensitive material (per AD-014 v2 Rule 2).
 */

import { createPrivateKey, createSign } from 'node:crypto';
import { promises as fs, constants as fsConstants } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  VaultProvider,
  CredentialId,
  CertificateB64,
  SignatureValueB64,
  DataToSign,
  SigningAlgorithm,
} from './VaultProvider';
import { VaultError } from './VaultProvider';

/**
 * Configuration for the filesystem vault.
 */
export interface FileSystemVaultConfig {
  /**
   * Absolute path to the vault root directory.
   * Must exist and have permissions 0700 or stricter.
   */
  readonly vaultRoot: string;

  /**
   * Whether to enforce file permission checks (recommended: true).
   * Set false only for Windows development where chmod has limited meaning.
   */
  readonly enforcePermissions: boolean;
}

/**
 * Implementation of VaultProvider backed by the local filesystem.
 *
 * Thread-safety: stateless; safe under concurrent calls.
 */
export class FileSystemVaultProvider implements VaultProvider {
  constructor(private readonly config: FileSystemVaultConfig) {
    // Defensive: resolve to absolute path to prevent path traversal via config.
    const resolved = resolve(config.vaultRoot);
    if (resolved !== config.vaultRoot) {
      throw new VaultError(
        'VAULT_UNAVAILABLE',
        'vaultRoot must be an absolute path'
      );
    }
  }

  /**
   * Sign data with ECDSA P-256 SHA-256.
   *
   * Per AD-001 Phase 4f: this is the cryptographic core.
   * Per AD-009 v2: signature is raw r||s (64 bytes), base64-encoded.
   */
  async sign(
    credentialId: CredentialId,
    data: DataToSign,
    algorithm: SigningAlgorithm
  ): Promise<SignatureValueB64> {
    if (algorithm !== 'ECDSA_P256_SHA256') {
      throw new VaultError(
        'UNSUPPORTED_ALGORITHM',
        'Only ECDSA_P256_SHA256 is currently supported',
        { requested: algorithm }
      );
    }

    const privateKeyPem = await this.readPrivateKeyPem(credentialId);

    try {
      const privateKey = createPrivateKey({
        key: privateKeyPem,
        format: 'pem',
      });

      // Verify the key is P-256 (per AD-008 v2)
      const keyDetails = (privateKey as unknown as { asymmetricKeyDetails?: { namedCurve?: string } })
        .asymmetricKeyDetails;
      if (keyDetails?.namedCurve && keyDetails.namedCurve !== 'prime256v1' && keyDetails.namedCurve !== 'P-256') {
        throw new VaultError(
          'INVALID_CREDENTIAL_FORMAT',
          'Private key is not P-256 curve',
          { credentialId, namedCurve: keyDetails.namedCurve }
        );
      }

      // Sign — Node returns DER-encoded ECDSA signature by default.
      // We need RAW (r||s, 64 bytes) per ZATCA spec (per AD-008 v2 / AD-009 v2).
      const signer = createSign('sha256');
      signer.update(data);
      signer.end();
      const derSignature = signer.sign({
        key: privateKey,
        dsaEncoding: 'ieee-p1363', // raw r||s format (matches ZATCA expectation)
      });

      // Validate length: P-256 raw signature must be exactly 64 bytes.
      if (derSignature.length !== 64) {
        throw new VaultError(
          'SIGNING_FAILED',
          'Signature length unexpected; expected 64 bytes for P-256 raw',
          { actual: derSignature.length }
        );
      }

      return derSignature.toString('base64') as SignatureValueB64;
    } catch (err) {
      if (err instanceof VaultError) throw err;
      throw new VaultError(
        'SIGNING_FAILED',
        'Signing operation failed',
        { credentialId, cause: this.sanitizeError(err) }
      );
    }
  }

  /**
   * Retrieve certificate as base64 (certificates are PUBLIC material).
   * Returns the DER bytes base64-encoded (NOT PEM with headers).
   */
  async getCertificate(credentialId: CredentialId): Promise<CertificateB64> {
    const path = this.certPath(credentialId);

    try {
      const pemContent = await fs.readFile(path, 'utf-8');
      const derB64 = this.extractCertificateB64FromPem(pemContent);
      return derB64 as CertificateB64;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new VaultError(
          'CREDENTIAL_NOT_FOUND',
          'Certificate not found for credential',
          { credentialId }
        );
      }
      throw new VaultError(
        'CREDENTIAL_INACCESSIBLE',
        'Certificate could not be read',
        { credentialId, cause: this.sanitizeError(err) }
      );
    }
  }

  /**
   * Check accessibility without exposing internals.
   * Used by health checks (per AD-015 v2 /readyz migrationStatus + vault check).
   */
  async isAccessible(credentialId: CredentialId): Promise<boolean> {
    try {
      await fs.access(this.privateKeyPath(credentialId), fsConstants.R_OK);
      await fs.access(this.certPath(credentialId), fsConstants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ---------- Private helpers ----------

  private credentialDir(credentialId: CredentialId): string {
    // Defensive: prevent path traversal via credentialId
    if (!/^[a-zA-Z0-9_-]+$/.test(credentialId)) {
      throw new VaultError(
        'CREDENTIAL_NOT_FOUND',
        'Credential identifier contains invalid characters',
        { credentialId }
      );
    }
    return join(this.config.vaultRoot, 'credentials', credentialId);
  }

  private privateKeyPath(credentialId: CredentialId): string {
    return join(this.credentialDir(credentialId), 'private.pem');
  }

  private certPath(credentialId: CredentialId): string {
    return join(this.credentialDir(credentialId), 'certificate.pem');
  }

  /**
   * Read private key PEM with permission verification.
   * Private key file must be 0400 (read by owner only).
   */
  private async readPrivateKeyPem(credentialId: CredentialId): Promise<string> {
    const path = this.privateKeyPath(credentialId);

    try {
      if (this.config.enforcePermissions) {
        const stat = await fs.stat(path);
        // On Unix-like systems, check that only owner can read (mode bits & 0o077 == 0).
        // Skip on Windows where mode semantics differ.
        const mode = stat.mode & 0o777;
        if (process.platform !== 'win32' && (mode & 0o077) !== 0) {
          throw new VaultError(
            'CREDENTIAL_INACCESSIBLE',
            'Private key file has permissions wider than 0400',
            { credentialId, actualMode: mode.toString(8) }
          );
        }
      }

      const content = await fs.readFile(path, 'utf-8');
      return content;
    } catch (err) {
      if (err instanceof VaultError) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        throw new VaultError(
          'CREDENTIAL_NOT_FOUND',
          'Private key not found for credential',
          { credentialId }
        );
      }
      throw new VaultError(
        'CREDENTIAL_INACCESSIBLE',
        'Private key could not be read',
        { credentialId, cause: this.sanitizeError(err) }
      );
    }
  }

  /**
   * Extract base64 certificate body from PEM string.
   * Strips BEGIN/END markers, line breaks, whitespace.
   */
  private extractCertificateB64FromPem(pem: string): string {
    const match = pem.match(
      /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/
    );
    if (!match) {
      throw new VaultError(
        'INVALID_CREDENTIAL_FORMAT',
        'Certificate file does not contain valid PEM markers'
      );
    }
    return match[1].replace(/\s+/g, '');
  }

  /**
   * Sanitize error before including in VaultError context.
   * Removes any field that might contain sensitive material.
   */
  private sanitizeError(err: unknown): { message: string; code?: string } {
    if (err instanceof Error) {
      const e = err as NodeJS.ErrnoException;
      return {
        message: e.message ?? 'Unknown error',
        code: e.code,
      };
    }
    return { message: String(err) };
  }
}
