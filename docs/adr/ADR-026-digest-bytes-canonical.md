# ADR-026: Digest bytes are the canonical representation; encoded forms are derived views

- Status: Accepted
- Date: 2026-06-27
- Supersedes: (none — additive capability; complements AD-009 v2 Encoding Asymmetry)
- Affected code: `src/services/zatca/hash/HashProvider.ts`, `src/services/zatca/hash/NodeCryptoHashProvider.ts`

## Context

`HashProvider` exposed only two SHA-256 outputs, both textual:

- `computeRawDigest` -> `RawDigestB64` (44 chars): base64 of the raw digest bytes.
  Used for Invoice Hash and QR Tag 6.
- `computeHexDigest` -> `HexDigestB64` (88 chars): base64 of the lowercase hex string.
  Used for SignedProperties Hash and Certificate Hash.

Both were correct for their original consumers, all of which embed the hash as text in
XML or a QR TLV. No consumer needed the digest as raw bytes, so none was exposed.

S3.3 (XAdES signer) changes that. Per ADR-025, ZATCA signs the raw 32-byte invoice hash:
`Vault.sign` receives those bytes and applies SHA-256 then ECDSA. The signer therefore
needs the digest **as bytes**, not as a base64 string.

The wrong way to get them is `Buffer.from(invoiceHashB64, 'base64')` inside the signer.
That would (a) put hash-representation knowledge inside the signing layer, breaking One
Authority Per Concern, and (b) risk the silent failure of signing a textual
representation instead of the bytes. The bytes must come from the hash authority.

## Decision

The raw 32-byte SHA-256 digest is the **canonical internal representation**. The base64
and base64-of-hex forms are **derived textual views** of those bytes.

`HashProvider` gains:

```
computeDigestBytes(input: BytesToHash): Buffer   // exactly 32 bytes — the source of truth
```

The XAdES signer consumes `computeDigestBytes` directly and passes the bytes to
`Vault.sign(..., 'der')`. No base64 round-trip exists anywhere in the sign path.

This is recorded as a principle, not just a method:

> Digest bytes are the canonical internal representation. Any other form
> (RawDigestB64, HexDigestB64, base64-of-hex) is a derived view of those bytes.

## Consequences

- `computeDigestBytes` is **additive**. The existing `computeRawDigest` and
  `computeHexDigest` keep their exact names, signatures, and behavior. No consumer
  (S3.2 SignedProperties, QR, DigestValue) is touched. This is the Open/Closed
  Principle in practice: capability added, contract unchanged.
- The implementation currently computes SHA-256 independently in `computeDigestBytes`.
  This is a deliberate, recorded choice: this change adds a capability and must not also
  restructure internals in the same commit, so that any future regression has an
  unambiguous source.
- **Backward compatibility is guaranteed.** A future refactor MAY derive
  `computeRawDigest` and `computeHexDigest` from `computeDigestBytes` (so all encoded
  forms flow from the one source) WITHOUT changing public behavior. That refactor is
  deferred tech-debt, to be done independently after the first Sandbox PASS, not now.
- S3.3 must obtain digest bytes from `computeDigestBytes`, never by base64-decoding a
  `*B64` value. The decode path is prohibited in the signing layer.

## Evidence

- `src/services/zatca/hash/__tests__/NodeCryptoHashProvider.test.ts`
  ("computeDigestBytes" suite: 32-byte length, NIST `"abc"` / `""` vectors byte-for-byte,
  and the canonical-source invariant `computeDigestBytes == base64-decode(computeRawDigest)`).
- 25/25 hash tests pass (19 pre-existing unchanged + 6 new), confirming no regression.

## Closure discipline

This decision is closed as an additive capability with a stated principle. The deferred
internal refactor (encoded forms derived from `computeDigestBytes`) is a separate future
change; should it be undertaken, it MUST preserve the public behavior locked by the
existing tests, and is not a mutation of this decision but an implementation of the
principle it records.
