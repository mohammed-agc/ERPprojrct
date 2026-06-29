/**
 * DocumentChainService — the single authority over the ZATCA document chain head.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * SCOPE — what this is, and what it is NOT (per One Authority Per Concern):
 *
 *   Two operations on the (company, environment) chain aggregate:
 *     - readHead : the SOLE reader of the head — returns a SNAPSHOT
 *                  { currentIcv, currentPih, token }.
 *     - append   : the SOLE writer — commits one document event, or reports
 *                  ALREADY_APPLIED / CONFLICT. It never moves the head under a
 *                  stale snapshot.
 *
 *   This service is a thin, faithful TS face over the atomic DB authorities
 *   public.zatca_read_head / public.zatca_append. ALL chain invariants (ICV
 *   reservation, PIH derivation, idempotency, token compare, conflict) live in
 *   the DB, under one lock (Invariant Locality). This layer does NOT re-derive
 *   them, NOT choose credentials, NOT build/sign XML, NOT resolve documents.
 *
 *   Frozen model: docs/adr/ADR-Chain-Concurrency-Model.md (ADR-028).
 * ════════════════════════════════════════════════════════════════════════════
 *
 * KNOWLEDGE ORDERING (the inversion ADR-028 fixes):
 *   readHead → (icv, pih) → build + sign XML embedding them → append.
 *   The head is known BEFORE signing; append validates the snapshot via `token`.
 *
 * OUTCOMES are RETURNED, not thrown (ADR-028 §3.3 — conflict resolution is the
 * caller's policy): append → SUCCESS | ALREADY_APPLIED | CONFLICT.
 *   - ALREADY_APPLIED is re-entry (the stronger truth) — wins over CONFLICT.
 *   - CONFLICT leaves the chain unchanged; the caller must readHead again and
 *     rebuild + re-sign (the signed content's PIH/ICV are now stale).
 * Non-outcomes (bad input, scope violation, DB/infra failure) PROPAGATE as
 * exceptions — never folded into an outcome.
 *
 * Architectural references:
 * - ADR-028:    Chain Concurrency Model (the frozen model this realizes).
 * - AD-009A v2: One Authority Per Concern.
 * - AD-012 v2:  Provider pattern for DI (factory-injected for test determinism).
 */

/**
 * ZATCA API environment. Mirrors the DB CHECK (zc/zcs/zdc_env_check) and
 * CredentialResolver.ZatcaEnvironment.
 * CLEANUP (noted): extract a single shared ZatcaEnvironment type for the whole
 * zatca service layer once a shared types module exists (low priority).
 */
export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

/** Chain document type. Mirrors zatca_document_chain.zdc_type_check. */
export type DocumentType = 'invoice' | 'credit_note' | 'debit_note';

/**
 * A snapshot of the CURRENT chain head (state, not projection).
 * The caller derives nextIcv = currentIcv + 1, and uses currentPih as the next
 * document's PIH. `token` is an opaque concurrency token (protocol, not domain).
 */
export interface ChainHead {
  readonly currentIcv: number;
  readonly currentPih: string;
  readonly token: number;
}

/**
 * A reference to a stored signed artifact: its identity + the link hash the
 * chain verifies against. An inseparable pair — passed as ONE entity so an
 * invalid {id, hash} combination is unrepresentable.
 */
export interface ArtifactReference {
  readonly artifactId: string;
  readonly artifactHash: string;
}

/** The artifact the caller built on a head snapshot, submitted for commit. */
export interface AppendRequest {
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly documentType: DocumentType;
  readonly documentId: string;
  readonly uuid: string;
  /** Reference to the durable signed artifact (persisted BEFORE this append). */
  readonly artifactRef: ArtifactReference;
  /** The token from the readHead snapshot this artifact was built upon. */
  readonly token: number;
}

/**
 * The result of append — one of exactly three outcomes (RETURNED, not thrown).
 */
export type AppendOutcome =
  | {
      readonly outcome: 'SUCCESS';
      readonly icv: number;
      readonly pih: string;
      readonly artifactHash: string;
    }
  | {
      readonly outcome: 'ALREADY_APPLIED';
      readonly icv: number;
      readonly pih: string;
      readonly artifactHash: string;
      readonly uuid: string;
    }
  | {
      readonly outcome: 'CONFLICT';
      readonly expectedToken: number;
      readonly currentToken: number;
    };

/**
 * DocumentChainService interface.
 *
 * MUST:
 * 1. Be a faithful face over zatca_read_head / zatca_append — no re-derivation
 *    of chain invariants in this layer (the DB owns them, under one lock).
 * 2. RETURN the three append outcomes; never throw for CONFLICT/ALREADY_APPLIED.
 * 3. PROPAGATE non-outcomes (bad input, scope violation, infra failure) as
 *    exceptions.
 */
export interface DocumentChainService {
  /** Human-readable implementation name for diagnostics. */
  readonly implementationName: string;

  /**
   * Read a snapshot of the chain head for (companyId, environment).
   * @throws on infra/precondition failure (non-outcome).
   */
  readHead(
    companyId: string,
    environment: ZatcaEnvironment
  ): Promise<ChainHead>;

  /**
   * Append one document event, validating the snapshot via request.token.
   * @returns SUCCESS | ALREADY_APPLIED | CONFLICT.
   * @throws on infra/precondition failure (non-outcome).
   */
  append(request: AppendRequest): Promise<AppendOutcome>;
}

/** Factory function signature for dependency injection (per AD-012 v2). */
export type DocumentChainServiceFactory = () => DocumentChainService;
