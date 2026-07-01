/**
 * ZatcaHealthReport — the COMPOSER. It runs independent diagnostics and assembles
 * one report. It derives an `overall` summary, but adds NO diagnostic knowledge:
 *
 *   - Operational checks (credential, certificate, database, outbox) come from
 *     the injected OperationalDiagnosticsBundle — each graded by its own check.
 *   - Projection health comes from ProjectionDiagnostics.analyzeScope, reduced to
 *     a SINGLE severity via deriveSeverity + worstSeverity. The report never sees
 *     classifications here; it sees one ProjectionSeverity.
 *   - `overall` is a pure reduction of those results (deriveOverall) — presentation,
 *     not a new domain policy. Details are always kept beside it, never replaced.
 *
 * Separation of the two questions is explicit:
 *   operational → "can the system operate?"   (Sign → Append → Submit runnable?)
 *   projection  → "is the read-model correct?"
 */

import type {
  OperationalScope,
  OperationalHealth,
  CredentialHealth,
  CertificateHealth,
  DatabaseHealth,
  OutboxHealth,
} from './OperationalDiagnostics';
import type { OperationalDiagnosticsBundle } from './SupabaseOperationalDiagnostics';
import { createOperationalDiagnostics } from './SupabaseOperationalDiagnostics';
import type {
  ProjectionDiagnostics,
  BatchScope,
  ScopeDiagnostics,
} from '../reconciliation/ProjectionDiagnostics';
import { createProjectionDiagnostics } from '../reconciliation/DefaultProjectionDiagnostics';
import {
  deriveSeverity,
  worstSeverity,
  type ProjectionSeverity,
} from '../policy/ProjectionSeverityPolicy';
import type { ZatcaEnvironment } from '../credential/CredentialResolver';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

export type OverallHealth = 'HEALTHY' | 'DEGRADED' | 'DOWN';

/** Projection block: the raw scope diagnostics plus its reduced severity. */
export interface ProjectionHealth {
  readonly severity: ProjectionSeverity;
  readonly diagnostics: ScopeDiagnostics;
}

export interface ZatcaHealth {
  readonly scope: OperationalScope;
  readonly overall: OverallHealth;
  readonly operational: OperationalHealth;
  readonly projection: ProjectionHealth;
  readonly checkedAt: string;
}

/** Threshold (days) below which a certificate counts as expiring_soon. */
const DEFAULT_CERT_THRESHOLD_DAYS = 30;

/**
 * Reduce gathered results to an overall summary. PURE, file-private: no new
 * knowledge — it knows nothing of classifications, only the four operational
 * states and ONE projection severity.
 */
function deriveOverall(input: {
  database: DatabaseHealth;
  credential: CredentialHealth;
  certificate: CertificateHealth;
  outbox: OutboxHealth;
  worstProjectionSeverity: ProjectionSeverity;
}): OverallHealth {
  // DOWN — the pipeline cannot run at all.
  if (input.database.status === 'unreachable') return 'DOWN';
  if (input.credential.status === 'none') return 'DOWN';

  // DEGRADED — operational but needs attention / follow-up.
  const certDegrades =
    input.certificate.status === 'expired' ||
    input.certificate.status === 'expiring_soon';
  const degraded =
    certDegrades ||
    input.outbox.status === 'pending' ||
    input.credential.status === 'multiple' ||
    input.worstProjectionSeverity !== 'OK';

  return degraded ? 'DEGRADED' : 'HEALTHY';
}

export class ZatcaHealthReport {
  constructor(
    private readonly operational: OperationalDiagnosticsBundle,
    private readonly projection: ProjectionDiagnostics,
    private readonly certThresholdDays: number = DEFAULT_CERT_THRESHOLD_DAYS
  ) {}

  async check(scope: OperationalScope): Promise<ZatcaHealth> {
    const batchScope: BatchScope = {
      kind: 'company-environment',
      companyId: scope.companyId,
      environment: scope.environment,
    };

    // Independent diagnostics — gathered concurrently.
    const [credential, certificate, database, outbox, scopeDiag] =
      await Promise.all([
        this.operational.credential.check(scope),
        this.operational.certificate.check(scope, this.certThresholdDays),
        this.operational.database.check(),
        this.operational.outbox.check(scope),
        this.projection.analyzeScope(batchScope),
      ]);

    // Reduce the projection to ONE severity: worst over the classifications that
    // actually appeared (count > 0). Nothing below WARNING escapes as noise.
    const worstProjectionSeverity = worstSeverity(
      (Object.keys(scopeDiag.tally) as Array<keyof typeof scopeDiag.tally>)
        .filter((c) => scopeDiag.tally[c] > 0)
        .map((c) => deriveSeverity(c))
    );

    const operational: OperationalHealth = {
      credential,
      certificate,
      database,
      outbox,
      vault: 'not-checked',
    };

    const overall = deriveOverall({
      database,
      credential,
      certificate,
      outbox,
      worstProjectionSeverity,
    });

    return {
      scope,
      overall,
      operational,
      projection: { severity: worstProjectionSeverity, diagnostics: scopeDiag },
      checkedAt: new Date().toISOString(),
    };
  }
}

/** Composition root — defaults to the singleton; server-side runs inject a client. */
export function createZatcaHealthReport(
  dbClient?: SupabaseLike,
  certThresholdDays: number = DEFAULT_CERT_THRESHOLD_DAYS
): ZatcaHealthReport {
  const client = dbClient ?? supabase;
  return new ZatcaHealthReport(
    createOperationalDiagnostics(client),
    createProjectionDiagnostics(client),
    certThresholdDays
  );
}

// Re-export for consumers building an environment-scoped health call.
export type { OperationalScope, ZatcaEnvironment };
