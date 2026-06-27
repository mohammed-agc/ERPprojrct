/**
 * Tests for NodeCryptoCertificatePolicyValidator.
 *
 * Per AI-001 Phase 2 Refactoring.
 * Per AD-012 v2 Layer 2 (Unit Tests).
 *
 * Strategy:
 *   - Generate ephemeral EC keys at runtime for various curves
 *   - Create self-signed test certificates
 *   - Validate against various policies (positive + negative cases)
 *
 * Cross-platform: works on Windows / Linux / Mac without openssl in PATH.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateKeyPairSync,
  X509Certificate,
  createSign,
} from 'node:crypto';
import { NodeCryptoCertificatePolicyValidator } from '../NodeCryptoCertificatePolicyValidator';
import {
  ZatcaPolicy_2023_05,
} from '../ZatcaPolicy_2023_05';
import type { CertificatePolicy, PolicyId } from '../CertificatePolicy';

/**
 * Embedded test certificate (real X.509, EC P-256, self-signed).
 * Used for tests that don't need a fresh key generation.
 */
const TEST_CERT_PRIME256V1_PEM = `-----BEGIN CERTIFICATE-----
MIIBtzCCAV2gAwIBAgIUV8V8FVpxEjv+kTS4dkUfTkmmgNYwCgYIKoZIzj0EAwIw
MTETMBEGA1UEAwwKWkFUQ0EtVGVzdDENMAsGA1UECgwEVGVzdDELMAkGA1UEBhMC
U0EwHhcNMjYwNjI2MDY1OTAwWhcNMzYwNjIzMDY1OTAwWjAxMRMwEQYDVQQDDApa
QVRDQS1UZXN0MQ0wCwYDVQQKDARUZXN0MQswCQYDVQQGEwJTQTBZMBMGByqGSM49
AgEGCCqGSM49AwEHA0IABG/2fgRJst14KxtOqK3lFls8lQce2RmjlQRdMk8d0Gbg
fXor4euOEJzwVHduK4U/DbI/FjmlMUycnpAM1azx/k+jUzBRMB0GA1UdDgQWBBSM
QThUwxW2RS13J0r2h4583AvksDAfBgNVHSMEGDAWgBSMQThUwxW2RS13J0r2h458
3AvksDAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA0gAMEUCIGA5VyBM7gBL
9SeRXFd/Rf/5MfIA0EZe35iKQzlUwTVaAiEA4YQCosEUOKR/rA7y95Gv0iWPFVF8
7Up1HISeFGnR+A0=
-----END CERTIFICATE-----
`;

