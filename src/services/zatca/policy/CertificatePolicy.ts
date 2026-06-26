/**
 * CertificatePolicy — Data-driven policy specification for X.509 certificates.
 *
 * Per AI-001 (Curve Investigation) — Phase 2 Refactoring:
 *   The policy is DATA, not CODE. Validators consume policies; they don't hardcode rules.
 *   This enables:
 *     - Multiple coexisting policy versions (e.g., ZatcaPolicy_2023_05, ZatcaPolicy_2026_XX)
 *     - Multi-authority support (ZATCA, others) without modifying the validator
 *     - Per-environment overrides (sandbox vs production)
 *     - Test fixtures with arbitrary policies for negative testing
 *
 * Architectural references:
 * - AI-001 Curve Investigation (active)
 * - AD-014 v2 Security Constitution (policy decisions are explicit, not implicit)
 * - "Treat This As A Product" Principle (configurable, not hardcoded)
 *
 * IMPORTANT: This file defines the shape only. Specific policy instances live in
 * separate files (e.g., ZatcaPolicy_2023_05.ts) and are imported where needed.
 *
 * ─── DESIGN NOTES (per Architect Review, 2026-06-26) ───
 * 1. authority is a discriminated union, not a free string — prevents typos like
 *    "Zatca" vs "ZATCA" vs "zatca".
 * 2. policyId is the STABLE identifier of this policy. version is human-readable.
 *    They are intentionally separate fields:
 *      - policyId: machine-friendly, used in audit logs, comparisons, references
 *                  Format: "<authority-lowercase>-<YYYY-MM>[-<qualifier>]"
 *                  Examples: "zatca-2023-05", "zatca-2023-05-permissive"
 *      - version:  human-readable display string
 *                  Examples: "2023.05", "v1.2", "2026.01-draft"
 * 3. Validator implementations MUST be authority-agnostic. They consume a
 *    CertificatePolicy uniformly — no `if (policy.authority === "ZATCA")` checks.
 *    If you find yourself wanting such a branch, add a field to the policy
 *    interface instead of branching on authority.
 */

/**
 * Recognized certificate-issuing authorities.
 *
 * Adding a new authority is intentionally a code change (not a string value) so
 * that the type system flags every place that needs updating.
 */
export type CertificateAuthority = 'ZATCA' | 'ETSI' | 'GENERIC';

/**
 * Stable, machine-readable identifier for a specific policy.
 *
 * Format convention: "<authority-lower>-<YYYY-MM>[-<qualifier>]"
 * Examples:
 *   - "zatca-2023-05"
 *   - "zatca-2023-05-permissive"
 *   - "etsi-en319-132-1"
 *
 * Used in:
 *   - Audit logs (which policy validated this certificate)
 *   - PolicyResult.policyId (which policy produced this result)
 *   - Test fixtures (which policy a fixture was authored against)
 */
export type PolicyId = string & { readonly __brand: 'PolicyId' };

/**
 * A versioned certificate policy.
 *
 * Each policy is identified by (authority, version). When an authority publishes
 * new requirements, a new policy object is added — old policies remain available
 * for verifying historical artifacts signed under previous rules.
 */
export interface CertificatePolicy {
  /**
   * Stable, machine-readable identifier for this policy.
   * Used in audit trails, result attribution, and policy lookups.
   *
   * Format: "<authority-lowercase>-<YYYY-MM>[-<qualifier>]"
   * Example: "zatca-2023-05"
   */
  readonly policyId: PolicyId;

  /**
   * Name of the issuing/governing authority (typed discriminated union).
   * Adding a new authority requires updating the CertificateAuthority type.
   */
  readonly authority: CertificateAuthority;

  /**
   * Human-readable version identifier of this policy.
   * Recommended format: "YYYY.MM" of source spec publication, or semantic version.
   * Examples: "2023.05", "v1.2", "2026.01-draft"
   *
   * NOTE: This is for human display. For programmatic identification, use policyId.
   */
  readonly version: string;

  /**
   * Curves accepted for the public key.
   * Names should match OpenSSL / Node crypto curve names.
   * Examples: "prime256v1", "secp256k1", "P-256"
   *
   * An empty array means "no curves accepted" (effectively rejects all).
   */
  readonly allowedCurves: readonly string[];

  /**
   * Signature algorithms accepted for the certificate signature.
   * Names should match standard algorithm identifiers.
   * Examples: "ecdsa-with-SHA256", "sha256WithRSAEncryption"
   *
   * Note: this is the algorithm of the *certificate's* signature, distinct from
   * the algorithm used to sign data with the key inside the certificate.
   */
  readonly allowedSignatureAlgorithms: readonly string[];

