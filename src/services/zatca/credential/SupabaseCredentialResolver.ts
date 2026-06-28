/**
 * SupabaseCredentialResolver — Supabase-backed CredentialResolver.
 *
 * Reads exactly one row from zatca_credentials (the active credential for the
 * coordinate), applies the time-expiry check, and maps it to a ResolvedCredential.
 *
 * The query client is INJECTED (per AD-012 v2) so the resolution logic is
 * deterministically testable without a live database; the factory defaults it
 * to the application Supabase singleton.
 *
 * Architectural references & contract: see CredentialResolver.ts and
 * docs/contracts/CREDENTIAL_RESOLVER_CONTRACT.md.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CredentialId } from '../vault/VaultProvider';
import {
  CredentialResolverError,
  type CredentialResolver,
  type CredentialType,
  type ResolvedCredential,
  type ZatcaEnvironment,
} from './CredentialResolver';

/** Raw zatca_credentials row — only the columns this resolver reads. */
interface RawCredentialRow {
  readonly id: string;
  readonly certificate_fingerprint: string;
  readonly certificate_expiry_at: string; // ISO timestamptz
}

/**
 * Minimal slice of the Supabase client this resolver depends on.
 * The real client satisfies it structurally; tests provide a trivial fake.
 */
export interface CredentialQueryClient {
  from(table: 'zatca_credentials'): {
    select(columns: string): CredentialQueryBuilder;
  };
}
interface CredentialQueryBuilder {
  eq(column: string, value: unknown): CredentialQueryBuilder;
  maybeSingle(): Promise<{
    data: RawCredentialRow | null;
    error: { message: string } | null;
  }>;
}

export class SupabaseCredentialResolver implements CredentialResolver {
  public readonly implementationName = 'SupabaseCredentialResolver';

  constructor(private readonly client: CredentialQueryClient) {}

  async resolve(
    companyId: string,
    environment: ZatcaEnvironment,
    credentialType: CredentialType
  ): Promise<ResolvedCredential> {
    // At most one row by the partial unique index — no selection logic needed.
    const { data, error } = await this.client
      .from('zatca_credentials')
      .select('id, certificate_fingerprint, certificate_expiry_at')
      .eq('company_id', companyId)
      .eq('environment', environment)
      .eq('credential_type', credentialType)
      .eq('is_active', true)
      .maybeSingle();

    // A DB-read failure is NOT a resolution outcome. Only NO_ACTIVE_CREDENTIAL
    // and CREDENTIAL_EXPIRED are outcomes; anything else propagates. Folding
    // this into NO_ACTIVE_CREDENTIAL would wrongly report "no credential" when
    // we simply could not check.
    if (error) {
      throw new Error(
        `CredentialResolver: credential lookup failed: ${error.message}`
      );
    }

    // No active credential for the coordinate (partial function — legitimate).
    if (!data) {
      throw new CredentialResolverError(
        'NO_ACTIVE_CREDENTIAL',
        'No active credential for the requested (company, environment, type)',
        { companyId, environment, credentialType }
      );
    }

    // Time-expiry: the one validity dimension that can become true with no
    // write (between expiry and the lifecycle sweep). is_active alone cannot be
    // trusted for it, so the resolver checks it here.
    const expiresAt = new Date(data.certificate_expiry_at);
    if (expiresAt.getTime() <= Date.now()) {
      throw new CredentialResolverError(
        'CREDENTIAL_EXPIRED',
        'The active credential has passed its certificate expiry',
        {
          companyId,
          environment,
          credentialType,
          expiresAt: expiresAt.toISOString(),
        }
      );
    }

    return {
      // = zatca_credentials.id (UUID) — the value VaultProvider.sign() consumes.
      credentialId: data.id as CredentialId,
      environment,
      credentialType,
      certificateFingerprint: data.certificate_fingerprint,
      expiresAt,
    };
  }
}

/**
 * Factory (per AD-012 v2). Defaults to the application Supabase singleton;
 * tests inject a fake CredentialQueryClient.
 */
export function createSupabaseCredentialResolver(
  client: CredentialQueryClient = supabase as unknown as CredentialQueryClient
): CredentialResolver {
  return new SupabaseCredentialResolver(client);
}
