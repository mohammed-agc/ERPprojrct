/**
 * SubmissionCoordinator — S5.3 (Submission Authority).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * Submits an ALREADY-SIGNED, ALREADY-CHAINED document to ZATCA's compliance /
 * clearance / reporting endpoint and records the outcome. Its concern BEGINS
 * where the InvoiceSigningCoordinator's ends (append SUCCESS) — it never signs,
 * never chains, never builds XML. It reads what the chain committed and sends it.
 *
 *   resolve credential → read signed document → submit (HTTP) → record outcome
 *
 * Orderings (not negotiable):
 *   - The submission log is the DURABLE record of the attempt. EVERY attempt is
 *     recorded — success OR failure — exactly once, after the HTTP boundary
 *     resolves (response or transport error). The log write is the last step.
 *   - A ZATCA *business* outcome (PASS / WARNING / ERROR in validationResults)
 *     is a RESULT. A *transport/auth* failure (network, 5xx, 401) is recorded
 *     then RE-THROWN — infrastructure failure is never a business outcome.
 *   - Idempotency is NOT enforced here (the log is append-only; re-submitting is
 *     a new attempt with attempt_number incremented by the caller's policy).
 *
 * It holds no crypto, no SQL, no HTTP — every truth comes from an authority.
 */

import type {
  ZatcaEnvironment,
  CredentialType,
} from '../credential/CredentialResolver';
import type { DocumentType } from '../xmlBuilder.types';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';

// ════════════════════════════════════════════════════════════════════════════
// 1) Submission credential — the API auth (Basic), read from the Vault.
//    Distinct from the SIGNING key/cert: this is the CCSID's HTTP credential.
// ════════════════════════════════════════════════════════════════════════════

export interface SubmissionApiCredential {
  /** ZATCA binarySecurityToken (Basic-auth username). Base64 cert token. */
  readonly binarySecurityToken: string;
  /** ZATCA secret (Basic-auth password). */
  readonly secret: string;
}

/**
 * Reads the API credential for a credentialId from the secrets store (Vault).
 * Lives beside private.pem / certificate.pem under <vaultRoot>/credentials/<id>/.
 *
 * `credentialId` is an OPAQUE authority reference — the aggregate identity of a
 * credential, NOT necessarily a DB UUID. A provider maps it to storage however
 * it likes (vault dir name today); consumers must not assume its shape.
 */
export interface SubmissionCredentialProvider {
  getApiCredential(credentialId: string): Promise<SubmissionApiCredential>;
}

// ════════════════════════════════════════════════════════════════════════════
// 2) Signed document — what the chain committed, assembled for transmission.
//    uuid + icv come from the CHAIN; signed_xml from the ARTIFACT.
// ════════════════════════════════════════════════════════════════════════════

/**
 * What the chain committed, assembled for transmission. Exposes ONLY the fields
 * the submission consumes — uuid + icv from the CHAIN, hash + signedXml from the
 * ARTIFACT. (artifactId is the reader's internal join key, deliberately NOT
 * surfaced: nothing downstream needs it yet. Add it when clearance-storage does.)
 */
export interface SignedDocument {
  readonly uuid: string;
  readonly icv: number;
  /** Base64 invoice hash (the chain/artifact hash) — sent as invoiceHash. */
  readonly artifactHash: string;
  /** The signed UBL XML (raw, not base64). */
  readonly signedXml: string;
}

/**
 * Reads a committed signed document by identity. Absence is a PROGRAMMING ERROR
 * (you cannot submit what was never signed) → throws, not an empty result.
 */
export interface SignedDocumentReader {
  read(
    environment: ZatcaEnvironment,
    documentType: ArtifactDocumentType,
    documentId: string
  ): Promise<SignedDocument>;
}

// ════════════════════════════════════════════════════════════════════════════
// 3) ZATCA compliance client — the HTTP boundary. Pure I/O, no policy.
// ════════════════════════════════════════════════════════════════════════════

