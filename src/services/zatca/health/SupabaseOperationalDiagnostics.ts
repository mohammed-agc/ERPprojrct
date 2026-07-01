/**
 * Supabase-backed operational diagnostics — four independent DB checks.
 * Each owns ONE query and grades its result; none interprets another's.
 */

import type {
  OperationalScope,
  CredentialDiagnostics,
  CredentialHealth,
  CertificateDiagnostics,
  CertificateHealth,
  DatabaseDiagnostics,
  DatabaseHealth,
  OutboxDiagnostics,
  OutboxHealth,
} from './OperationalDiagnostics';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

const DAY_MS = 24 * 60 * 60 * 1000;

/* ----------------------------- credential -------------------------------- */

export class SupabaseCredentialDiagnostics implements CredentialDiagnostics {
  constructor(private readonly client: SupabaseLike) {}

  async check(scope: OperationalScope): Promise<CredentialHealth> {
    const { data, error } = await this.client
      .from('zatca_credentials')
      .select('credential_type')
      .eq('company_id', scope.companyId)
      .eq('environment', scope.environment)
      .eq('is_active', true);

    if (error)
      throw new Error(`CredentialDiagnostics: query failed: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) return { status: 'none', activeCount: 0 };
    if (rows.length > 1) return { status: 'multiple', activeCount: rows.length };
    return {
      status: 'active',
      activeCount: 1,
      credentialType: (rows[0].credential_type as string) ?? undefined,
    };
  }
}

/* ----------------------------- certificate ------------------------------- */

export class SupabaseCertificateDiagnostics implements CertificateDiagnostics {
  constructor(private readonly client: SupabaseLike) {}

  async check(
    scope: OperationalScope,
    thresholdDays: number
  ): Promise<CertificateHealth> {
    const { data, error } = await this.client
      .from('zatca_credentials')
      .select('certificate_expiry_at')
      .eq('company_id', scope.companyId)
      .eq('environment', scope.environment)
      .eq('is_active', true)
      .order('certificate_expiry_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error)
      throw new Error(`CertificateDiagnostics: query failed: ${error.message}`);

    const expiryRaw = data?.certificate_expiry_at as string | null | undefined;
    if (!expiryRaw) return { status: 'no_credential', thresholdDays };

    const expiresAt = new Date(expiryRaw);
    const daysRemaining = Math.floor(
      (expiresAt.getTime() - Date.now()) / DAY_MS
    );

    let status: CertificateHealth['status'];
    if (daysRemaining < 0) status = 'expired';
    else if (daysRemaining <= thresholdDays) status = 'expiring_soon';
    else status = 'valid';

    return { status, expiresAt: expiresAt.toISOString(), daysRemaining, thresholdDays };
  }
}

/* ------------------------------ database --------------------------------- */

export class SupabaseDatabaseDiagnostics implements DatabaseDiagnostics {
  constructor(private readonly client: SupabaseLike) {}

  async check(): Promise<DatabaseHealth> {
    try {
      // Cheapest possible round-trip: count-only, head request, zero rows.
      const { error } = await this.client
        .from('zatca_credentials')
        .select('id', { count: 'exact', head: true });
      if (error) return { status: 'unreachable', detail: error.message };
      return { status: 'reachable' };
    } catch (e) {
      return {
        status: 'unreachable',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }
}

/* ------------------------------- outbox ---------------------------------- */

export class SupabaseOutboxDiagnostics implements OutboxDiagnostics {
  constructor(private readonly client: SupabaseLike) {}

  async check(_scope: OperationalScope): Promise<OutboxHealth> {
    // The outbox has no company/environment column; it is keyed by artifact.
    // Scope is accepted for contract symmetry but the count is global per tenant
    // deployment (single-tenant DB). Unresolved = resolved_at IS NULL.
    const { count, error } = await this.client
      .from('zatca_projection_outbox')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null);

    if (error)
      throw new Error(`OutboxDiagnostics: query failed: ${error.message}`);

    const unresolvedCount = count ?? 0;
    return {
      status: unresolvedCount === 0 ? 'empty' : 'pending',
      unresolvedCount,
    };
  }
}

/* ------------------------------ factory ---------------------------------- */

export interface OperationalDiagnosticsBundle {
  credential: CredentialDiagnostics;
  certificate: CertificateDiagnostics;
  database: DatabaseDiagnostics;
  outbox: OutboxDiagnostics;
}

export function createOperationalDiagnostics(
  dbClient?: SupabaseLike
): OperationalDiagnosticsBundle {
  const client = dbClient ?? supabase;
  return {
    credential: new SupabaseCredentialDiagnostics(client),
    certificate: new SupabaseCertificateDiagnostics(client),
    database: new SupabaseDatabaseDiagnostics(client),
    outbox: new SupabaseOutboxDiagnostics(client),
  };
}
