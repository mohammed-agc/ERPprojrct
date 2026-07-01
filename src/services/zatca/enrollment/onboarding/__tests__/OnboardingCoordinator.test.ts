// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  DefaultOnboardingCoordinator,
  OnboardingError,
  type OnboardingInput,
} from '../OnboardingCoordinator';
import type { CsrGenerator, CsrResult } from '../../../onboarding/CsrGenerator';
import type { VaultWriter } from '../../../vault/VaultWriter';
import type { CcsidEnrollmentClient } from '../../ccsid/CcsidEnrollmentClient';
import type { PcsidEnrollmentClient } from '../../pcsid/PcsidEnrollmentClient';
import type { CredentialRepository } from '../CredentialRepository';

const INPUT: OnboardingInput = {
  credentialId: 'cred-abc',
  companyId: 'company-1',
  environment: 'sandbox',
  credentialType: 'PCSID',
  csr: {
    organizationName: 'Ard',
    organizationUnitName: 'Riyadh',
    commonName: 'egs-1',
    serialNumber: '1-a|2-b|3-c',
    vatNumber: '300000000000003',
    invoiceType: '1100',
    registeredAddress: 'Riyadh',
    businessCategory: 'Automotive',
  },
  otp: '123456',
  certificateExpiryAt: '2027-01-01T00:00:00Z',
  certificateFingerprint: 'fp-cert',
  credentialFingerprint: 'fp-cred',
};

/** Builds a full set of fakes that record an ordered call log. */
function makeFakes(overrides: {
  pcsidThrows?: boolean;
  ccsidThrows?: boolean;
} = {}) {
  const log: string[] = [];

  const csrGenerator: CsrGenerator = {
    implementationName: 'FakeCsr',
    async generate(): Promise<CsrResult> {
      log.push('generate');
      return {
        csrPem: 'PEM',
        csrBase64: 'CSRB64',
        privateKeyPem: 'PKEY',
        curve: 'secp256k1',
      };
    },
  };

  const vaultWriter: VaultWriter = {
    implementationName: 'FakeVault',
    async storePrivateKey() {
      log.push('vault:private');
    },
    async storeCertificate(_id, _pem, opts) {
      log.push(`vault:cert${opts?.overwrite ? ':overwrite' : ''}`);
    },
    async storeComplianceCredential(_id, _cred, opts) {
      log.push(`vault:compliance${opts?.overwrite ? ':overwrite' : ''}`);
    },
    async storeMetadata() {
      log.push('vault:metadata');
    },
  };

  const ccsidClient: CcsidEnrollmentClient = {
    implementationName: 'FakeCcsid',
    async enroll() {
      log.push('ccsid');
      if (overrides.ccsidThrows) throw new Error('ccsid boom');
      return {
        requestId: 'req-123',
        binarySecurityToken: 'CCSID-BST',
        secret: 'ccsid-secret',
      };
    },
  };

  const pcsidClient: PcsidEnrollmentClient = {
    implementationName: 'FakePcsid',
    async enroll() {
      log.push('pcsid');
      if (overrides.pcsidThrows) throw new Error('pcsid boom');
      return { binarySecurityToken: 'PROD-BST', secret: 'prod-secret' };
    },
  };

  const repository: CredentialRepository = {
    implementationName: 'FakeRepo',
    async register() {
      log.push('db:register');
      return INPUT.credentialId;
    },
  };

  return { log, csrGenerator, vaultWriter, ccsidClient, pcsidClient, repository };
}

describe('DefaultOnboardingCoordinator — happy path', () => {
  it('returns the expected facts (no secrets)', async () => {
    const f = makeFakes();
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    const r = await c.onboard(INPUT);
    expect(r).toEqual({
      credentialId: 'cred-abc',
      credentialType: 'PCSID',
      environment: 'sandbox',
      requestId: 'req-123',
    });
  });

  it('runs the stages in the exact required order', async () => {
    const f = makeFakes();
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    await c.onboard(INPUT);
    expect(f.log).toEqual([
      'generate',
      'vault:private',
      'ccsid',
      'vault:cert',
      'vault:compliance',
      'pcsid',
      'vault:cert:overwrite',
      'vault:compliance:overwrite',
      'vault:metadata',
      'db:register',
    ]);
  });

  it('registers in the DB only after all Vault writes (Vault before DB)', async () => {
    const f = makeFakes();
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    await c.onboard(INPUT);
    const dbIndex = f.log.indexOf('db:register');
    const lastVaultIndex = f.log.map((s) => s.startsWith('vault:')).lastIndexOf(true);
    expect(dbIndex).toBeGreaterThan(lastVaultIndex);
  });
});

describe('DefaultOnboardingCoordinator — invariants on failure', () => {
  it('never registers in the DB if PCSID fails', async () => {
    const f = makeFakes({ pcsidThrows: true });
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    await expect(c.onboard(INPUT)).rejects.toThrow(OnboardingError);
    expect(f.log).not.toContain('db:register');
  });

  it('names the failing stage', async () => {
    const f = makeFakes({ pcsidThrows: true });
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    await expect(c.onboard(INPUT)).rejects.toMatchObject({
      stage: 'enroll-pcsid',
    });
  });

  it('stops before PCSID (and DB) if CCSID fails', async () => {
    const f = makeFakes({ ccsidThrows: true });
    const c = new DefaultOnboardingCoordinator(
      f.csrGenerator,
      f.vaultWriter,
      f.ccsidClient,
      f.pcsidClient,
      f.repository
    );
    await expect(c.onboard(INPUT)).rejects.toMatchObject({
      stage: 'enroll-ccsid',
    });
    expect(f.log).not.toContain('pcsid');
    expect(f.log).not.toContain('db:register');
    // Private key was already stored before CCSID (Vault-first).
    expect(f.log).toContain('vault:private');
  });
});
