/**
 * Tests for XmlCryptoCanonicalizationProvider.
 *
 * Per AD-012 v2 Layer 2 (Unit Tests) + Layer 3 (Golden Fixtures via AD-006A v2).
 *
 * Test categories:
 * 1. Contract tests       — interface and error handling
 * 2. Standard fixtures    — typical UBL invoice structures
 * 3. Arabic fixtures      — Saudi-specific UTF-8 content
 * 4. Edge-case fixtures   — namespace inheritance, ordering, whitespace, etc.
 * 5. Determinism tests    — byte-identical output for identical input
 *
 * Golden Fixtures convention:
 *   <name>.input.xml      — input XML
 *   <name>.canonical.xml  — expected canonical output
 *
 * Per AD-006A v2: a fixture is "golden" only when its expected output has been
 * reviewed and committed. Modifying expected output requires architectural review.
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { XmlCryptoCanonicalizationProvider } from '../XmlCryptoCanonicalizationProvider';
import { CanonicalizationError } from '../CanonicalizationProvider';

const FIXTURES_DIR = join(__dirname, '..', 'fixtures');

/**
 * Helper: load a fixture pair (input + expected canonical) by name and category.
 */
async function loadFixture(category: string, name: string): Promise<{ input: string; expected: string }> {
  const input = await fs.readFile(join(FIXTURES_DIR, category, `${name}.input.xml`), 'utf-8');
  const expected = await fs.readFile(join(FIXTURES_DIR, category, `${name}.canonical.xml`), 'utf-8');
  return { input, expected };
}

/**
 * Helper: assert canonical output matches expected fixture.
 * Per AD-006A v2: exact byte-for-byte comparison.
 */
function assertCanonicalMatches(actual: string, expected: string, name: string): void {
  if (actual !== expected) {
    // Detailed diagnostic for failed Golden Fixture
    const actualHash = createHash('sha256').update(actual).digest('hex').slice(0, 16);
    const expectedHash = createHash('sha256').update(expected).digest('hex').slice(0, 16);
    throw new Error(
      `Golden Fixture mismatch for "${name}":\n` +
      `  Expected (sha256: ${expectedHash}): ${JSON.stringify(expected)}\n` +
      `  Actual   (sha256: ${actualHash}): ${JSON.stringify(actual)}\n` +
      `  If the new output is correct, update the fixture file.`
    );
  }
}

