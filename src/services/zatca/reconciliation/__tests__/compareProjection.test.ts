import { describe, it, expect } from 'vitest';
import { compareProjection } from '../compareProjection';
import type { ExpectedProjection, ProjectionSnapshot } from '../TruthSnapshot';

const EXPECTED: ExpectedProjection = {
  icv: 1,
  pih: 'PIH_1',
  signedArtifactId: 'art-1',
  xmlHash: 'HASH_1',
  zatcaStatus: 'cleared',
};

/** A projection that fully matches EXPECTED. */
const CONSISTENT: ProjectionSnapshot = {
  icv: 1,
  pih: 'PIH_1',
  signedArtifactId: 'art-1',
  xmlHash: 'HASH_1',
  zatcaStatus: 'cleared',
};

describe('compareProjection — field drift with source attribution', () => {
  it('fully consistent → no drifts', () => {
    expect(compareProjection(EXPECTED, CONSISTENT)).toEqual([]);
  });

  it('signed_artifact_id missing → one Chain drift (the 966673e8 case)', () => {
    const actual = { ...CONSISTENT, signedArtifactId: null };
    const drifts = compareProjection(EXPECTED, actual);
    expect(drifts).toEqual([
      {
        field: 'signed_artifact_id',
        expected: 'art-1',
        actual: null,
        source: 'Chain',
      },
    ]);
  });

  it('stale status → one SubmissionLog drift', () => {
    const actual = { ...CONSISTENT, zatcaStatus: 'ready' };
    const drifts = compareProjection(EXPECTED, actual);
    expect(drifts).toEqual([
      {
        field: 'zatca_status',
        expected: 'cleared',
        actual: 'ready',
        source: 'SubmissionLog',
      },
    ]);
  });

  it('multiple structural drifts are all reported with Chain source', () => {
    const actual = {
      icv: null,
      pih: null,
      signedArtifactId: null,
      xmlHash: null,
      zatcaStatus: 'cleared',
    };
    const drifts = compareProjection(EXPECTED, actual);
    expect(drifts.map((d) => d.field)).toEqual([
      'icv',
      'pih',
      'signed_artifact_id',
      'xml_hash',
    ]);
    expect(drifts.every((d) => d.source === 'Chain')).toBe(true);
  });

  it('expected.zatcaStatus === null → status field is NOT compared', () => {
    const expected: ExpectedProjection = { ...EXPECTED, zatcaStatus: null };
    // actual has some arbitrary status; it must be ignored, not flagged
    const actual = { ...CONSISTENT, zatcaStatus: 'rejected' };
    const drifts = compareProjection(expected, actual);
    expect(drifts.find((d) => d.field === 'zatca_status')).toBeUndefined();
    expect(drifts).toEqual([]); // structural fields all match
  });

  it('treats undefined and null as equal (a missing column is null)', () => {
    const actual = {
      ...CONSISTENT,
      signedArtifactId: undefined as unknown as string | null,
    };
    const expectedWithNullArtifact: ExpectedProjection = {
      ...EXPECTED,
      signedArtifactId: null as unknown as string,
    };
    expect(compareProjection(expectedWithNullArtifact, actual)).toEqual([]);
  });
});
