/**
 * PcsidEnrollmentClient — the Production-CSID enrollment AUTHORITY (contract).
 *
 * The final credential-lifecycle step: exchange a Compliance CSID (CCSID) for a
 * Production CSID (PCSID). Sibling of CcsidEnrollmentClient, but with a different
 * authentication and body:
 *   - auth: HTTP Basic with the CCSID's binarySecurityToken:secret
 *     (NOT the OTP header that CCSID enrollment used),
 *   - body: { compliance_request_id } — the requestId returned by CCSID enrollment.
 *
 * ZATCA protocol (POST <base>/production/csids):
 *   headers: Authorization: Basic base64(bst:secret), Accept-Version: V2,
 *            Content-Type/Accept: application/json
 *   body:    { "compliance_request_id": <ccsid requestId> }
 *   200:     { requestID, binarySecurityToken, secret, ... }  ← the PRODUCTION
 *            credential (a NEW token + secret that replace the CCSID for signing).
 *
 * IMPORTANT (per ZATCA's Developer Portal manual): the PCSID request returns an
 * invalid response until the compliance checks (sample-invoice submissions) have
 * been completed between CCSID issuance and this call. Those checks are a separate
 * step, orchestrated above this client — not this authority's concern.
 *
 * Bound to an environment at construction (the environment decides the endpoint).
 * A protocol failure is an EXCEPTION; raw JSON never surfaces above this client.
 */

export interface PcsidEnrollmentInput {
  /** The CCSID's requestId (from CcsidEnrollmentClient) → compliance_request_id. */
  readonly complianceRequestId: string;
  /** The CCSID's binarySecurityToken — used for HTTP Basic auth. */
  readonly binarySecurityToken: string;
  /** The CCSID's secret — used for HTTP Basic auth. */
  readonly secret: string;
}

export interface PcsidEnrollmentResult {
  /** The PRODUCTION certificate (base64). Replaces certificate.pem. */
  readonly binarySecurityToken: string;
  /** The PRODUCTION secret. Replaces compliance.json's secret. */
  readonly secret: string;
}

export type PcsidEnrollmentErrorCode =
  | 'UNAUTHORIZED'
  | 'COMPLIANCE_NOT_COMPLETED'
  | 'ENROLLMENT_REJECTED'
  | 'TRANSPORT_ERROR'
  | 'MALFORMED_RESPONSE';

export class PcsidEnrollmentError extends Error {
  constructor(
    readonly code: PcsidEnrollmentErrorCode,
    message: string,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PcsidEnrollmentError';
  }
}

export interface PcsidEnrollmentClient {
  readonly implementationName: string;
  enroll(input: PcsidEnrollmentInput): Promise<PcsidEnrollmentResult>;
}
