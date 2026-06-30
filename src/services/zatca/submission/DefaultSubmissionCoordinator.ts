/**
 * DefaultSubmissionCoordinator — S5.3 sequencing.
 *
 *   resolve credentialId → getApiCredential(Vault) → read signed doc (chain⋈artifact)
 *     → submit(HTTP) → record submission_log (TRUTH) → project read-model (best-effort)
 *     → return FACTS
 *
 * Invariants (from the contract):
 *   - Transport/auth failures (ZatcaTransportError) are RECORDED as a failed
 *     attempt, then RE-THROWN. Infrastructure is never a business outcome.
 *   - A ZATCA business response (PASS/WARNING/ERROR) is RECORDED, projected, and
 *     RETURNED as facts. accepted/rejected is derived by the caller (isAccepted).
 *   - The submission_log write is the durable TRUTH and always happens (once per
 *     attempt). The projection is best-effort AFTER it — a projection failure is
 *     swallowed (recoverable by replaying the log), never masks the result.
 */

import type {
  SubmissionCoordinator,
  SubmitDocumentInput,
  SubmitDocumentResult,
  SubmissionCredentialProvider,
  SignedDocumentReader,
  ZatcaComplianceClient,
  SubmissionLogWriter,
  SubmissionProjectionWriter,
  ComplianceResponse,
  ComplianceTarget,
  SubmissionLogEntry,
} from './SubmissionCoordinator';
import type { DocumentType } from '../xmlBuilder.types';
import type { ArtifactDocumentType } from '../artifact/ArtifactStore';
import type { CredentialResolver } from '../credential/CredentialResolver';
import { ZatcaTransportError } from './FetchZatcaComplianceClient';

/** Same mapping the signing coordinator uses; owned here independently. */
const CHAIN_TYPE: Record<DocumentType, ArtifactDocumentType> = {
  tax_invoice: 'invoice',
  credit_note: 'credit_note',
};

/**
 * submission_type stored in the log is the DOCUMENT'S nature (clearance for
 * standard, reporting for simplified) — NOT the endpoint name. The `compliance`
 * gateway tests one or the other; the response reveals which. DB CHECK allows
 * only 'clearance' | 'reporting'.
 */
function deriveSubmissionType(
  target: ComplianceTarget,
  response?: ComplianceResponse
): 'clearance' | 'reporting' {
  if (target === 'reporting') return 'reporting';
  if (target === 'clearance') return 'clearance';
  // 'compliance' gateway — let the response decide; standard invoice → clearance.
  if (response?.reportingStatus) return 'reporting';
  return 'clearance';
}

/** Base64 of the raw signed XML (UTF-8). Browser + Node. */
function xmlToBase64(xml: string): string {
  if (typeof btoa === 'function') {
    // btoa needs a binary string; encode UTF-8 first.
    const utf8 = new TextEncoder().encode(xml);
    let bin = '';
    for (const b of utf8) bin += String.fromCharCode(b);
    return btoa(bin);
  }
  return Buffer.from(xml, 'utf-8').toString('base64');
}

export class DefaultSubmissionCoordinator implements SubmissionCoordinator {
  readonly implementationName = 'DefaultSubmissionCoordinator';

  constructor(
    private readonly credentials: CredentialResolver,
    private readonly apiCredentials: SubmissionCredentialProvider,
    private readonly reader: SignedDocumentReader,
    private readonly client: ZatcaComplianceClient,
    private readonly log: SubmissionLogWriter,
    private readonly projection: SubmissionProjectionWriter
  ) {}

