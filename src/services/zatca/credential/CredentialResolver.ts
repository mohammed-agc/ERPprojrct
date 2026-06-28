/**
 * CredentialResolver — resolves a logical credential identity
 * (company, environment, credentialType) to an actual credential reference.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SCOPE — what this is, and what it is NOT (per One Authority Per Concern):
 *
 *   The single question this authority answers:
 *     "Is there a usable, valid credential right now for this
 *      (company, environment, credentialType)?"
 *
 *   It does NOT answer "WHY is there no valid credential?" — REVOKED / INACTIVE
 *   diagnosis would change the question to "what state is the previous
 *   credential in?", which needs a selection policy over (possibly many)
 *   inactive rows; that is a Lifecycle / Administration concern, not resolution.
 *
 *   It does NOT choose WHICH credentialType a workflow needs — "invoices use
 *   PCSID" is a Workflow fact (the Composer / Submission workflow knows the
 *   purpose), not a credential fact.
 *
 *   It reads zatca_credentials ONLY. It never decrypts secrets, never handles
 *   API auth (binary_security_token / secret), never touches the lifecycle
 *   (rotation, onboarding, expiry sweeping).
 *
 *   Frozen contract: docs/contracts/CREDENTIAL_RESOLVER_CONTRACT.md
 * ════════════════════════════════════════════════════════════════════════════
 *
 * INVARIANT (enforced by the partial unique index uq_active_credential
 *   ON zatca_credentials(company_id, environment, credential_type)
 *   WHERE is_active=true):
 *
 *   For any (company, environment, credentialType) there exists AT MOST ONE
 *   active credential. Therefore resolution is DETERMINISTIC BUT PARTIAL:
 *     - deterministic: no selection logic — at most one candidate.
 *     - partial:       may find nothing (NO_ACTIVE_CREDENTIAL is a legitimate
 *                      outcome, not an invariant violation).
 *
 * PRECONDITIONS (preconditions are NOT outcomes):
 *   - environment / credentialType validity is enforced at COMPILE TIME by the
 *     union types below — an invalid value is unrepresentable, the strongest
 *     precondition guarantee (the invalid call cannot be written).
 *   - companyId is an opaque lookup key; the resolver does not own the companies
 *     table. Any companyId with no active credential → NO_ACTIVE_CREDENTIAL.
 *
 * Architectural references:
 * - AD-005:     Credential Resolution Strategy (this is its implementation).
 * - AD-009A v2: One Authority Per Concern.
 * - AD-012 v2:  Provider pattern for DI (factory-injected for test determinism).
 * - AD-011 v2:  typed errors carry actionable context.
 */

import type { CredentialId } from '../vault/VaultProvider';

/** ZATCA API environment (matches zatca_credentials.zc_env_check). */
export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

/** Credential type (matches zatca_credentials.zc_type_check). */
export type CredentialType = 'CCSID' | 'PCSID';

/**
 * A resolved, usable credential reference.
 *
 * Carries ONLY resolution data:
 *   - credentialId           the value VaultProvider.sign() consumes
 *                            (= zatca_credentials.id, a UUID; satisfies the
 *                            Vault's [a-zA-Z0-9_-]+ directory-name rule).
 *   - environment/type       echoed back (already typed) for caller convenience.
 *   - certificateFingerprint the certificate's integrity reference.
 *   - expiresAt              certificate expiry — a FUTURE instant on success
 *                            (the caller may use it for proactive renewal).
 *
 * Deliberately ABSENT (usage data, not resolution data):
 *   - status                  success already guarantees validity.
 *   - binary_security_token   API-auth material — a later usage concern (S5.3).
 *   - secret_encrypted        decryption is a cryptography concern, not resolution.
 */
export interface ResolvedCredential {
  readonly credentialId: CredentialId;
  readonly environment: ZatcaEnvironment;
  readonly credentialType: CredentialType;
  readonly certificateFingerprint: string;
  readonly expiresAt: Date;
}

/**
 * Errors raised by CredentialResolver.
 *
 * Exactly TWO codes — both RESOLUTION OUTCOMES:
 *   - NO_ACTIVE_CREDENTIAL  no usable active credential for the coordinate
 *                           (no row / no active row / last one revoked|inactive|
 *                           historical / never created — all mean the same to
 *                           the caller: "cannot resolve a valid credential").
 *   - CREDENTIAL_EXPIRED    an active row exists, but certificate_expiry_at <= now()
 *                           (the one validity dimension that can become true with
 *                           no write — between expiry and the lifecycle sweep).
 *
 * A DB-read/infrastructure failure is NOT an outcome — it propagates as a plain
 * exception (never folded into NO_ACTIVE_CREDENTIAL, which would falsely report
 * "no credential" when the lookup simply could not be performed).
 */
export class CredentialResolverError extends Error {
  constructor(
    public readonly code: CredentialResolverErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CredentialResolverError';
  }
}

export type CredentialResolverErrorCode =
  | 'NO_ACTIVE_CREDENTIAL'
  | 'CREDENTIAL_EXPIRED';

/**
 * CredentialResolver interface.
 *
 * MUST:
 * 1. Resolve deterministically: at most one active row per coordinate (invariant).
 * 2. Treat the certificate's time-expiry as part of validity (CREDENTIAL_EXPIRED),
 *    because expiry is the only validity dimension that can change with no write;
 *    is_active alone cannot be trusted for it.
 * 3. Return ONLY resolution data (no secrets, no API-auth material).
 * 4. NOT choose credentialType, NOT diagnose absence, NOT touch lifecycle.
 */
export interface CredentialResolver {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Resolve the active, valid credential for a coordinate.
   *
   * @param companyId      - Owning company id (opaque lookup key).
   * @param environment    - ZATCA API environment.
   * @param credentialType - CCSID (compliance) or PCSID (production).
   * @returns ResolvedCredential (credentialId + safe metadata).
   * @throws CredentialResolverError('NO_ACTIVE_CREDENTIAL') if none is active.
   * @throws CredentialResolverError('CREDENTIAL_EXPIRED') if the active one is time-expired.
   */
  resolve(
    companyId: string,
    environment: ZatcaEnvironment,
    credentialType: CredentialType
  ): Promise<ResolvedCredential>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type CredentialResolverFactory = () => CredentialResolver;
