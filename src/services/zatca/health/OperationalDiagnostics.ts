/**
 * OperationalDiagnostics — "can the system operate?" checks, kept strictly apart
 * from projection consistency ("is the read-model correct?").
 *
 * Each check is an INDEPENDENT contract with a graded result (never a bare
 * boolean): the HealthReport COMPOSES these; it does not implement or interpret
 * them. Sprint A ships four DB-backed checks. Vault (file-system, Node-only) is
 * declared but injected later (PCSID / Item 4).
 *
 * All checks are scoped to a company + environment — health is always asked of a
 * specific tenant in a specific ZATCA environment, never globally.
 */

import type { ZatcaEnvironment } from '../credential/CredentialResolver';

export interface OperationalScope {
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
}

/* ----------------------------- credential -------------------------------- */

export type CredentialHealthStatus =
  | 'active' // exactly one active credential for the scope
  | 'none' // no active credential — system cannot submit
  | 'multiple'; // >1 active — ambiguous, needs operator attention

export interface CredentialHealth {
  readonly status: CredentialHealthStatus;
  readonly activeCount: number;
  /** credential_type of the active credential, when status='active'. */
  readonly credentialType?: string;
}

export interface CredentialDiagnostics {
  check(scope: OperationalScope): Promise<CredentialHealth>;
}

/* ----------------------------- certificate ------------------------------- */

export type CertificateHealthStatus =
  | 'valid' // expiry beyond the warning threshold
  | 'expiring_soon' // valid, but within the threshold window
  | 'expired' // certificate_expiry_at is in the past
  | 'no_credential'; // nothing to check

export interface CertificateHealth {
  readonly status: CertificateHealthStatus;
  /** Absolute expiry, when a credential exists. */
  readonly expiresAt?: string;
  /** Whole days until expiry (negative if expired), when a credential exists. */
  readonly daysRemaining?: number;
  /** The threshold (days) used to decide expiring_soon — echoed for audit. */
  readonly thresholdDays: number;
}

export interface CertificateDiagnostics {
  /** @param thresholdDays days-before-expiry that count as expiring_soon (injected, not hard-coded). */
  check(scope: OperationalScope, thresholdDays: number): Promise<CertificateHealth>;
}

/* ------------------------------ database --------------------------------- */

export type DatabaseHealthStatus = 'reachable' | 'unreachable';

export interface DatabaseHealth {
  readonly status: DatabaseHealthStatus;
  /** Error text when unreachable — for the operator, not the projection. */
  readonly detail?: string;
}

export interface DatabaseDiagnostics {
  check(): Promise<DatabaseHealth>;
}

/* ------------------------------- outbox ---------------------------------- */

export type OutboxHealthStatus =
  | 'empty' // no unresolved projection failures
  | 'pending'; // N unresolved rows await reconciliation

export interface OutboxHealth {
  readonly status: OutboxHealthStatus;
  readonly unresolvedCount: number;
}

export interface OutboxDiagnostics {
  check(scope: OperationalScope): Promise<OutboxHealth>;
}

/* --------------------------- composed bundle ----------------------------- */

/** Checks not run in this context (e.g. vault in a browser) report 'not-checked'. */
export type NotChecked = 'not-checked';

export interface OperationalHealth {
  readonly credential: CredentialHealth;
  readonly certificate: CertificateHealth;
  readonly database: DatabaseHealth;
  readonly outbox: OutboxHealth;
  readonly vault: NotChecked; // injected in Item 4 (PCSID)
}
