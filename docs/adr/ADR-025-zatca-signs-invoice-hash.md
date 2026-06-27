# ADR-025: ZATCA signs the raw invoice hash, not C14N(SignedInfo)

- Status: Accepted
- Date: 2026-06-27
- Supersedes: AD-001 Phase 4 (signed-message clause: "data to sign is SignedInfo canonical bytes")
- Affected code: `src/services/zatca/vault/VaultProvider.ts` (`DataToSign` contract); consumed by S3.3 XadesSigner (caller)

## Context

`AD-001 Phase 4` and the `DataToSign` type comment described the bytes handed to the
Vault as `C14N(SignedInfo)` — the canonicalized `<SignedInfo>` element. That is the
standard XML-DSIG signing model: the signer canonicalizes `SignedInfo` (which contains
the digests of all references) and signs the result.

This is the model the contract inherited because XAdES is an XML-DSIG profile. At the
time it was written, no ZATCA-signed reference had been reproduced byte-for-byte, so the
standard model was assumed to apply.

## Decision

ZATCA does **not** sign `C14N(SignedInfo)`. It signs the **raw 32-byte invoice hash**
directly. The end-to-end relation, verified against the golden reference, is:

```
SignatureValue = base64( DER( ECDSA( SHA-256( invoice_hash_32_bytes ) ) ) )
```

where `invoice_hash_32_bytes` is the raw SHA-256 digest of the canonical invoice
(the same value carried in QR Tag 6 and in Reference #1's `DigestValue`).

Mechanically, in Node: `createSign('sha256').update(invoiceHash32).sign(...)` computes
`SHA-256` over the 32 hash bytes and then applies ECDSA — i.e. `ECDSA(SHA-256(hash))`.
This is what reproduces the golden `SignatureValue`. Feeding `C14N(SignedInfo)` instead
produces a different signature that the golden certificate does not verify. The
reproduction is artifact-level proof, not an inference from the XML-DSIG spec.

This is a deliberate ZATCA deviation from standard XML-DSIG. The `<SignedInfo>` element
still exists in the emitted XML (it carries the two reference digests for structural
completeness), but its canonical form is **not** the signed message. The signed message
is the invoice hash.

## Consequences

- `DataToSign` is documented as the caller's chosen raw message bytes — for ZATCA, the
  32-byte invoice hash — explicitly **not** `C14N(SignedInfo)`. The type stays
  `Uint8Array`, so the representation is raw bytes (no utf-8 / base64 string coercion that
  would silently hash the wrong input).
- Choosing the correct message is the **caller's** responsibility (S3.3 XadesSigner). The
  Vault is message-agnostic: it applies `SHA-256` then ECDSA to whatever bytes it is
  given. The Vault must therefore receive the 32 hash bytes, not the invoice XML and not
  `SignedInfo`.
- S3.3 must not attempt the standard "canonicalize SignedInfo and sign it" path. It
  computes the invoice hash (S3.1.2 HashProvider) and passes those 32 bytes to
  `Vault.sign(..., 'der')`.
- This decision concerns **which bytes are signed**. The separate question of the
  signature's output *encoding* (DER vs raw r||s) is recorded in ADR-024.

## Evidence

- `src/services/zatca/__fixtures__/zatca-golden/` (golden invoice hash + golden
  `SignatureValue`; reproducing the latter from the former requires signing the hash, not
  `C14N(SignedInfo)`)
- Memory of byte-level verification: `ECDSA(SHA-256(invoice_hash_raw_32bytes))` matches
  the golden `SignatureValue`; `C14N(SignedInfo)` does not.

## Closure discipline

This decision is closed on the reproduction of the golden `SignatureValue` from the raw
invoice hash. Should a future ZATCA version move to a standard XML-DSIG `SignedInfo`
signing model, that is a new signing-model decision (a new ADR), not a mutation of this
one. Because the message choice lives in the caller (S3.3), such a change is a caller
change, not a Vault change.
