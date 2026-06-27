/**
 * VaultProvider — Abstraction over secret storage for cryptographic material.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PHASE 2 REFACTORING (per AI-001):
 *   This interface is now CURVE-AGNOSTIC. Policy decisions (which curves are
 *   acceptable for ZATCA, which key sizes, etc.) live in CertificatePolicyValidator,
 *   NOT here. The Vault only stores and uses keys — it does not judge them.
 *
 *   Before:  if (curve !== 'prime256v1') throw          ← policy in storage
 *   After:   Vault signs whatever it has; Policy Validator validates before use.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Architectural references:
 * - AD-004 v2: Hybrid Vault Strategy (FS Vault + DB metadata + Provider abstraction)
 * - AD-005:    Credential Resolution Strategy
 * - AD-014 v2: Security Constitution (private keys never leave Vault unencrypted)
 * - AI-001:    Curve Investigation (curve enforcement moved out of Vault)
 *
 * Contract:
 * - Vault stores raw cryptographic material (private keys, certificates).
 * - DB stores ONLY metadata (credentialId, status, expiry, paths/refs).
 * - Service Layer calls Vault to perform cryptographic operations.
 * - Service Layer is responsible for calling CertificatePolicyValidator BEFORE
 *   using a credential — Vault no longer rejects "wrong-curve" keys.
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
 * Base64-encoded ECDSA signature value, DER-encoded (ASN.1).
 *
 * ⚠️ Per ADR-024: encoding is DER, NOT raw r||s (IEEE-P1363). DER is the legal
 * default for ECDSA (X.509, OpenSSL, Node default) and is what ZATCA's golden
 * reference SignatureValue uses (verified byte-level: starts 30 45 02 21…).
 * DER length is VARIABLE (~70–72 bytes for 256-bit curves → ~96 b64 chars),
 * because r and s carry leading-zero/sign padding. Do NOT assert a fixed length.
 * The actual encoding is chosen per-call by the caller via the dsaEncoding param.
 */
export type SignatureValueB64 = string & { readonly __brand: 'SignatureValueB64' };

/**
 * The raw bytes to be signed, passed opaquely to the EC private key.
 *
 * ⚠️ ZATCA-CRITICAL (per ADR-024): These bytes are the caller's chosen message.
 * For ZATCA invoice signing this is the RAW 32-byte invoice hash — NOT
 * C14N(SignedInfo). ZATCA deviates from standard XML-DSIG here: it signs the
 * invoice hash directly. The Vault applies SHA-256 to these bytes then ECDSA,
 * yielding ECDSA(SHA-256(invoiceHash32)). Choosing the correct message is the
 * CALLER's responsibility (the XAdES signer, S3.3); the Vault is curve- and
 * message-agnostic.
 */
export type DataToSign = Uint8Array;

/**
 * Algorithm identifier for signing.
 *
 * PHASE 2 REFACTORING NOTE (per AI-001):
 *   This identifier specifies the HASH and SIGNATURE STYLE (ECDSA with SHA-256,
 *   raw r||s encoding). It does NOT lock the curve — the curve is determined by
 *   the key itself, and curve-acceptability is the policy validator's concern.
 *
 *   "ECDSA_SHA256" covers any ECDSA-with-SHA256 signature regardless of curve:
 *     - prime256v1 / P-256 (NIST)
 *     - secp256k1 (Bitcoin)
 *     - any other curve supported by Node crypto
 */
export type SigningAlgorithm = 'ECDSA_SHA256';

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
 * 3. Validate credential ACCESSIBILITY (exists, readable) before each operation.
 * 4. Be safe under concurrent access.
 * 5. Emit no sensitive data in error messages or logs.
 *
 * Implementations MUST NOT:
 * - Enforce policy decisions (e.g., which curves are acceptable). That is the
 *   responsibility of CertificatePolicyValidator.
 * - Inspect or reject keys based on cryptographic parameters beyond what is
 *   strictly necessary for the signing operation itself.
 */
export interface VaultProvider {
  /**
   * Sign opaque bytes with the credential's private key.
   *
   * @param credentialId - Identifier resolved by CredentialResolver (AD-005)
   * @param data         - Raw bytes to sign (see DataToSign). For ZATCA this is
   *                       the 32-byte invoice hash. Vault does SHA-256 then ECDSA.
   * @param algorithm    - Signing algorithm (currently only ECDSA_SHA256)
   * @param dsaEncoding  - Signature output encoding. 'der' for ZATCA (ADR-024);
   *                       'ieee-p1363' for JWS/WebCrypto-style consumers. REQUIRED,
   *                       no default — the caller must state the encoding its
   *                       protocol mandates (Constitution Rule 6: No Silent Assumptions).
   * @returns Base64-encoded signature in the requested encoding.
   *
   * @throws VaultError if credential not found / inaccessible / signing fails
   *
   * PHASE 2 NOTE: curve-agnostic. Caller validates curve via CertificatePolicyValidator.
   */
  sign(
    credentialId: CredentialId,
    data: DataToSign,
    algorithm: SigningAlgorithm,
    dsaEncoding: 'der' | 'ieee-p1363'
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
