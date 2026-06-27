# ADR-023: ZATCA signing curve is secp256k1 (closes AI-001)

- Status: Accepted
- Date: 2026-06-27
- Supersedes: AI-001 (Curve Investigation)
- Affected policy: `src/services/zatca/policy/ZatcaPolicy_2023_05.ts`

## Context

ZATCA's published Security Features Implementation Standards v1.2 (May 2023, page 14)
describes the certificate's `SubjectPublicKeyInfo` with the phrase "Key length: P-256".
Read literally, "P-256" names the NIST curve prime256v1. This conflicted with other
ZATCA sources, so the curve was left open under AI-001 and the policy shipped with a
PROVISIONAL `allowedCurves: ['prime256v1']`, plus a temporary permissive variant that
accepted both candidate curves for inspection.

The conflicting evidence was:

- Security Doc v1.2 p.14: literal text "P-256" (suggests prime256v1).
- ZATCA Developer Portal manuals and SDK release notes: "comply with secp256k1".
- ZATCA SDK ships `ec-secp256k1-priv-key.pem` and the official Signing Process
  documentation uses `openssl ecparam -name secp256k1 -genkey`.
- Multiple production libraries (PHP, Node) all use secp256k1.

A documentation phrase is weaker evidence than an artifact ZATCA itself produced. The
investigation deliberately held closure until a real ZATCA-issued certificate could be
decoded and its curve OID read directly.

## Decision

The curve is **secp256k1**.

A genuine ZATCA-issued certificate (issuer `CN=PRZEINVOICESCA4-CA`), extracted from a
signed reference invoice, was decoded with OpenSSL:

```
Public Key Algorithm: id-ecPublicKey
Public-Key: (256 bit)
ASN1 OID: secp256k1
Signature Algorithm: ecdsa-with-SHA256
```

ZATCA's own certificate authority issued a certificate binding a secp256k1 public key.
This is a repeatable, artifact-level proof, not an inference from documentation. The
"P-256" in Security Doc v1.2 p.14 is therefore read as a typo for "256-bit" (the line is
labelled "Key length", and P-256 is a curve name, not a length).

## Consequences

- `ZatcaPolicy_2023_05.allowedCurves` is set to `['secp256k1']` and the PROVISIONAL
  markers are removed.
- The temporary `ZatcaPolicy_2023_05_PermissiveInvestigation` constant is deleted; the
  investigation window it served is closed.
- The validator code is unchanged: it consumes the policy object and does not branch on
  the curve, preserving the authority-agnostic guarantee.

## Evidence

- `src/services/zatca/__fixtures__/zatca-golden/zatca_real_certificate.pem`
- `src/services/zatca/__fixtures__/zatca-golden/certificate_decoded.txt`

## Closure discipline

This decision is closed on certificate evidence. Should a future ZATCA certificate ever
present a different OID, that is a new policy version (a new file), not a mutation of this
one.
