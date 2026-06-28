/**
 * InvoiceSigningComposer — S5.1 — pure composition authority (AD-009A).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * One Authority Per Concern: this composer ONLY wires the proven pure
 * authorities into the final signed-and-QR-stamped invoice. It does NOT:
 *   - touch the database (no PIH / ICV / chain — that is S5.2),
 *   - touch the network (no Clearance / Reporting / Fatoora — that is S5.3),
 *   - resolve credentials (credentialId arrives already-resolved; a separate
 *     CredentialResolver authority maps company_id+environment → credentialId),
 *   - build the unsigned XML (that is XmlBuilder, upstream).
 *
 * It is the last PURE step in the ZATCA pipeline before the concurrency
 * layer (S5.2) and the network layer (S5.3).
 *
 * Pipeline (each step delegates to a golden-proven authority):
 *   1. signXml(xml)            → XadesSigner      → SignedXmlResult
 *   2. loadQrFields(certB64)   → CertificateLoader → { publicKeyDer, certSignatureDer }
 *   3. isSimplified            ← metadata.dbInvoiceType === 'simplified'  (mapping, not a rule)
 *   4. assemble(...)           → QrAssembler      → QrInput
 *   5. build(qrInput)          → QrTlvProvider    → qrBase64
 *   6. inject(signedXml, qr)   → QrInjector       → final signed+QR XML
 *
 * Errors propagate unwrapped from the delegated authorities (XadesSignerError,
 * ZatcaInputError, QrTlvError, QrInjectionError). The composer adds no catch
 * and no ComposerError — wrapping here would add no value (No Silent Assumptions).
 *
 * SSOT: signatureValueB64 and certificateB64 are computed once (by the signer)
 * and surfaced in the result so S5.2 (chain) and S5.3 (submission) never need
 * to re-parse the signed XML to recover them.
 */

import type { XmlBuildOutput } from '../xmlBuilder.types';
import type { CredentialId, SignatureValueB64, CertificateB64 } from '../vault/VaultProvider';
import type { InvoiceHashB64 } from '../hash/HashProvider';
import type { SigningTimeIso, XadesSigner } from '../xades/XadesSigner';
import type { CertificateLoader } from '../certificate/CertificateLoader';
import type { QrAssembler } from '../qr/QrAssembler';
import type { QrTlvProvider } from '../qr/QrTlvProvider';
import type { QrInjector } from '../qr/QrInjector';

/**
 * The composed artifact: a signed, QR-stamped invoice plus the cryptographic
 * by-products that downstream authorities (S5.2/S5.3) consume without re-parsing.
 */
export interface ComposedInvoiceResult {
  /** Final UBL XML: XAdES signature spliced in AND QR TLV injected. */
  readonly signedXml: string;
  /** SHA-256 invoice hash (base64, 44ch) — QR Tag 6 and the S5.2 chain link. */
  readonly invoiceHashB64: InvoiceHashB64;
  /** ECDSA signature value (base64, DER) — surfaced for S5.2 (SSOT, no re-parse). */
  readonly signatureValueB64: SignatureValueB64;
  /** X.509 certificate (base64) — surfaced for S5.3 submission (SSOT, no re-parse). */
  readonly certificateB64: CertificateB64;
  /** QR TLV payload (base64) — written to invoices.qr_code by S5.2. */
  readonly qrBase64: string;
}

export interface InvoiceSigningComposer {
  /** Human-readable implementation name for diagnostics. */
  readonly name: string;

  /**
   * Compose a signed, QR-stamped invoice from an XmlBuilder artifact.
   *
   * @param xmlBuildOutput - the composite artifact from buildInvoiceXml
   *                         (xml + ubl + metadata); kept intact, not destructured
   *                         by the caller, to preserve XmlBuildOutput's encapsulation.
   * @param credentialId   - already-resolved Vault credential (see CredentialResolver).
   * @param signingTime    - ISO-8601 signing time, supplied by the caller (TD-012-001).
   * @returns the composed result (final XML + crypto by-products for S5.2/S5.3).
   */
  compose(
    xmlBuildOutput: XmlBuildOutput,
    credentialId: CredentialId,
    signingTime: SigningTimeIso,
  ): Promise<ComposedInvoiceResult>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type InvoiceSigningComposerFactory = () => InvoiceSigningComposer;

/**
 * NodeInvoiceSigningComposer — the default pure composer.
 *
 * Holds the five proven authorities by injection. Owns no crypto, no I/O of its
 * own; every byte it returns originates from a golden-verified authority.
 */
export class NodeInvoiceSigningComposer implements InvoiceSigningComposer {
  readonly name = 'NodeInvoiceSigningComposer';

  constructor(
    private readonly signer: XadesSigner,
    private readonly certLoader: CertificateLoader,
    private readonly qrAssembler: QrAssembler,
    private readonly qrTlvProvider: QrTlvProvider,
    private readonly qrInjector: QrInjector,
  ) {}

  async compose(
    xmlBuildOutput: XmlBuildOutput,
    credentialId: CredentialId,
    signingTime: SigningTimeIso,
  ): Promise<ComposedInvoiceResult> {
    // 1. Sign the unsigned XML (Vault key, XAdES B-B). Errors propagate.
    const signed = await this.signer.signXml({
      unsignedXml: xmlBuildOutput.xml,
      credentialId,
      signingTime,
    });

    // 2. Extract the two raw QR byte-fields from the signed certificate
    //    (TD-013: promoted, not re-parsed downstream).
    const qrCert = this.certLoader.loadQrFields(signed.certificateB64);

    // 3. Tag-9 gate: pure mapping from the domain invoice type (not a business rule).
    const isSimplified = xmlBuildOutput.metadata.dbInvoiceType === 'simplified';

    // 4. Assemble the fully-formed QrInput (Tags 1–9 sourced from ubl + signed + cert).
    const qrInput = this.qrAssembler.assemble({
      ubl: xmlBuildOutput.ubl,
      signed,
      publicKeyDer: qrCert.publicKeyDer,
      certSignatureDer: qrCert.certSignatureDer,
      isSimplified,
    });

    // 5. Encode to TLV base64.
    const qrBase64 = this.qrTlvProvider.build(qrInput);

    // 6. Inject the QR into the signed XML's placeholder → final artifact.
    const finalXml = this.qrInjector.inject(signed.signedXml, qrBase64);

    return {
      signedXml: finalXml,
      invoiceHashB64: signed.invoiceHashB64,
      signatureValueB64: signed.signatureValueB64,
      certificateB64: signed.certificateB64,
      qrBase64,
    };
  }
}
