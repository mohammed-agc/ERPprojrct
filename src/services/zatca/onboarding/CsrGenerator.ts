/**
 * CsrGenerator — the ZATCA CSR AUTHORITY (contract only).
 *
 * ONE job: given a taxpayer's EGS details, produce an secp256k1 key pair and a
 * PEM CSR carrying ZATCA's required subject + custom extensions. It knows nothing
 * of HTTP, the vault, or onboarding sequence — a higher layer feeds it data and
 * decides where the private key is stored.
 *
 * LIBRARY-AGNOSTIC by design: the contract names no crypto library. The first
 * implementation is NodeForgeCsrGenerator; it could later become an OpenSSL- or
 * native-backed one with zero change to callers — the same discipline as
 * ZatcaComplianceClient not knowing fetch, or ArtifactStore not knowing Supabase.
 *
 * ZATCA CSR structure (verified against ZATCA docs + reference implementations):
 *   Subject (DN):
 *     C  = SA
 *     OU = <branch / organisational unit>
 *     O  = <organisation name>
 *     CN = <common name / EGS unit name>
 *   Extensions:
 *     certificateTemplateName = PRINTABLESTRING "ZATCA-Code-Signing"
 *     subjectAltName = dirName with:
 *       SN               = <EGS serial, e.g. "1-Name|2-Model|3-uuid">
 *       UID              = <VAT number, 15 digits>
 *       title            = <invoice type: "1000" B2B | "0100" B2C | "1100" both>
 *       registeredAddress= <address>
 *       businessCategory = <industry>
 *
 * A malformed CSR is rejected by ZATCA as Invalid-CSR, so every field is explicit
 * and required — no silent defaults.
 */

/** ZATCA invoice-type coding used in the CSR `title` field. */
export type ZatcaInvoiceTypeCode = '1000' | '0100' | '1100';

/** Everything needed to build the CSR — supplied by the caller (onboarding). */
export interface CsrInput {
  /** Organisation name → Subject O. */
  readonly organizationName: string;
  /** Branch / organisational unit → Subject OU. */
  readonly organizationUnitName: string;
  /** Common name / EGS unit name → Subject CN. */
  readonly commonName: string;
  /** EGS serial number → SAN SN (e.g. "1-Ard|2-ERP|3-<uuid>"). */
  readonly serialNumber: string;
  /** VAT registration number, 15 digits → SAN UID. */
  readonly vatNumber: string;
  /** Invoice type coding → SAN title. */
  readonly invoiceType: ZatcaInvoiceTypeCode;
  /** Registered address → SAN registeredAddress. */
  readonly registeredAddress: string;
  /** Industry / business category → SAN businessCategory. */
  readonly businessCategory: string;
}

/** The generator's output. */
export interface CsrResult {
  /** CSR in PEM (-----BEGIN CERTIFICATE REQUEST-----). */
  readonly csrPem: string;
  /** CSR base64 (PEM body, no header/footer) — the form ZATCA's API accepts. */
  readonly csrBase64: string;
  /** Private key in PEM (SEC1/PKCS8) — the caller decides where it is stored. */
  readonly privateKeyPem: string;
  /** Named curve, always 'secp256k1' (ADR-023) — echoed for auditing. */
  readonly curve: 'secp256k1';
}

export class CsrGenerationError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
    this.name = 'CsrGenerationError';
  }
}

export interface CsrGenerator {
  readonly implementationName: string;
  generate(input: CsrInput): Promise<CsrResult>;
}
