// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { SupabaseTruthSnapshotReader } from '../SupabaseTruthSnapshotReader';
import type { DocumentRef } from '../ProjectionReconciler';

const REF: DocumentRef = {
  documentId: 'doc-1',
  environment: 'sandbox',
  documentType: 'invoice',
};

type Resp = { data: unknown; error: { message: string } | null };

/**
 * Fake Supabase client. Each table yields one canned Resp. The builder swallows
 * select/eq/order/limit/is and returns the table's response on maybeSingle()
 * (single-row reads) or when awaited (list reads, e.g. outbox).
 */
function fakeClient(byTable: Record<string, Resp>) {
  return {
    from(table: string) {
      const resp = byTable[table] ?? { data: null, error: null };
      const builder: Record<string, unknown> = {};
      const self = () => builder;
      builder.select = self;
      builder.eq = self;
      builder.order = self;
      builder.limit = self;
      builder.is = () => Promise.resolve(resp); // terminal for outbox list
      builder.maybeSingle = () => Promise.resolve(resp);
      return builder;
    },
  } as never;
}

const INV_FULL: Resp = {
  data: {
    icv: 1,
    pih: 'PIH_1',
    signed_artifact_id: 'art-1',
    xml_hash: 'HASH_1',
    zatca_status: 'cleared',
  },
  error: null,
};
const CHAIN_ROW: Resp = {
  data: {
    icv: 1,
    pih: 'PIH_1',
    uuid: 'uuid-1',
    artifact_id: 'art-1',
    artifact_hash: 'HASH_1',
  },
  error: null,
};
const ARTIFACT_ROW: Resp = { data: { artifact_hash: 'HASH_1' }, error: null };
const SUB_ROW: Resp = {
  data: {
    id: 'log-1',
    zatca_status: 'PASS',
    zatca_response_code: 'CLEARED',
    success: true,
  },
  error: null,
};
const OUTBOX_EMPTY: Resp = { data: [], error: null };

describe('SupabaseTruthSnapshotReader', () => {
  it('gathers a complete, consistent snapshot', async () => {
    const reader = new SupabaseTruthSnapshotReader(
      fakeClient({
        invoices: INV_FULL,
        zatca_document_chain: CHAIN_ROW,
        zatca_signed_artifacts: ARTIFACT_ROW,
        zatca_submission_log: SUB_ROW,
        zatca_projection_outbox: OUTBOX_EMPTY,
      })
    );
    const s = await reader.read(REF);

    expect(s.chain).toEqual({
      icv: 1,
      pih: 'PIH_1',
      uuid: 'uuid-1',
      artifactId: 'art-1',
      artifactHash: 'HASH_1',
    });
    expect(s.artifact).toEqual({ artifactHash: 'HASH_1' });
    expect(s.projection.zatcaStatus).toBe('cleared');
    expect(s.latestSubmission?.submissionLogId).toBe('log-1');
    expect(s.latestSubmission?.zatca_response_code).toBe('CLEARED');
    expect(s.unresolvedOutboxIds).toEqual([]);
  });

  it('chain absent → chain null, AND artifact/outbox not read (stay null/empty)', async () => {
    const reader = new SupabaseTruthSnapshotReader(
      fakeClient({
        invoices: INV_FULL,
        zatca_document_chain: { data: null, error: null },
        // even if an artifact row existed, it must not be consulted without a chain
        zatca_signed_artifacts: ARTIFACT_ROW,
        zatca_submission_log: { data: null, error: null },
      })
    );
    const s = await reader.read(REF);
    expect(s.chain).toBeNull();
    expect(s.artifact).toBeNull();
    expect(s.unresolvedOutboxIds).toEqual([]);
    expect(s.latestSubmission).toBeNull();
  });

  it('chain present but artifact missing → artifact null (MISSING_ARTIFACT signal)', async () => {
    const reader = new SupabaseTruthSnapshotReader(
      fakeClient({
        invoices: INV_FULL,
        zatca_document_chain: CHAIN_ROW,
        zatca_signed_artifacts: { data: null, error: null },
        zatca_submission_log: { data: null, error: null },
        zatca_projection_outbox: OUTBOX_EMPTY,
      })
    );
    const s = await reader.read(REF);
    expect(s.chain).not.toBeNull();
    expect(s.artifact).toBeNull();
  });

  it('collects unresolved outbox ids', async () => {
    const reader = new SupabaseTruthSnapshotReader(
      fakeClient({
        invoices: INV_FULL,
        zatca_document_chain: CHAIN_ROW,
        zatca_signed_artifacts: ARTIFACT_ROW,
        zatca_submission_log: { data: null, error: null },
        zatca_projection_outbox: { data: [{ id: 'ob-1' }, { id: 'ob-2' }], error: null },
      })
    );
    const s = await reader.read(REF);
    expect(s.unresolvedOutboxIds).toEqual(['ob-1', 'ob-2']);
  });

  it('propagates an invoices read error', async () => {
    const reader = new SupabaseTruthSnapshotReader(
      fakeClient({ invoices: { data: null, error: { message: 'boom' } } })
    );
    await expect(reader.read(REF)).rejects.toThrow(/invoices read failed: boom/);
  });
});
