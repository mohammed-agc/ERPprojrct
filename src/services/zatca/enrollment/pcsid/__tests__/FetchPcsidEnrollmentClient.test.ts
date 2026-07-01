// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { FetchPcsidEnrollmentClient, type FetchLike } from '../FetchPcsidEnrollmentClient';
import { PcsidEnrollmentError } from '../PcsidEnrollmentClient';
import { DefaultEnvironmentEndpointResolver } from '../../EnvironmentEndpointResolver';

const resolver = new DefaultEnvironmentEndpointResolver();

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function fakeFetch(
  response: { ok: boolean; status: number; body: string },
  captured?: Captured[]
): FetchLike {
  return async (url, init) => {
    captured?.push({
      url,
      method: init.method,
      headers: init.headers,
      body: init.body,
    });
    return {
      ok: response.ok,
      status: response.status,
      text: async () => response.body,
    };
  };
}

const PROD_BODY = JSON.stringify({
  requestID: 9999999999,
  dispositionMessage: 'ISSUED',
  binarySecurityToken: 'PROD-TOKEN-base64',
  secret: 'prod-secret-value',
});

const INPUT = {
  complianceRequestId: '1234567890123',
  binarySecurityToken: 'CCSID-TOKEN',
  secret: 'ccsid-secret',
};

describe('FetchPcsidEnrollmentClient — success', () => {
  it('maps the response to the production { binarySecurityToken, secret }', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: PROD_BODY }),
    });
    const r = await client.enroll(INPUT);
    expect(r.binarySecurityToken).toBe('PROD-TOKEN-base64');
    expect(r.secret).toBe('prod-secret-value');
    expect(Object.keys(r).sort()).toEqual(['binarySecurityToken', 'secret']);
  });
});

describe('FetchPcsidEnrollmentClient — request shape', () => {
  it('POSTs to <base>/production/csids with Basic auth and compliance_request_id', async () => {
    const captured: Captured[] = [];
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: PROD_BODY }, captured),
    });
    await client.enroll(INPUT);

    const req = captured[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/production/csids'
    );
    expect(req.headers['Accept-Version']).toBe('V2');
    expect(JSON.parse(req.body)).toEqual({
      compliance_request_id: '1234567890123',
    });
  });

  it('builds Basic auth as base64(binarySecurityToken:secret) from the CCSID', async () => {
    const captured: Captured[] = [];
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: PROD_BODY }, captured),
    });
    await client.enroll(INPUT);

    const auth = captured[0].headers['Authorization'];
    expect(auth.startsWith('Basic ')).toBe(true);
    const decoded = atob(auth.slice('Basic '.length));
    expect(decoded).toBe('CCSID-TOKEN:ccsid-secret');
  });

  it('uses the production base URL when environment is production', async () => {
    const captured: Captured[] = [];
    const client = new FetchPcsidEnrollmentClient({
      environment: 'production',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: PROD_BODY }, captured),
    });
    await client.enroll(INPUT);
    expect(captured[0].url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/core/production/csids'
    );
  });
});

describe('FetchPcsidEnrollmentClient — protocol failures throw', () => {
  it('throws UNAUTHORIZED on HTTP 401', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 401, body: 'nope' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED on HTTP 403', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 403, body: 'forbidden' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws COMPLIANCE_NOT_COMPLETED on HTTP 400', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 400, body: 'checks not done' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'COMPLIANCE_NOT_COMPLETED',
    });
  });

  it('throws ENROLLMENT_REJECTED on HTTP 500', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 500, body: 'server error' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'ENROLLMENT_REJECTED',
    });
  });

  it('throws MALFORMED_RESPONSE on non-JSON', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: 'not json' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws MALFORMED_RESPONSE when secret is missing', async () => {
    const body = JSON.stringify({ binarySecurityToken: 'x' });
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws TRANSPORT_ERROR when fetch rejects', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: async () => {
        throw new Error('ECONNRESET');
      },
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'TRANSPORT_ERROR',
    });
  });

  it('the thrown error is a PcsidEnrollmentError', async () => {
    const client = new FetchPcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 401, body: '' }),
    });
    await expect(client.enroll(INPUT)).rejects.toBeInstanceOf(
      PcsidEnrollmentError
    );
  });
});
