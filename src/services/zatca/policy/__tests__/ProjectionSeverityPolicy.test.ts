import { describe, it, expect } from 'vitest';
import {
  deriveSeverity,
  worstSeverity,
  severityRank,
  SEVERITY_ORDER,
  type ProjectionSeverity,
} from '../ProjectionSeverityPolicy';
import type { ProjectionClassification } from '../../reconciliation/ProjectionReconciler';

describe('ProjectionSeverityPolicy.deriveSeverity', () => {
  const cases: Array<[ProjectionClassification, ProjectionSeverity]> = [
    ['CONSISTENT', 'OK'],
    ['NOT_SIGNED', 'OK'],
    ['STALE_SUBMISSION_STATUS', 'WARNING'],
    ['ORPHANED_OUTBOX', 'WARNING'],
    ['MISSING_SIGNING_PROJECTION', 'ERROR'],
    ['MULTIPLE_DRIFTS', 'ERROR'],
    ['MISSING_ARTIFACT', 'CRITICAL'],
    ['UNSUPPORTED_SUBMISSION_STATE', 'CRITICAL'],
  ];

  it.each(cases)('%s → %s', (classification, expected) => {
    expect(deriveSeverity(classification)).toBe(expected);
  });

  it('the unknown is treated as the most dangerous (UNSUPPORTED = CRITICAL)', () => {
    // The design principle, pinned: an unknown state outranks known drifts.
    expect(severityRank(deriveSeverity('UNSUPPORTED_SUBMISSION_STATE'))).toBe(
      severityRank('CRITICAL')
    );
    expect(
      severityRank(deriveSeverity('UNSUPPORTED_SUBMISSION_STATE'))
    ).toBeGreaterThan(severityRank(deriveSeverity('MULTIPLE_DRIFTS')));
  });

  it('an unmapped classification defaults to CRITICAL, never OK', () => {
    expect(deriveSeverity('SOMETHING_NEW' as ProjectionClassification)).toBe(
      'CRITICAL'
    );
  });
});

describe('severity ordering', () => {
  it('is OK < WARNING < ERROR < CRITICAL', () => {
    expect(SEVERITY_ORDER).toEqual(['OK', 'WARNING', 'ERROR', 'CRITICAL']);
    expect(severityRank('OK')).toBeLessThan(severityRank('WARNING'));
    expect(severityRank('WARNING')).toBeLessThan(severityRank('ERROR'));
    expect(severityRank('ERROR')).toBeLessThan(severityRank('CRITICAL'));
  });
});

describe('worstSeverity', () => {
  it('empty set → OK', () => {
    expect(worstSeverity([])).toBe('OK');
  });

  it('picks the highest-rank severity present', () => {
    expect(worstSeverity(['OK', 'WARNING', 'OK'])).toBe('WARNING');
    expect(worstSeverity(['WARNING', 'ERROR', 'WARNING'])).toBe('ERROR');
    expect(worstSeverity(['OK', 'CRITICAL', 'ERROR'])).toBe('CRITICAL');
  });

  it('all OK → OK', () => {
    expect(worstSeverity(['OK', 'OK', 'OK'])).toBe('OK');
  });
});
