# ADR-024: ZATCA SignatureValue is DER-encoded, not raw r||s (IEEE-P1363)

- Status: Accepted
- Date: 2026-06-27
- Supersedes: AD-009 v2 (signature encoding clause: "signature is raw r||s, base64-encoded")
- Affected code: `src/services/zatca/vault/VaultProvider.ts`, `src/services/zatca/vault/FileSystemVaultProvider.ts`

## Context

The Vault was built at v1.24 to emit ECDSA signatures as raw `r||s` (IEEE-P1363):
a fixed-length 64-byte concatenation for 256-bit curves, base64-encoded to 88 chars.
This was recorded as an architectural decision (AD-009 v2) and reinforced throughout
`FileSystemVaultProvider.ts`: the `dsaEncoding: 'ieee-p1363'` call, a `rawSignature`
variable name, a "64 bytes raw -> 88 chars b64" length note, and a `SignatureValueB64`
brand comment all asserting raw `r||s`.

Raw `r||s` is the natural default in the JWS / WebCrypto world (ES256 uses it), which is
the lineage the Vault inherited. At the time, no ZATCA-signed reference had been decoded
byte-for-byte, so the encoding was an inherited assumption, not a verified fact.

## Decision

ZATCA's `SignatureValue` is **DER-encoded** (ASN.1 `SEQUENCE { INTEGER r, INTEGER s }`),
not raw `r||s`.

The golden reference invoice (issuer `CN=PRZEINVOICESCA4-CA`, ZATCA-signed) carries a
`SignatureValue` whose decoded bytes begin:

```
30 45 02 21 ...
```

- `30` = ASN.1 SEQUENCE tag. Raw `r||s` has no tag; it would start with the first byte
  of `r`. The presence of `30` is dispositive: this is DER.
- `30 45` = SEQUENCE of length 0x45 (69) bytes -> 71 bytes total. DER length is
  **variable** (~70-72 bytes for 256-bit curves), because each INTEGER carries
  leading-zero / sign padding when its high bit is set. Raw `r||s` is a fixed 64 bytes.

This is artifact-level proof from ZATCA's own signed output, not an inference. It was
further confirmed end-to-end: a signature produced by the refactored Vault verifies
successfully only when the verifier is told `dsaEncoding: 'der'`; under `'ieee-p1363'`
the same signature fails to verify. The encodings are not interchangeable, and the golden
artifact settles which one ZATCA expects.

## Consequences

- `VaultProvider.sign` gains a required `dsaEncoding: 'der' | 'ieee-p1363'` parameter,
  with **no default**. The Vault stays generic (it can still emit either encoding); the
  caller must state the encoding its protocol mandates. For ZATCA the caller passes
  `'der'`. Forcing the caller to declare the encoding upholds Constitution Rule 6
  (No Silent Assumptions): the legal requirement lives at the call site, not buried in a
  Node default.
- `FileSystemVaultProvider` consumes the parameter instead of the hardcoded
  `'ieee-p1363'`. The `rawSignature` name and the raw-`r||s` comments/length notes are
  removed; the `SignatureValueB64` brand now documents DER + variable length.
- Vault tests that asserted a fixed 64-byte length are replaced with assertions that the
  output is a valid DER signature (first byte `0x30`, length in the DER range). The
  in-test `verify` call is switched to `dsaEncoding: 'der'` to match the signer.
- This decision concerns **encoding only**. The separate question of *which bytes* ZATCA
  signs (the raw invoice hash, not `C14N(SignedInfo)`) is recorded in ADR-025.

## Evidence

- `src/services/zatca/__fixtures__/zatca-golden/` (golden SignatureValue decoding to
  `30 45 02 21 ...`)
- `src/services/zatca/vault/__tests__/FileSystemVaultProvider.test.ts`
  ("produces a valid DER signature (SEQUENCE)", "signature is verifiable")

## Closure discipline

This decision is closed on golden-artifact evidence. Should a future ZATCA reference ever
present a non-DER `SignatureValue`, that is a new encoding decision (a new ADR), not a
mutation of this one. The Vault remaining encoding-agnostic means such a change would be a
new call-site argument, not a Vault rewrite.
