/**
 * ZatcaPolicy_2023_05 — The ZATCA certificate policy as documented in
 * Security Features Implementation Standards v1.2 (published May 2023).
 *
 * STATUS: PROVISIONAL — pending AI-001 resolution.
 *
 * Per AI-001 Curve Investigation, the curve choice ('prime256v1' vs 'secp256k1')
 * is the open question. This policy reflects the literal reading of the Security
 * Doc v1.2 ("Key length: P-256"). If sandbox certificate inspection (Evidence #2)
 * shows a different curve, this file is updated — NOT the code that consumes it.
 *
 * Per architect direction: this is a DATA file. The validator code is generic and
 * consumes this object. Multiple policy versions coexist; we never mutate an
 * existing one — we add a new version when ZATCA updates requirements.
 *
 * Architectural references:
 * - AI-001 Curve Investigation (this file is the subject of investigation)
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
 * Open questions (tracked in AI-001):
 * - Is the actual curve `prime256v1` (NIST P-256) or `secp256k1`?
 *   Conflicting evidence; will be resolved by direct certificate inspection.
 */
export const ZatcaPolicy_2023_05: CertificatePolicy = Object.freeze({
  policyId: 'zatca-2023-05' as PolicyId,
  authority: 'ZATCA',
  version: '2023.05',
  description:
    'ZATCA Security Features Implementation Standards v1.2 (May 2023). ' +
    'PROVISIONAL: curve choice pending AI-001 investigation.',

  // PROVISIONAL — based on literal reading of Security Doc v1.2 page 14.
  // Will be updated to ['secp256k1'] or extended to allow both if Evidence #2
  // (sandbox certificate inspection) shows otherwise.
  allowedCurves: ['prime256v1'] as const,

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

/**
 * Optional permissive policy variant for the investigation window.
 *
 * When inspecting real-world certificates whose curve we have not yet confirmed,
 * this policy accepts both candidate curves so the validator can extract the
 * metadata without rejecting the certificate.
 *
 * STATUS: TEMPORARY — exists only until AI-001 closes. Then delete this constant.
 *
 * Use this in:
 * - Diagnostic tooling that wants to inspect a certificate without judgment
 * - Tests that need to verify the validator can identify curves of either type
 *
 * DO NOT USE in production signing flows.
 */
export const ZatcaPolicy_2023_05_PermissiveInvestigation: CertificatePolicy = Object.freeze({
  ...ZatcaPolicy_2023_05,
  policyId: 'zatca-2023-05-permissive' as PolicyId,
  version: '2023.05-permissive-investigation',
  description:
    'TEMPORARY: permissive variant for AI-001 investigation window. ' +
    'Allows both candidate curves so certificates can be inspected without rejection. ' +
    'DELETE this constant once AI-001 closes and the canonical curve is confirmed.',
  allowedCurves: ['prime256v1', 'secp256k1'] as const,
});
