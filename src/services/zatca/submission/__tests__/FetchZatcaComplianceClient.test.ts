import { describe, it, expect, vi } from 'vitest';
import {
  FetchZatcaComplianceClient,
  ZatcaTransportError,
  type FetchLike,
} from '../FetchZatcaComplianceClient';

const REQ = { invoiceHash: 'h', uuid: 'u', invoiceBase64: 'b' };
const AUTH = { binarySecurityToken: 'BST', secret: 'SEC' };

/** A fake fetch that resolves one Response. */
function fetchReturning(status: number, body: string): FetchLike {
  return vi
    .fn()
    .mockResolvedValue(new Response(body, { status })) as unknown as FetchLike;
}

// The exact body a real ZATCA sandbox 200 returned (CLEARED).
const CLEARED_BODY = JSON.stringify({
  validationResults: {
    infoMessages: [
      {
        type: 'INFO',
        code: 'XSD_ZATCA_VALID',
        category: 'XSD validation',
        message: 'Complied with UBL 2.1 standards in line with ZATCA specifications',
        status: 'PASS',
      },
    ],
    warningMessages: [],
    errorMessages: [],
    status: 'PASS',
  },
  reportingStatus: null,
  clearanceStatus: 'CLEARED',
  qrSellertStatus: null,
  qrBuyertStatus: null,
});

describe('FetchZatcaComplianceClient — ZATCA protocol adapter', () => {
  it('maps a real CLEARED 200 into a ComplianceResponse', async () => {
    const client = new FetchZatcaComplianceClient(fetchReturning(200, CLEARED_BODY));
    const r = await client.submit('compliance', 'sandbox', REQ, AUTH);

    expect(r.httpStatus).toBe(200);
    expect(r.validationStatus).toBe('PASS');
    expect(r.clearanceStatus).toBe('CLEARED');
    expect(r.reportingStatus).toBeNull();
    expect(r.errorMessages).toHaveLength(0);
    expect(r.warningMessages).toHaveLength(0);
    expect(r.infoMessages).toHaveLength(1);
    expect(r.infoMessages[0].code).toBe('XSD_ZATCA_VALID');
    // raw preserves ZATCA's verbatim body (incl. their misspelled qr fields).
    expect(r.raw).toMatchObject({ clearanceStatus: 'CLEARED', qrSellertStatus: null });
  });

  it('RETURNS (does not throw) on HTTP 200 with validationStatus ERROR — a business outcome', async () => {
    const body = JSON.stringify({
      validationResults: {
        infoMessages: [],
        warningMessages: [],
        errorMessages: [{ type: 'ERROR', code: 'BR-KSA-XX', message: 'bad', status: 'ERROR' }],
        status: 'ERROR',
      },
      clearanceStatus: 'NOT_CLEARED',
      reportingStatus: null,
    });
    const client = new FetchZatcaComplianceClient(fetchReturning(200, body));
    const r = await client.submit('compliance', 'sandbox', REQ, AUTH);

    expect(r.httpStatus).toBe(200);
    expect(r.validationStatus).toBe('ERROR');
    expect(r.errorMessages).toHaveLength(1);
    expect(r.errorMessages[0].code).toBe('BR-KSA-XX');
    expect(r.clearanceStatus).toBe('NOT_CLEARED');
  });

  it('RETURNS a business rejection even on 4xx when a validationResults body is present', async () => {
    const body = JSON.stringify({
      validationResults: { errorMessages: [{ code: 'X' }], status: 'ERROR' },
    });
    const client = new FetchZatcaComplianceClient(fetchReturning(400, body));
    const r = await client.submit('compliance', 'sandbox', REQ, AUTH);

    expect(r.httpStatus).toBe(400);
    expect(r.validationStatus).toBe('ERROR');
    expect(r.errorMessages).toHaveLength(1);
  });

  it('THROWS ZatcaTransportError on 401 (auth — not a business outcome)', async () => {
    const client = new FetchZatcaComplianceClient(
      fetchReturning(401, '{"message":"unauthorized"}')
    );
    await expect(
      client.submit('compliance', 'sandbox', REQ, AUTH)
    ).rejects.toBeInstanceOf(ZatcaTransportError);
  });

  it('THROWS ZatcaTransportError on 5xx (server transport)', async () => {
    const client = new FetchZatcaComplianceClient(
      fetchReturning(503, 'Service Unavailable')
    );
    await expect(
      client.submit('compliance', 'sandbox', REQ, AUTH)
    ).rejects.toBeInstanceOf(ZatcaTransportError);
  });

  it('THROWS ZatcaTransportError when fetch itself rejects (network)', async () => {
    const f = vi
      .fn()
      .mockRejectedValue(new Error('ECONNRESET')) as unknown as FetchLike;
    const client = new FetchZatcaComplianceClient(f);
    await expect(
      client.submit('compliance', 'sandbox', REQ, AUTH)
    ).rejects.toBeInstanceOf(ZatcaTransportError);
  });

  it('THROWS on a non-2xx with no ZATCA body (e.g. gateway HTML)', async () => {
    const client = new FetchZatcaComplianceClient(
      fetchReturning(404, '<html>Not Found</html>')
    );
    await expect(
      client.submit('compliance', 'sandbox', REQ, AUTH)
    ).rejects.toBeInstanceOf(ZatcaTransportError);
  });

  it('posts Basic auth + correct URL + payload to the sandbox compliance endpoint', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(new Response('{"validationResults":{"status":"PASS"}}', { status: 200 }));
    const client = new FetchZatcaComplianceClient(f as unknown as FetchLike);
    await client.submit('compliance', 'sandbox', REQ, AUTH);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal/compliance/invoices'
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Basic ' + btoa('BST:SEC'));
    expect(headers['Accept-Version']).toBe('V2');
    expect(JSON.parse(init.body as string)).toEqual({
      invoiceHash: 'h',
      uuid: 'u',
      invoice: 'b',
    });
  });
});
