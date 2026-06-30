/**
 * ProjectionDiagnostics — S6.3 contract.
 *
 * Owns ANALYSIS at two granularities, both grounded in the SAME single-document
 * truth the Reconciler already established:
 *
 *   analyzeOne(identity) → ReconciliationReport   (delegates to the Reconciler;
 *                                                  the one source of truth)
 *   analyzeScope(scope)  → ScopeDiagnostics        (ITERATES analyzeOne + tallies;
 *                                                  NO new classification logic)
 *
 * Hard rules (frozen):
 *   1. analyzeOne is the only place truth is classified.
 *   2. analyzeScope merely REPEATS analyzeOne and aggregates — never re-derives.
 *   3. The set of documents is a SCOPE CONTRACT, not "all signed documents"
 *      hard-coded. Sprint A ships one scope: { companyId, environment }.
 *   4. This is NOT a HealthReport — it answers "is the read-model consistent?",
 *      not "can the system operate?". HealthReport composes this, never the
 *      reverse, and never knows the word "batch".
 *
 * Naming is deliberately "Diagnostics", not "BatchReconciler": the scope path may
 * later stream / paginate / run on a queue without the contract implying a loop.
 */

import type {
  ProjectionReconciler,
  DocumentRef,
  ReconciliationReport,
  ProjectionClassification,
} from './ProjectionReconciler';
import type { ZatcaEnvironment } from '../credential/CredentialResolver';

/**
 * Which documents to analyze. A CONTRACT, not a fixed query. Sprint A implements
 * only the company+environment scope; future scopes (document type, last-24h,
 * everything) add a variant without changing analyzeScope's shape.
 */
export type BatchScope = {
  readonly kind: 'company-environment';
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
};

/** A per-classification tally over a scope. */
export type ClassificationTally = Record<ProjectionClassification, number>;

/** The aggregated outcome of analyzing every document in a scope. */
export interface ScopeDiagnostics {
  readonly scope: BatchScope;
  readonly total: number;
  /** Count per classification (all eight keys always present, zero-filled). */
  readonly tally: ClassificationTally;
  /** Documents needing intervention (decision ESCALATE) — surfaced explicitly. */
  readonly escalations: readonly ReconciliationReport[];
  /** Documents repairable now (decision CAN_REPAIR) — count only, not the reports. */
  readonly repairable: number;
  /** Per-document reports, in enumeration order (full detail for drill-down). */
  readonly reports: readonly ReconciliationReport[];
}

/**
 * Enumerates the document identities in a scope. The ONLY part that knows how a
 * scope maps to rows; analyzeScope itself stays scope-agnostic (it just loops).
 */
export interface ScopeEnumerator {
  enumerate(scope: BatchScope): Promise<DocumentRef[]>;
}

export interface ProjectionDiagnostics {
  readonly implementationName: string;
  analyzeOne(identity: DocumentRef): Promise<ReconciliationReport>;
  analyzeScope(scope: BatchScope): Promise<ScopeDiagnostics>;
}

/** The eight classifications, for zero-filling a tally. */
export const ALL_CLASSIFICATIONS: readonly ProjectionClassification[] = [
  'NOT_SIGNED',
  'CONSISTENT',
  'MISSING_SIGNING_PROJECTION',
  'STALE_SUBMISSION_STATUS',
  'ORPHANED_OUTBOX',
  'MULTIPLE_DRIFTS',
  'MISSING_ARTIFACT',
  'UNSUPPORTED_SUBMISSION_STATE',
];

/** A fresh zero-filled tally — single source for the tally shape. */
export function emptyTally(): ClassificationTally {
  return {
    NOT_SIGNED: 0,
    CONSISTENT: 0,
    MISSING_SIGNING_PROJECTION: 0,
    STALE_SUBMISSION_STATUS: 0,
    ORPHANED_OUTBOX: 0,
    MULTIPLE_DRIFTS: 0,
    MISSING_ARTIFACT: 0,
    UNSUPPORTED_SUBMISSION_STATE: 0,
  };
}

// Re-export for implementers wiring the underlying authority.
export type { ProjectionReconciler };
