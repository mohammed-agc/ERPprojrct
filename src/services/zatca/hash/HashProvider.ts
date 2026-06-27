/**
 * HashProvider — The SOLE authority for cryptographic hashing in ZATCA pipeline.
 *
 * Architectural references:
 * - AD-001 Pipeline Phase 3: Compute Invoice Hash
 * - AD-009 v2: Hash Encoding Asymmetry (CRITICAL)
 * - AD-009A v2: Hash Module Boundary + One Authority Per Concern
 * - AD-012 v2: Provider pattern for DI
 *
 * THE ENCODING ASYMMETRY (most subtle bug in ZATCA implementations):
 *   ZATCA uses TWO different encodings of the same SHA-256 hash:
 *
 *   ┌─────────────────────────────────────────────────────────────────┐
 *   │ RawDigestB64 = base64( sha256(input) raw bytes )                 │
 *   │   ├── Length: 44 characters (32 bytes * 4/3 with padding)        │
 *   │   ├── Used for: Invoice Hash, QR Tag 6                           │
 *   │   └── This is the "natural" base64 of hash bytes                 │
 *   ├─────────────────────────────────────────────────────────────────┤
 *   │ HexDigestB64 = base64( hex_string( sha256(input) ) as UTF-8 )    │
 *   │   ├── Length: 88 characters (64 hex chars * 4/3 with padding)    │
 *   │   ├── Used for: SignedProperties Hash, Certificate Hash          │
 *   │   └── This is the base64 of the hex REPRESENTATION               │
 *   └─────────────────────────────────────────────────────────────────┘
 *
 *   If you confuse these two — even once — ZATCA rejects the invoice.
 *   The Provider exposes BOTH methods explicitly to make the choice
 *   intentional, not accidental.
 *
 * Type-safe usage aliases (compile-time enforcement):
 *   - InvoiceHashB64        = brand of RawDigestB64
 *   - SignedPropertiesHashB64 = brand of HexDigestB64
 *   - QrInvoiceHashB64      = brand of RawDigestB64
 *   - CertificateHashB64    = brand of HexDigestB64
 *
 *   You cannot pass a SignedPropertiesHashB64 where an InvoiceHashB64 is
 *   expected. TypeScript prevents the mix-up at compile time.
 *
 * Determinism:
 *   For identical bytes, output is byte-identical. Verified by Golden Fixtures
 *   cross-checked against OpenSSL, Node crypto, and Python hashlib.
 *
 * No private state, no side effects, thread-safe.
 */

/**
 * Bytes to be hashed. Typically canonical XML bytes.
 */
export type BytesToHash = Uint8Array | Buffer | string;

/**
 * RawDigestB64: base64 of SHA-256 raw bytes.
 * Always 44 characters when properly formatted.
 *
 * Per AD-009 v2: used for Invoice Hash and QR Tag 6.
 */
export type RawDigestB64 = string & { readonly __brand: 'RawDigestB64' };

/**
 * HexDigestB64: base64 of hex string of SHA-256 (interpreting hex as UTF-8 bytes).
 * Always 88 characters when properly formatted.
 *
 * Per AD-009 v2: used for SignedProperties Hash and Certificate Hash.
 */
export type HexDigestB64 = string & { readonly __brand: 'HexDigestB64' };

// ───── Usage-specific aliases (compile-time guards) ─────────────────────────

/**
 * Invoice Hash: SHA-256 of canonical invoice XML, base64-encoded raw.
 * Per AD-009 v2 alias of RawDigestB64.
 * Used at:
 *   - <ds:DigestValue> in XML signature
 *   - QR Code Tag 6 (invoice hash)
 */
export type InvoiceHashB64 = RawDigestB64 & { readonly __alias: 'InvoiceHashB64' };

/**
 * SignedProperties Hash: SHA-256 of canonical SignedProperties XML,
 *                        encoded as base64-of-hex (NOT raw).
 * Per AD-009 v2 alias of HexDigestB64.
 * Used at:
 *   - <ds:Reference URI="#xadesSignedProperties"><ds:DigestValue>
 */
export type SignedPropertiesHashB64 = HexDigestB64 & { readonly __alias: 'SignedPropertiesHashB64' };

/**
 * QR Invoice Hash: same as InvoiceHashB64.
 * Per AD-009 v2 alias of RawDigestB64.
 * Used at:
 *   - QR Code TLV Tag 6
 */
export type QrInvoiceHashB64 = RawDigestB64 & { readonly __alias: 'QrInvoiceHashB64' };

