# ZATCA Golden Reference — Verified Findings

Source: signed Standard Invoice from Saleh7/php-zatca-xml (aligned to ZATCA Java SDK R3.4.8),
carrying a **genuine ZATCA-issued test certificate** (issuer CN=PRZEINVOICESCA4-CA).

These facts were verified by direct computation against the accepted invoice, not read from a spec.

---

## 1. Curve — AI-001 CLOSED

The embedded X.509 certificate was decoded with OpenSSL:

```
Public Key Algorithm: id-ecPublicKey
Public-Key: (256 bit)
ASN1 OID: secp256k1
Signature Algorithm: ecdsa-with-SHA256
Issuer: CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local
```

ZATCA's own CA issued this certificate binding a **secp256k1** public key. This is the
repeatable, certificate-level evidence required to close AI-001. The "P-256" in
Security Features v1.2 p.14 is a typo for "256-bit".

ADR-023: curve = secp256k1.

---

## 2. Certificate digest — hashes the BASE64 STRING, not the DER

Step 3 of the signing process (CertDigest in SignedProperties) was verified:

```
SHA-256(base64 cert string as ASCII)  -> d302b411...  MATCHES the accepted invoice
SHA-256(DER bytes)                    -> a286d287...  does NOT match
```

CRITICAL: the certificate is hashed as the **base64 text** (the binarySecurityToken string
returned by ZATCA), NOT the decoded DER bytes. Security v1.2 p.23 says "DER encoded" — this
is a spec-vs-reality conflict. Use the base64 string.

The result is then base64-encoded again, giving an 88-character DigestValue
(base64 of the 64-char hex string). This is the "Encoding Asymmetry".

---

## 3. Encoding Asymmetry — CONFIRMED

| Element | DigestValue length | Encoding |
|---|---|---|
| Invoice (Reference #1, Id=invoiceSignedData) | 44 chars | raw 32-byte SHA-256, base64 once |
| SignedProperties (Reference #2) | 88 chars | SHA-256 hex string, base64 of that |
| CertDigest | 88 chars | SHA-256 hex string, base64 of that |

Matches our HashProvider design: computeRawDigest (44) vs computeHexDigest (88).

---

## 4. Algorithms and structure (from accepted invoice)

- CanonicalizationMethod: `http://www.w3.org/2006/12/xml-c14n11`  (C14N 1.1)
- SignatureMethod: `http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256`
- Invoice Reference: 3 XPath transforms (exclude UBLExtensions, cac:Signature,
  AdditionalDocumentReference[cbc:ID='QR']) + xml-c14n11 transform
- SigningCertificate is **V1** (`<xades:SigningCertificate>`), NOT SigningCertificateV2
- Reference #2 Type = `http://www.w3.org/2000/09/xmldsig#SignatureProperties`
  (NOT the etsi URI `http://uri.etsi.org/01903#SignedProperties` that Security v1.2 states)
- QualifyingProperties: `xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature"`
- SignedProperties Id = `xadesSignedProperties` (matches Reference #2 URI `#xadesSignedProperties`)
- X509IssuerName format: `CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local`
- X509SerialNumber: decimal integer (e.g. 379112742831380471835263969587287663520528387)

---

## 5. Status discipline

| Item | Evidence level | Closure status |
|---|---|---|
| secp256k1 | Real ZATCA cert OID, verified | CLOSED -> ADR-023 |
| CertDigest = SHA-256(base64 string) | Byte-for-byte verified | Strong; confirm at Sandbox |
| Encoding asymmetry (44 vs 88) | Byte-for-byte verified | Confirmed |
| C14N 1.1, V1, Type URI | From library-generated invoice w/ real cert | Strong Evidence; lock ADR after Sandbox PASS |

The remaining items are Golden-Reference evidence, not yet Sandbox-confirmed against our own
output. Lock the ADRs after the first accepted invoice, per "success is the closure point".
