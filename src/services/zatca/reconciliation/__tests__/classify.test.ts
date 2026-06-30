import { describe, it, expect } from 'vitest';
import { classify } from '../classify';
import type { TruthSnapshot, ExpectedProjection } from '../TruthSnapshot';
import type { ProjectionDrift, DocumentRef } from '../ProjectionReconciler';

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

const FULL_PROJECTION = {
  icv: 1,
  pih: 'PIH_1',
  signedArtifactId: 'art-1',
  xmlHash: 'HASH_1',
  zatcaStatus: 'cleared',
};

const EMPTY_PROJECTION = {
  icv: null,
  pih: null,
  signedArtifactId: null,
  xmlHash: null,
  zatcaStatus: null,
};

const EXPECTED: ExpectedProjection = {
  icv: 1,
  pih: 'PIH_1',
  signedArtifactId: 'art-1',
  xmlHash: 'HASH_1',
  zatcaStatus: 'cleared',
};

function snap(over: Partial<TruthSnapshot>): TruthSnapshot {
  return {
    chain: CHAIN,
    artifact: { artifactHash: 'HASH_1' },
    projection: FULL_PROJECTION,
    latestSubmission: null,
    unresolvedOutboxIds: [],
    ...over,
  };
}

const STRUCT_DRIFT: ProjectionDrift = {
  field: 'signed_artifact_id',
  expected: 'art-1',
  actual: null,
  source: 'Chain',
};
const STATUS_DRIFT: ProjectionDrift = {
  field: 'zatca_status',
  expected: 'cleared',
  actual: 'ready',
  source: 'SubmissionLog',
};

describe('classify — hierarchical state naming', () => {
  it('chain == null → NOT_SIGNED / OUT_OF_SCOPE (no drifts carried)', () => {
    const r = classify(REF, snap({ chain: null }), null, []);
    expect(r.classification).toBe('NOT_SIGNED');
    expect(r.decision).toBe('OUT_OF_SCOPE');
    expect(r.scope).toBe('OUT_OF_SCOPE');
    expect(r.drifts).toEqual([]);
  });

  it('artifact == null → MISSING_ARTIFACT / ESCALATE — PRECEDES any drift', () => {
    // drifts exist, but broken structural truth wins
    const r = classify(REF, snap({ artifact: null }), EXPECTED, [STRUCT_DRIFT]);
    expect(r.classification).toBe('MISSING_ARTIFACT');
    expect(r.decision).toBe('ESCALATE');
    expect(r.drifts).toEqual([]); // not CAN_REPAIR → nothing to apply
  });

  it('expected.zatcaStatus == null → UNSUPPORTED_SUBMISSION_STATE / ESCALATE', () => {
    const expected = { ...EXPECTED, zatcaStatus: null };
    const r = classify(REF, snap({}), expected, [STATUS_DRIFT]);
    expect(r.classification).toBe('UNSUPPORTED_SUBMISSION_STATE');
    expect(r.decision).toBe('ESCALATE');
  });

  it('no drifts + no outbox → CONSISTENT / NO_ACTION', () => {
    const r = classify(REF, snap({}), EXPECTED, []);
    expect(r.classification).toBe('CONSISTENT');
    expect(r.decision).toBe('NO_ACTION');
  });

  it('no drifts + unresolved outbox → ORPHANED_OUTBOX / CAN_REPAIR (outbox carried)', () => {
    const r = classify(
      REF,
      snap({ unresolvedOutboxIds: ['ob-1', 'ob-2'] }),
      EXPECTED,
      []
    );
    expect(r.classification).toBe('ORPHANED_OUTBOX');
    expect(r.decision).toBe('CAN_REPAIR');
    expect(r.orphanedOutboxIds).toEqual(['ob-1', 'ob-2']);
  });

  it('drifts + no signing projection at all → MISSING_SIGNING_PROJECTION (the 966673e8 case)', () => {
    const r = classify(
      REF,
      snap({ projection: EMPTY_PROJECTION, unresolvedOutboxIds: ['ob-9'] }),
      EXPECTED,
      [STRUCT_DRIFT]
    );
    expect(r.classification).toBe('MISSING_SIGNING_PROJECTION');
    expect(r.decision).toBe('CAN_REPAIR');
    // CAN_REPAIR carries both the drifts and the outbox to resolve
    expect(r.drifts).toEqual([STRUCT_DRIFT]);
    expect(r.orphanedOutboxIds).toEqual(['ob-9']);
  });

  it('only status drifts (some projection present) → STALE_SUBMISSION_STATUS', () => {
    // projection has structural values, only zatca_status lags
    const partial = { ...FULL_PROJECTION, zatcaStatus: 'ready' };
    const r = classify(REF, snap({ projection: partial }), EXPECTED, [STATUS_DRIFT]);
    expect(r.classification).toBe('STALE_SUBMISSION_STATUS');
    expect(r.decision).toBe('CAN_REPAIR');
  });

  it('mixed drifts with partial projection → MULTIPLE_DRIFTS', () => {
    // signing projection partially present (icv set) → not "missing", so mixed
    const partial = { ...EMPTY_PROJECTION, icv: 1 };
    const r = classify(REF, snap({ projection: partial }), EXPECTED, [
      STRUCT_DRIFT,
      STATUS_DRIFT,
    ]);
    expect(r.classification).toBe('MULTIPLE_DRIFTS');
    expect(r.decision).toBe('CAN_REPAIR');
    expect(r.drifts).toHaveLength(2);
  });

  it('carries a human-readable summary on every report', () => {
    const r = classify(REF, snap({}), EXPECTED, []);
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });
});
