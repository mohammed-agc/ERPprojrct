/**
 * VaultProvider — Abstraction over secret storage for cryptographic material.
 *
 * Architectural references:
 * - AD-004 v2: Hybrid Vault Strategy (FS Vault + DB metadata + Provider abstraction)
 * - AD-005:    Credential Resolution Strategy
 * - AD-014 v2: Security Constitution (private keys never leave Vault unencrypted)
 *
 * Contract:
 * - Vault stores raw cryptographic material (private keys, certificates).
 * - DB stores ONLY metadata (credentialId, status, expiry, paths/refs).
 * - Service Layer calls Vault to perform cryptographic operations.
 * - Private keys MUST NOT be returned to callers; signing happens inside the Vault adapter.
 *
 * This file defines the interface. Implementations:
 * - FileSystemVaultProvider (development, on-premise, current target)
 * - AzureKeyVaultProvider (future)
 * - AwsKmsVaultProvider (future)
 */

/**
 * Opaque identifier of a credential stored in the Vault.
 * Maps to zatca_credentials.credential_id in DB.
 */
export type CredentialId = string & { readonly __brand: 'CredentialId' };

/**
 * Base64-encoded X.509 certificate (DER, then base64).
 */
export type CertificateB64 = string & { readonly __brand: 'CertificateB64' };

/**
 * Base64-encoded raw signature value (ECDSA r||s, 64 bytes for P-256).
 */
export type SignatureValueB64 = string & { readonly __brand: 'SignatureValueB64' };

/**
 * The data to be signed — already canonicalized, ready for hashing.
 * Per AD-001 Pipeline Phase 4: this is SignedInfo canonical bytes.
 */
export type DataToSign = Uint8Array;

/**
 * Algorithm identifier for signing.
 * Per AD-008 v2: ZATCA uses ECDSA P-256 (secp256r1) with SHA-256.
 */
export type SigningAlgorithm = 'ECDSA_P256_SHA256';

/**
 * Errors raised by VaultProvider.
 * Per AD-011 v2: errors are typed and carry correlation IDs.
 */
export class VaultError extends Error {
  constructor(
    public readonly code: VaultErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'VaultError';
  }
}

export type VaultErrorCode =
  | 'CREDENTIAL_NOT_FOUND'
  | 'CREDENTIAL_REVOKED'
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_INACCESSIBLE'
  | 'SIGNING_FAILED'
  | 'UNSUPPORTED_ALGORITHM'
  | 'VAULT_UNAVAILABLE'
  | 'INVALID_CREDENTIAL_FORMAT';

/**
 * The VaultProvider interface.
 *
 * All implementations MUST:
 * 1. Never return private keys to callers — keys never leave the Vault.
 * 2. Sign opaquely: caller provides bytes-to-sign, Vault returns signature.
 * 3. Validate credential state before each operation.
 * 4. Be safe under concurrent access.
 * 5. Emit no sensitive data in error messages or logs.
 */
export interface VaultProvider {
  /**
   * Sign opaque data with the credential's private key.
   *
   * @param credentialId - Identifier resolved by CredentialResolver (AD-005)
   * @param data         - Bytes to sign (typically canonical SignedInfo, per AD-001 Phase 4)
   * @param algorithm    - Signing algorithm (currently only ECDSA_P256_SHA256)
   * @returns Base64-encoded signature value (r||s for ECDSA P-256, 64 bytes raw = 88 chars b64)
   *
   * @throws VaultError if credential not found / revoked / signing fails
   *
   * Important: This is the ONLY path to obtain a signature. Private key never exposed.
   */
  sign(
    credentialId: CredentialId,
    data: DataToSign,
    algorithm: SigningAlgorithm
  ): Promise<SignatureValueB64>;

  /**
   * Retrieve the X.509 certificate bound to a credential.
   * Certificates are PUBLIC material (per AD-014 v2 classification) so returning bytes is safe.
   *
   * @param credentialId - Identifier resolved by CredentialResolver
   * @returns Base64-encoded DER-encoded X.509 certificate
   *
   * @throws VaultError if credential not found
   */
  getCertificate(credentialId: CredentialId): Promise<CertificateB64>;

  /**
   * Check whether a credential is accessible (does not validate content, just existence).
   * Used by health checks (per AD-015 v2 Principle 7 /readyz).
   *
   * @param credentialId - Identifier to check
   * @returns true if credential is accessible and not in a terminal state (revoked/expired)
   */
  isAccessible(credentialId: CredentialId): Promise<boolean>;
}

/**
 * Factory function signature for dependency injection.
 * Per AD-012 v2: all providers injected through factories for determinism in tests.
 */
export type VaultProviderFactory = () => VaultProvider;
