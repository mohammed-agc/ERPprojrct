/**
 * NodeCryptoHashProvider — SHA-256 implementation via Node's built-in crypto.
 *
 * Architectural references:
 * - AD-001 Pipeline Phase 3: Compute Invoice Hash
 * - AD-009 v2: Hash Encoding Asymmetry
 * - AD-009A v2: Hash Module Boundary (this is the ONLY place crypto.createHash
 *                                     for SHA-256 is allowed)
 *
 * Why Node crypto:
 * - Built into Node, no external dependency
 * - FIPS-validated SHA-256 implementation
 * - Cross-verified against OpenSSL 3.0.13 and Python 3.12 hashlib
 *   (all produce IDENTICAL output for IDENTICAL input — see MANIFEST.json)
 * - Deterministic, thread-safe
 *
 * What this provider does:
 *   computeRawDigest(input):
 *     1. Hash input with SHA-256
 *     2. Return base64 of raw bytes (44 chars)
 *
 *   computeHexDigest(input):
 *     1. Hash input with SHA-256
 *     2. Convert to lowercase hex string (64 chars)
 *     3. Encode hex string AS UTF-8 bytes via base64 (88 chars)
 *
 * Invariants enforced at runtime:
 * - RawDigestB64 output length === 44
 * - HexDigestB64 output length === 88
 * - Outputs match Golden Fixtures (verified by tests, not at runtime)
 */

import { createHash } from 'node:crypto';
import type {
  HashProvider,
  HashAlgorithm,
  BytesToHash,
  RawDigestB64,
  HexDigestB64,
} from './HashProvider';
import { HashError } from './HashProvider';

const EXPECTED_RAW_DIGEST_LENGTH = 44;
const EXPECTED_HEX_DIGEST_LENGTH = 88;

export class NodeCryptoHashProvider implements HashProvider {
  readonly algorithm: HashAlgorithm = 'SHA-256';
  readonly implementationName = 'node:crypto SHA-256';

  /**
   * Compute base64 of raw SHA-256 bytes.
   * Per AD-009 v2: this is RawDigestB64 (44 chars).
   * Used for InvoiceHash and QR Tag 6.
   */
  computeRawDigest(input: BytesToHash): RawDigestB64 {
    const buffer = this.toBuffer(input);

    try {
      const result = createHash('sha256').update(buffer).digest('base64');

      // Defensive invariant: output MUST be 44 chars for SHA-256
      if (result.length !== EXPECTED_RAW_DIGEST_LENGTH) {
        throw new HashError(
          'HASH_COMPUTATION_FAILED',
          `RawDigestB64 has unexpected length: ${result.length} (expected ${EXPECTED_RAW_DIGEST_LENGTH})`,
          { actualLength: result.length, expectedLength: EXPECTED_RAW_DIGEST_LENGTH }
        );
      }

      return result as RawDigestB64;
    } catch (err) {
      if (err instanceof HashError) throw err;
      throw new HashError(
        'HASH_COMPUTATION_FAILED',
        'SHA-256 computation failed',
        { cause: String(err) }
      );
    }
  }

  /**
   * Compute base64 of hex string of SHA-256.
   * Per AD-009 v2: this is HexDigestB64 (88 chars).
   * Used for SignedProperties Hash and Certificate Hash.
   *
   * The asymmetry: instead of base64-encoding the 32 raw bytes (44 chars),
   * we first hex-encode them (64 chars) then base64-encode the hex string
   * AS UTF-8 BYTES (88 chars).
   */
  computeHexDigest(input: BytesToHash): HexDigestB64 {
    const buffer = this.toBuffer(input);

    try {
      // Step 1: Compute SHA-256 and get lowercase hex
      const hexStr = createHash('sha256').update(buffer).digest('hex');

      // Defensive: hex string MUST be 64 chars for SHA-256
      if (hexStr.length !== 64) {
        throw new HashError(
          'HASH_COMPUTATION_FAILED',
          `Hex digest has unexpected length: ${hexStr.length} (expected 64)`,
          { actualLength: hexStr.length }
        );
      }

      // Step 2: Base64-encode the hex string AS UTF-8 bytes
      const result = Buffer.from(hexStr, 'utf-8').toString('base64');

      // Defensive invariant: output MUST be 88 chars
      if (result.length !== EXPECTED_HEX_DIGEST_LENGTH) {
        throw new HashError(
          'HASH_COMPUTATION_FAILED',
          `HexDigestB64 has unexpected length: ${result.length} (expected ${EXPECTED_HEX_DIGEST_LENGTH})`,
          { actualLength: result.length, expectedLength: EXPECTED_HEX_DIGEST_LENGTH }
        );
      }

      return result as HexDigestB64;
    } catch (err) {
      if (err instanceof HashError) throw err;
      throw new HashError(
        'HASH_COMPUTATION_FAILED',
        'SHA-256 hex computation failed',
        { cause: String(err) }
      );
    }
  }

  /**
   * Normalize input to a Buffer.
   * - Buffer: passed through
   * - Uint8Array: wrapped as Buffer
   * - string: encoded as UTF-8
   */
  private toBuffer(input: BytesToHash): Buffer {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input);
    if (typeof input === 'string') return Buffer.from(input, 'utf-8');
    throw new HashError(
      'HASH_COMPUTATION_FAILED',
      'Unsupported input type for hashing',
      { inputType: typeof input }
    );
  }
}
