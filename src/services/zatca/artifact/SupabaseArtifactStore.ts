import { supabase } from '@/integrations/supabase/client';
import type {
  ArtifactStore,
  NewSignedArtifact,
  StoredArtifact,
} from './ArtifactStore';

const TABLE = 'zatca_signed_artifacts';

/**
 * Minimal DB seam the store depends on — two operations over a table, hiding the
 * Supabase query-builder so the store logic (NewSignedArtifact ↔ row mapping)
 * stays unit-testable with a trivial fake.
 */
export interface ArtifactDbClient {
  /** INSERT one row, return the generated id. Throws on infra error. */
  insertReturningId(table: string, row: Record<string, unknown>): Promise<string>;
  /** SELECT one row by id, or null if absent. Throws on infra error. */
  selectById(table: string, id: string): Promise<Record<string, unknown> | null>;
}

type SupabaseLike = typeof supabase;

/** Supabase-backed ArtifactDbClient (the real seam used in production). */
export function supabaseArtifactDbClient(
  client: SupabaseLike = supabase
): ArtifactDbClient {
  return {
    async insertReturningId(table, row) {
      const { data, error } = await client
        .from(table as never)
        .insert(row as never)
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      const id = (data as { id?: unknown } | null)?.id;
      if (typeof id !== 'string') {
        throw new Error(`${TABLE}: insert returned no id`);
      }
      return id;
    },
    async selectById(table, id) {
      const { data, error } = await client
        .from(table as never)
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Record<string, unknown> | null) ?? null;
    },
  };
}

/**
 * Supabase implementation of ArtifactStore.
 *
 * Maps the camelCase domain type to the snake_case row, and back. Holds NO
 * chain/projection logic — it only persists and retrieves the artifact.
 */
export class SupabaseArtifactStore implements ArtifactStore {
  readonly implementationName = 'SupabaseArtifactStore';

  constructor(private readonly db: ArtifactDbClient) {}

  async persist(a: NewSignedArtifact): Promise<string> {
    return this.db.insertReturningId(TABLE, {
      company_id: a.companyId,
      environment: a.environment,
      document_type: a.documentType,
      document_id: a.documentId,
      artifact_hash: a.artifactHash,
      signed_xml: a.signedXml,
      signing_time: a.signingTime,
      credential_id: a.credentialId,
      certificate_fingerprint: a.certificateFingerprint,
    });
  }

  async fetch(artifactId: string): Promise<StoredArtifact> {
    const row = await this.db.selectById(TABLE, artifactId);
    if (!row) {
      throw new Error(`ArtifactStore.fetch: artifact not found: ${artifactId}`);
    }
    return {
      id: row.id as string,
      companyId: row.company_id as string,
      environment: row.environment as StoredArtifact['environment'],
      documentType: row.document_type as StoredArtifact['documentType'],
      documentId: row.document_id as string,
      artifactHash: row.artifact_hash as string,
      signedXml: row.signed_xml as string,
      signingTime: row.signing_time as string,
      credentialId: row.credential_id as string,
      certificateFingerprint: row.certificate_fingerprint as string,
      createdAt: row.created_at as string,
    };
  }
}

/** Default factory: Supabase-backed store over the singleton client. */
export function createArtifactStore(): ArtifactStore {
  return new SupabaseArtifactStore(supabaseArtifactDbClient());
}
