import { describe, it, expect } from 'vitest';
import {
  decideRepair,
  type ProjectionClassification,
  type RepairDecision,
} from '../ProjectionReconciler';

/**
 * The agreed classification → decision table, asserted row by row. This is the
 * entire repair policy; if a future classification is added without a decision,
 * the exhaustiveness test below fails to compile/run.
 */
const TABLE: Record<ProjectionClassification, RepairDecision> = {
  NOT_SIGNED: 'OUT_OF_SCOPE',
  CONSISTENT: 'NO_ACTION',
  MISSING_SIGNING_PROJECTION: 'CAN_REPAIR',
  STALE_SUBMISSION_STATUS: 'CAN_REPAIR',
  ORPHANED_OUTBOX: 'CAN_REPAIR',
  MULTIPLE_DRIFTS: 'CAN_REPAIR',
  MISSING_ARTIFACT: 'ESCALATE',
  UNSUPPORTED_SUBMISSION_STATE: 'ESCALATE',
};

describe('decideRepair — the repair policy table', () => {
  for (const [classification, expected] of Object.entries(TABLE) as [
    ProjectionClassification,
    RepairDecision
  ][]) {
    it(`${classification} → ${expected}`, () => {
      expect(decideRepair(classification)).toBe(expected);
    });
  }

  it('the principle: only intact-truth drifts are CAN_REPAIR', () => {
    // projection-lag classifications (truth intact)
    const repairable: ProjectionClassification[] = [
      'MISSING_SIGNING_PROJECTION',
      'STALE_SUBMISSION_STATUS',
      'ORPHANED_OUTBOX',
      'MULTIPLE_DRIFTS',
    ];
    for (const c of repairable) expect(decideRepair(c)).toBe('CAN_REPAIR');

    // broken-truth → never CAN_REPAIR
    expect(decideRepair('MISSING_ARTIFACT')).toBe('ESCALATE');
    expect(decideRepair('UNSUPPORTED_SUBMISSION_STATE')).toBe('ESCALATE');
    // no-truth → never CAN_REPAIR
    expect(decideRepair('NOT_SIGNED')).toBe('OUT_OF_SCOPE');
    // already-correct → never CAN_REPAIR
    expect(decideRepair('CONSISTENT')).toBe('NO_ACTION');
  });

  it('covers every classification exactly once (no orphan, no duplicate)', () => {
    const all = Object.keys(TABLE) as ProjectionClassification[];
    const decisions = new Set(all.map(decideRepair));
    // all four decisions are represented by the seven classifications
    expect([...decisions].sort()).toEqual(
      ['CAN_REPAIR', 'ESCALATE', 'NO_ACTION', 'OUT_OF_SCOPE'].sort()
    );
  });
});
