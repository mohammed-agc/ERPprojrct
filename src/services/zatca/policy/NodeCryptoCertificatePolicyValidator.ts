/**
 * NodeCryptoCertificatePolicyValidator — Default validator using Node X509Certificate.
 *
 * Per AI-001 Phase 2: this is the layer that knows "what is acceptable".
 * Vault only stores; this validator decides if what's stored is policy-compliant.
 *
 * Implementation notes:
 * - Uses Node's built-in X509Certificate (no external deps)
 * - Returns PolicyResult; never throws on policy violations
 * - Throws only on parsing failure (genuine programming error)
 * - Pure: same input → same output (modulo the `now` parameter for expiry)
 *
 * Architectural references:
 * - AI-001 Phase 2 Refactoring
 * - AD-009A v2 (one authority per concern — policy in one place)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ AUTHORITY-AGNOSTIC GUARANTEE (per Architect Review, 2026-06-26):
 *
 * This validator MUST NOT contain authority-specific branching such as:
 *
 *   if (policy.authority === 'ZATCA') { ... special handling ... }
 *
 * If a new validation rule is needed for one authority but not another, add it
 * as a new field on the CertificatePolicy interface and let the policy data
 * opt in or out by setting that field. Branching on authority defeats the
 * entire architectural purpose of separating policy data from validator code.
 *
 * Lint hint: a future ESLint custom rule should flag any `policy.authority ===`
 * or `policy.authority !==` comparison inside this directory.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { X509Certificate } from 'node:crypto';
import type {
  CertificatePolicyValidator,
  CertificateInput,
} from './CertificatePolicyValidator';
import type {
  CertificatePolicy,
  PolicyResult,
  PolicyViolation,
  PolicyWarning,
  InspectedMetadata,
} from './CertificatePolicy';

export class NodeCryptoCertificatePolicyValidator implements CertificatePolicyValidator {
  readonly implementationName = 'node:crypto X509Certificate validator';

  /**
   * Validate a certificate against a policy.
   *
   * Strategy:
   *   1. Parse the certificate (throws on unparseable input)
   *   2. Extract metadata (always succeeds if parse succeeded)
   *   3. Run each policy rule; collect violations & warnings
   *   4. Return structured result; never throw on policy failure
   */
  validate(
    certificate: CertificateInput,
    policy: CertificatePolicy,
    now: string
  ): PolicyResult {
    // Parse + inspect (may throw on unparseable input — that's a programming
    // error, not a policy violation, so it propagates).
    const cert = this.parseCertificate(certificate);
    const metadata = this.extractMetadata(cert);

    const violations: PolicyViolation[] = [];
    const warnings: PolicyWarning[] = [];

    // ─── Curve check ───
    if (metadata.curve !== undefined) {
      if (!policy.allowedCurves.includes(metadata.curve)) {
        violations.push({
          code: 'DISALLOWED_CURVE',
          message: `Certificate curve "${metadata.curve}" is not in policy's allowedCurves`,
          context: {
            found: metadata.curve,
            allowed: [...policy.allowedCurves],
            policyId: policy.policyId,
          },
        });
      }
    } else {
      // No curve info — only flag as violation if policy requires EC.
      // For now, if allowedCurves is non-empty, missing curve = violation.
      if (policy.allowedCurves.length > 0) {
        violations.push({
          code: 'DISALLOWED_CURVE',
          message: 'Certificate does not appear to use an elliptic curve key',
          context: { allowed: [...policy.allowedCurves] },
        });
      }
    }

    // ─── Signature algorithm check ───
    if (
      metadata.signatureAlgorithm !== undefined &&
      !policy.allowedSignatureAlgorithms.includes(metadata.signatureAlgorithm)
    ) {
      violations.push({
        code: 'DISALLOWED_SIGNATURE_ALGORITHM',
        message: `Certificate signature algorithm "${metadata.signatureAlgorithm}" is not in policy's allowed list`,
        context: {
          found: metadata.signatureAlgorithm,
          allowed: [...policy.allowedSignatureAlgorithms],
        },
      });
    }

    // ─── Key size check ───
    if (metadata.keySize !== undefined && metadata.keySize < policy.minimumKeySize) {
      violations.push({
        code: 'INSUFFICIENT_KEY_SIZE',
        message: `Key size ${metadata.keySize} is less than minimum ${policy.minimumKeySize}`,
        context: {
          found: metadata.keySize,
          minimum: policy.minimumKeySize,
        },
      });
    }

    // ─── Expiry check (using passed-in `now`) ───
    const nowDate = new Date(now);
    if (isNaN(nowDate.getTime())) {
      throw new Error(
        `NodeCryptoCertificatePolicyValidator.validate: invalid "now" parameter: ${now}`
      );
    }

    if (metadata.validFrom !== undefined) {
      const validFromDate = new Date(metadata.validFrom);
      if (nowDate < validFromDate) {
        violations.push({
          code: 'CERTIFICATE_NOT_YET_VALID',
          message: `Certificate not valid until ${metadata.validFrom}`,
          context: { validFrom: metadata.validFrom, now },
        });
      }
    }

    if (metadata.validTo !== undefined) {
      const validToDate = new Date(metadata.validTo);
      if (nowDate > validToDate) {
        violations.push({
          code: 'CERTIFICATE_EXPIRED',
          message: `Certificate expired at ${metadata.validTo}`,
          context: { validTo: metadata.validTo, now },
        });
      } else {
        // Warn if within 30 days of expiry
        const daysToExpiry =
          (validToDate.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysToExpiry < 30) {
          warnings.push({
            code: 'NEAR_EXPIRY',
            message: `Certificate expires in ${Math.floor(daysToExpiry)} days`,
            context: { daysToExpiry: Math.floor(daysToExpiry), validTo: metadata.validTo },
          });
        }
      }
    }

    // ─── Maximum validity check ───
    if (
      policy.maximumValidityDays !== undefined &&
      metadata.validFrom !== undefined &&
      metadata.validTo !== undefined
    ) {
      const validFromDate = new Date(metadata.validFrom);
      const validToDate = new Date(metadata.validTo);
      const lifetimeDays =
        (validToDate.getTime() - validFromDate.getTime()) / (1000 * 60 * 60 * 24);
      if (lifetimeDays > policy.maximumValidityDays) {
        violations.push({
          code: 'EXCESSIVE_VALIDITY',
          message: `Certificate validity (${Math.ceil(lifetimeDays)} days) exceeds policy maximum (${policy.maximumValidityDays} days)`,
          context: {
            lifetimeDays: Math.ceil(lifetimeDays),
            maximum: policy.maximumValidityDays,
          },
        });
      }
    }

    return {
      valid: violations.length === 0,
      policyId: policy.policyId,
      policy: { authority: policy.authority, version: policy.version },
      violations,
      warnings,
      inspectedMetadata: metadata,
    };
  }

  /**
   * Inspect without enforcing — extract metadata only.
   * Used by diagnostic tooling and the AI-001 investigation.
   */
  inspect(certificate: CertificateInput): InspectedMetadata {
    const cert = this.parseCertificate(certificate);
    return this.extractMetadata(cert);
  }

  // ─── Private helpers ───

  /**
   * Parse the certificate from any supported input format.
   * Throws on unparseable input (genuine error, not a policy violation).
   */
  private parseCertificate(input: CertificateInput): X509Certificate {
    try {
      if (input.format === 'pem') {
        return new X509Certificate(input.pem);
      }
      if (input.format === 'der') {
        return new X509Certificate(Buffer.from(input.der));
      }
      // der-base64
      const derBytes = Buffer.from(input.b64, 'base64');
      return new X509Certificate(derBytes);
    } catch (err) {
      throw new Error(
        `NodeCryptoCertificatePolicyValidator: failed to parse certificate (${input.format}): ${(err as Error).message}`
      );
    }
  }

  /**
   * Extract metadata from a parsed certificate.
   */
  private extractMetadata(cert: X509Certificate): InspectedMetadata {
    const metadata: { -readonly [K in keyof InspectedMetadata]: InspectedMetadata[K] } = {};

    // Subject / Issuer
    metadata.subject = cert.subject;
    metadata.issuer = cert.issuer;

    // Validity
    metadata.validFrom = new Date(cert.validFrom).toISOString();
    metadata.validTo = new Date(cert.validTo).toISOString();

    // Public key — extract curve & size for EC keys
    // Per Node 22+: cert.publicKey is already a KeyObject; do NOT pass it
    // through createPublicKey() (which would mis-interpret it as private).
    try {
      const details = (cert.publicKey as unknown as {
        asymmetricKeyDetails?: { namedCurve?: string };
        asymmetricKeyType?: string;
      });

      const namedCurve = details.asymmetricKeyDetails?.namedCurve;
      if (namedCurve) {
        metadata.curve = namedCurve;
        // Best-effort key size derivation for common 256-bit curves
        if (
          namedCurve === 'prime256v1' ||
          namedCurve === 'P-256' ||
          namedCurve === 'secp256k1' ||
          namedCurve === 'secp256r1'
        ) {
          metadata.keySize = 256;
        } else if (namedCurve === 'secp384r1' || namedCurve === 'P-384') {
          metadata.keySize = 384;
        } else if (namedCurve === 'secp521r1' || namedCurve === 'P-521') {
          metadata.keySize = 521;
        }
      }
    } catch {
      // If we cannot extract key details, leave curve/keySize undefined.
      // The policy check will react appropriately.
    }

    // Signature algorithm — try to extract from sigAlgName if present
    const sigAlgName = (cert as unknown as { sigAlgName?: string }).sigAlgName;
    if (typeof sigAlgName === 'string' && sigAlgName.length > 0) {
      metadata.signatureAlgorithm = sigAlgName;
    }

    return metadata;
  }
}
