/**
 * QrInjector — splices the QR base64 into a signed UBL invoice.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * WHERE THIS RUNS IN THE PIPELINE (locked):
 *
 *   XmlBuilder → signXml → QrAssembler → QrTlvProvider → **QrInjector**
 *
 *   The QR depends on the invoice hash (Tag 6), which exists only AFTER signing.
 *   NodeXadesSigner builds signedXml as the ORIGINAL unsignedXml plus the
 *   signature block spliced before </ext:UBLExtensions> — it does NOT re-
 *   serialize the document. So the QR placeholder that XmlBuilder emitted
 *   survives byte-for-byte in signedXml, and we inject AFTER signing. This is
 *   safe: Reference#1 excludes the QR AdditionalDocumentReference, so changing
 *   its content does not affect the (already computed) signature.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WHAT IT EXPECTS (the XmlBuilder QR placeholder shape):
 *
 *   <cac:AdditionalDocumentReference>
 *     <cbc:ID>QR</cbc:ID>
 *     <cac:Attachment>
 *       <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">…</cbc:EmbeddedDocumentBinaryObject>
 *     </cac:Attachment>
 *   </cac:AdditionalDocumentReference>
 *
 *   The injector replaces the CONTENT of that EmbeddedDocumentBinaryObject with
 *   the QR base64. The match is anchored on <cbc:ID>QR</cbc:ID>, so the PIH
 *   AdditionalDocumentReference (which uses the same element and appears earlier)
 *   is never touched. A document whose QR block is empty (no Attachment, as in
 *   some reference fixtures) is intentionally rejected — this injector targets
 *   XmlBuilder output, which always carries the placeholder.
 *
 * Architectural references:
 * - AD-009A v2: One Authority Per Concern (this only injects; it does not build,
 *   sign, encode, or assemble).
 */

/** Errors raised by QrInjector. */
export class QrInjectionError extends Error {
  public readonly code: QrInjectionErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(code: QrInjectionErrorCode, message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'QrInjectionError';
    this.code = code;
    this.context = context;

    if (typeof (Error as { captureStackTrace?: unknown }).captureStackTrace === 'function') {
      (Error as unknown as { captureStackTrace: (t: object, c: unknown) => void })
        .captureStackTrace(this, QrInjectionError);
    }
  }
}

export type QrInjectionErrorCode =
  | 'QR_PLACEHOLDER_NOT_FOUND'; // no QR EmbeddedDocumentBinaryObject to fill

export interface QrInjector {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Replace the content of the QR EmbeddedDocumentBinaryObject with qrBase64.
   * Everything else in the document is preserved byte-for-byte.
   *
   * @throws QrInjectionError('QR_PLACEHOLDER_NOT_FOUND') if no QR slot exists.
   */
  inject(signedXml: string, qrBase64: string): string;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type QrInjectorFactory = () => QrInjector;

/**
 * NodeQrInjector — anchored textual replacement (no DOM re-serialization).
 *
 * Mirrors NodeXadesSigner's text-splice philosophy: the document is not parsed
 * and re-serialized (which could shift whitespace or drop comments); only the
 * QR EmbeddedDocumentBinaryObject content is replaced in place.
 */
export class NodeQrInjector implements QrInjector {
  readonly implementationName = 'anchored textual QR injector';

  /**
   * Capture groups:
   *   1: from <cbc:ID>QR</cbc:ID> up to and including the opening
   *      <cbc:EmbeddedDocumentBinaryObject …>
   *   2: the current content (placeholder comment, or a previous value)
   *   3: the closing </cbc:EmbeddedDocumentBinaryObject>
   * The lazy quantifiers keep the match inside the QR block (first
   * EmbeddedDocumentBinaryObject after the QR id), never the earlier PIH one.
   */
  private static readonly QR_BLOCK =
    /(<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject\b[^>]*>)([\s\S]*?)(<\/cbc:EmbeddedDocumentBinaryObject>)/;

  inject(signedXml: string, qrBase64: string): string {
    if (!NodeQrInjector.QR_BLOCK.test(signedXml)) {
      throw new QrInjectionError(
        'QR_PLACEHOLDER_NOT_FOUND',
        'No QR EmbeddedDocumentBinaryObject found to inject the QR base64 into'
      );
    }
    return signedXml.replace(
      NodeQrInjector.QR_BLOCK,
      (_match, open: string, _content: string, close: string) => open + qrBase64 + close
    );
  }
}
