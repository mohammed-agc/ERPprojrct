// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  SupabaseCredentialDiagnostics,
  SupabaseCertificateDiagnostics,
  SupabaseDatabaseDiagnostics,
  SupabaseOutboxDiagnostics,
} from '../SupabaseOperationalDiagnostics';
import type { OperationalScope } from '../OperationalDiagnostics';

const SCOPE: OperationalScope = {
  companyId: 'company-1',
  environment: 'sandbox',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const isoInDays = (d: number) => new Date(Date.now() + d * DAY_MS).toISOString();

/* ---- a chainable query stub that resolves to a fixed payload ------------- */

/**
 * Builds a fake supabase client whose .from(...).select(...).eq(...)... chain
 * is fully chainable and finally awaitable / terminal-callable with `resolved`.
 * Terminal forms covered: maybeSingle(), and awaiting the builder directly,
 * and head-count selects (which resolve on the select call's thenable).
 */
function fakeClient(resolved: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const m of ['eq', 'is', 'order', 'limit']) {
    builder[m] = vi.fn(chain);
  }
  builder.select = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => resolved);
  // make the builder awaitable (for queries without a terminal method)
  builder.then = (onF: (v: unknown) => unknown) => Promise.resolve(resolved).then(onF);
  const client = { from: vi.fn(() => builder) };
  return { client, builder };
}

/* ------------------------------ credential -------------------------------- */

describe('SupabaseCredentialDiagnostics', () => {
  it('no active credential → none', async () => {
    const { client } = fakeClient({ data: [], error: null });
    const r = await new SupabaseCredentialDiagnostics(client as never).check(SCOPE);
    expect(r).toEqual({ status: 'none', activeCount: 0 });
  });

  it('exactly one → active (with type)', async () => {
    const { client } = fakeClient({ data: [{ credential_type: 'CCSID' }], error: null });
    const r = await new SupabaseCredentialDiagnostics(client as never).check(SCOPE);
    expect(r).toEqual({ status: 'active', activeCount: 1, credentialType: 'CCSID' });
  });

  it('more than one → multiple', async () => {
    const { client } = fakeClient({ data: [{}, {}], error: null });
    const r = await new SupabaseCredentialDiagnostics(client as never).check(SCOPE);
    expect(r).toEqual({ status: 'multiple', activeCount: 2 });
  });

  it('query error throws', async () => {
    const { client } = fakeClient({ data: null, error: { message: 'boom' } });
    await expect(
      new SupabaseCredentialDiagnostics(client as never).check(SCOPE)
    ).rejects.toThrow(/boom/);
  });
});

/* ------------------------------ certificate ------------------------------- */

describe('SupabaseCertificateDiagnostics', () => {
  it('expiry far out → valid', async () => {
    const { client } = fakeClient({ data: { certificate_expiry_at: isoInDays(200) }, error: null });
    const r = await new SupabaseCertificateDiagnostics(client as never).check(SCOPE, 30);
    expect(r.status).toBe('valid');
    expect(r.daysRemaining).toBeGreaterThan(30);
    expect(r.thresholdDays).toBe(30);
  });

  it('within threshold → expiring_soon', async () => {
    const { client } = fakeClient({ data: { certificate_expiry_at: isoInDays(10) }, error: null });
    const r = await new SupabaseCertificateDiagnostics(client as never).check(SCOPE, 30);
    expect(r.status).toBe('expiring_soon');
  });

  it('past expiry → expired (negative days)', async () => {
    const { client } = fakeClient({ data: { certificate_expiry_at: isoInDays(-5) }, error: null });
    const r = await new SupabaseCertificateDiagnostics(client as never).check(SCOPE, 30);
    expect(r.status).toBe('expired');
    expect(r.daysRemaining).toBeLessThan(0);
  });

  it('no credential → no_credential', async () => {
    const { client } = fakeClient({ data: null, error: null });
    const r = await new SupabaseCertificateDiagnostics(client as never).check(SCOPE, 30);
    expect(r).toEqual({ status: 'no_credential', thresholdDays: 30 });
  });
});

/* ------------------------------- database --------------------------------- */

describe('SupabaseDatabaseDiagnostics', () => {
  it('select ok → reachable', async () => {
    const { client } = fakeClient({ error: null, count: 3 });
    const r = await new SupabaseDatabaseDiagnostics(client as never).check();
    expect(r).toEqual({ status: 'reachable' });
  });

  it('select error → unreachable (does not throw)', async () => {
    const { client } = fakeClient({ error: { message: 'no db' } });
    const r = await new SupabaseDatabaseDiagnostics(client as never).check();
    expect(r).toEqual({ status: 'unreachable', detail: 'no db' });
  });
});

/* -------------------------------- outbox ---------------------------------- */

describe('SupabaseOutboxDiagnostics', () => {
  it('no unresolved rows → empty', async () => {
    const { client } = fakeClient({ count: 0, error: null });
    const r = await new SupabaseOutboxDiagnostics(client as never).check(SCOPE);
    expect(r).toEqual({ status: 'empty', unresolvedCount: 0 });
  });

  it('unresolved rows → pending with count', async () => {
    const { client } = fakeClient({ count: 4, error: null });
    const r = await new SupabaseOutboxDiagnostics(client as never).check(SCOPE);
    expect(r).toEqual({ status: 'pending', unresolvedCount: 4 });
  });

  it('query error throws', async () => {
    const { client } = fakeClient({ count: null, error: { message: 'bad' } });
    await expect(
      new SupabaseOutboxDiagnostics(client as never).check(SCOPE)
    ).rejects.toThrow(/bad/);
  });
});
