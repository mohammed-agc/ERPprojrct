import { describe, it, expect } from 'vitest';
import {
  deriveExpectedProjection,
  type TruthSnapshot,
  type ChainSnapshot,
} from '../TruthSnapshot';

const CHAIN: ChainSnapshot = {
  icv: 1,
  pih: 'PIH_1',
  uuid: 'uuid-1',
  artifactId: 'art-1',
  artifactHash: 'HASH_1',
};

const EMPTY_PROJECTION = {
  icv: null,
  pih: null,
  signedArtifactId: null,
  xmlHash: null,
  zatcaStatus: null,
};

function snapshot(over: Partial<TruthSnapshot>): TruthSnapshot {
  return {
    chain: CHAIN,
    artifact: { artifactHash: 'HASH_1' },
    projection: EMPTY_PROJECTION,
    latestSubmission: null,
    unresolvedOutboxIds: [],
    ...over,
  };
}

describe('deriveExpectedProjection — derives only from truth, never invents', () => {
  it('chain == null → null (no truth → NOT_SIGNED downstream)', () => {
    expect(deriveExpectedProjection(snapshot({ chain: null }))).toBeNull();
  });

  it('no submission → ready (signed, unsent) with structural truth from chain', () => {
    const e = deriveExpectedProjection(snapshot({ latestSubmission: null }));
    expect(e).toEqual({
      icv: 1,
      pih: 'PIH_1',
      signedArtifactId: 'art-1',
      xmlHash: 'HASH_1',
      zatcaStatus: 'ready',
    });
  });

  it('submission CLEARED → cleared', () => {
    const e = deriveExpectedProjection(
      snapshot({
        latestSubmission: {
          submissionLogId: 'log-1',
          zatca_status: 'PASS',
          zatca_response_code: 'CLEARED',
          success: true,
        },
      })
    );
    expect(e?.zatcaStatus).toBe('cleared');
    // structural truth still comes from the chain, unchanged
    expect(e?.signedArtifactId).toBe('art-1');
    expect(e?.xmlHash).toBe('HASH_1');
  });

  it('submission REPORTED → reported; ERROR → rejected', () => {
    expect(
      deriveExpectedProjection(
        snapshot({
          latestSubmission: {
            submissionLogId: 'l',
            zatca_response_code: 'REPORTED',
            zatca_status: 'PASS',
          },
        })
      )?.zatcaStatus
    ).toBe('reported');

    expect(
      deriveExpectedProjection(
        snapshot({
          latestSubmission: { submissionLogId: 'l', zatca_status: 'ERROR', success: false },
        })
      )?.zatcaStatus
    ).toBe('rejected');
  });

  it('submission present but UNSUPPORTED disposition → zatcaStatus null (NOT coerced to ready)', () => {
    const e = deriveExpectedProjection(
      snapshot({
        latestSubmission: {
          submissionLogId: 'log-x',
          zatca_status: 'PASS',
          zatca_response_code: 'NOT_CLEARED', // not a terminal code we project
          success: false,
        },
      })
    );
    // structural truth is still derived…
    expect(e?.icv).toBe(1);
    expect(e?.signedArtifactId).toBe('art-1');
    // …but the status is an explicit null — a truth we cannot project.
    // This is NOT 'ready' (a submission exists), and classify() decides meaning.
    expect(e?.zatcaStatus).toBeNull();
  });
});
