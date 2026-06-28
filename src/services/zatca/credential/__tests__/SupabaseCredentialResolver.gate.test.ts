/**
 * Gate test for SupabaseCredentialResolver — drives the frozen contract:
 *   docs/contracts/CREDENTIAL_RESOLVER_CONTRACT.md
 *
 * Outcomes proven (exactly the two contract codes, plus passthrough + infra):
 *   - SUCCESS                  → ResolvedCredential (credentialId = row id)
 *   - NO_ACTIVE_CREDENTIAL     → no active row
 *   - CREDENTIAL_EXPIRED       → active row, but past certificate expiry
 *   - credentialId is Vault-compatible ([a-zA-Z0-9_-]+ directory rule)
 *   - a DB-read error PROPAGATES (never folded into a resolution outcome)
 */

import { describe, it, expect } from 'vitest';
import {
  SupabaseCredentialResolver,
  type CredentialQueryClient,
} from '../SupabaseCredentialResolver';
import { CredentialResolverError } from '../CredentialResolver';

type Row = {
  id: string;
  certificate_fingerprint: string;
  certificate_expiry_at: string;
};

/** A fake client whose maybeSingle() returns a fixed { data, error }. */
function fakeClient(result: {
  data: Row | null;
  error: { message: string } | null;
}): CredentialQueryClient {
  const builder = {
    eq: () => builder,
    maybeSingle: async () => result,
  };
  return {
    from: () => ({ select: () => builder }),
  } as unknown as CredentialQueryClient;
}

const UUID = '608ef6cf-6ea1-4aeb-8e4d-64db4e43f8f3';
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 86_400_000).toISOString();

describe('SupabaseCredentialResolver — frozen contract gate', () => {
  it('declares its implementation name', () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({ data: null, error: null })
    );
    expect(r.implementationName).toBe('SupabaseCredentialResolver');
  });

  it('SUCCESS — returns the credential reference; credentialId = the row id', async () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({
        data: { id: UUID, certificate_fingerprint: 'FP-1', certificate_expiry_at: FUTURE },
        error: null,
      })
    );
    const res = await r.resolve('company-1', 'sandbox', 'PCSID');
    expect(res.credentialId).toBe(UUID);
    expect(res.environment).toBe('sandbox');
    expect(res.credentialType).toBe('PCSID');
    expect(res.certificateFingerprint).toBe('FP-1');
    expect(res.expiresAt.toISOString()).toBe(FUTURE);
  });

  it('credentialId is Vault-compatible (matches the [a-zA-Z0-9_-]+ directory rule)', async () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({
        data: { id: UUID, certificate_fingerprint: 'FP', certificate_expiry_at: FUTURE },
        error: null,
      })
    );
    const res = await r.resolve('c', 'production', 'PCSID');
    expect(/^[a-zA-Z0-9_-]+$/.test(res.credentialId)).toBe(true);
  });

  it('NO_ACTIVE_CREDENTIAL — when no active row exists', async () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({ data: null, error: null })
    );
    await expect(
      r.resolve('company-1', 'sandbox', 'PCSID')
    ).rejects.toMatchObject({
      name: 'CredentialResolverError',
      code: 'NO_ACTIVE_CREDENTIAL',
    });
  });

  it('CREDENTIAL_EXPIRED — active row, but past its certificate expiry', async () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({
        data: { id: UUID, certificate_fingerprint: 'FP', certificate_expiry_at: PAST },
        error: null,
      })
    );
    await expect(
      r.resolve('company-1', 'sandbox', 'PCSID')
    ).rejects.toMatchObject({
      name: 'CredentialResolverError',
      code: 'CREDENTIAL_EXPIRED',
    });
  });

  it('a DB-read error propagates (NOT folded into a resolution outcome)', async () => {
    const r = new SupabaseCredentialResolver(
      fakeClient({ data: null, error: { message: 'connection refused' } })
    );
    const err = await r.resolve('c', 'sandbox', 'PCSID').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CredentialResolverError);
  });
});
