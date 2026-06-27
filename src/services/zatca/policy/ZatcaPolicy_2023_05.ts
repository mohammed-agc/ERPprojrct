/**
 * ZatcaPolicy_2023_05 — The ZATCA certificate policy as documented in
 * Security Features Implementation Standards v1.2 (published May 2023).
 *
 * STATUS: CLOSED (ADR-023) — curve confirmed as secp256k1.
 *
 * The curve question (AI-001) is resolved. A real ZATCA-issued certificate
 * (CN=PRZEINVOICESCA4-CA) was decoded; its SubjectPublicKeyInfo OID is
 * secp256k1. The "P-256" in Security Doc v1.2 page 14 is a typo for "256-bit".
 * Evidence: src/services/zatca/__fixtures__/zatca-golden/zatca_real_certificate.pem
 *
 * Per architect direction: this is a DATA file. The validator code is generic and
 * consumes this object. Multiple policy versions coexist; we never mutate an
 * existing one — we add a new version when ZATCA updates requirements.
 *
 * Architectural references:
 * - ADR-023 (closes AI-001): curve = secp256k1, certificate-verified
 * - AD-014 v2 Security Constitution (policy values are explicit)
 * - "Product-First" Principle (configurable, not hardcoded)
 *
 * ⚠️ DO NOT MUTATE this object at runtime. It is `as const` and frozen.
 *    To change the policy, create a new file (e.g., ZatcaPolicy_2026_XX.ts).
 */

import type { CertificatePolicy, PolicyId } from './CertificatePolicy';

/**
 * ZATCA policy as derived from Security Doc v1.2 (May 2023).
 *
 * Source references:
 * - ZATCA Security Features Implementation Standards v1.2, page 14
 *   ("SubjectPublicKeyInfo: Key length: P-256")
 * - ZATCA Security Doc v1.2, requirement 16 ("Hashing algorithm shall be SHA-256;
 *   Asymmetric key algorithm shall be ECDSA; Key length shall be 256.")
 *
 * Resolved (ADR-023):
 * - Curve is secp256k1, confirmed by real ZATCA certificate OID inspection.
 */
export const ZatcaPolicy_2023_05: CertificatePolicy = Object.freeze({
  policyId: 'zatca-2023-05' as PolicyId,
  authority: 'ZATCA',
  version: '2023.05',
  description:
    'ZATCA Security Features Implementation Standards v1.2 (May 2023). ' +
    'Curve confirmed as secp256k1 per ADR-023.',

  
  // Per ADR-023: secp256k1 confirmed via real ZATCA certificate OID inspection.
  allowedCurves: ['secp256k1'] as const,

  // Per Security Doc v1.2 requirement 16: "ECDSA" with "SHA-256".
  allowedSignatureAlgorithms: ['ecdsa-with-SHA256'] as const,

  // Per Security Doc v1.2 requirement 16: "Key length shall be 256."
  minimumKeySize: 256,

  // Per Security Doc v1.2 page 14: NotAfter up to 60 months (5 years).
  // 5 years × 365.25 = 1826 days, rounded up.
  maximumValidityDays: 1830,

  // Per Security Doc v1.2 page 17: "Key Usage: digitalSignature, keyEncipherment".
  requiredKeyUsages: ['digitalSignature', 'keyEncipherment'] as const,
});

