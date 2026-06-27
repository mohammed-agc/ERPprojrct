# TA-001 — ZATCA Test Identity (Golden Test Key Pair)

Deterministic secp256k1 identity for ALL ZATCA signing tests (S3.3, S3.4, S4, E2E).
Generated ONCE, frozen as a fixture — never regenerated at runtime (AD-012 determinism).

## Files
- `private.pem`     — secp256k1 private key (PKCS#8, unencrypted, test-only)
- `certificate.pem` — self-signed X.509, 2-year validity, KeyUsage: digitalSignature + nonRepudiation

## Verified gates (probe, 2026-06-27)
- ASN1 OID: secp256k1 (NOT prime256v1) — satisfies ADR-023
- CertificateLoader.load → certDigest=88ch, issuer/serial extracted
- CertificatePolicyValidator(ZatcaPolicy_2023_05) → valid:true, violations:[]

## NOT for production
Test-only. Never used against ZATCA Sandbox. Sandbox uses real CSID (Contract Tests, Layer 4).

## Regeneration (only if ever needed)
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:secp256k1 \
  -keyout private.pem -out certificate.pem -days 730 -nodes \
  -subj "/C=SA/O=ARD TEST EGS/OU=Testing/CN=TA-001 ZATCA Test Identity" \
  -addext "keyUsage=critical,digitalSignature,nonRepudiation"