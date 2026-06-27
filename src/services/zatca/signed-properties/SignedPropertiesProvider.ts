/**
 * S3.2 — SignedProperties Builder
 *
 * Builds the XAdES SignedProperties block for ZATCA invoice signing.
 *
 * CRITICAL ARCHITECTURAL FACT (verified byte-for-byte against the ZATCA golden
 * reference, digest e930cd6a...):
 * The SignedProperties hash is NOT computed via C14N. ZATCA hashes the SignedProperties
 * with inherited namespaces made explicit (xmlns:xades on the root, xmlns:ds on each ds:
 * element) but WITHOUT C14N empty-element expansion (DigestMethod stays self-closing).
 * Running this block through the S3.1.1 CanonicalizationProvider would EXPAND the empty
 * DigestMethod element and produce the WRONG digest — ZATCA would reject the invoice.
 *
 * Therefore S3.2 uses a fixed literal template + HashProvider.computeHexDigest. It does
 * NOT depend on the CanonicalizationProvider.
 *
 * COUPLING CONSTRAINT: the indentation in the template must match the indentation used
 * when the XmlBuilder (S2.1) embeds the SignedProperties into the invoice. ZATCA's
 * validator re-derives this same form from the embedded element. If the embedded
 * indentation differs from the hash template, validation fails. Both are pinned to the
 * verified 32/36/40/44/48-space layout from the golden reference.
 *
 * Architectural references:
 * - AD-009 v2: Hash Encoding Asymmetry (SignedProperties uses HexDigestB64, 88 chars)
 * - ADR-023: curve secp256k1 (unrelated here but same ZATCA crypto chain)
 * - S3.1.2 HashProvider (sole hashing authority)
 */

import type {
  HashProvider,
  SignedPropertiesHashB64,
  CertificateHashB64,
} from '../hash/HashProvider';

export interface SignedPropertiesInput {
  /** Signing instant from the EGS clock, e.g. "2025-02-27T20:52:40" (no timezone suffix). */
  readonly signingTime: string;
  /** Certificate digest (CertificateHashB64): base64-of-hex, 88 chars. From S3.4 cert loader. */
  readonly certificateDigest: CertificateHashB64;
  /** Issuer distinguished name, e.g. "CN=PRZEINVOICESCA4-CA, DC=extgazt, DC=gov, DC=local". */
  readonly issuerName: string;
  /** Certificate serial number as a decimal string. */
  readonly serialNumber: string;
}

export interface SignedPropertiesResult {
  /**
   * The exact byte sequence that is hashed to produce the digest. This is the "hash version":
   * xmlns:xades on the SignedProperties root, xmlns:ds repeated on each ds: element,
   * self-closing DigestMethod, LF line endings, fixed indentation.
   */
  readonly hashVersionXml: string;
  /** SHA-256(hashVersionXml) as base64-of-hex (88 chars). Goes into Reference#2. */
  readonly digest: SignedPropertiesHashB64;
}

export interface SignedPropertiesProvider {
  build(input: SignedPropertiesInput): SignedPropertiesResult;
}
