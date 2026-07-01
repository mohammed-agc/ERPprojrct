// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { ZatcaHealthReport } from '../ZatcaHealthReport';
import type {
  OperationalScope,
  CredentialHealth,
  CertificateHealth,
  DatabaseHealth,
  OutboxHealth,
} from '../OperationalDiagnostics';
import type { OperationalDiagnosticsBundle } from '../SupabaseOperationalDiagnostics';
import type {
  ProjectionDiagnostics,
  ScopeDiagnostics,
  ClassificationTally,
} from '../../reconciliation/ProjectionDiagnostics';
import { emptyTally } from '../../reconciliation/ProjectionDiagnostics';

const SCOPE: OperationalScope = { companyId: 'c1', environment: 'sandbox' };

/* ---- healthy defaults, overridable per test ------------------------------ */
const OK_CREDENTIAL: CredentialHealth = { status: 'active', activeCount: 1, credentialType: 'CCSID' };
const OK_CERT: CertificateHealth = { status: 'valid', thresholdDays: 30, daysRemaining: 200 };
const OK_DB: DatabaseHealth = { status: 'reachable' };
const OK_OUTBOX: OutboxHealth = { status: 'empty', unresolvedCount: 0 };

function tallyWith(overrides: Partial<ClassificationTally>): ClassificationTally {
  return { ...emptyTally(), ...overrides };
}

function scopeDiag(tally: ClassificationTally, total: number): ScopeDiagnostics {
  return { scope: { kind: 'company-environment', companyId: 'c1', environment: 'sandbox' },
    total, tally, escalations: [], repairable: 0, reports: [] };
}

function build(opts: {
  credential?: CredentialHealth;
  certificate?: CertificateHealth;
  database?: DatabaseHealth;
  outbox?: OutboxHealth;
  tally?: ClassificationTally;
  total?: number;
}) {
  const bundle: OperationalDiagnosticsBundle = {
    credential: { check: vi.fn(async () => opts.credential ?? OK_CREDENTIAL) },
    certificate: { check: vi.fn(async () => opts.certificate ?? OK_CERT) },
    database: { check: vi.fn(async () => opts.database ?? OK_DB) },
    outbox: { check: vi.fn(async () => opts.outbox ?? OK_OUTBOX) },
  };
  const diag: ProjectionDiagnostics = {
    implementationName: 'fake',
    analyzeOne: vi.fn(),
    analyzeScope: vi.fn(async () =>
      scopeDiag(opts.tally ?? emptyTally(), opts.total ?? 0)
    ),
  };
  return new ZatcaHealthReport(bundle, diag);
}

describe('ZatcaHealthReport — overall', () => {
  it('all green → HEALTHY', async () => {
    const r = await build({ tally: tallyWith({ CONSISTENT: 5 }), total: 5 }).check(SCOPE);
    expect(r.overall).toBe('HEALTHY');
    expect(r.projection.severity).toBe('OK');
    expect(r.operational.vault).toBe('not-checked');
  });

  it('database unreachable → DOWN', async () => {
    const r = await build({ database: { status: 'unreachable', detail: 'x' } }).check(SCOPE);
    expect(r.overall).toBe('DOWN');
  });

  it('no active credential → DOWN', async () => {
    const r = await build({ credential: { status: 'none', activeCount: 0 } }).check(SCOPE);
    expect(r.overall).toBe('DOWN');
  });

  it('certificate expiring_soon → DEGRADED', async () => {
    const r = await build({
      certificate: { status: 'expiring_soon', thresholdDays: 30, daysRemaining: 10 },
    }).check(SCOPE);
    expect(r.overall).toBe('DEGRADED');
  });

  it('certificate expired → DEGRADED (a single doc/infra warning, not DOWN)', async () => {
    const r = await build({
      certificate: { status: 'expired', thresholdDays: 30, daysRemaining: -3 },
    }).check(SCOPE);
    expect(r.overall).toBe('DEGRADED');
  });

  it('outbox pending → DEGRADED', async () => {
    const r = await build({ outbox: { status: 'pending', unresolvedCount: 2 } }).check(SCOPE);
    expect(r.overall).toBe('DEGRADED');
  });

  it('multiple active credentials → DEGRADED', async () => {
    const r = await build({ credential: { status: 'multiple', activeCount: 2 } }).check(SCOPE);
    expect(r.overall).toBe('DEGRADED');
  });

  it('a projection drift (>= WARNING) → DEGRADED', async () => {
    const r = await build({
      tally: tallyWith({ CONSISTENT: 4, STALE_SUBMISSION_STATUS: 1 }),
      total: 5,
    }).check(SCOPE);
    expect(r.overall).toBe('DEGRADED');
    expect(r.projection.severity).toBe('WARNING');
  });

  it('DOWN takes precedence over projection/degraded signals', async () => {
    const r = await build({
      database: { status: 'unreachable' },
      outbox: { status: 'pending', unresolvedCount: 9 },
      tally: tallyWith({ MISSING_ARTIFACT: 1 }),
      total: 1,
    }).check(SCOPE);
    expect(r.overall).toBe('DOWN');
  });
});

describe('ZatcaHealthReport — projection severity reduction', () => {
  it('reduces to the WORST severity among classifications present', async () => {
    // WARNING (stale) + CRITICAL (missing artifact) present → CRITICAL wins.
    const r = await build({
      tally: tallyWith({
        CONSISTENT: 3,
        STALE_SUBMISSION_STATUS: 2,
        MISSING_ARTIFACT: 1,
      }),
      total: 6,
    }).check(SCOPE);
    expect(r.projection.severity).toBe('CRITICAL');
    // still DEGRADED, never DOWN — one broken doc doesn't down the pipeline
    expect(r.overall).toBe('DEGRADED');
  });

  it('ignores zero-count classifications', async () => {
    const r = await build({ tally: tallyWith({ CONSISTENT: 7 }), total: 7 }).check(SCOPE);
    expect(r.projection.severity).toBe('OK');
  });

  it('carries the full scope diagnostics beside the severity', async () => {
    const r = await build({ tally: tallyWith({ CONSISTENT: 7 }), total: 7 }).check(SCOPE);
    expect(r.projection.diagnostics.total).toBe(7);
    expect(r.projection.diagnostics.tally.CONSISTENT).toBe(7);
  });
});
