/**
 * InvoiceSigningCoordinator — S5 orchestrator (Composition Authority).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Owns ORDERING ONLY. It GUARANTEES the atomic local production of a Signed
 * Invoice by sequencing the four frozen authorities + the composer:
 *
 *   resolve → readHead → build(snapshot) → compose → persist → append → project
 *
 * It knows nothing of company/environment/context — the caller supplies them.
 * It holds no crypto, no SQL, no chain math; every truth comes from an authority.
 *
 * Key orderings (not negotiable):
 *   - persist BEFORE append: the artifact is durable before the chain commits to
 *     its hash (the durability boundary — chain never references a lost artifact).
 *   - project AFTER append SUCCESS, and NON-transactionally: chain success is the
 *     truth; a projection failure is surfaced as a ProjectionFailed event (never
 *     lost, never fatal).
 *
 * CONFLICT is retried on a fresh head (PIH moved); each attempt re-signs into a
 * NEW artifact (signingTime per attempt). Orphaned attempts are system record.
 * ALREADY_APPLIED is idempotent success — it does NOT re-project (the canonical
 * projection belongs to the artifact the chain accepted, not this attempt's).
 *
 * Its concern ENDS at append SUCCESS. Submission to Fatoora is S5.3.
 */

import type {
  ZatcaEnvironment,
  CredentialType,
} from '../credential/CredentialResolver';
import type { DocumentType } from '../xmlBuilder.types';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';

/** Operational policy (NOT part of the model) — injected, env-tunable. */
export interface CoordinatorOptions {
  /** Bounded CONFLICT retries before giving up. Sprint A: 5. */
  readonly maxRetries: number;
}

/** All context the orchestrator needs, supplied by the caller (Workflow). */
export interface SignDocumentInput {
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  /** Workflow decides the credential purpose (Sprint A compliance: 'CCSID'). */
  readonly credentialType: CredentialType;
  readonly documentType: DocumentType;
  readonly documentId: string;
}

/** The orchestrator's outcome — a committed chain position + its artifact. */
export type SignDocumentResult =
  | {
      readonly status: 'SIGNED';
      readonly icv: number;
      readonly pih: string;
      readonly artifactId: string;
      readonly artifactHash: string;
    }
  | {
      readonly status: 'ALREADY_SIGNED';
      readonly icv: number;
      readonly pih: string;
      readonly artifactHash: string;
    };

/**
 * Emitted when the chain committed but the projection write failed. The chain
 * result stands; this event makes the stale projection RECOVERABLE (a durable
 * sink — Outbox / event bus — reconciles it later). It must never be lost.
 */
export interface ProjectionFailedEvent {
  readonly kind: 'ProjectionFailed';
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly documentType: ArtifactDocumentType;
  readonly documentId: string;
  readonly icv: number;
  readonly artifactId: string;
  readonly error: string;
  readonly occurredAt: string;
}

/**
 * Durable channel for ProjectionFailed events. Injected so the caller chooses
 * durability (Outbox table / event bus) — the orchestrator only guarantees the
 * event is EMITTED, not where it is stored.
 */
export interface ProjectionFailureSink {
  record(event: ProjectionFailedEvent): Promise<void>;
}

/**
 * InvoiceSigningCoordinator interface.
 *
 * MUST:
 * 1. Sequence the authorities; never re-derive their invariants.
 * 2. persist before append; project after SUCCESS, non-transactionally.
 * 3. Retry CONFLICT up to options.maxRetries on a fresh head, then throw.
 * 4. Return ALREADY_APPLIED as idempotent success without re-projecting.
 * 5. Propagate resolve/build/compose/persist/append failures as exceptions.
 */
export interface InvoiceSigningCoordinator {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /** Produce (or recognize already-produced) a signed, chained invoice. */
  run(input: SignDocumentInput): Promise<SignDocumentResult>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type InvoiceSigningCoordinatorFactory = () => InvoiceSigningCoordinator;