  async submit(input: SubmitDocumentInput): Promise<SubmitDocumentResult> {
    const chainType = CHAIN_TYPE[input.documentType];
    const attemptNumber = input.attemptNumber ?? 1;

    // 1) Resolve the credential identity, then its API auth from the Vault.
    const resolved = await this.credentials.resolve(
      input.companyId,
      input.environment,
      input.credentialType
    );
    const auth = await this.apiCredentials.getApiCredential(
      resolved.credentialId
    );

    // 2) Read the committed signed document (chain ⋈ artifact).
    const doc = await this.reader.read(
      input.environment,
      chainType,
      input.documentId
    );

    // Common log fields for whichever outcome follows.
    const base = {
      companyId: input.companyId,
      documentType: chainType,
      documentId: input.documentId,
      icv: doc.icv,
      zatcaInvoiceUuid: doc.uuid,
      credentialId: resolved.credentialId,
      xmlHash: doc.artifactHash,
      attemptNumber,
    } satisfies Partial<SubmissionLogEntry>;

    // 3) Submit. Transport/auth failures: record a failed attempt, then re-throw.
    let response: ComplianceResponse;
    try {
      response = await this.client.submit(
        input.target,
        input.environment,
        {
          invoiceHash: doc.artifactHash,
          uuid: doc.uuid,
          invoiceBase64: xmlToBase64(doc.signedXml),
        },
        auth
      );
    } catch (err) {
      const transport = err instanceof ZatcaTransportError;
      await this.log.record({
        ...base,
        submissionType: deriveSubmissionType(input.target),
        success: false,
        errorCategory: transport ? 'TRANSPORT' : 'UNKNOWN',
        errorCode: transport ? 'TRANSPORT_FAILURE' : 'UNEXPECTED',
        errorMessage: err instanceof Error ? err.message : String(err),
        retryable: true,
        httpStatus:
          transport && typeof (err.detail?.httpStatus) === 'number'
            ? err.detail.httpStatus
            : undefined,
      });
      throw err;
    }

    // 4) Business outcome — record the TRUTH (exactly one row).
    const hasErrors = response.errorMessages.length > 0;
    const success =
      !hasErrors &&
      (response.validationStatus === 'PASS' ||
        response.validationStatus === 'WARNING');
    const zatcaResponseCode =
      response.clearanceStatus ?? response.reportingStatus ?? undefined;

    const submissionLogId = await this.log.record({
      ...base,
      submissionType: deriveSubmissionType(input.target, response),
      success,
      httpStatus: response.httpStatus,
      zatcaStatus: response.validationStatus,
      zatcaResponseCode: zatcaResponseCode ?? undefined,
      responseDescription: hasErrors
        ? response.errorMessages[0]?.message
        : response.infoMessages[0]?.message,
      responseJson: response.raw,
      errorCategory: hasErrors ? 'VALIDATION' : undefined,
      errorCode: hasErrors ? response.errorMessages[0]?.code : undefined,
      errorMessage: hasErrors ? response.errorMessages[0]?.message : undefined,
      retryable: hasErrors ? false : undefined,
    });

    // 5) Project the read-model AFTER the log — best-effort, never fatal.
    try {
      await this.projection.project({
        companyId: input.companyId,
        documentType: chainType,
        documentId: input.documentId,
        icv: doc.icv,
        validationStatus: response.validationStatus,
        clearanceStatus: response.clearanceStatus ?? undefined,
        reportingStatus: response.reportingStatus ?? undefined,
        submissionLogId,
      });
    } catch (projErr) {
      // Recoverable by replaying the latest submission_log row. Do not mask the
      // committed truth or the returned facts.
      // eslint-disable-next-line no-console
      console.error(
        'DefaultSubmissionCoordinator: projection failed (recoverable from log)',
        projErr
      );
    }

    // 6) Return the FACTS.
    return {
      httpStatus: response.httpStatus,
      validationStatus: response.validationStatus,
      clearanceStatus: response.clearanceStatus ?? undefined,
      reportingStatus: response.reportingStatus ?? undefined,
      warnings: response.warningMessages,
      errors: response.errorMessages,
      clearedInvoiceBase64: response.clearedInvoiceBase64,
      submissionLogId,
    };
  }
}