/**
 * Certificate Hash: SHA-256 of certificate DER bytes, encoded as base64-of-hex.
 * Per AD-009 v2 alias of HexDigestB64.
 * Used at:
 *   - <xades:CertDigest><ds:DigestValue> in SignedProperties
 */
export type CertificateHashB64 = HexDigestB64 & { readonly __alias: 'CertificateHashB64' };

/**
 * Errors raised by HashProvider.
 */
export class HashError extends Error {
  constructor(
    public readonly code: HashErrorCode,
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'HashError';
  }
}

export type HashErrorCode =
  | 'EMPTY_INPUT_REJECTED'      // Optional defensive check
  | 'HASH_COMPUTATION_FAILED';

/**
 * Algorithm identifier — currently only SHA-256 is supported (per ZATCA spec).
 */
export type HashAlgorithm = 'SHA-256';

/**
 * HashProvider interface.
 *
 * MUST:
 * 1. Always return deterministic output for identical input.
 * 2. Expose both digest encodings explicitly — no defaults that could mask a mix-up.
 * 3. Validate output length (44 for raw, 88 for hex-encoded).
 * 4. Be stateless and thread-safe.
 */
export interface HashProvider {
  /**
   * The algorithm this provider implements.
   */
  readonly algorithm: HashAlgorithm;

  /**
   * Human-readable implementation name for diagnostics.
   */
  readonly implementationName: string;
  /**
   * Compute the raw 32-byte SHA-256 digest — the CANONICAL internal representation.
   *
   * Per ADR-026: the digest bytes are the source of truth; RawDigestB64 and
   * HexDigestB64 are derived textual representations (views) of these bytes.
   *
   * Use for: anything that needs the digest as bytes rather than text — notably
   * ECDSA signing (the XAdES signer passes these 32 bytes to Vault.sign, which
   * applies SHA-256 then ECDSA, per ADR-025). Do NOT base64-decode a *B64 string
   * to recover these bytes; obtain them here, from the hash authority.
   *
   * @param input - Bytes to hash (Uint8Array | Buffer | string-as-UTF-8)
   * @returns Buffer of exactly 32 bytes (SHA-256 output)
   * @throws HashError on failure
   */
  computeDigestBytes(input: BytesToHash): Buffer;

  /**
   * Compute base64 of raw SHA-256 bytes (44 chars).
   *
   * Use for: Invoice Hash, QR Tag 6.
   * Per AD-009 v2: this is the encoding for the bytes-themselves.
   *
   * @param input - Bytes to hash (Uint8Array | Buffer | string-as-UTF-8)
   * @returns RawDigestB64 (44 characters base64)
   * @throws HashError on failure
   */
  computeRawDigest(input: BytesToHash): RawDigestB64;

  /**
   * Compute base64 of hex string of SHA-256 (88 chars).
   *
   * Use for: SignedProperties Hash, Certificate Hash.
   * Per AD-009 v2: this is base64-of-the-hex-representation.
   *
   * The hex string is interpreted as ASCII/UTF-8 bytes before base64 encoding.
   * I.e., the hex characters '0'-'9', 'a'-'f' are the actual bytes that go
   * into the base64 encoder.
   *
   * @param input - Bytes to hash (Uint8Array | Buffer | string-as-UTF-8)
   * @returns HexDigestB64 (88 characters base64)
   * @throws HashError on failure
   */
  computeHexDigest(input: BytesToHash): HexDigestB64;
}

/**
 * Helper: tag a RawDigestB64 as an InvoiceHashB64 (usage clarification).
 * No-op at runtime; compile-time branding only.
 */
export function asInvoiceHash(raw: RawDigestB64): InvoiceHashB64 {
  return raw as InvoiceHashB64;
}

/**
 * Helper: tag a RawDigestB64 as a QrInvoiceHashB64 (usage clarification).
 */
export function asQrInvoiceHash(raw: RawDigestB64): QrInvoiceHashB64 {
  return raw as QrInvoiceHashB64;
}

/**
 * Helper: tag a HexDigestB64 as a SignedPropertiesHashB64 (usage clarification).
 */
export function asSignedPropertiesHash(hex: HexDigestB64): SignedPropertiesHashB64 {
  return hex as SignedPropertiesHashB64;
}

/**
 * Helper: tag a HexDigestB64 as a CertificateHashB64 (usage clarification).
 */
export function asCertificateHash(hex: HexDigestB64): CertificateHashB64 {
  return hex as CertificateHashB64;
}

/**
 * Factory function signature for dependency injection (per AD-012 v2).
 */
export type HashProviderFactory = () => HashProvider;