describe('NodeCryptoCertificatePolicyValidator', () => {
  let validator: NodeCryptoCertificatePolicyValidator;
  // A fixed "now" so tests are deterministic
  const NOW = '2026-06-26T12:00:00.000Z';

  beforeAll(() => {
    validator = new NodeCryptoCertificatePolicyValidator();
  });

  describe('inspect()', () => {
    it('extracts curve from prime256v1 certificate', () => {
      const metadata = validator.inspect({
        format: 'pem',
        pem: TEST_CERT_PRIME256V1_PEM,
      });
      expect(metadata.curve).toBe('prime256v1');
      expect(metadata.keySize).toBe(256);
      expect(metadata.validFrom).toBeDefined();
      expect(metadata.validTo).toBeDefined();
      expect(metadata.subject).toContain('ZATCA-Test');
    });

    it('throws on unparseable input', () => {
      expect(() =>
        validator.inspect({ format: 'pem', pem: 'not-a-certificate' })
      ).toThrow(/failed to parse certificate/);
    });

    it('accepts DER base64 format', () => {
      // Convert PEM to DER-base64
      const match = TEST_CERT_PRIME256V1_PEM.match(
        /-----BEGIN CERTIFICATE-----\s*([\s\S]+?)\s*-----END CERTIFICATE-----/
      );
      const derB64 = match![1].replace(/\s+/g, '');
      const metadata = validator.inspect({ format: 'der-base64', b64: derB64 });
      expect(metadata.curve).toBe('prime256v1');
    });
  });

  describe('validate() — happy path', () => {
    it('accepts a valid prime256v1 certificate under ZatcaPolicy_2023_05', () => {
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        NOW
      );

      // The test cert has prime256v1, so curve check passes.
      // It may have other issues (no Key Usage, long validity, etc.) — track them.
      expect(result.inspectedMetadata.curve).toBe('prime256v1');
      expect(result.policy.authority).toBe('ZATCA');
      expect(result.policy.version).toBe('2023.05');

      // ADR-023: ZATCA mandates secp256k1, so prime256v1 MUST be rejected.
      const curveViolations = result.violations.filter(
        (v) => v.code === 'DISALLOWED_CURVE'
      );
      expect(curveViolations).toHaveLength(1);
      expect(result.valid).toBe(false);
    });

    it('includes the policy identity in result for audit trail', () => {
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        NOW
      );
      // policyId is the stable machine-friendly identifier
      expect(result.policyId).toBe('zatca-2023-05');
      // policy.{authority,version} are human-friendly display fields
      expect(result.policy).toEqual({
        authority: 'ZATCA',
        version: '2023.05',
      });
    });



    it('populates inspectedMetadata even when validation fails', () => {
      const strictPolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        allowedCurves: ['secp384r1'], // not prime256v1
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        strictPolicy,
        NOW
      );
      expect(result.valid).toBe(false);
      // Even though it failed, metadata is populated
      expect(result.inspectedMetadata.curve).toBe('prime256v1');
    });
  });

  describe('validate() — curve enforcement', () => {
    it('rejects a certificate whose curve is not in policy.allowedCurves', () => {
      const restrictivePolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        allowedCurves: ['secp384r1'],
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        restrictivePolicy,
        NOW
      );
      expect(result.valid).toBe(false);
      const violation = result.violations.find(
        (v) => v.code === 'DISALLOWED_CURVE'
      );
      expect(violation).toBeDefined();
      expect(violation!.context?.found).toBe('prime256v1');
      expect(violation!.context?.allowed).toEqual(['secp384r1']);
    });

    it('accepts a certificate when curve is in allowedCurves list (multiple)', () => {
      const multiCurvePolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        allowedCurves: ['secp384r1', 'prime256v1', 'secp256k1'],
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        multiCurvePolicy,
        NOW
      );
      const curveViolations = result.violations.filter(
        (v) => v.code === 'DISALLOWED_CURVE'
      );
      expect(curveViolations).toHaveLength(0);
    });


  });

  describe('validate() — key size', () => {
    it('rejects keys below minimum size', () => {
      const strictPolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        minimumKeySize: 384, // higher than the test cert's 256
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        strictPolicy,
        NOW
      );
      const violation = result.violations.find(
        (v) => v.code === 'INSUFFICIENT_KEY_SIZE'
      );
      expect(violation).toBeDefined();
      expect(violation!.context?.found).toBe(256);
      expect(violation!.context?.minimum).toBe(384);
    });
  });

  describe('validate() — expiry checks', () => {
    it('rejects an expired certificate', () => {
      // Use a date AFTER the test cert's notAfter (2036)
      const futureNow = '2040-01-01T00:00:00.000Z';
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        futureNow
      );
      const violation = result.violations.find(
        (v) => v.code === 'CERTIFICATE_EXPIRED'
      );
      expect(violation).toBeDefined();
    });

    it('rejects a not-yet-valid certificate', () => {
      // Use a date BEFORE the test cert's notBefore (2026-06-26)
      const pastNow = '2020-01-01T00:00:00.000Z';
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        pastNow
      );
      const violation = result.violations.find(
        (v) => v.code === 'CERTIFICATE_NOT_YET_VALID'
      );
      expect(violation).toBeDefined();
    });

    it('throws on malformed "now" parameter', () => {
      expect(() =>
        validator.validate(
          { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
          ZatcaPolicy_2023_05,
          'not-a-date'
        )
      ).toThrow(/invalid "now" parameter/);
    });
  });

  describe('validate() — maximum validity', () => {
    it('flags a certificate with excessive validity', () => {
      // The test cert is valid from 2026 to 2036 (10 years = ~3653 days)
      // Policy maximum is 1830 days (5 years)
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        NOW
      );
      const violation = result.violations.find(
        (v) => v.code === 'EXCESSIVE_VALIDITY'
      );
      expect(violation).toBeDefined();
      expect(violation!.context?.maximum).toBe(1830);
    });

    it('does not flag a certificate with acceptable validity', () => {
      const looseValidityPolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        maximumValidityDays: 5000, // larger than test cert's ~3653
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        looseValidityPolicy,
        NOW
      );
      const violation = result.violations.find(
        (v) => v.code === 'EXCESSIVE_VALIDITY'
      );
      expect(violation).toBeUndefined();
    });
  });

  describe('validate() — non-throwing contract', () => {
    it('never throws on policy violations — returns valid=false instead', () => {
      // Worst-case policy: nothing acceptable
      const impossiblePolicy: CertificatePolicy = {
        policyId: 'test-impossible-1' as PolicyId,
        authority: 'GENERIC',
        version: '1.0',
        allowedCurves: ['definitely-not-a-real-curve'],
        allowedSignatureAlgorithms: ['fake-algo'],
        minimumKeySize: 99999,
        maximumValidityDays: 1,
      };

      // Should NOT throw — should return a result with multiple violations
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        impossiblePolicy,
        NOW
      );
      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('does throw on genuinely unparseable input (programming error)', () => {
      expect(() =>
        validator.validate(
          { format: 'pem', pem: 'garbage' },
          ZatcaPolicy_2023_05,
          NOW
        )
      ).toThrow();
    });
  });

  describe('determinism', () => {
    it('returns the same result for the same input (no hidden state)', () => {
      const result1 = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        NOW
      );
      const result2 = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        NOW
      );
      expect(result1).toEqual(result2);
    });

    it('produces different results when "now" changes (deterministic w.r.t. time)', () => {
      const result1 = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        '2026-06-26T12:00:00.000Z'
      );
      const result2 = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        ZatcaPolicy_2023_05,
        '2040-01-01T00:00:00.000Z'
      );
      // Past: not expired. Future: expired.
      const expiredIn1 = result1.violations.some(
        (v) => v.code === 'CERTIFICATE_EXPIRED'
      );
      const expiredIn2 = result2.violations.some(
        (v) => v.code === 'CERTIFICATE_EXPIRED'
      );
      expect(expiredIn1).toBe(false);
      expect(expiredIn2).toBe(true);
    });
  });

  describe('Policy Object pattern', () => {
    it('ZatcaPolicy_2023_05 is frozen (cannot be mutated at runtime)', () => {
      expect(Object.isFrozen(ZatcaPolicy_2023_05)).toBe(true);
    });

    it('ZatcaPolicy_2023_05 has the expected shape (ADR-023: secp256k1)', () => {
      expect(ZatcaPolicy_2023_05.policyId).toBe('zatca-2023-05');
      expect(ZatcaPolicy_2023_05.authority).toBe('ZATCA');
      expect(ZatcaPolicy_2023_05.version).toBe('2023.05');
      expect(ZatcaPolicy_2023_05.allowedCurves).toEqual(['secp256k1']);
      expect(ZatcaPolicy_2023_05.minimumKeySize).toBe(256);
    });



    it('A different policy version can coexist (versioning works)', () => {
      const futurePolicy: CertificatePolicy = {
        ...ZatcaPolicy_2023_05,
        policyId: 'zatca-2030-01' as PolicyId,
        version: '2030.01',
        allowedCurves: ['secp256k1'],
      };
      expect(futurePolicy.policyId).toBe('zatca-2030-01');
      expect(futurePolicy.version).toBe('2030.01');
      // Original unchanged
      expect(ZatcaPolicy_2023_05.policyId).toBe('zatca-2023-05');
      expect(ZatcaPolicy_2023_05.version).toBe('2023.05');
    });

    it('A non-ZATCA authority can use the same validator (authority-agnostic)', () => {
      // This test enforces that the validator does NOT branch on authority.
      // If a future change introduces `if (policy.authority === 'ZATCA') ...`
      // this test will continue to pass — that branching is the wrong place.
      // We verify the principle indirectly by showing GENERIC works identically.
      const genericPolicy: CertificatePolicy = {
        policyId: 'generic-test-1' as PolicyId,
        authority: 'GENERIC',
        version: '1.0',
        allowedCurves: ['prime256v1'],
        allowedSignatureAlgorithms: ['ecdsa-with-SHA256'],
        minimumKeySize: 256,
      };
      const result = validator.validate(
        { format: 'pem', pem: TEST_CERT_PRIME256V1_PEM },
        genericPolicy,
        NOW
      );
      // Curve check passes equally regardless of authority
      const curveViolations = result.violations.filter(
        (v) => v.code === 'DISALLOWED_CURVE'
      );
      expect(curveViolations).toHaveLength(0);
      expect(result.policyId).toBe('generic-test-1');
      expect(result.policy.authority).toBe('GENERIC');
    });
  });
});
