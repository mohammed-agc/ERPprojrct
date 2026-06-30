// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { DefaultSubmissionCoordinator } from '../DefaultSubmissionCoordinator';
import { ZatcaTransportError } from '../FetchZatcaComplianceClient';
import type {
  ComplianceResponse,
  SubmitDocumentInput,
} from '../SubmissionCoordinator';

const INPUT: SubmitDocumentInput = {
  companyId: 'company-1',
  environment: 'sandbox',
  credentialType: 'CCSID',
  documentType: 'tax_invoice',
  documentId: 'doc-1',
  target: 'compliance',
};

const RESOLVED = {
  credentialId: 'cred-1',
  environment: 'sandbox' as const,
  credentialType: 'CCSID' as const,
  certificateFingerprint: 'fp',
  expiresAt: new Date(Date.now() + 1e9),
};

const DOC = {
  uuid: 'uuid-1',
  icv: 1,
  artifactHash: 'hash-1',
  signedXml: '<Invoice/>',
};

const CLEARED: ComplianceResponse = {
  httpStatus: 200,
  validationStatus: 'PASS',
  infoMessages: [{ code: 'XSD_ZATCA_VALID', status: 'PASS' }],
  warningMessages: [],
  errorMessages: [],
  clearanceStatus: 'CLEARED',
  reportingStatus: null,
  raw: { clearanceStatus: 'CLEARED' },
};

function build(overrides: {
  client?: { submit: ReturnType<typeof vi.fn> };
  logRecord?: ReturnType<typeof vi.fn>;
  project?: ReturnType<typeof vi.fn>;
}) {
  const credentials = {
    implementationName: 'fake',
    resolve: vi.fn().mockResolvedValue(RESOLVED),
  };
  const apiCredentials = {
    getApiCredential: vi
      .fn()
      .mockResolvedValue({ binarySecurityToken: 'BST', secret: 'SEC' }),
  };
  const reader = { read: vi.fn().mockResolvedValue(DOC) };
  const client = overrides.client ?? {
    submit: vi.fn().mockResolvedValue(CLEARED),
  };
  const logRecord = overrides.logRecord ?? vi.fn().mockResolvedValue('log-1');
  const log = { record: logRecord };
  const projectFn = overrides.project ?? vi.fn().mockResolvedValue(undefined);
  const projection = { project: projectFn };

  const coordinator = new DefaultSubmissionCoordinator(
    credentials as never,
    apiCredentials as never,
    reader as never,
    client as never,
    log as never,
    projection as never
  );
  return { coordinator, credentials, apiCredentials, reader, client, logRecord, projectFn };
}

describe('DefaultSubmissionCoordinator', () => {
  it('CLEARED: records truth, projects, returns facts', async () => {
    const { coordinator, logRecord, projectFn } = build({});
    const r = await coordinator.submit(INPUT);

    expect(r.httpStatus).toBe(200);
    expect(r.validationStatus).toBe('PASS');
    expect(r.clearanceStatus).toBe('CLEARED');
    expect(r.errors).toHaveLength(0);
    expect(r.submissionLogId).toBe('log-1');

    // exactly one log row, success=true, mapped to the chain vocab + facts
    expect(logRecord).toHaveBeenCalledTimes(1);
    expect(logRecord.mock.calls[0][0]).toMatchObject({
      documentType: 'invoice',
      documentId: 'doc-1',
      icv: 1,
      zatcaInvoiceUuid: 'uuid-1',
      submissionType: 'clearance',
      credentialId: 'cred-1',
      xmlHash: 'hash-1',
      success: true,
      httpStatus: 200,
      zatcaStatus: 'PASS',
      zatcaResponseCode: 'CLEARED',
    });

    // projection ran with the facts
    expect(projectFn).toHaveBeenCalledTimes(1);
    expect(projectFn.mock.calls[0][0]).toMatchObject({
      documentId: 'doc-1',
      clearanceStatus: 'CLEARED',
      submissionLogId: 'log-1',
    });
  });

  it('validation ERROR (HTTP 200): records a failed truth, still returns facts (no throw)', async () => {
    const errored: ComplianceResponse = {
      httpStatus: 200,
      validationStatus: 'ERROR',
      infoMessages: [],
      warningMessages: [],
      errorMessages: [{ code: 'BR-KSA-44', message: 'bad VAT' }],
      clearanceStatus: 'NOT_CLEARED',
      reportingStatus: null,
      raw: {},
    };
    const { coordinator, logRecord } = build({
      client: { submit: vi.fn().mockResolvedValue(errored) },
    });
    const r = await coordinator.submit(INPUT);

    expect(r.validationStatus).toBe('ERROR');
    expect(r.errors).toHaveLength(1);
    expect(logRecord.mock.calls[0][0]).toMatchObject({
      success: false,
      errorCategory: 'VALIDATION',
      errorCode: 'BR-KSA-44',
    });
  });

  it('transport failure: records a failed attempt THEN re-throws', async () => {
    const logRecord = vi.fn().mockResolvedValue('log-err');
    const { coordinator } = build({
      client: {
        submit: vi
          .fn()
          .mockRejectedValue(new ZatcaTransportError('auth rejected', { httpStatus: 401 })),
      },
      logRecord,
    });

    await expect(coordinator.submit(INPUT)).rejects.toBeInstanceOf(
      ZatcaTransportError
    );
    expect(logRecord).toHaveBeenCalledTimes(1);
    expect(logRecord.mock.calls[0][0]).toMatchObject({
      success: false,
      errorCategory: 'TRANSPORT',
      retryable: true,
      httpStatus: 401,
    });
  });

  it('projection failure is swallowed — the result still returns', async () => {
    const { coordinator } = build({
      project: vi.fn().mockRejectedValue(new Error('rls denied')),
    });
    const r = await coordinator.submit(INPUT);
    expect(r.clearanceStatus).toBe('CLEARED');
    expect(r.submissionLogId).toBe('log-1');
  });

  it('orders: log (truth) BEFORE projection (read-model)', async () => {
    const order: string[] = [];
    const logRecord = vi.fn().mockImplementation(async () => {
      order.push('log');
      return 'log-1';
    });
    const project = vi.fn().mockImplementation(async () => {
      order.push('project');
    });
    const { coordinator } = build({ logRecord, project });
    await coordinator.submit(INPUT);
    expect(order).toEqual(['log', 'project']);
  });
});
