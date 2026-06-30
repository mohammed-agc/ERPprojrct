// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SupabaseSubmissionLogWriter } from '../SupabaseSubmissionLogWriter';
import type { SubmissionLogEntry } from '../SubmissionCoordinator';

type Resp = { data: unknown; error: { message: string } | null };

function fakeClient(resp: Resp, capture?: (row: Record<string, unknown>) => void) {
  return {
    from() {
      const builder: Record<string, unknown> = {};
      builder.insert = (row: Record<string, unknown>) => {
        capture?.(row);
        return builder;
      };
      builder.select = () => builder;
      builder.single = () => Promise.resolve(resp);
      return builder;
    },
  } as never;
}

const ENTRY: SubmissionLogEntry = {
  companyId: 'company-1',
  documentType: 'invoice',
  documentId: 'doc-1',
  icv: 1,
  zatcaInvoiceUuid: 'uuid-1',
  submissionType: 'compliance',
  credentialId: 'cred-1',
  xmlHash: 'hash-1',
  attemptNumber: 1,
  httpStatus: 200,
  zatcaStatus: 'PASS',
  zatcaResponseCode: 'CLEARED',
  responseDescription: 'ok',
  responseJson: { clearanceStatus: 'CLEARED' },
  success: true,
};

describe('SupabaseSubmissionLogWriter', () => {
  it('inserts a mapped row and returns the new id', async () => {
    let captured: Record<string, unknown> | undefined;
    const writer = new SupabaseSubmissionLogWriter(
      fakeClient({ data: { id: 'log-99' }, error: null }, (r) => (captured = r))
    );
    const id = await writer.record(ENTRY);

    expect(id).toBe('log-99');
    expect(captured).toMatchObject({
      company_id: 'company-1',
      document_type: 'invoice',
      document_id: 'doc-1',
      icv: 1,
      zatca_invoice_uuid: 'uuid-1',
      submission_type: 'compliance',
      credential_id: 'cred-1',
      xml_hash: 'hash-1',
      attempt_number: 1,
      http_status: 200,
      zatca_status: 'PASS',
      zatca_response_code: 'CLEARED',
      success: true,
    });
    expect(captured?.response_json).toEqual({ clearanceStatus: 'CLEARED' });
    // optional fields absent in the entry default to null
    expect(captured?.error_message).toBeNull();
    expect(captured?.retryable).toBeNull();
    expect(typeof captured?.completed_at).toBe('string');
  });

  it('maps a failure attempt (success=false + error fields)', async () => {
    let captured: Record<string, unknown> | undefined;
    const writer = new SupabaseSubmissionLogWriter(
      fakeClient({ data: { id: 'log-100' }, error: null }, (r) => (captured = r))
    );
    await writer.record({
      ...ENTRY,
      success: false,
      httpStatus: undefined,
      zatcaStatus: undefined,
      errorCategory: 'TRANSPORT',
      errorCode: 'NETWORK',
      errorMessage: 'ECONNRESET',
      retryable: true,
    });
    expect(captured).toMatchObject({
      success: false,
      http_status: null,
      zatca_status: null,
      error_category: 'TRANSPORT',
      error_code: 'NETWORK',
      error_message: 'ECONNRESET',
      retryable: true,
    });
  });

  it('throws when the insert fails', async () => {
    const writer = new SupabaseSubmissionLogWriter(
      fakeClient({ data: null, error: { message: 'rls denied' } })
    );
    await expect(writer.record(ENTRY)).rejects.toThrow(/insert failed: rls denied/);
  });

  it('throws when no id is returned', async () => {
    const writer = new SupabaseSubmissionLogWriter(
      fakeClient({ data: {}, error: null })
    );
    await expect(writer.record(ENTRY)).rejects.toThrow(/returned no id/);
  });
});
