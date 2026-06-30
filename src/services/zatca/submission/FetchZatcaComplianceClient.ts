/**
 * FetchZatcaComplianceClient — ZATCA HTTP *protocol adapter*.
 *
 * NOT a business client. Its ONE job: map the ZATCA HTTP protocol ⇄ the internal
 * ComplianceResponse contract. No policy, no retry, no business meaning. The
 * coordinator interprets; this adapter only transmits and normalizes.
 *
 * Boundary rules (S5.3 contract — the most important decision lives here):
 *   - Transport/auth failures (network error, 401/403 auth, 5xx server) THROW a
 *     ZatcaTransportError. Infrastructure is NEVER a business outcome.
 *   - A response carrying a ZATCA `validationResults` body — even status 'ERROR',
 *     even a 4xx rejection — is RETURNED as a ComplianceResponse. That is a
 *     business outcome for the coordinator to classify, not a transport failure.
 *
 * fetch is INJECTED (FetchLike = typeof fetch): zero HTTP dependencies; identical
 * in Browser / Node 18+ / Vitest. Tests inject a fake — no library mocking.
 *
 * Response shape pinned to a real sandbox 200 (status:PASS, clearanceStatus:CLEARED).
 */

import type {
  ZatcaComplianceClient,
  ComplianceRequest,
  ComplianceResponse,
  ComplianceTarget,
  SubmissionApiCredential,
  ValidationMessage,
} from './SubmissionCoordinator';
import type { ZatcaEnvironment } from '../credential/CredentialResolver';

export type FetchLike = typeof fetch;

/** Transport/auth failure — distinct from a business (validation) rejection. */
export class ZatcaTransportError extends Error {
  constructor(
    message: string,
    readonly detail?: { httpStatus?: number; body?: unknown; cause?: unknown }
  ) {
    super(message);
    this.name = 'ZatcaTransportError';
  }
}

const BASE_URL: Record<ZatcaEnvironment, string> = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

/** Path per target. Only `compliance` is byte-verified (sandbox 200 CLEARED). */
const PATH: Record<ComplianceTarget, string> = {
  compliance: '/compliance/invoices',
  reporting: '/invoices/reporting/single',
  clearance: '/invoices/clearance/single',
};

/** Base64 that works in Browser (btoa) and Node (Buffer). Auth string is ASCII. */
function toBase64(s: string): string {
  if (typeof btoa === 'function') return btoa(s);
  return Buffer.from(s, 'utf-8').toString('base64');
}

function asMessages(raw: unknown): ValidationMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
    return {
      type: str(o.type),
      code: str(o.code),
      category: str(o.category),
      message: str(o.message),
      status: str(o.status),
    };
  });
}

export class FetchZatcaComplianceClient implements ZatcaComplianceClient {
  constructor(private readonly fetchImpl: FetchLike) {}

  async submit(
    target: ComplianceTarget,
    environment: ZatcaEnvironment,
    request: ComplianceRequest,
    auth: SubmissionApiCredential
  ): Promise<ComplianceResponse> {
    const url = BASE_URL[environment] + PATH[target];
    const authHeader =
      'Basic ' + toBase64(`${auth.binarySecurityToken}:${auth.secret}`);
    const body = JSON.stringify({
      invoiceHash: request.invoiceHash,
      uuid: request.uuid,
      invoice: request.invoiceBase64,
    });

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept-Version': 'V2',
          'Accept-Language': 'en',
          Authorization: authHeader,
        },
        body,
      });
    } catch (cause) {
      throw new ZatcaTransportError(
        `ZATCA transport failure: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause }
      );
    }

    const httpStatus = res.status;
    const text = await res.text();
    let parsed: unknown;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined; // non-JSON body (gateway HTML, plain text, …)
      }
    }

    // Auth / server failures are TRANSPORT — never business outcomes.
    if (httpStatus === 401 || httpStatus === 403) {
      throw new ZatcaTransportError(`ZATCA auth rejected (HTTP ${httpStatus})`, {
        httpStatus,
        body: parsed ?? text,
      });
    }
    if (httpStatus >= 500) {
      throw new ZatcaTransportError(`ZATCA server error (HTTP ${httpStatus})`, {
        httpStatus,
        body: parsed ?? text,
      });
    }

    const vr = (parsed as { validationResults?: Record<string, unknown> })
      ?.validationResults;

    // No ZATCA body AND a non-2xx → unexpected transport-class failure.
    if (!vr && (httpStatus < 200 || httpStatus >= 300)) {
      throw new ZatcaTransportError(
        `ZATCA unexpected response (HTTP ${httpStatus})`,
        { httpStatus, body: parsed ?? text }
      );
    }

    const root = (parsed ?? {}) as Record<string, unknown>;
    return {
      httpStatus,
      validationStatus: typeof vr?.status === 'string' ? vr.status : undefined,
      infoMessages: asMessages(vr?.infoMessages),
      warningMessages: asMessages(vr?.warningMessages),
      errorMessages: asMessages(vr?.errorMessages),
      clearanceStatus:
        (root.clearanceStatus as string | null | undefined) ?? null,
      reportingStatus:
        (root.reportingStatus as string | null | undefined) ?? null,
      raw: parsed ?? text,
    };
  }
}
