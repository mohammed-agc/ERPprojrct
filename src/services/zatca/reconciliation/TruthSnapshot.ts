/**
 * TruthSnapshot + deriveExpectedProjection — the FIRST pure stage of analyze().
 *
 * TruthSnapshot is RAW: each source is its real shape, or null when absent. The
 * reader does NOT interpret (no `exists: boolean`) — null is a fact, "exists" is
 * a reading. All interpretation lives downstream (deriveExpectedProjection, then
 * compare, then classify).
 *
 * deriveExpectedProjection answers ONE question — "what can I derive from the
 * sources of truth?" — and NOTHING more. It never invents a status when the
 * policy cannot derive one:
 *
 *   chain == null                              → ExpectedProjection = null  (NOT_SIGNED)
 *   latestSubmission == null                   → zatcaStatus = 'ready'      (signed, unsent)
 *   latestSubmission present + policy succeeds  → the derived status
 *   latestSubmission present + policy == null   → zatcaStatus = null
 *                                                 (a truth we cannot project —
 *                                                  classify() decides its meaning,
 *                                                  NOT this function)
 *
 * `null` zatcaStatus is NOT a ZATCA state; it is the explicit marker of
 * "submission exists but its disposition is unsupported". Distinguishing absence
 * of truth from failure-to-interpret truth is the whole point.
 */

import {
  deriveSubmissionStatus,
  submissionFactsFromLogRow,
  type SubmissionDerivedStatus,
  type SubmissionLogFactsRow,
} from '../policy/SubmissionStatusPolicy';

/** Structural truth from zatca_document_chain (the SSOT row), or null if unsigned. */
export interface ChainSnapshot {
  readonly icv: number;
  readonly pih: string;
  readonly uuid: string;
  readonly artifactId: string; // chain's claimed artifact reference
  readonly artifactHash: string;
}

/** The artifact the chain points at, or null if it does not exist (broken truth). */
export interface ArtifactSnapshot {
  readonly artifactHash: string;
  // presence alone is the fact the classifier needs; bytes are not read here.
}

/** The latest submission attempt (by completed_at DESC NULLS LAST), or null. */
export interface LatestSubmissionSnapshot extends SubmissionLogFactsRow {
  readonly submissionLogId: string;
}

/** The current invoices read-model row (always present for a known invoice). */
export interface ProjectionSnapshot {
  readonly icv: number | null;
  readonly pih: string | null;
  readonly signedArtifactId: string | null;
  readonly xmlHash: string | null;
  readonly zatcaStatus: string | null;
}

/** Raw, uninterpreted picture of every truth source for one document. */
export interface TruthSnapshot {
  readonly chain: ChainSnapshot | null;
  readonly artifact: ArtifactSnapshot | null;
  readonly projection: ProjectionSnapshot;
  readonly latestSubmission: LatestSubmissionSnapshot | null;
  readonly unresolvedOutboxIds: readonly string[];
}

/**
 * What the projection SHOULD be, derived purely from the sources of truth.
 * `zatcaStatus === null` means "a submission exists whose disposition we cannot
 * project" — left for classify() to name; never coerced to a plausible value.
 */
export interface ExpectedProjection {
  readonly icv: number;
  readonly pih: string;
  readonly signedArtifactId: string;
  readonly xmlHash: string;
  readonly zatcaStatus: SubmissionDerivedStatus | 'ready' | null;
}

/**
 * Derive the expected projection from a snapshot.
 * Returns null ⇔ no structural truth exists (chain == null ⇒ NOT_SIGNED).
 */
export function deriveExpectedProjection(
  snapshot: TruthSnapshot
): ExpectedProjection | null {
  const { chain, latestSubmission } = snapshot;
  if (!chain) return null; // no truth → nothing to expect

  let zatcaStatus: ExpectedProjection['zatcaStatus'];
  if (!latestSubmission) {
    // signed but never submitted — derived from the ABSENCE of a submission
    zatcaStatus = 'ready';
  } else {
    // a submission exists — the policy decides; null = unsupported disposition
    zatcaStatus = deriveSubmissionStatus(
      submissionFactsFromLogRow(latestSubmission)
    );
  }

  return {
    icv: chain.icv,
    pih: chain.pih,
    signedArtifactId: chain.artifactId,
    xmlHash: chain.artifactHash,
    zatcaStatus,
  };
}