export interface ComplianceRequest {
  /** Base64 invoice hash (BT — invoiceHash). */
  readonly invoiceHash: string;
  /** Invoice UUID (cbc:UUID inside the XML). */
  readonly uuid: string;
  /** Base64 of the signed UBL XML (invoice). */
  readonly invoiceBase64: string;
}

export interface ValidationMessage {
  readonly type?: string;
  readonly code?: string;
  readonly category?: string;
  readonly message?: string;
  /** Each message carries its own status too (verified: "PASS"/"WARNING"/...). */
  readonly status?: string;
}

/**
 * Normalized ZATCA response — VERIFIED against a real sandbox 200:
 *   { validationResults: { infoMessages[], warningMessages[], errorMessages[],
 *                          status }, reportingStatus, clearanceStatus,
 *     qrSellertStatus, qrBuyertStatus }
 * `raw` preserves the full body for the log (response_json), including ZATCA's
 * own quirks (e.g. the misspelled qrSellert/qrBuyertStatus) and any future field.
 */
export interface ComplianceResponse {
  readonly httpStatus: number;
  /** validationResults.status — 'PASS' | 'WARNING' | 'ERROR'. */
  readonly validationStatus?: string;
  readonly infoMessages: ValidationMessage[];
  readonly warningMessages: ValidationMessage[];
  readonly errorMessages: ValidationMessage[];
  /** Standard (B2B) → clearance. e.g. 'CLEARED' / 'NOT_CLEARED'. null if N/A. */
  readonly clearanceStatus?: string | null;
  /** Simplified (B2C) → reporting. e.g. 'REPORTED'. null if N/A. */
  readonly reportingStatus?: string | null;
  /**
   * Base64 cleared invoice — only from the PRODUCTION clearance endpoint, NOT
   * compliance/invoices (verified: compliance returns status only, no XML).
   */
  readonly clearedInvoiceBase64?: string;
  /** Full response body, verbatim, for the audit log. */
  readonly raw: unknown;
}

export type ComplianceTarget = 'compliance' | 'reporting' | 'clearance';

/**
 * Performs the POST. Transport failures (network, timeout) THROW. A non-2xx
 * with a parseable ZATCA body is returned as a ComplianceResponse (the caller
 * decides if it's a business rejection). A non-2xx without a body THROWS.
 */
export interface ZatcaComplianceClient {
  submit(
    target: ComplianceTarget,
    environment: ZatcaEnvironment,
    request: ComplianceRequest,
    auth: SubmissionApiCredential
  ): Promise<ComplianceResponse>;
}

// ════════════════════════════════════════════════════════════════════════════
// 4) Submission log — append-only audit. One row per attempt.
// ════════════════════════════════════════════════════════════════════════════

export interface SubmissionLogEntry {
  readonly companyId: string;
  readonly documentType: ArtifactDocumentType;
  readonly documentId: string;
  readonly icv: number;
  readonly zatcaInvoiceUuid: string;
  readonly submissionType: ComplianceTarget;
  readonly credentialId: string;
  readonly xmlHash: string;
  readonly attemptNumber: number;
  // outcome
  readonly httpStatus?: number;
  readonly zatcaStatus?: string;
  readonly zatcaResponseCode?: string;
  readonly responseDescription?: string;
  readonly responseJson?: unknown;
  readonly success: boolean;
  readonly errorCategory?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly retryable?: boolean;
}

/** Appends one attempt row. Returns the new log id. */
export interface SubmissionLogWriter {
  record(entry: SubmissionLogEntry): Promise<string>;
}

// ════════════════════════════════════════════════════════════════════════════
// 4b) Submission projection — the READ MODEL (e.g. invoices.zatca_status).
//     Mirrors S5.1/S5.2: the log is the TRUTH; this is a derived view written
//     AFTER the log, best-effort. A failure here is NON-fatal and recoverable by
//     replaying from zatca_submission_log — the log IS the event source, so no
//     separate outbox is needed (unlike signing, whose truth is the chain).
//     The coordinator sequences (log → project) but never OWNS this read model.
// ════════════════════════════════════════════════════════════════════════════