  /**
   * Minimum key size in bits (for the public key inside the certificate).
   * For elliptic curve keys, this is the bit-length of the field.
   * Common values: 256, 384, 521.
   */
  readonly minimumKeySize: number;

  /**
   * Maximum acceptable certificate validity period in days (optional).
   * If undefined, no maximum is enforced.
   * Useful for catching certificates with suspiciously long lifetimes.
   */
  readonly maximumValidityDays?: number;

  /**
   * Required X.509 Key Usage extensions (optional).
   * Empty array or undefined means no specific Key Usage required.
   * Examples: ['digitalSignature', 'keyEncipherment']
   */
  readonly requiredKeyUsages?: readonly string[];

  /**
   * Human-readable description of what this policy represents.
   * Used in logs, error messages, and audit trails.
   */
  readonly description?: string;
}

/**
 * Result of policy validation.
 *
 * Distinguishes between hard violations (policy says NO) and warnings (policy
 * accepted, but with notes). The validator never throws — it returns a structured
 * result. Callers decide whether to throw based on their context.
 */
export interface PolicyResult {
  /**
   * Whether the certificate passes all policy checks.
   * If false, at least one violation is present in violations[].
   */
  readonly valid: boolean;

  /**
   * Identifier of the policy used for this validation (for audit trail).
   * This is the FULL policy identity — useful for:
   *   - Compliance audits ("which policy approved this certificate?")
   *   - Reproducing results (look up the policy by id)
   *   - Debugging (log lines include the exact policy version)
   */
  readonly policyId: PolicyId;

  /**
   * Authority + human-readable version of the policy (for display).
   * Kept separate from policyId so display strings can change without breaking
   * stored audit records.
   */
  readonly policy: {
    readonly authority: CertificateAuthority;
    readonly version: string;
  };

  /**
   * List of hard violations. Empty when valid is true.
   */
  readonly violations: readonly PolicyViolation[];

  /**
   * List of non-fatal warnings (policy passed but with caveats).
   * Examples: certificate uses an allowed-but-deprecated curve.
   */
  readonly warnings: readonly PolicyWarning[];

  /**
   * Inspected metadata extracted from the certificate (curve found, etc.).
   * Useful for diagnostics regardless of validity.
   */
  readonly inspectedMetadata: InspectedMetadata;
}

/**
 * Hard policy violation.
 */
export interface PolicyViolation {
  /**
   * Stable code for this violation type.
   * Used by callers for programmatic handling.
   */
  readonly code: PolicyViolationCode;

  /**
   * Human-readable description.
   */
  readonly message: string;

  /**
   * Additional context (curve found, expected, etc.).
   * Should never contain sensitive material.
   */
  readonly context?: Record<string, unknown>;
}

/**
 * Non-fatal warning.
 */
export interface PolicyWarning {
  readonly code: PolicyWarningCode;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

/**
 * Codes for violations.
 */
export type PolicyViolationCode =
  | 'DISALLOWED_CURVE'
  | 'DISALLOWED_SIGNATURE_ALGORITHM'
  | 'INSUFFICIENT_KEY_SIZE'
  | 'EXCESSIVE_VALIDITY'
  | 'MISSING_KEY_USAGE'
  | 'CERTIFICATE_PARSE_ERROR'
  | 'CERTIFICATE_EXPIRED'
  | 'CERTIFICATE_NOT_YET_VALID';

/**
 * Codes for warnings.
 */
export type PolicyWarningCode =
  | 'DEPRECATED_CURVE'
  | 'NEAR_EXPIRY';

/**
 * Certificate metadata extracted during validation.
 * Returned in PolicyResult regardless of validity (useful for diagnostics).
 */
export interface InspectedMetadata {
  /**
   * Curve name as reported by the crypto library (e.g., "prime256v1", "secp256k1").
   * undefined if the certificate's key is not an EC key.
   */
  readonly curve?: string;

  /**
   * Signature algorithm of the certificate itself.
   * Examples: "ecdsa-with-SHA256".
   */
  readonly signatureAlgorithm?: string;

  /**
   * Public key size in bits.
   */
  readonly keySize?: number;

  /**
   * Certificate's validity period (ISO 8601 dates).
   */
  readonly validFrom?: string;
  readonly validTo?: string;

  /**
   * Subject DN.
   */
  readonly subject?: string;

  /**
   * Issuer DN.
   */
  readonly issuer?: string;
}