describe('XmlCryptoCanonicalizationProvider', () => {
  const provider = new XmlCryptoCanonicalizationProvider();

  describe('Contract', () => {
    it('declares the C14N 1.0 algorithm URI', () => {
      expect(provider.algorithm).toBe('http://www.w3.org/TR/2001/REC-xml-c14n-20010315');
    });

    it('declares an implementation name', () => {
      expect(provider.implementationName).toContain('xml-crypto');
      expect(provider.implementationName).toContain('C14N 1.0');
    });

    it('throws EMPTY_INPUT for empty string', () => {
      expect(() => provider.canonicalize('')).toThrow(CanonicalizationError);
      try {
        provider.canonicalize('');
      } catch (err) {
        expect((err as CanonicalizationError).code).toBe('EMPTY_INPUT');
      }
    });

    it('throws EMPTY_INPUT for whitespace-only string', () => {
      try {
        provider.canonicalize('   \n  \t  ');
        expect.fail('Expected CanonicalizationError');
      } catch (err) {
        expect((err as CanonicalizationError).code).toBe('EMPTY_INPUT');
      }
    });

    it('throws INVALID_XML for malformed XML', () => {
      try {
        provider.canonicalize('<root><unclosed>');
        expect.fail('Expected CanonicalizationError');
      } catch (err) {
        expect(err).toBeInstanceOf(CanonicalizationError);
        expect((err as CanonicalizationError).code).toBe('INVALID_XML');
      }
    });

    it('throws INVALID_XML for non-XML input', () => {
      try {
        provider.canonicalize('this is not xml');
        expect.fail('Expected CanonicalizationError');
      } catch (err) {
        expect((err as CanonicalizationError).code).toBe('INVALID_XML');
      }
    });
  });

  describe('Input normalization', () => {
    it('strips UTF-8 BOM from input', () => {
      const xmlWithBom = '\uFEFF<root>content</root>';
      const result = provider.canonicalize(xmlWithBom);
      expect(result.startsWith('\uFEFF')).toBe(false);
      expect(result).toBe('<root>content</root>');
    });

    it('normalizes CRLF to LF', () => {
      const xmlCrlf = '<root>\r\n<child>x</child>\r\n</root>';
      const result = provider.canonicalize(xmlCrlf);
      expect(result).not.toContain('\r');
      expect(result).toContain('\n');
    });

    it('normalizes standalone CR to LF', () => {
      const xmlCr = '<root>\r<child>x</child>\r</root>';
      const result = provider.canonicalize(xmlCr);
      expect(result).not.toContain('\r');
    });

    it('handles BOM + CRLF combination', () => {
      const tricky = '\uFEFF<root>\r\ncontent\r\n</root>';
      const result = provider.canonicalize(tricky);
      expect(result.startsWith('\uFEFF')).toBe(false);
      expect(result).not.toContain('\r');
    });
  });

  describe('Determinism', () => {
    it('produces byte-identical output for identical input', () => {
      const xml = '<root xmlns="urn:test"><a>1</a><b>2</b></root>';
      const r1 = provider.canonicalize(xml);
      const r2 = provider.canonicalize(xml);
      const r3 = provider.canonicalize(xml);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('produces identical output across multiple provider instances', () => {
      const xml = '<root xmlns="urn:test"><a>1</a></root>';
      const p1 = new XmlCryptoCanonicalizationProvider();
      const p2 = new XmlCryptoCanonicalizationProvider();
      expect(p1.canonicalize(xml)).toBe(p2.canonicalize(xml));
    });

    it('SHA-256 of canonical output is stable', () => {
      const xml = '<Invoice xmlns="urn:test"><ID>X</ID></Invoice>';
      const canonical = provider.canonicalize(xml);
      const hash1 = createHash('sha256').update(canonical).digest('hex');
      const hash2 = createHash('sha256').update(provider.canonicalize(xml)).digest('hex');
      expect(hash1).toBe(hash2);
    });
  });

  describe('Golden Fixtures: standard', () => {
    it('canonicalizes minimal-invoice correctly', async () => {
      const { input, expected } = await loadFixture('standard', 'minimal-invoice');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'minimal-invoice');
    });

    it('canonicalizes multi-line-invoice correctly', async () => {
      const { input, expected } = await loadFixture('standard', 'multi-line-invoice');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'multi-line-invoice');
    });
  });

  describe('Golden Fixtures: arabic', () => {
    it('canonicalizes full-arabic-invoice correctly (Arabic UTF-8 preserved)', async () => {
      const { input, expected } = await loadFixture('arabic', 'full-arabic-invoice');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'full-arabic-invoice');
      // Defensive: confirm Arabic still present
      expect(actual).toContain('أرض المبارك');
      expect(actual).toContain('محمد أحمد العتيبي');
    });
  });

  describe('Golden Fixtures: edge-cases', () => {
    it('orders attributes alphabetically', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'attribute-ordering');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'attribute-ordering');
      // Defensive: confirm a, b, c order
      const aPos = actual.indexOf('a=');
      const bPos = actual.indexOf('b=');
      const cPos = actual.indexOf('c=');
      expect(aPos).toBeLessThan(bPos);
      expect(bPos).toBeLessThan(cPos);
    });

    it('collapses whitespace in tags', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'whitespace-in-tags');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'whitespace-in-tags');
    });

    it('preserves nested namespaces', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'nested-namespaces');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'nested-namespaces');
    });

    it('expands empty elements (self-closing → open+close)', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'empty-elements');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'empty-elements');
      // Defensive: no self-closing tags in canonical form
      expect(actual).not.toMatch(/<\w+\s*\/>/);
    });

    it('strips comments (C14N without comments)', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'comments');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'comments');
      // Defensive: no comment markers
      expect(actual).not.toContain('<!--');
      expect(actual).not.toContain('-->');
    });

    it('escapes special characters correctly', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'special-characters');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'special-characters');
      // Defensive: entities present in attribute context
      expect(actual).toContain('&quot;');
    });

    it('preserves xml:lang attribute', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'xml-lang');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'xml-lang');
      // Defensive: xml:lang present
      expect(actual).toContain('xml:lang="ar"');
    });

    it('normalizes CRLF input', async () => {
      const { input, expected } = await loadFixture('edge-cases', 'crlf-input');
      const actual = provider.canonicalize(input);
      assertCanonicalMatches(actual, expected, 'crlf-input');
      expect(actual).not.toContain('\r');
    });
  });

  describe('Critical invariants for ZATCA signing chain', () => {
    it('output is a JavaScript string (not bytes)', () => {
      const result = provider.canonicalize('<root>x</root>');
      expect(typeof result).toBe('string');
    });

    it('output never contains UTF-8 BOM (defensive)', () => {
      const result = provider.canonicalize('<root>x</root>');
      expect(result.charCodeAt(0)).not.toBe(0xFEFF);
    });

    it('output never contains CR characters', () => {
      const inputs = [
        '<root>x</root>',
        '<root>\r\n<a>1</a>\r\n</root>',
        '<root>\r<a>1</a>\r</root>',
      ];
      for (const xml of inputs) {
        const result = provider.canonicalize(xml);
        expect(result.indexOf('\r')).toBe(-1);
      }
    });
  });
});
