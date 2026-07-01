// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { OpenSslCsrGenerator } from '../OpenSslCsrGenerator';
import { CsrGenerationError, type CsrInput } from '../CsrGenerator';
import type {
  ProcessRunner,
  ProcessResult,
  ProcessRunOptions,
} from '../ProcessRunner';
import type { OpenSslLocator } from '../OpenSslLocator';
import { readFile } from 'node:fs/promises';

const VALID: CsrInput = {
  organizationName: 'Ard Al-Mubarak Trading',
  organizationUnitName: 'Riyadh Branch',
  commonName: '1-ArdERP|2-v1|3-egs-0001',
  serialNumber: '1-Ard|2-ERP|3-11111111-2222-3333-4444-555555555555',
  vatNumber: '300000000000003',
  invoiceType: '1100',
  registeredAddress: 'Riyadh, King Fahd Rd',
  businessCategory: 'Automotive',
};

const locator: OpenSslLocator = { getExecutable: () => 'openssl' };

/**
 * A fake runner that records every invocation and simulates openssl by writing
 * plausible artifacts to the -out path, so the generator's file reads succeed.
 * It reads the config the generator wrote (via -config) and captures it for
 * assertions.
 */
interface Recorded {
  executable: string;
  args: readonly string[];
}

function makeFakeRunner(
  behaviour: {
    keyExit?: number;
    reqExit?: number;
    reqStderr?: string;
    capturedConfig?: { value: string };
  } = {}
): { runner: ProcessRunner; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const runner: ProcessRunner = {
    implementationName: 'fake',
    async run(
      executable: string,
      args: readonly string[],
      _options?: ProcessRunOptions
    ): Promise<ProcessResult> {
      calls.push({ executable, args });

      const outIdx = args.indexOf('-out');
      const outPath = outIdx >= 0 ? (args[outIdx + 1] as string) : undefined;

      if (args[0] === 'ecparam') {
        if (behaviour.keyExit && behaviour.keyExit !== 0) {
          return { code: behaviour.keyExit, stdout: '', stderr: 'keygen boom' };
        }
        if (outPath) {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(
            outPath,
            '-----BEGIN EC PRIVATE KEY-----\nFAKEKEY\n-----END EC PRIVATE KEY-----\n'
          );
        }
        return { code: 0, stdout: '', stderr: '' };
      }

      if (args[0] === 'req') {
        // Capture the config the generator wrote.
        const cfgIdx = args.indexOf('-config');
        if (cfgIdx >= 0 && behaviour.capturedConfig) {
          behaviour.capturedConfig.value = await readFile(
            args[cfgIdx + 1] as string,
            'utf8'
          );
        }
        if (behaviour.reqExit && behaviour.reqExit !== 0) {
          return {
            code: behaviour.reqExit,
            stdout: '',
            stderr: behaviour.reqStderr ?? 'req boom',
          };
        }
        if (outPath) {
          const { writeFile } = await import('node:fs/promises');
          await writeFile(
            outPath,
            '-----BEGIN CERTIFICATE REQUEST-----\nFAKECSRBODY==\n-----END CERTIFICATE REQUEST-----\n'
          );
        }
        return { code: 0, stdout: '', stderr: '' };
      }

      return { code: 0, stdout: '', stderr: '' };
    },
  };
  return { runner, calls };
}

describe('OpenSslCsrGenerator — validation (no openssl call)', () => {
  it('rejects a missing organization name', async () => {
    const gen = new OpenSslCsrGenerator(makeFakeRunner().runner, locator);
    await expect(gen.generate({ ...VALID, organizationName: '' })).rejects.toThrow(
      CsrGenerationError
    );
  });

  it('rejects a VAT that is not 15 digits', async () => {
    const gen = new OpenSslCsrGenerator(makeFakeRunner().runner, locator);
    await expect(gen.generate({ ...VALID, vatNumber: '123' })).rejects.toThrow(
      /15 digits/
    );
  });

  it('rejects an unknown invoice type', async () => {
    const gen = new OpenSslCsrGenerator(makeFakeRunner().runner, locator);
    await expect(
      gen.generate({ ...VALID, invoiceType: '2222' as never })
    ).rejects.toThrow(/invoiceType/);
  });
});

describe('OpenSslCsrGenerator — orchestration', () => {
  it('produces a CSR PEM, base64, and private key on success', async () => {
    const gen = new OpenSslCsrGenerator(makeFakeRunner().runner, locator);
    const r = await gen.generate(VALID);
    expect(r.curve).toBe('secp256k1');
    expect(r.csrPem).toContain('CERTIFICATE REQUEST');
    expect(r.csrBase64).toBe('FAKECSRBODY==');
    expect(r.privateKeyPem).toContain('EC PRIVATE KEY');
  });

  it('calls ecparam then req, both with the openssl executable', async () => {
    const { runner, calls } = makeFakeRunner();
    const gen = new OpenSslCsrGenerator(runner, locator);
    await gen.generate(VALID);
    const relevant = calls.filter((c) =>
      ['ecparam', 'req'].includes(c.args[0] as string)
    );
    expect(relevant[0].executable).toBe('openssl');
    expect(relevant[0].args[0]).toBe('ecparam');
    expect(relevant[0].args).toContain('secp256k1');
    expect(relevant[1].args[0]).toBe('req');
    expect(relevant[1].args).toContain('-sha256');
  });

  it('writes a config carrying every ZATCA field', async () => {
    const capturedConfig = { value: '' };
    const gen = new OpenSslCsrGenerator(
      makeFakeRunner({ capturedConfig }).runner,
      locator
    );
    await gen.generate(VALID);
    const cfg = capturedConfig.value;
    expect(cfg).toContain('C = SA');
    expect(cfg).toContain(`O = ${VALID.organizationName}`);
    expect(cfg).toContain(`CN = ${VALID.commonName}`);
    expect(cfg).toContain(
      'certificateTemplateName = ASN1:PRINTABLESTRING:ZATCA-Code-Signing'
    );
    expect(cfg).toContain('subjectAltName = dirName:alt_names');
    expect(cfg).toContain(`UID = ${VALID.vatNumber}`);
    expect(cfg).toContain(`title = ${VALID.invoiceType}`);
    expect(cfg).toContain(`businessCategory = ${VALID.businessCategory}`);
  });

  it('surfaces a non-zero openssl exit as CsrGenerationError with stderr', async () => {
    const gen = new OpenSslCsrGenerator(
      makeFakeRunner({ reqExit: 1, reqStderr: 'problems making Certificate Request' })
        .runner,
      locator
    );
    await expect(gen.generate(VALID)).rejects.toThrow(
      /openssl exited 1.*Certificate Request/s
    );
  });

  it('surfaces a key-generation failure', async () => {
    const gen = new OpenSslCsrGenerator(makeFakeRunner({ keyExit: 2 }).runner, locator);
    await expect(gen.generate(VALID)).rejects.toThrow(/key generation/);
  });
});
