/**
 * Tests for NodeQrInjector.
 *
 * The injector targets XmlBuilder's QR placeholder shape, so the fixture here
 * reproduces that shape byte-for-byte (2-space indent, the Arabic placeholder
 * comment, a preceding PIH block that uses the same element). We verify:
 *   - only the QR EmbeddedDocumentBinaryObject content changes,
 *   - PIH is never touched,
 *   - the rest of the document is byte-identical,
 *   - the real golden Standard QR survives a round-trip (re-extract + TLV decode),
 *   - the absence guard fires.
 */

import { describe, it, expect } from 'vitest';
import { NodeQrInjector, QrInjectionError } from '../QrInjector';

/** A signed-XML fragment matching XmlBuilder's exact QR placeholder output. */
function xmlBuilderShaped(): string {
  const block = [
    '  <cac:AdditionalDocumentReference>',
    '    <cbc:ID>PIH</cbc:ID>',
    '    <cac:Attachment>',
    '      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">NWZlY2ViNjY=</cbc:EmbeddedDocumentBinaryObject>',
    '    </cac:Attachment>',
    '  </cac:AdditionalDocumentReference>',
    '  <cac:AdditionalDocumentReference>',
    '    <cbc:ID>QR</cbc:ID>',
    '    <cac:Attachment>',
    '      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"><!-- QR TLV base64 — يُملأ في S4 QrTlvService --></cbc:EmbeddedDocumentBinaryObject>',
    '    </cac:Attachment>',
    '  </cac:AdditionalDocumentReference>',
  ].join('\n');
  return `<Invoice>\n<ext:UBLExtensions>...signature...</ext:UBLExtensions>\n${block}\n</Invoice>`;
}

/** Extract the QR content with the same anchoring used elsewhere in the suite. */
function extractQr(xml: string): string {
  const m = xml.match(
    /<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject\b[^>]*>([\s\S]*?)<\/cbc:EmbeddedDocumentBinaryObject>/
  );
  if (!m) throw new Error('no QR content');
  return m[1];
}

function decodeTlv(buf: Buffer): Map<number, Buffer> {
  const tags = new Map<number, Buffer>();
  let i = 0;
  while (i < buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    if (tag === undefined || len === undefined) break;
    tags.set(tag, buf.subarray(i + 2, i + 2 + len));
    i += 2 + len;
  }
  return tags;
}

// The real golden Standard QR (Tags 1–8), proven byte-exact in earlier layers.
const GOLDEN_STD_QR =
  'AQdMYXRlbmN5Ag8zOTk5OTk5OTk5MDAwMDMDFDIwMjQtMDktMDdUMTc6NDE6MDhaBAQ0LjYwBQQwLjYwBix3M01aS00wQ1RIYXdoaFNUN1EycUQwbWk5RGMvWGMycEQxQVNpWEZ3cEpZPQdgTUVVQ0lRRDlIS0hkeGs5QXh1QmpURWcxOXdTQXBEQ0lxeW1FMHBkbEh6Sm1jRGFZeXdJZ2YzZC9iZk1TaDlRNUlHZ013OVlCaFpsZmJHTEVoTHQ2SUR5T2NySFhNaTA9CFgwVjAQBgcqhkjOPQIBBgUrgQQACgNCAAShYIprRJr0UgStM6/S4CQLVUgpfFT2c+nHa+V/jKEx6PLxzTZcluUOru0/J2jyarRqE4yY2jyDCeLte3UpP1R4';

describe('NodeQrInjector', () => {
  const injector = new NodeQrInjector();

  it('declares an implementation name', () => {
    expect(injector.implementationName).toContain('injector');
  });

  it('replaces the QR placeholder content with the base64', () => {
    const out = injector.inject(xmlBuilderShaped(), 'Wnpaeg==');
    expect(out).toContain('>Wnpaeg==<');
    expect(out).not.toContain('QR TLV base64'); // comment gone
  });

  it('never touches the earlier PIH block', () => {
    const out = injector.inject(xmlBuilderShaped(), 'Wnpaeg==');
    expect(out).toContain('>NWZlY2ViNjY=<'); // PIH value intact
  });

  it('round-trips: re-extracted QR equals the injected value', () => {
    const out = injector.inject(xmlBuilderShaped(), GOLDEN_STD_QR);
    expect(extractQr(out)).toBe(GOLDEN_STD_QR);
  });

  it('the injected golden QR still decodes to Tags 1–8', () => {
    const out = injector.inject(xmlBuilderShaped(), GOLDEN_STD_QR);
    const tags = decodeTlv(Buffer.from(extractQr(out), 'base64'));
    expect(tags.has(8)).toBe(true);
    expect(tags.has(9)).toBe(false);
    expect(tags.size).toBe(8);
  });

  it('changes only the QR content — the rest is byte-identical', () => {
    const src = xmlBuilderShaped();
    const out = injector.inject(src, GOLDEN_STD_QR);
    const placeholder = '<!-- QR TLV base64 — يُملأ في S4 QrTlvService -->';
    const before = src.replace(placeholder, '\u0000');
    const after = out.replace(GOLDEN_STD_QR, '\u0000');
    expect(after).toBe(before);
  });

  it('re-injecting over a filled QR replaces it cleanly', () => {
    const once = injector.inject(xmlBuilderShaped(), 'AAAA');
    const twice = injector.inject(once, 'BBBB');
    expect(extractQr(twice)).toBe('BBBB');
    expect(twice).not.toContain('>AAAA<');
  });

  it('throws QR_PLACEHOLDER_NOT_FOUND when the QR slot is absent', () => {
    const noQr =
      '<Invoice><cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID></cac:AdditionalDocumentReference></Invoice>';
    expect(() => injector.inject(noQr, 'X')).toThrow(QrInjectionError);
    try {
      injector.inject(noQr, 'X');
    } catch (e) {
      expect((e as QrInjectionError).code).toBe('QR_PLACEHOLDER_NOT_FOUND');
    }
  });

  it('throws QR_PLACEHOLDER_NOT_FOUND for an empty QR block (no Attachment)', () => {
    // Mirrors the reference unsigned shape: <cbc:ID>QR</cbc:ID> with no element to fill.
    const emptyQr =
      '<Invoice><cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID></cac:AdditionalDocumentReference></Invoice>';
    expect(() => injector.inject(emptyQr, 'X')).toThrow(QrInjectionError);
  });
});
