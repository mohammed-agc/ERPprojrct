/**
 * ProjectionSeverityPolicy — maps WHAT we found (classification) to HOW BADLY it
 * affects system health (severity). A third, independent axis from Decision:
 *
 *   Classification → what is the truth we discovered?   (the reality)
 *   Decision       → what should we do about it?          (an operational choice)
 *   Severity       → how bad is that reality for health?  (impact)
 *
 * Severity depends on the CLASSIFICATION ALONE — never on the decision. Tying it
 * to the decision would let a repair choice define how serious a state is, but
 * seriousness is a property of the state itself. MISSING_ARTIFACT and
 * UNSUPPORTED_SUBMISSION_STATE are both ESCALATE, yet we must be able to grade
 * them independently.
 *
 * Guiding principle (from S5): the UNKNOWN is more dangerous than the KNOWN.
 *   - Understood drifts (MISSING_SIGNING_PROJECTION, MULTIPLE_DRIFTS) → ERROR:
 *     describable and repairable.
 *   - UNSUPPORTED_SUBMISSION_STATE → CRITICAL: a base assumption collapsed; the
 *     reconciler cannot derive truth with confidence ("we don't know what this
 *     data means"). Worse for health than a known deviation, however small today.
 *
 * Pure: no DB, no I/O. Reusable by HealthReport, dashboards, alerts, monitoring.
 */

import type { ProjectionClassification } from '../reconciliation/ProjectionReconciler';

export type ProjectionSeverity = 'OK' | 'WARNING' | 'ERROR' | 'CRITICAL';

/** Total order, ascending — index is the rank (higher = worse). */
export const SEVERITY_ORDER: readonly ProjectionSeverity[] = [
  'OK',
  'WARNING',
  'ERROR',
  'CRITICAL',
];

const SEVERITY_BY_CLASSIFICATION: Record<
  ProjectionClassification,
  ProjectionSeverity
> = {
  CONSISTENT: 'OK',
  NOT_SIGNED: 'OK',
  STALE_SUBMISSION_STATUS: 'WARNING',
  ORPHANED_OUTBOX: 'WARNING',
  MISSING_SIGNING_PROJECTION: 'ERROR',
  MULTIPLE_DRIFTS: 'ERROR',
  MISSING_ARTIFACT: 'CRITICAL',
  UNSUPPORTED_SUBMISSION_STATE: 'CRITICAL',
};

/** Severity of a single classification. */
export function deriveSeverity(
  classification: ProjectionClassification
): ProjectionSeverity {
  const s = SEVERITY_BY_CLASSIFICATION[classification];
  if (!s) {
    // Defensive: an unmapped classification is itself an unknown — treat as the
    // worst, never silently 'OK'. (Keeps the table honest if the enum grows.)
    return 'CRITICAL';
  }
  return s;
}

/** Rank of a severity (higher = worse), for comparisons. */
export function severityRank(s: ProjectionSeverity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/** The worst (highest-rank) severity in a set; 'OK' for an empty set. */
export function worstSeverity(
  severities: readonly ProjectionSeverity[]
): ProjectionSeverity {
  return severities.reduce<ProjectionSeverity>(
    (worst, s) => (severityRank(s) > severityRank(worst) ? s : worst),
    'OK'
  );
}