export interface SubmissionProjection {
  readonly companyId: string;
  readonly documentType: ArtifactDocumentType;
  readonly documentId: string;
  readonly icv: number;
  readonly validationStatus?: string;
  readonly clearanceStatus?: string;
  readonly reportingStatus?: string;
  readonly submissionLogId: string;
}

export interface SubmissionProjectionWriter {
  project(projection: SubmissionProjection): Promise<void>;
}

// ════════════════════════════════════════════════════════════════════════════
// 5) Coordinator — sequences the four authorities.
// ════════════════════════════════════════════════════════════════════════════

export interface SubmitDocumentInput {
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly credentialType: CredentialType;
  readonly documentType: DocumentType;
  readonly documentId: string;
  /** Which ZATCA flow. Sprint A sandbox: 'compliance'. */
  readonly target: ComplianceTarget;
  /** Caller's retry policy supplies this; defaults to 1. */
  readonly attemptNumber?: number;
}

/**
 * The FACTS of a completed submission round-trip — never an interpretation.
 * Transport/auth failures THROW (never reach here), so a returned result always
 * means "ZATCA responded and the attempt was logged". `accepted` is DERIVED from
 * these facts (see isAccepted) — so new ZATCA states (HTTP 202 queued, a future
 * endpoint, a status we don't model yet) need NO new result variant; they simply
 * carry through httpStatus / validationStatus and let the derivation decide.
 */
export interface SubmitDocumentResult {
  readonly httpStatus: number;
  /** ZATCA validationResults.status — 'PASS' | 'WARNING' | 'ERROR' | undefined. */
  readonly validationStatus?: string;
  /** Standard (B2B) clearance disposition, when present. */
  readonly clearanceStatus?: string;
  /** Simplified (B2C) reporting disposition, when present. */
  readonly reportingStatus?: string;
  readonly warnings: ValidationMessage[];
  readonly errors: ValidationMessage[];
  /** Base64 cleared invoice (clearance only) — passthrough for future storage. */
  readonly clearedInvoiceBase64?: string;
  readonly submissionLogId: string;
}

/**
 * Derived classification — a convenience over the facts above, NOT an authority.
 * Accepted ⇔ no validation errors AND a PASS/WARNING status. Anything else
 * (ERROR, queued, unknown) is not accepted. Consumers needing finer grain read
 * the fields directly.
 */
export function isAccepted(r: SubmitDocumentResult): boolean {
  return (
    r.errors.length === 0 &&
    (r.validationStatus === 'PASS' || r.validationStatus === 'WARNING')
  );
}

/**
 * SubmissionCoordinator.
 *
 * MUST:
 * 1. Resolve credentialId, then read its API credential from the Vault.
 * 2. Read the committed signed document (chain ⋈ artifact) by identity.
 * 3. Submit via the HTTP client. Transport/auth failures are recorded as a
 *    failed attempt, THEN re-thrown (infrastructure is never a business result).
 * 4. Record EXACTLY ONE submission_log row (the TRUTH) for the attempt — whether
 *    ZATCA passed, warned, or rejected.
 * 5. Project to the invoices read-model AFTER the log write, best-effort:
 *    a projection failure is NON-fatal (the log stands; replay reconciles it).
 *    The coordinator never owns the read model — it calls the writer.
 * 6. Return the FACTS (SubmitDocumentResult). accepted/rejected is DERIVED.
 */
export interface SubmissionCoordinator {
  readonly implementationName: string;
  submit(input: SubmitDocumentInput): Promise<SubmitDocumentResult>;
}

export type SubmissionCoordinatorFactory = () => SubmissionCoordinator;
