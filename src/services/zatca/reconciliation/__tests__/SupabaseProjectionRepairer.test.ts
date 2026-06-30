// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { SupabaseProjectionRepairer } from '../SupabaseProjectionRepairer';
import type {
  ReconciliationReport,
  DocumentRef,
  ProjectionDrift,
} from '../ProjectionReconciler';

const REF: DocumentRef = {
  documentId: 'doc-1',
  environment: 'sandbox',
  documentType: 'invoice',
};

/**
 * Fake client capturing UPDATE patches per table. invoices: from→update→eq.
 * outbox: from→update→in→is (terminal).
 */
function fakeClient(opts?: {
  invoicesError?: string;
  outboxError?: string;
  capture?: (table: string, patch: Record<string, unknown>) => void;
}) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      builder.update = (patch: Record<string, unknown>) => {
        opts?.capture?.(table, patch);
        return builder;
      };
      builder.eq = () =>
        Promise.resolve({
          error: opts?.invoicesError ? { message: opts.invoicesError } : null,
        });
      builder.in = () => builder;
      builder.is = () =>
        Promise.resolve({
          error: opts?.outboxError ? { message: opts.outboxError } : null,
        });
      return builder;
    },
  } as never;
}

function report(over: Partial<ReconciliationReport>): ReconciliationReport {
  return {
    documentRef: REF,
    scope: 'IN_SCOPE',
    classification: 'MISSING_SIGNING_PROJECTION',
    decision: 'CAN_REPAIR',
    drifts: [],
    orphanedOutboxIds: [],
    summary: '',
    ...over,
  };
}

const ARTIFACT_DRIFT: ProjectionDrift = {
  field: 'signed_artifact_id',
  expected: 'art-1',
  actual: null,
  source: 'Chain',
};
const HASH_DRIFT: ProjectionDrift = {
  field: 'xml_hash',
  expected: 'HASH_1',
  actual: 'old',
  source: 'Chain',
};

describe('SupabaseProjectionRepairer', () => {
  it('applies drift expecteds verbatim into one invoices UPDATE', async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    const r = new SupabaseProjectionRepairer(
      fakeClient({ capture: (t, p) => (captured[t] = p) })
    );
    const out = await r.apply(report({ drifts: [ARTIFACT_DRIFT, HASH_DRIFT] }));

    expect(out.applied).toBe(true);
    expect(out.fieldsRepaired.sort()).toEqual(['signed_artifact_id', 'xml_hash']);
    expect(captured.invoices).toEqual({
      signed_artifact_id: 'art-1',
      xml_hash: 'HASH_1',
    });
  });

  it('resolves orphaned outbox ids', async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    const r = new SupabaseProjectionRepairer(
      fakeClient({ capture: (t, p) => (captured[t] = p) })
    );
    const out = await r.apply(
      report({ classification: 'ORPHANED_OUTBOX', orphanedOutboxIds: ['ob-1', 'ob-2'] })
    );
    expect(out.outboxResolved).toEqual(['ob-1', 'ob-2']);
    expect(captured.zatca_projection_outbox).toHaveProperty('resolved_at');
  });

  it('repairs drifts AND outbox together (the 966673e8 shape)', async () => {
    const r = new SupabaseProjectionRepairer(fakeClient());
    const out = await r.apply(
      report({ drifts: [ARTIFACT_DRIFT], orphanedOutboxIds: ['ob-9'] })
    );
    expect(out.fieldsRepaired).toEqual(['signed_artifact_id']);
    expect(out.outboxResolved).toEqual(['ob-9']);
  });

  it('is a NO-OP for a non-CAN_REPAIR decision', async () => {
    const captured: Record<string, Record<string, unknown>> = {};
    const r = new SupabaseProjectionRepairer(
      fakeClient({ capture: (t, p) => (captured[t] = p) })
    );
    const out = await r.apply(
      report({ classification: 'MISSING_ARTIFACT', decision: 'ESCALATE', drifts: [ARTIFACT_DRIFT] })
    );
    expect(out.applied).toBe(false);
    expect(out.fieldsRepaired).toEqual([]);
    expect(captured.invoices).toBeUndefined(); // nothing written
  });

  it('refuses a non-repairable column (defense in depth)', async () => {
    const r = new SupabaseProjectionRepairer(fakeClient());
    const bad: ProjectionDrift = {
      field: 'total_amount',
      expected: 999,
      actual: 0,
      source: 'Chain',
    };
    await expect(r.apply(report({ drifts: [bad] }))).rejects.toThrow(
      /non-repairable column "total_amount"/
    );
  });

  it('throws when the invoices update fails', async () => {
    const r = new SupabaseProjectionRepairer(
      fakeClient({ invoicesError: 'rls denied' })
    );
    await expect(
      r.apply(report({ drifts: [ARTIFACT_DRIFT] }))
    ).rejects.toThrow(/invoices update failed: rls denied/);
  });
});
