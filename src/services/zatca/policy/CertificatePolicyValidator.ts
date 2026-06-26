/**
 * CertificatePolicyValidator — Interface for validating certificates against policies.
 *
 * Per AI-001 Phase 2 Refactoring: this module owns the question
 * "is this certificate acceptable?" — separately from the VaultProvider, which
 * only knows how to store and use keys.
 *
 * Single Responsibility:
 *   - Validator: "does this cert meet the policy?"
 *   - Vault:     "give me the key / certificate"
 *
 * Architectural references:
 * - AI-001 Phase 2 (this is the new architectural layer)
 * - AD-012 v2 Provider pattern (DI-friendly interface)
 * - AD-014 v2 Security Constitution (policy decisions are explicit, traceable)
 *
 * Multiple implementations may exist:
 * - NodeCryptoCertificatePolicyValidator (default, uses Node X509Certificate)
 * - MockCertificatePolicyValidator (for tests)
 * - StrictCertificatePolicyValidator (future, with extra checks)
 */

import type { CertificatePolicy, PolicyResult } from './CertificatePolicy';

/**
 * Certificate input for validation.
 *
 * Accepts either a PEM string (most common, what Vault returns) or DER bytes.
 * The validator handles both transparently.
 */
export type CertificateInput =
  | { format: 'pem'; pem: string }
  | { format: 'der'; der: Uint8Array | Buffer }
  | { format: 'der-base64'; b64: string };

/**
 * The CertificatePolicyValidator interface.
 *
 * Implementations MUST:
 * 1. Be pure: same input → same output. No I/O, no clock reads beyond what's
 *    needed for expiry checks (which take a "now" parameter for determinism).
 * 2. Never throw on policy violations — return PolicyResult with valid=false.
 *    Throwing is reserved for genuine programming errors (e.g., null input).
 * 3. Always populate inspectedMetadata in the result, even on failure.
 *    Callers need to know what was found, not just whether it passed.
 * 4. Be safe under concurrent calls (stateless preferred).
 */
export interface CertificatePolicyValidator {
  /**
   * Human-readable name of the implementation (for diagnostics).
   */
  readonly implementationName: string;

  /**
   * Validate a certificate against a policy.
   *
   * @param certificate - Certificate to validate (PEM or DER)
   * @param policy - Policy to enforce
   * @param now - Current time as ISO 8601 string (for expiry checks).
   *              Required for determinism: validators must not call Date.now()
   *              internally. Caller is responsible for passing the actual time.
   * @returns PolicyResult with valid flag, violations, warnings, and metadata
   *
   * @throws Error only on genuine programming errors (null/malformed input).
   *         Policy violations are returned in the result, not thrown.
   */
  validate(
    certificate: CertificateInput,
    policy: CertificatePolicy,
    now: string
  ): PolicyResult;

  /**
   * Inspect a certificate to extract metadata without enforcing a policy.
   *
   * Useful for diagnostics, debugging, and the AI-001 investigation
   * (where we want to read the curve without rejecting unfamiliar values).
   *
   * @param certificate - Certificate to inspect
   * @returns Inspected metadata (curve, signature algorithm, etc.)
   * @throws Error if certificate cannot be parsed at all
   */
  inspect(certificate: CertificateInput): import('./CertificatePolicy').InspectedMetadata;
}

/**
 * Factory function signature for DI (per AD-012 v2).
 */
export type CertificatePolicyValidatorFactory = () => CertificatePolicyValidator;
