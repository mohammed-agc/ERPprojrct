/**
 * CcsidEnrollmentClient — the Compliance-CSID enrollment AUTHORITY (contract).
 *
 * A credential-lifecycle authority, distinct from the operational
 * ZatcaComplianceClient (which submits signed documents). It performs ONE step:
 * exchange a CSR + OTP for a Compliance CSID.
 *
 * Bound to an environment at construction (the environment decides the endpoint,
 * via EnvironmentEndpointResolver) — per-call input carries only what belongs to
 * the enrollment itself: the CSR and the OTP.
 *
 * ZATCA protocol (POST <base>/compliance):
 *   headers: OTP: <otp>, Accept-Version: V2, Content-Type/Accept: application/json
 *   body:    { "csr": "<base64 CSR>" }
 *   200:     { requestID, dispositionMessage: "ISSUED", binarySecurityToken, secret }
 *
 * The implementation validates the protocol (ISSUED, fields present) and maps to
 * EnrollmentResult. A protocol failure is an EXCEPTION, never a domain result —
 * raw JSON and dispositionMessage never surface above this client.
 */

export interface CcsidEnrollmentInput {
  /** The CSR, base64 (PEM body, no header/footer). */
  readonly csrBase64: string;
  /** One-time password from the Fatoora portal (valid ~1 hour). */
  readonly otp: string;
}

export interface EnrollmentResult {
  /** ZATCA request id — required later to request the PCSID (4.4). */
  readonly requestId: string;
  /** The compliance certificate (base64). Persisted as certificate.pem. */
  readonly binarySecurityToken: string;
  /** The API secret paired with the token. Persisted in compliance.json. */
  readonly secret: string;
}

export type CcsidEnrollmentErrorCode =
  | 'INVALID_OTP'
  | 'ENROLLMENT_REJECTED'
  | 'TRANSPORT_ERROR'
  | 'MALFORMED_RESPONSE';

export class CcsidEnrollmentError extends Error {
  constructor(
    readonly code: CcsidEnrollmentErrorCode,
    message: string,
    readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'CcsidEnrollmentError';
  }
}

export interface CcsidEnrollmentClient {
  readonly implementationName: string;
  enroll(input: CcsidEnrollmentInput): Promise<EnrollmentResult>;
}
