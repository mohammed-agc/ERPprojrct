import {
  SignedPropertiesProvider,
  SignedPropertiesInput,
  SignedPropertiesResult,
  SignedPropertiesHashB64,
} from './SignedPropertiesProvider';

/**
 * Minimal hash dependency. In the real codebase this is the S3.1.2 HashProvider;
 * computeHexDigest returns SHA-256 as base64-of-hex (88 chars).
 */
export interface HashPort {
  computeHexDigest(utf8: string): string;
}

/**
 * Builds the ZATCA XAdES SignedProperties hash block from a fixed, verified template.
 *
 * The template, indentation, namespace placement and self-closing DigestMethod were all
 * reproduced byte-for-byte against the golden reference invoice (digest e930cd6a...).
 * Do not "tidy" the whitespace — every space and newline is part of the signed bytes.
 */
export class TemplateSignedPropertiesProvider implements SignedPropertiesProvider {
  constructor(private readonly hash: HashPort) {}

  build(input: SignedPropertiesInput): SignedPropertiesResult {
    this.assertNonEmpty('signingTime', input.signingTime);
    this.assertNonEmpty('certificateDigest', input.certificateDigest);
    this.assertNonEmpty('issuerName', input.issuerName);
    this.assertNonEmpty('serialNumber', input.serialNumber);

    const hashVersionXml = this.render(input);
    const digest = this.hash.computeHexDigest(hashVersionXml) as SignedPropertiesHashB64;
    return { hashVersionXml, digest };
  }

  /**
   * The literal hash-version template. LF line endings, fixed indentation
   * (32/36/40/44/48 spaces), xmlns:xades on root, xmlns:ds on every ds: element,
   * self-closing DigestMethod.
   */
  private render(i: SignedPropertiesInput): string {
    const DS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#"';
    return (
      '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">\n' +
      '                                <xades:SignedSignatureProperties>\n' +
      '                                    <xades:SigningTime>' + i.signingTime + '</xades:SigningTime>\n' +
      '                                    <xades:SigningCertificate>\n' +
      '                                        <xades:Cert>\n' +
      '                                            <xades:CertDigest>\n' +
      '                                                <ds:DigestMethod ' + DS + ' Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n' +
      '                                                <ds:DigestValue ' + DS + '>' + i.certificateDigest + '</ds:DigestValue>\n' +
      '                                            </xades:CertDigest>\n' +
      '                                            <xades:IssuerSerial>\n' +
      '                                                <ds:X509IssuerName ' + DS + '>' + i.issuerName + '</ds:X509IssuerName>\n' +
      '                                                <ds:X509SerialNumber ' + DS + '>' + i.serialNumber + '</ds:X509SerialNumber>\n' +
      '                                            </xades:IssuerSerial>\n' +
      '                                        </xades:Cert>\n' +
      '                                    </xades:SigningCertificate>\n' +
      '                                </xades:SignedSignatureProperties>\n' +
      '                            </xades:SignedProperties>'
    );
  }

  private assertNonEmpty(field: string, value: string): void {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`SignedProperties: ${field} must be a non-empty string`);
    }
  }
}
