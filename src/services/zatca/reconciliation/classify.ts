/**
 * classify — the THIRD and final pure stage of analyze().
 *
 * It NAMES the state, hierarchically: each level assumes the soundness of the
 * level above it. The first three levels are about TRUTH VALIDITY (is there
 * truth, and is it interpretable?) and must precede any projection comparison —
 * comparing a read-model before its truth source is valid is meaningless.
 *
 *   1. chain == null                       → NOT_SIGNED            (no truth)
 *   2. artifact == null                    → MISSING_ARTIFACT      (broken structural truth)
 *   3. expected.zatcaStatus == null        → UNSUPPORTED_SUBMISSION_STATE
 *                                            (a submission exists, no policy projects it)
 *   ── truth is valid below this line; now compare the projection ──
 *   4. no drifts:
 *        unresolved outbox → ORPHANED_OUTBOX
 *        else              → CONSISTENT
 *   5. no signing projection at all        → MISSING_SIGNING_PROJECTION
 *   6. all drifts are status (SubmissionLog) → STALE_SUBMISSION_STATUS
 *   7. otherwise                           → MULTIPLE_DRIFTS
 *
 * "No signing projection at all" is a SEMANTIC condition ("the signing
 * projection was never written"). Its current implementation — all four
 * structural columns null — is a detail, not the contract: a fifth column or a
 * storage change must not alter the meaning of MISSING_SIGNING_PROJECTION.
 *
 * Pure: depends only on its inputs. Produces the full report via decideRepair.
 */

import {
  decideRepair,
  type DocumentRef,
  type ProjectionClassification,
  type ProjectionDrift,
  type ProjectionScope,
  type ReconciliationReport,
} from './ProjectionReconciler';
import type { ExpectedProjection, TruthSnapshot } from './TruthSnapshot';

/** True when NO part of the signing projection was ever written. */
function hasNoSigningProjection(snapshot: TruthSnapshot): boolean {
  const p = snapshot.projection;
  return (
    p.icv === null &&
    p.pih === null &&
    p.signedArtifactId === null &&
    p.xmlHash === null
  );
}

function classifyOnly(
  snapshot: TruthSnapshot,
  expected: ExpectedProjection | null,
  drifts: readonly ProjectionDrift[]
): ProjectionClassification {
  // ── truth-validity levels (must precede comparison) ──
  if (!snapshot.chain) return 'NOT_SIGNED';
  if (!snapshot.artifact) return 'MISSING_ARTIFACT';
  // expected is non-null here (chain present); status null = uninterpretable submission
  if (expected && expected.zatcaStatus === null) {
    return 'UNSUPPORTED_SUBMISSION_STATE';
  }

  // ── projection-comparison levels (truth is valid) ──
  if (drifts.length === 0) {
    return snapshot.unresolvedOutboxIds.length > 0
      ? 'ORPHANED_OUTBOX'
      : 'CONSISTENT';
  }

  if (hasNoSigningProjection(snapshot)) {
    return 'MISSING_SIGNING_PROJECTION';
  }

  if (drifts.every((d) => d.source === 'SubmissionLog')) {
    return 'STALE_SUBMISSION_STATUS';
  }

  return 'MULTIPLE_DRIFTS';
}

/** Human-readable one-liner for logs / Health Check. */
function summarize(
  classification: ProjectionClassification,
  drifts: readonly ProjectionDrift[],
  orphanCount: number
): string {
  switch (classification) {
    case 'NOT_SIGNED':
      return 'Document is not signed — outside reconciler scope.';
    case 'CONSISTENT':
      return 'Projection matches truth.';
    case 'MISSING_ARTIFACT':
      return 'Chain references an artifact that does not exist (structural truth broken).';
    case 'UNSUPPORTED_SUBMISSION_STATE':
      return 'A submission exists with a disposition no policy can project.';
    case 'ORPHANED_OUTBOX':
      return `Projection is consistent but ${orphanCount} unresolved outbox row(s) remain.`;
    case 'MISSING_SIGNING_PROJECTION':
      return 'Signing projection was never written; rebuild from chain + artifact.';
    case 'STALE_SUBMISSION_STATUS':
      return 'zatca_status lags the latest submission outcome.';
    case 'MULTIPLE_DRIFTS':
      return `${drifts.length} field(s) drifted from truth.`;
  }
}

/**
 * Build the full ReconciliationReport from the three pure inputs. The drifts and
 * orphaned outbox ids are carried verbatim so repair() APPLIES, never recomputes.
 */
export function classify(
  ref: DocumentRef,
  snapshot: TruthSnapshot,
  expected: ExpectedProjection | null,
  drifts: readonly ProjectionDrift[]
): ReconciliationReport {
  const classification = classifyOnly(snapshot, expected, drifts);
  const decision = decideRepair(classification);
  const scope: ProjectionScope =
    decision === 'OUT_OF_SCOPE' ? 'OUT_OF_SCOPE' : 'IN_SCOPE';

  // Only a CAN_REPAIR report carries drifts/outbox to apply; otherwise empty.
  const applicableDrifts = decision === 'CAN_REPAIR' ? drifts : [];
  const applicableOutbox =
    decision === 'CAN_REPAIR' ? snapshot.unresolvedOutboxIds : [];

  return {
    documentRef: ref,
    scope,
    classification,
    decision,
    drifts: applicableDrifts,
    orphanedOutboxIds: applicableOutbox,
    summary: summarize(
      classification,
      drifts,
      snapshot.unresolvedOutboxIds.length
    ),
  };
}
