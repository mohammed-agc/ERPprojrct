/**
 * CredentialRepository — writes credential METADATA to zatca_credentials.
 *
 * The database is the metadata SSOT; the Vault is the secrets SSOT. This
 * repository records only what is safe and useful for indexing, audit, and
 * expiry — company, environment, type, fingerprints, expiry, status. It NEVER
 * writes the private key, the binarySecurityToken, or the secret: those live in
 * the Vault exclusively (the deprecated secret_* / binary_security_token columns
 * are left null).
 *
 * A pure metadata authority: no crypto, no Vault, no orchestration. The
 * Registrar composes it with the VaultWriter.
 */

import type { ZatcaEnvironment, CredentialType } from '../credential/CredentialResolver';

/** The metadata row this repository persists. */
export interface CredentialMetadataRecord {
  /** The credentialId — also the Vault directory name. Caller-supplied. */
  readonly credentialId: string;
  readonly companyId: string;
  readonly environment: ZatcaEnvironment;
  readonly credentialType: CredentialType;
  /** SHA-256 (or similar) of the certificate — for lookup/verification. */
  readonly certificateFingerprint: string;
  /** Fingerprint of the credential as a whole. */
  readonly credentialFingerprint: string;
  /** Certificate expiry (ISO timestamptz). */
  readonly certificateExpiryAt: string;
  /** Optional descriptive fields. */
  readonly certificateSerial?: string;
  readonly certificateSubject?: string;
}

export class CredentialRepositoryError extends Error {
  constructor(message: string, readonly context?: Record<string, unknown>) {
    super(message);
    this.name = 'CredentialRepositoryError';
  }
}

export interface CredentialRepository {
  readonly implementationName: string;
  /** Insert the credential metadata. Returns the stored credentialId. */
  register(record: CredentialMetadataRecord): Promise<string>;
}

/** Minimal slice of the Supabase client this repository needs. */
export interface CredentialInsertClient {
  from(table: 'zatca_credentials'): {
    insert(row: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

export class SupabaseCredentialRepository implements CredentialRepository {
  readonly implementationName = 'SupabaseCredentialRepository';
  constructor(private readonly client: CredentialInsertClient) {}

  async register(record: CredentialMetadataRecord): Promise<string> {
    const row: Record<string, unknown> = {
      id: record.credentialId,
      company_id: record.companyId,
      environment: record.environment,
      credential_type: record.credentialType,
      certificate_fingerprint: record.certificateFingerprint,
      credential_fingerprint: record.credentialFingerprint,
      certificate_expiry_at: record.certificateExpiryAt,
      certificate_serial: record.certificateSerial ?? null,
      certificate_subject: record.certificateSubject ?? null,
      issued_at: new Date().toISOString(),
      status: 'active',
      is_active: true,
      // Secrets deliberately NOT written — they live in the Vault. The
      // deprecated secret_* / binary_security_token columns stay null.
    };

    const { data, error } = await this.client
      .from('zatca_credentials')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      throw new CredentialRepositoryError(
        `failed to register credential metadata: ${error.message}`,
        { credentialId: record.credentialId }
      );
    }
    if (!data?.id) {
      throw new CredentialRepositoryError(
        'credential insert returned no id',
        { credentialId: record.credentialId }
      );
    }
    return data.id;
  }
}

export function createCredentialRepository(
  client: CredentialInsertClient
): CredentialRepository {
  return new SupabaseCredentialRepository(client);
}
