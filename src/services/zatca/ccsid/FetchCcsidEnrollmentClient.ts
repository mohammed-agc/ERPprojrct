/**
 * FetchCcsidEnrollmentClient — the fetch-backed CcsidEnrollmentClient.
 *
 * Bound to an environment; resolves its endpoint via EnvironmentEndpointResolver
 * (no hardcoded URL). Performs POST <base>/compliance with the OTP header and the
 * CSR body, validates the ZATCA protocol, and maps the response to
 * EnrollmentResult. Raw JSON and dispositionMessage never escape this client.
 *
 * fetch is INJECTED (defaults to global fetch) — same posture as
 * FetchZatcaComplianceClient — so it is unit-testable with a fake fetch.
 */

import type { ZatcaEnvironment } from '../credential/CredentialResolver';
import {
  CcsidEnrollmentError,
  type CcsidEnrollmentClient,
  type CcsidEnrollmentInput,
  type EnrollmentResult,
} from './CcsidEnrollmentClient';
import type { EnvironmentEndpointResolver } from './EnvironmentEndpointResolver';

/** Minimal fetch shape this client needs (matches global fetch). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export interface FetchCcsidEnrollmentClientConfig {
  readonly environment: ZatcaEnvironment;
  readonly endpointResolver: EnvironmentEndpointResolver;
  readonly fetchImpl?: FetchLike;
}

export class FetchCcsidEnrollmentClient implements CcsidEnrollmentClient {
  readonly implementationName = 'FetchCcsidEnrollmentClient';
  private readonly environment: ZatcaEnvironment;
  private readonly endpointResolver: EnvironmentEndpointResolver;
  private readonly fetchImpl: FetchLike;

  constructor(config: FetchCcsidEnrollmentClientConfig) {
    this.environment = config.environment;
    this.endpointResolver = config.endpointResolver;
    this.fetchImpl = config.fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async enroll(input: CcsidEnrollmentInput): Promise<EnrollmentResult> {
    const url = `${this.endpointResolver.baseUrl(this.environment)}/compliance`;

    let response: { ok: boolean; status: number; text(): Promise<string> };
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          OTP: input.otp,
        },
        body: JSON.stringify({ csr: input.csrBase64 }),
      });
    } catch (e) {
      throw new CcsidEnrollmentError(
        'TRANSPORT_ERROR',
        `network failure calling ${url}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { url }
      );
    }

    const raw = await response.text();

    // ZATCA returns 400/401 for a bad/expired OTP.
    if (response.status === 400 || response.status === 401) {
      throw new CcsidEnrollmentError(
        'INVALID_OTP',
        `ZATCA rejected the OTP (HTTP ${response.status}). OTPs expire after ~1 hour.`,
        { status: response.status, body: raw.slice(0, 500) }
      );
    }

    if (!response.ok) {
      throw new CcsidEnrollmentError(
        'ENROLLMENT_REJECTED',
        `ZATCA compliance enrollment failed (HTTP ${response.status})`,
        { status: response.status, body: raw.slice(0, 500) }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new CcsidEnrollmentError(
        'MALFORMED_RESPONSE',
        'ZATCA compliance response is not valid JSON',
        { body: raw.slice(0, 500) }
      );
    }

    const disposition = body.dispositionMessage;
    if (disposition !== 'ISSUED') {
      throw new CcsidEnrollmentError(
        'ENROLLMENT_REJECTED',
        `ZATCA did not issue a CCSID (dispositionMessage="${String(
          disposition
        )}")`,
        { dispositionMessage: disposition }
      );
    }

    const requestId = this.readString(body, 'requestID');
    const binarySecurityToken = this.readString(body, 'binarySecurityToken');
    const secret = this.readString(body, 'secret');

    return { requestId, binarySecurityToken, secret };
  }

  private readString(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    // requestID may arrive as a number; coerce, then validate non-empty.
    const str =
      typeof value === 'number' ? String(value) : (value as unknown);
    if (typeof str !== 'string' || str.length === 0) {
      throw new CcsidEnrollmentError(
        'MALFORMED_RESPONSE',
        `ZATCA compliance response missing "${key}"`,
        { key }
      );
    }
    return str;
  }
}

export function createCcsidEnrollmentClient(
  config: FetchCcsidEnrollmentClientConfig
): CcsidEnrollmentClient {
  return new FetchCcsidEnrollmentClient(config);
}
