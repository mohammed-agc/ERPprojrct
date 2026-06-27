/**
 * NodeXadesSigner — S3.3 — concrete XAdES signer (PURE COMPOSER, AD-002).
 *
 * Pipeline (each step delegates to a proven authority — no crypto here):
 *   1. strip Reference#1 exclusions (UBLExtensions, cac:Signature, QR ADR)
 *   2. canonicalize        → CanonicalizationProvider (S3.1.1)
 *   3. hash                → HashProvider: digestBytes (sign) + rawDigest (Ref#1)  [GATE]
 *   4. certificate fields  → CertificateLoader (S3.4)
 *   5. SignedProperties    → SignedPropertiesProvider (S3.2)  → hashVersionXml + digest(Ref#2)
 *   6. sign                → VaultProvider (ADR-024/025): DER+base64
 *   7. fill SIGNATURE_TEMPLATE + splice into the UBLExtensions stub
 *
 * TD-012-001: signingTime supplied by caller (no ClockProvider yet).
 */

import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { CanonicalizationProvider } from '../canonicalization/CanonicalizationProvider';
import type { HashProvider, InvoiceHashB64 } from '../hash/HashProvider';
import { asInvoiceHash } from '../hash/HashProvider';
import type { CertificateLoader } from '../certificate/CertificateLoader';
import type { SignedPropertiesProvider } from '../signed-properties/SignedPropertiesProvider';
import type { VaultProvider } from '../vault/VaultProvider';
import { SIGNATURE_TEMPLATE } from './signatureTemplate';
import type { XadesSigner, SignXmlRequest, SignedXmlResult } from './XadesSigner';
import { XadesSignerError } from './XadesSigner';

const UBLEXT_CLOSE = '</ext:UBLExtensions>';

export class NodeXadesSigner implements XadesSigner {
  readonly name = 'NodeXadesSigner';

  constructor(
    private readonly canonicalizer: CanonicalizationProvider,
    private readonly hash: HashProvider,
    private readonly certLoader: CertificateLoader,
    private readonly signedProps: SignedPropertiesProvider,
    private readonly vault: VaultProvider,
  ) {}

  async signXml(request: SignXmlRequest): Promise<SignedXmlResult> {
    const { unsignedXml, credentialId, signingTime } = request;

    if (!unsignedXml.includes('<ext:UBLExtensions>')) {
      throw new XadesSignerError('STUB_NOT_FOUND', 'UBLExtensions stub absent in unsigned XML');
    }

    // 1-3. Reference#1 derivation (proven golden in reference1-derivation gate).
    const stripped = this.stripReference1Exclusions(unsignedXml);
    const canonical = this.canonicalizer.canonicalize(stripped);
    const invoiceHashBytes = this.hash.computeDigestBytes(canonical);   // Buffer 32B → sign
    const invoiceHashB64: InvoiceHashB64 = asInvoiceHash(this.hash.computeRawDigest(canonical)); // 44ch → Ref#1

    // 4. Certificate fields (sync).
    const certB64 = await this.vault.getCertificate(credentialId);
    const certFields = this.certLoader.load(certB64);

    // 5. SignedProperties (sync) — single producer of the block bytes (SSOT).
    const sp = this.signedProps.build({
      signingTime,
      certificateDigest: certFields.certificateDigest,
      issuerName: certFields.issuerName,
      serialNumber: certFields.serialNumber,
    });

    // 6. Sign — Vault does SHA-256 + ECDSA + DER + base64 (no crypto here).
    let signatureValueB64;
    try {
      signatureValueB64 = await this.vault.sign(credentialId, invoiceHashBytes, 'ECDSA_SHA256');
    } catch (err) {
      throw new XadesSignerError('SIGNING_FAILED', 'Vault signing failed', err);
    }

    // 7. Fill template (5 slots) + splice into stub.
    const signatureBlock = SIGNATURE_TEMPLATE
      .replace('{{SIGNED_PROPERTIES}}', sp.hashVersionXml)
      .replace('{{REF1_DIGEST}}', invoiceHashB64)
      .replace('{{REF2_DIGEST}}', sp.digest)
      .replace('{{SIGNATURE_VALUE}}', signatureValueB64)
      .replace('{{X509_CERT}}', certFields.certificateB64);

    // Structural splice: insert the signature block immediately before the
    // UBLExtensions closing tag. Independent of stub whitespace/prefix/comments.
    const closeIdx = unsignedXml.indexOf(UBLEXT_CLOSE);
    if (closeIdx === -1) {
      throw new XadesSignerError('STUB_NOT_FOUND', 'UBLExtensions closing tag absent');
    }
    const signedXml =
      unsignedXml.slice(0, closeIdx) + signatureBlock + '\n  ' + unsignedXml.slice(closeIdx);

    return {
      signedXml,
      invoiceHashB64,
      signatureValueB64,
      certificateB64: certFields.certificateB64,
    };
  }

  /** Remove the three Reference#1 transform exclusions (DOM strip; C14N follows). */
  private stripReference1Exclusions(xml: string): string {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const remove = (qname: string, pred?: (el: any) => boolean) => {
      const els = Array.from(doc.getElementsByTagName(qname) as any) as any[];
      for (const el of els) {
        if (pred && !pred(el)) continue;
        el.parentNode?.removeChild(el);
      }
    };
    remove('ext:UBLExtensions');
    remove('cac:Signature');
    remove('cac:AdditionalDocumentReference', (el) => {
      const id = el.getElementsByTagName('cbc:ID')[0]?.textContent?.trim();
      return id === 'QR';
    });
    return new XMLSerializer().serializeToString(doc);
  }
}