# ADR-027: CertDigest is the hash of the certificate's base64 STRING, not its DER bytes

- Status: Accepted
- Date: 2026-06-27
- Supersedes: (corrects) the `CertificateHashB64` doc comment in
  `src/services/zatca/hash/HashProvider.ts` ("SHA-256 of certificate DER bytes")
- Affected code: `src/services/zatca/certificate/NodeCryptoCertificateLoader.ts`;
  the inaccurate comment in `src/services/zatca/hash/HashProvider.ts`

## Context

The XAdES `SignedProperties` carries a `<xades:CertDigest><ds:DigestValue>` —
a SHA-256 digest of the signing certificate, base64-of-hex encoded (88 chars).

The `HashProvider` type comment for `CertificateHashB64` described this as
"SHA-256 of certificate **DER bytes**". That matches the intuitive reading: a
certificate "is" its DER encoding, so hashing "the certificate" should hash the
DER. No golden value had been reproduced when that comment was written, so the
intuitive reading went unchallenged.

## Decision

ZATCA's `CertDigest` is **SHA-256 of the certificate's base64 STRING** (the
base64 text, interpreted as ASCII bytes), **not** of the DER bytes. The result
is then base64-of-hex encoded (88 chars), per the standard Encoding Asymmetry.

```
CertDigest = base64( hex( SHA-256( certificateB64_string_as_ASCII ) ) )
```

This is proven against the golden reference (Standard_Invoice_Signed.xml):

- Golden `<ds:DigestValue>` (88 chars) base64-decodes to the hex string
  `d302b411575c956598c5e88abb4856452556a5ab8a01f7acb95a069d46662485`.
- Running `computeHexDigest(certificateB64)` over the golden certificate's
  base64 string reproduces that exact value.
- Running `computeHexDigest(DER_bytes)` over the same certificate produces a
  DIFFERENT value — so the DER reading is demonstrably wrong.

Both directions are locked by tests
(`NodeCryptoCertificateLoader.test.ts`: "certificateDigest matches the golden
CertDigest exactly" and "would NOT match if hashing DER bytes instead").

The likely reason ZATCA hashes the base64 string: the certificate travels
through the pipeline AS a base64 string (that is what `<ds:X509Certificate>`
contains and what the CSID/onboarding flow handles), so the digest is taken over
the representation that is actually transmitted, not the decoded bytes.

## Consequences

- `NodeCryptoCertificateLoader.load()` computes `certificateDigest` as
  `hash.computeHexDigest(certificateB64)` — passing the base64 STRING, not the
  decoded DER. This is the single place the rule is applied.
- The `CertificateHashB64` comment in `HashProvider.ts` ("DER bytes") is
  inaccurate and should be corrected to "base64 string of the certificate" when
  that file is next touched. The behavior is already correct (HashProvider just
  hashes whatever bytes it is given); only the comment misdescribes the intended
  input. This is recorded as low-risk tech-debt, not a code defect.
- The XAdES signer (S3.3) and SignedProperties (S3.2) consume the loader's
  `certificateDigest` and must not recompute it from DER.

## Evidence

- `src/services/zatca/__fixtures__/zatca-golden/Standard_Invoice_Signed.xml`
  (golden `<ds:DigestValue>` for CertDigest)
- `src/services/zatca/certificate/__tests__/NodeCryptoCertificateLoader.test.ts`
  (golden match + the DER-mismatch negative test)

## Closure discipline

This decision is closed on golden-reference reproduction. Should a future ZATCA
version hash the DER bytes (or a normalized PEM) instead, that is a new decision
(a new ADR), not a mutation of this one. The rule lives in one place
(CertificateLoader), so such a change would be a single-site change.
