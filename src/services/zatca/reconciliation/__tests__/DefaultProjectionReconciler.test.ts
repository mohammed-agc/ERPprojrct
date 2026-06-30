// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { DefaultProjectionReconciler } from '../DefaultProjectionReconciler';
import type { DocumentRef, ReconciliationReport } from '../ProjectionReconciler';
import type { TruthSnapshot } from '../TruthSnapshot';

const REF: DocumentRef = {
  documentId: 'doc-1',
  environment: 'sandbox',
  documentType: 'invoice',
};

const CHAIN = {
  icv: 1,
  pih: 'PIH_1',
  uuid: 'uuid-1',
  artifactId: 'art-1',
  artifactHash: 'HASH_1',
};

/** A snapshot where the signing projection was never written (966673e8 shape). */
const MISSING_PROJECTION_SNAPSHOT: TruthSnapshot = {
  chain: CHAIN,
  artifact: { artifactHash: 'HASH_1' },
  projection: {
    icv: null,
    pih: null,
    signedArtifactId: null,
    xmlHash: null,
    zatcaStatus: 'cleared', // set later by submission; structural part missing
  },
  latestSubmission: {
    submissionLogId: 'log-1',
    zatca_status: 'PASS',
    zatca_response_code: 'CLEARED',
    success: true,
  },
  unresolvedOutboxIds: ['ob-1'],
};

const CONSISTENT_SNAPSHOT: TruthSnapshot = {
  chain: CHAIN,
  artifact: { artifactHash: 'HASH_1' },
  projection: {
    icv: 1,
    pih: 'PIH_1',
    signedArtifactId: 'art-1',
    xmlHash: 'HASH_1',
    zatcaStatus: 'cleared',
  },
  latestSubmission: {
    submissionLogId: 'log-1',
    zatca_response_code: 'CLEARED',
    zatca_status: 'PASS',
  },
  unresolvedOutboxIds: [],
};

function build(snapshot: TruthSnapshot) {
  const reader = { read: vi.fn().mockResolvedValue(snapshot) };
  const applyFn = vi.fn().mockResolvedValue({
    documentRef: REF,
    applied: true,
    fieldsRepaired: [],
    outboxResolved: [],
    decision: 'CAN_REPAIR',
  });
  const repairer = { apply: applyFn };
  const reconciler = new DefaultProjectionReconciler(
    reader as never,
    repairer as never
  );
  return { reconciler, reader, applyFn };
}

describe('DefaultProjectionReconciler', () => {
  it('analyze produces a full report from the snapshot (the 966673e8 case)', async () => {
    const { reconciler } = build(MISSING_PROJECTION_SNAPSHOT);
    const report = await reconciler.analyze(REF);

    expect(report.classification).toBe('MISSING_SIGNING_PROJECTION');
    expect(report.decision).toBe('CAN_REPAIR');
    // carries the structural drifts + the outbox to resolve
    expect(report.drifts.map((d) => d.field).sort()).toEqual([
      'icv',
      'pih',
      'signed_artifact_id',
      'xml_hash',
    ]);
    expect(report.orphanedOutboxIds).toEqual(['ob-1']);
  });

  it('analyze NEVER calls the repairer (read-only)', async () => {
    const { reconciler, applyFn } = build(MISSING_PROJECTION_SNAPSHOT);
    await reconciler.analyze(REF);
    expect(applyFn).not.toHaveBeenCalled();
  });

  it('analyze classifies a consistent snapshot as CONSISTENT / NO_ACTION', async () => {
    const { reconciler } = build(CONSISTENT_SNAPSHOT);
    const report = await reconciler.analyze(REF);
    expect(report.classification).toBe('CONSISTENT');
    expect(report.decision).toBe('NO_ACTION');
    expect(report.drifts).toEqual([]);
  });

  it('repair delegates the report verbatim to the repairer', async () => {
    const { reconciler, applyFn } = build(MISSING_PROJECTION_SNAPSHOT);
    const report = await reconciler.analyze(REF);
    await reconciler.repair(report);
    expect(applyFn).toHaveBeenCalledTimes(1);
    expect(applyFn).toHaveBeenCalledWith(report);
  });

  it('analyze then repair: the same report flows through (no re-derivation)', async () => {
    const { reconciler, reader, applyFn } = build(MISSING_PROJECTION_SNAPSHOT);
    const report = await reconciler.analyze(REF);
    await reconciler.repair(report);
    // reader read once (analyze); repair did not read truth again
    expect(reader.read).toHaveBeenCalledTimes(1);
    expect(applyFn.mock.calls[0][0]).toBe(report);
  });
});
