/**
 * ProjectionReconciler — S6.1 contract.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE ONE RULE this authority is faithful to:
 *
 *   "I rebuild the PROJECTION from the truth. I never repair the truth itself."
 *
 *   Truth has two sources, each owning part of the invoices read-model:
 *     - STRUCTURAL truth  = Chain + Artifact  → icv, pih, signed_artifact_id, xml_hash
 *     - TEMPORAL  truth   = latest submission_log row → zatca_status
 *   `invoices` is a PROJECTION that merges them.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TWO separated operations (no `mode` flag — that would make one service with
 * two personalities):
 *
 *   const report = await reconciler.analyze(ref);   // PURE: reads, never writes
 *   if (approved) await reconciler.repair(report);  // APPLIES the report verbatim
 *
 * Why separated: the report becomes a reviewable ARTIFACT, and repair APPLIES it
 * rather than recomputing — closing the TOCTOU gap where truth could change
 * between analysis and repair without anyone noticing.
 *
 * analyze() asks SCOPE FIRST ("is this document mine at all?") before comparing
 * any value:
 *   1. No chain?            → NOT_SIGNED (OUT_OF_SCOPE — there is no truth to project)
 *   2. Chain exists         → derive truth (structural + latest submission)
 *   3. Compare to projection
 *   4. Classify the drift
 *
 * The decision boundary is PRINCIPLED, not ad-hoc:
 *   - projection lags intact truth        → CAN_REPAIR
 *   - a truth SOURCE itself is inconsistent (chain points at a missing artifact,
 *     a hash mismatch between sources, …) → ESCALATE (beyond a reconciler's remit)
 *
 * Scope: ONE document. No batch concept in this contract — a BatchReconciler is
 * built ON TOP of this later (it just loops analyze→repair), keeping pagination /
 * checkpointing / parallelism out of the first version.
 *
 * Frozen contract — sole writer of the read-model remains ProjectionWriter; this
 * authority repairs THROUGH the same columns, never inventing new truth.
 */

import type { ZatcaEnvironment } from '../credential/CredentialResolver';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';

/** Identifies the single document to reconcile. */
export interface DocumentRef {
  readonly documentId: string;
  readonly environment: ZatcaEnvironment;
  readonly documentType: ArtifactDocumentType;
}

/** Is this document within the reconciler's remit at all? */
export type ProjectionScope = 'IN_SCOPE' | 'OUT_OF_SCOPE';

/**
 * The outcome of classifying a document.
 *
 *   NOT_SIGNED                  no chain → no truth exists yet (OUT_OF_SCOPE).
 *   CONSISTENT                  projection matches truth.
 *   MISSING_SIGNING_PROJECTION  structural columns empty despite chain+artifact.
 *   STALE_SUBMISSION_STATUS     zatca_status ≠ the latest submission_log outcome.
 *   ORPHANED_OUTBOX             unresolved outbox row(s) despite a consistent projection.
 *   MULTIPLE_DRIFTS             more than one repairable drift, truth intact.
 *   MISSING_ARTIFACT            chain references an artifact that does not exist
 *                               — STRUCTURAL TRUTH is broken (ESCALATE).
 *   UNSUPPORTED_SUBMISSION_STATE a submission exists whose disposition no policy
 *                               can project — TEMPORAL TRUTH is uninterpretable
 *                               (ESCALATE; never coerced to a plausible status).
 */
export type ProjectionClassification =
  | 'NOT_SIGNED'
  | 'CONSISTENT'
  | 'MISSING_SIGNING_PROJECTION'
  | 'STALE_SUBMISSION_STATUS'
  | 'ORPHANED_OUTBOX'
  | 'MULTIPLE_DRIFTS'
  | 'MISSING_ARTIFACT'
  | 'UNSUPPORTED_SUBMISSION_STATE';

/**
 * What repair() is permitted to do for a classification.
 *
 *   OUT_OF_SCOPE  no truth exists (NOT_SIGNED) — nothing to do.
 *   NO_ACTION     truth and projection already match (CONSISTENT).
 *   CAN_REPAIR    truth is intact, the projection lags — safe to rebuild.
 *   ESCALATE      a truth SOURCE is itself inconsistent — beyond the reconciler;
 *                 requires intervention (never silently "fixed").
 */
export type RepairDecision =
  | 'OUT_OF_SCOPE'
  | 'NO_ACTION'
  | 'CAN_REPAIR'
  | 'ESCALATE';

/** Which source owns the expected value of a drifted field. */
export type TruthSource = 'Chain' | 'Artifact' | 'SubmissionLog';

/** A single field whose projected value disagrees with the truth. */
export interface ProjectionDrift {
  readonly field: string; // the invoices column, e.g. 'signed_artifact_id'
  readonly expected: unknown; // what the truth says it should be
  readonly actual: unknown; // what the projection currently holds
  readonly source: TruthSource; // which truth owns `expected`
}

/**
 * The diagnostic ARTIFACT analyze() produces and repair() consumes.
 * It carries the REASON for each drift (source + expected/actual), not just
 * "4 columns differ" — making it a diagnosis, not a mere preview.
 */
export interface ReconciliationReport {
  readonly documentRef: DocumentRef;
  readonly scope: ProjectionScope;
  readonly classification: ProjectionClassification;
  readonly decision: RepairDecision;
  /** The exact field-level differences repair() will apply. Empty unless CAN_REPAIR. */
  readonly drifts: readonly ProjectionDrift[];
  /** Unresolved outbox rows for this document, to be resolved on repair. */
  readonly orphanedOutboxIds: readonly string[];
  /** Human-readable summary for logs / Health Check. */
  readonly summary: string;
}

/** The result of applying a report. */
export interface RepairOutcome {
  readonly documentRef: DocumentRef;
  readonly applied: boolean; // false when decision !== CAN_REPAIR
  readonly fieldsRepaired: readonly string[];
  readonly outboxResolved: readonly string[];
  readonly decision: RepairDecision;
}

/**
 * The pure classification → decision table. This is the entire policy of "what
 * may be repaired", in one referentially-transparent place. New classifications
 * map to an existing decision here without touching analyze/repair logic.
 */
export function decideRepair(
  classification: ProjectionClassification
): RepairDecision {
  switch (classification) {
    case 'NOT_SIGNED':
      return 'OUT_OF_SCOPE';
    case 'CONSISTENT':
      return 'NO_ACTION';
    case 'MISSING_SIGNING_PROJECTION':
    case 'STALE_SUBMISSION_STATUS':
    case 'ORPHANED_OUTBOX':
    case 'MULTIPLE_DRIFTS':
      return 'CAN_REPAIR';
    case 'MISSING_ARTIFACT':
      return 'ESCALATE';
    case 'UNSUPPORTED_SUBMISSION_STATE':
      return 'ESCALATE';
  }
}

/**
 * ProjectionReconciler — analyze (pure) then repair (applies a report).
 *
 * MUST:
 *   1. analyze() performs NO writes — it only reads truth + projection.
 *   2. repair() APPLIES the given report; it does NOT re-derive truth.
 *   3. repair() executes ONLY when report.decision === 'CAN_REPAIR'; for every
 *      other decision it returns applied=false and changes nothing.
 *   4. It repairs THROUGH the existing read-model columns; it never writes truth
 *      (chain / artifact / submission_log are read-only to it).
 */
export interface ProjectionReconciler {
  readonly implementationName: string;
  analyze(ref: DocumentRef): Promise<ReconciliationReport>;
  repair(report: ReconciliationReport): Promise<RepairOutcome>;
}
