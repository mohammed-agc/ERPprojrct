/**
 * OpenSslCsrGenerator — the production CsrGenerator implementation.
 *
 * Orchestrates the openssl CLI (the only path proven to work across the ZATCA
 * ecosystem for secp256k1 + the custom template/SAN extensions). It adds no
 * crypto of its own; it composes two injected authorities:
 *   - OpenSslLocator → which openssl executable,
 *   - ProcessRunner  → how a process is run.
 * Both are injected, so this class is unit-testable with fakes and never touches
 * child_process directly.
 *
 * Sequence (mirrors every reference OpenSSL config in the ZATCA community):
 *   1. openssl ecparam -name secp256k1 -genkey -noout   → private key (PEM)
 *   2. openssl req -new -sha256 -key <key> -config <cfg> → CSR (PEM)
 * where <cfg> carries the ZATCA subject + custom extensions:
 *   certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing
 *   subjectAltName = dirName:alt_names { SN, UID, title, registeredAddress,
 *                                        businessCategory }
 *
 * Key material and the config live in a per-call temp dir that is always removed
 * (even on failure). The private key is read back and returned; the caller (the
 * vault-persistence step) decides where it ultimately lives.
 */

import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CsrGenerationError,
  type CsrGenerator,
  type CsrInput,
  type CsrResult,
  type ZatcaInvoiceTypeCode,
} from './CsrGenerator';
import type { ProcessRunner, ProcessResult } from './ProcessRunner';
import type { OpenSslLocator } from './OpenSslLocator';

export class OpenSslCsrGenerator implements CsrGenerator {
  readonly implementationName = 'OpenSslCsrGenerator (openssl CLI, secp256k1)';

  constructor(
    private readonly runner: ProcessRunner,
    private readonly locator: OpenSslLocator
  ) {}

  async generate(input: CsrInput): Promise<CsrResult> {
    this.validate(input);
    const openssl = this.locator.getExecutable();

    const dir = await mkdtemp(join(tmpdir(), 'zatca-csr-'));
    const keyPath = join(dir, 'private-key.pem');
    const cfgPath = join(dir, 'csr.cnf');
    const csrPath = join(dir, 'taxpayer.csr');

    try {
      // 1) secp256k1 private key.
      await this.mustRun(
        openssl,
        ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath],
        'key generation'
      );

      // 2) CSR from the ZATCA config.
      await writeFile(cfgPath, this.buildConfig(input), 'utf8');
      await this.mustRun(
        openssl,
        [
          'req',
          '-new',
          '-sha256',
          '-key',
          keyPath,
          '-config',
          cfgPath,
          '-out',
          csrPath,
        ],
        'CSR generation'
      );

      const csrPem = (await readFile(csrPath, 'utf8')).trim();
      const privateKeyPem = (await readFile(keyPath, 'utf8')).trim();
      const csrBase64 = this.pemBodyToBase64(csrPem);

      if (!csrPem.includes('CERTIFICATE REQUEST')) {
        throw new CsrGenerationError('openssl produced no valid CSR PEM');
      }

      return { csrPem, csrBase64, privateKeyPem, curve: 'secp256k1' };
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Run openssl and throw a CsrGenerationError if it exits non-zero. */
  private async mustRun(
    openssl: string,
    args: readonly string[],
    phase: string
  ): Promise<ProcessResult> {
    let result: ProcessResult;
    try {
      result = await this.runner.run(openssl, args);
    } catch (e) {
      throw new CsrGenerationError(
        `${phase}: could not run openssl (${
          e instanceof Error ? e.message : String(e)
        }). Is OpenSSL installed / OPENSSL_BIN set?`,
        e
      );
    }
    if (result.code !== 0) {
      throw new CsrGenerationError(
        `${phase}: openssl exited ${result.code}: ${result.stderr.trim()}`,
        result
      );
    }
    return result;
  }

  /**
   * Build the OpenSSL config carrying ZATCA's required subject + extensions.
   * Mirrors the community/NetSuite reference config exactly.
   */
  private buildConfig(input: CsrInput): string {
    return [
      'oid_section = OIDs',
      '',
      '[ OIDs ]',
      'certificateTemplateName = 1.3.6.1.4.1.311.20.2',
      '',
      '[ req ]',
      'prompt = no',
      'default_md = sha256',
      'req_extensions = req_ext',
      'distinguished_name = dn',
      '',
      '[ dn ]',
      'C = SA',
      `OU = ${input.organizationUnitName}`,
      `O = ${input.organizationName}`,
      `CN = ${input.commonName}`,
      '',
      '[ req_ext ]',
      'certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing',
      'subjectAltName = dirName:alt_names',
      '',
      '[ alt_names ]',
      `SN = ${input.serialNumber}`,
      `UID = ${input.vatNumber}`,
      `title = ${input.invoiceType}`,
      `registeredAddress = ${input.registeredAddress}`,
      `businessCategory = ${input.businessCategory}`,
      '',
    ].join('\n');
  }

  private validate(input: CsrInput): void {
    const required: Array<[keyof CsrInput, string]> = [
      ['organizationName', input.organizationName],
      ['organizationUnitName', input.organizationUnitName],
      ['commonName', input.commonName],
      ['serialNumber', input.serialNumber],
      ['vatNumber', input.vatNumber],
      ['registeredAddress', input.registeredAddress],
      ['businessCategory', input.businessCategory],
    ];
    for (const [field, value] of required) {
      if (!value || !value.trim()) {
        throw new CsrGenerationError(`CsrInput.${field} is required`);
      }
    }
    if (!/^\d{15}$/.test(input.vatNumber)) {
      throw new CsrGenerationError(
        `CsrInput.vatNumber must be 15 digits (got "${input.vatNumber}")`
      );
    }
    const types: ZatcaInvoiceTypeCode[] = ['1000', '0100', '1100'];
    if (!types.includes(input.invoiceType)) {
      throw new CsrGenerationError(
        `CsrInput.invoiceType must be 1000 | 0100 | 1100 (got "${input.invoiceType}")`
      );
    }
  }

  private pemBodyToBase64(pem: string): string {
    return pem
      .replace(/-----BEGIN CERTIFICATE REQUEST-----/, '')
      .replace(/-----END CERTIFICATE REQUEST-----/, '')
      .replace(/\s+/g, '');
  }
}

export function createOpenSslCsrGenerator(
  runner: ProcessRunner,
  locator: OpenSslLocator
): CsrGenerator {
  return new OpenSslCsrGenerator(runner, locator);
}
