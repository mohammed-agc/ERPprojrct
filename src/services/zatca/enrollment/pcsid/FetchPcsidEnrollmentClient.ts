/**
 * FetchPcsidEnrollmentClient — the fetch-backed PcsidEnrollmentClient.
 *
 * Sibling of FetchCcsidEnrollmentClient, differing only in auth + body:
 *   - auth: HTTP Basic base64(binarySecurityToken:secret) from the CCSID,
 *   - body: { compliance_request_id: <ccsid requestId> }.
 *
 * Resolves its endpoint via EnvironmentEndpointResolver (POST <base>/production/
 * csids), validates the protocol, and maps the response to
 * PcsidEnrollmentResult. Raw JSON never escapes this client. fetch is injected.
 */

import type { ZatcaEnvironment } from '../../credential/CredentialResolver';
import {
  PcsidEnrollmentError,
  type PcsidEnrollmentClient,
  type PcsidEnrollmentInput,
  type PcsidEnrollmentResult,
} from './PcsidEnrollmentClient';
import type { EnvironmentEndpointResolver } from '../EnvironmentEndpointResolver';

/** Minimal fetch shape (matches global fetch). */
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

export interface FetchPcsidEnrollmentClientConfig {
  readonly environment: ZatcaEnvironment;
  readonly endpointResolver: EnvironmentEndpointResolver;
  readonly fetchImpl?: FetchLike;
}

export class FetchPcsidEnrollmentClient implements PcsidEnrollmentClient {
  readonly implementationName = 'FetchPcsidEnrollmentClient';
  private readonly environment: ZatcaEnvironment;
  private readonly endpointResolver: EnvironmentEndpointResolver;
  private readonly fetchImpl: FetchLike;

  constructor(config: FetchPcsidEnrollmentClientConfig) {
    this.environment = config.environment;
    this.endpointResolver = config.endpointResolver;
    this.fetchImpl = config.fetchImpl ?? (fetch as unknown as FetchLike);
  }

  async enroll(input: PcsidEnrollmentInput): Promise<PcsidEnrollmentResult> {
    const url = `${this.endpointResolver.baseUrl(this.environment)}/production/csids`;

    const basic = this.toBase64(
      `${input.binarySecurityToken}:${input.secret}`
    );

    let response: { ok: boolean; status: number; text(): Promise<string> };
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Version': 'V2',
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify({
          compliance_request_id: input.complianceRequestId,
        }),
      });
    } catch (e) {
      throw new PcsidEnrollmentError(
        'TRANSPORT_ERROR',
        `network failure calling ${url}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { url }
      );
    }

    const raw = await response.text();

    if (response.status === 401 || response.status === 403) {
      throw new PcsidEnrollmentError(
        'UNAUTHORIZED',
        `ZATCA rejected the CCSID credentials (HTTP ${response.status})`,
        { status: response.status, body: raw.slice(0, 500) }
      );
    }

    // A PCSID request before the compliance checks pass returns a non-2xx /
    // invalid response (per the ZATCA developer portal manual).
    if (!response.ok) {
      const code =
        response.status === 400
          ? 'COMPLIANCE_NOT_COMPLETED'
          : 'ENROLLMENT_REJECTED';
      throw new PcsidEnrollmentError(
        code,
        `ZATCA production CSID request failed (HTTP ${response.status}). ` +
          'Ensure the compliance checks were completed for this CCSID.',
        { status: response.status, body: raw.slice(0, 500) }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new PcsidEnrollmentError(
        'MALFORMED_RESPONSE',
        'ZATCA production CSID response is not valid JSON',
        { body: raw.slice(0, 500) }
      );
    }

    const binarySecurityToken = this.readString(body, 'binarySecurityToken');
    const secret = this.readString(body, 'secret');

    return { binarySecurityToken, secret };
  }

  private readString(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw new PcsidEnrollmentError(
        'MALFORMED_RESPONSE',
        `ZATCA production CSID response missing "${key}"`,
        { key }
      );
    }
    return value;
  }

  /** Base64 that works in both Node and the browser/jsdom. */
  private toBase64(s: string): string {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(s, 'utf-8').toString('base64');
    }
    // eslint-disable-next-line no-undef
    return btoa(s);
  }
}

export function createPcsidEnrollmentClient(
  config: FetchPcsidEnrollmentClientConfig
): PcsidEnrollmentClient {
  return new FetchPcsidEnrollmentClient(config);
}
