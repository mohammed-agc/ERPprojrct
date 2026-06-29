import { supabase } from '@/integrations/supabase/client';
import type { ProjectionWriter, InvoiceProjection } from './ProjectionWriter';

const TABLE = 'invoices';

/**
 * Minimal DB seam: a targeted UPDATE by id, hiding the Supabase builder so the
 * projection mapping stays unit-testable with a trivial fake.
 */
export interface ProjectionDbClient {
  /** UPDATE one row by id with the given patch. Throws on infra error. */
  updateById(
    table: string,
    id: string,
    patch: Record<string, unknown>
  ): Promise<void>;
}

type SupabaseLike = typeof supabase;

/** Supabase-backed ProjectionDbClient (the real seam used in production). */
export function supabaseProjectionDbClient(
  client: SupabaseLike = supabase
): ProjectionDbClient {
  return {
    async updateById(table, id, patch) {
      const { error } = await client
        .from(table as never)
        .update(patch as never)
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Supabase implementation of ProjectionWriter — the sole writer of the eight
 * Invoice Projection columns. Holds no chain/artifact logic; it only projects.
 */
export class SupabaseProjectionWriter implements ProjectionWriter {
  readonly implementationName = 'SupabaseProjectionWriter';

  constructor(private readonly db: ProjectionDbClient) {}

  async write(p: InvoiceProjection): Promise<void> {
    await this.db.updateById(TABLE, p.invoiceId, {
      icv: p.icv,
      pih: p.pih,
      qr_code: p.qrCode,
      xml_hash: p.xmlHash,
      zatca_status: p.zatcaStatus,
      xml_generated_at: p.generatedAt,
      qr_generated_at: p.generatedAt,
      signed_artifact_id: p.signedArtifactId,
    });
  }
}

/** Default factory: Supabase-backed writer over the singleton client. */
export function createProjectionWriter(): ProjectionWriter {
  return new SupabaseProjectionWriter(supabaseProjectionDbClient());
}
