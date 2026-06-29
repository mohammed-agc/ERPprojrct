/**
 * ArtifactStore — the single authority over the signed artifact.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SCOPE (One Authority Per Concern):
 *   Owns the durable, immutable signed artifact (the irreproducible product of
 *   compose). Two operations:
 *     - persist : store a freshly-composed artifact → returns its artifactId.
 *                 Called BEFORE Chain.append (the durability boundary), so the
 *                 chain never commits to a hash whose artifact is not yet durable.
 *     - fetch   : retrieve a stored artifact by id (e.g. for S5.3 submission).
 *
 *   It does NOT chain (that is DocumentChainService), NOT project to the read
 *   model (that is ProjectionWriter), NOT sign (that is the Composer).
 *
 * INVARIANTS (enforced by the DB — see 20260629_zatca_signed_artifacts.sql):
 *   - append-only & immutable (UPDATE/DELETE blocked at the DB level),
 *   - many artifacts per document allowed (one per signing attempt; failed
 *     attempts are system record, not garbage),
 *   - artifact_hash is the only field the Chain reads, to VERIFY identity↔hash.
 *
 * QR is NOT stored here: it is a deterministic derivative, embedded in signed_xml
 * and projected onto invoices.qr_code (it is not part of artifact identity).
 */

/** ZATCA API environment. Mirrors the DB CHECK. (Shared-type extraction: TODO.) */
export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

/** Document type in the chain/artifact vocabulary. Mirrors the DB CHECK. */
export type ArtifactDocumentType = 'invoice' | 'credit_note' | 'debit_note';

/**
 * A freshly-composed artifact to persist. id + createdAt are DB-generated.
 * Captures the full signing context as an immutable HISTORICAL record:
 * credential_id may be recycled later, but certificateFingerprint preserves
 * what actually signed it.
 */
export interface NewSignedArtifact {
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly documentType: ArtifactDocumentType;
  readonly documentId: string;
  /** SHA-256 of the signed XML — the value the Chain verifies against. */
  readonly artifactHash: string;
  /** The irreproducible product (signed UBL XML, QR already embedded). */
  readonly signedXml: string;
  /** ISO-8601 signing time baked into the signature. */
  readonly signingTime: string;
  readonly credentialId: string;
  readonly certificateFingerprint: string;
}

/** A stored artifact, as retrieved. */
export interface StoredArtifact {
  readonly id: string;
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly documentType: ArtifactDocumentType;
  readonly documentId: string;
  readonly artifactHash: string;
  readonly signedXml: string;
  readonly signingTime: string;
  readonly credentialId: string;
  readonly certificateFingerprint: string;
  readonly createdAt: string;
}

/**
 * ArtifactStore interface.
 *
 * MUST:
 * 1. persist exactly one immutable artifact and return its id.
 * 2. fetch by id; a missing artifact is a precondition failure (exception).
 * 3. PROPAGATE infra failures as exceptions (no swallowing).
 */
export interface ArtifactStore {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Persist a freshly-composed artifact.
   * @returns the new artifactId.
   * @throws on infra failure.
   */
  persist(artifact: NewSignedArtifact): Promise<string>;

  /**
   * Fetch a stored artifact by id.
   * @throws if not found (precondition) or on infra failure.
   */
  fetch(artifactId: string): Promise<StoredArtifact>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type ArtifactStoreFactory = () => ArtifactStore;
