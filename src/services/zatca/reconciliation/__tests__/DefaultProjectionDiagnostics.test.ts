// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { DefaultProjectionDiagnostics } from '../DefaultProjectionDiagnostics';
import type { BatchScope } from '../ProjectionDiagnostics';
import type {
  DocumentRef,
  ReconciliationReport,
  ProjectionClassification,
  RepairDecision,
} from '../ProjectionReconciler';

const SCOPE: BatchScope = {
  kind: 'company-environment',
  companyId: 'company-1',
  environment: 'sandbox',
};

function ref(id: string): DocumentRef {
  return { documentId: id, environment: 'sandbox', documentType: 'invoice' };
}

function report(
  id: string,
  classification: ProjectionClassification,
  decision: RepairDecision
): ReconciliationReport {
  return {
    documentRef: ref(id),
    scope: decision === 'OUT_OF_SCOPE' ? 'OUT_OF_SCOPE' : 'IN_SCOPE',
    classification,
    decision,
    drifts: [],
    orphanedOutboxIds: [],
    summary: '',
  };
}

/** Build diagnostics with a stubbed reconciler + enumerator. */
function build(
  identities: DocumentRef[],
  byId: Record<string, ReconciliationReport>
) {
  const analyzeFn = vi.fn(async (id: DocumentRef) => byId[id.documentId]);
  const reconciler = { implementationName: 'fake', analyze: analyzeFn, repair: vi.fn() };
  const enumerator = { enumerate: vi.fn(async () => identities) };
  const diag = new DefaultProjectionDiagnostics(
    reconciler as never,
    enumerator as never
  );
  return { diag, analyzeFn, enumerator };
}

describe('DefaultProjectionDiagnostics', () => {
  it('analyzeOne delegates straight to the reconciler', async () => {
    const r = report('d1', 'CONSISTENT', 'NO_ACTION');
    const { diag, analyzeFn } = build([], { d1: r });
    const out = await diag.analyzeOne(ref('d1'));
    expect(out).toBe(r);
    expect(analyzeFn).toHaveBeenCalledWith(ref('d1'));
  });

  it('analyzeScope calls analyzeOne once per enumerated identity', async () => {
    const ids = [ref('d1'), ref('d2'), ref('d3')];
    const { diag, analyzeFn } = build(ids, {
      d1: report('d1', 'CONSISTENT', 'NO_ACTION'),
      d2: report('d2', 'CONSISTENT', 'NO_ACTION'),
      d3: report('d3', 'CONSISTENT', 'NO_ACTION'),
    });
    const out = await diag.analyzeScope(SCOPE);
    expect(analyzeFn).toHaveBeenCalledTimes(3);
    expect(out.total).toBe(3);
    expect(out.reports).toHaveLength(3);
  });

  it('tallies classifications (all eight keys present, zero-filled)', async () => {
    const ids = [ref('d1'), ref('d2'), ref('d3'), ref('d4')];
    const { diag } = build(ids, {
      d1: report('d1', 'CONSISTENT', 'NO_ACTION'),
      d2: report('d2', 'CONSISTENT', 'NO_ACTION'),
      d3: report('d3', 'STALE_SUBMISSION_STATUS', 'CAN_REPAIR'),
      d4: report('d4', 'MISSING_ARTIFACT', 'ESCALATE'),
    });
    const out = await diag.analyzeScope(SCOPE);
    expect(out.tally.CONSISTENT).toBe(2);
    expect(out.tally.STALE_SUBMISSION_STATUS).toBe(1);
    expect(out.tally.MISSING_ARTIFACT).toBe(1);
    // untouched classifications are present and zero
    expect(out.tally.NOT_SIGNED).toBe(0);
    expect(out.tally.MULTIPLE_DRIFTS).toBe(0);
    expect(out.tally.UNSUPPORTED_SUBMISSION_STATE).toBe(0);
  });

  it('surfaces escalations and counts repairables', async () => {
    const ids = [ref('d1'), ref('d2'), ref('d3')];
    const { diag } = build(ids, {
      d1: report('d1', 'MISSING_SIGNING_PROJECTION', 'CAN_REPAIR'),
      d2: report('d2', 'MISSING_ARTIFACT', 'ESCALATE'),
      d3: report('d3', 'UNSUPPORTED_SUBMISSION_STATE', 'ESCALATE'),
    });
    const out = await diag.analyzeScope(SCOPE);
    expect(out.repairable).toBe(1);
    expect(out.escalations.map((e) => e.documentRef.documentId)).toEqual(['d2', 'd3']);
  });

  it('an empty scope yields total 0 and a zero tally', async () => {
    const { diag } = build([], {});
    const out = await diag.analyzeScope(SCOPE);
    expect(out.total).toBe(0);
    expect(out.escalations).toEqual([]);
    expect(out.repairable).toBe(0);
    expect(Object.values(out.tally).every((n) => n === 0)).toBe(true);
  });
});
