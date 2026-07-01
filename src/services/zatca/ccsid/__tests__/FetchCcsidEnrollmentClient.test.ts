// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { FetchCcsidEnrollmentClient, type FetchLike } from '../FetchCcsidEnrollmentClient';
import { CcsidEnrollmentError } from '../CcsidEnrollmentClient';
import { DefaultEnvironmentEndpointResolver } from '../EnvironmentEndpointResolver';

const resolver = new DefaultEnvironmentEndpointResolver();

interface Captured {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A fake fetch that records the request and returns a scripted response. */
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

const ISSUED_BODY = JSON.stringify({
  requestType: 'Compliance CSID',
  requestID: 1234567890123,
  dispositionMessage: 'ISSUED',
  binarySecurityToken: 'TUlJQ...token',
  secret: 'super-secret-value',
});

const INPUT = { csrBase64: 'BASE64CSRBODY==', otp: '123456' };

describe('FetchCcsidEnrollmentClient — success', () => {
  it('maps an ISSUED response to { requestId, binarySecurityToken, secret }', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: ISSUED_BODY }),
    });
    const r = await client.enroll(INPUT);
    expect(r.requestId).toBe('1234567890123'); // number coerced to string
    expect(r.binarySecurityToken).toBe('TUlJQ...token');
    expect(r.secret).toBe('super-secret-value');
  });

  it('does NOT surface dispositionMessage or raw JSON', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: ISSUED_BODY }),
    });
    const r = await client.enroll(INPUT);
    expect(Object.keys(r).sort()).toEqual([
      'binarySecurityToken',
      'requestId',
      'secret',
    ]);
  });
});

describe('FetchCcsidEnrollmentClient — request shape', () => {
  it('POSTs to <base>/compliance with OTP header, V2, and the CSR body', async () => {
    const captured: Captured[] = [];
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: ISSUED_BODY }, captured),
    });
    await client.enroll(INPUT);

    const req = captured[0];
    expect(req.method).toBe('POST');
    expect(req.url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance'
    );
    expect(req.headers['OTP']).toBe('123456');
    expect(req.headers['Accept-Version']).toBe('V2');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(req.body)).toEqual({ csr: 'BASE64CSRBODY==' });
  });

  it('uses the simulation base URL when environment is simulation', async () => {
    const captured: Captured[] = [];
    const client = new FetchCcsidEnrollmentClient({
      environment: 'simulation',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: ISSUED_BODY }, captured),
    });
    await client.enroll(INPUT);
    expect(captured[0].url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation/compliance'
    );
  });
});

describe('FetchCcsidEnrollmentClient — protocol failures throw', () => {
  it('throws INVALID_OTP on HTTP 401', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 401, body: 'unauthorized' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'INVALID_OTP',
    });
  });

  it('throws INVALID_OTP on HTTP 400', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 400, body: 'bad request' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'INVALID_OTP',
    });
  });

  it('throws ENROLLMENT_REJECTED on HTTP 500', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 500, body: 'server error' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'ENROLLMENT_REJECTED',
    });
  });

  it('throws ENROLLMENT_REJECTED when dispositionMessage is not ISSUED', async () => {
    const body = JSON.stringify({
      requestID: 1,
      dispositionMessage: 'NOT_ISSUED',
      binarySecurityToken: 'x',
      secret: 'y',
    });
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'ENROLLMENT_REJECTED',
    });
  });

  it('throws MALFORMED_RESPONSE on non-JSON', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body: '<html>oops</html>' }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws MALFORMED_RESPONSE when a field is missing', async () => {
    const body = JSON.stringify({
      requestID: 1,
      dispositionMessage: 'ISSUED',
      binarySecurityToken: 'x',
      // secret missing
    });
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: true, status: 200, body }),
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'MALFORMED_RESPONSE',
    });
  });

  it('throws TRANSPORT_ERROR when fetch itself rejects', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    await expect(client.enroll(INPUT)).rejects.toMatchObject({
      code: 'TRANSPORT_ERROR',
    });
  });

  it('the thrown error is a CcsidEnrollmentError', async () => {
    const client = new FetchCcsidEnrollmentClient({
      environment: 'sandbox',
      endpointResolver: resolver,
      fetchImpl: fakeFetch({ ok: false, status: 401, body: '' }),
    });
    await expect(client.enroll(INPUT)).rejects.toBeInstanceOf(
      CcsidEnrollmentError
    );
  });
});
