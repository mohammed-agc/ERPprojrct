import { supabase } from '@/integrations/supabase/client';
import type {
  ProjectionFailureSink,
  ProjectionFailedEvent,
} from '../coordinator/InvoiceSigningCoordinator';

const TABLE = 'zatca_projection_outbox';

/**
 * All ProjectionFailed events share one classification — they are projection
 * write failures. The detail lives in error_message; the code groups them for
 * the reconciler. (Granular codes are a later concern, if ever needed.)
 */
const PROJECTION_WRITE_FAILED = 'PROJECTION_WRITE_FAILED';

/** Minimal DB seam: a single INSERT, hiding the Supabase builder for testing. */
export interface OutboxDbClient {
  insert(table: string, row: Record<string, unknown>): Promise<void>;
}

type SupabaseLike = typeof supabase;

/** Supabase-backed OutboxDbClient (the real seam used in production). */
export function supabaseOutboxDbClient(
  client: SupabaseLike = supabase
): OutboxDbClient {
  return {
    async insert(table, row) {
      const { error } = await client.from(table as never).insert(row as never);
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * SupabaseProjectionFailureSink — durably records a ProjectionFailed event.
 *
 * Maps the event to the MINIMAL outbox row: artifact_id is the key; document /
 * company / environment / hash are all derivable from the artifact at reconcile
 * time, so they are deliberately NOT stored (ADR-029 §3 + outbox refinement).
 */
export class SupabaseProjectionFailureSink implements ProjectionFailureSink {
  constructor(private readonly db: OutboxDbClient) {}

  async record(event: ProjectionFailedEvent): Promise<void> {
    await this.db.insert(TABLE, {
      artifact_id: event.artifactId,
      error_code: PROJECTION_WRITE_FAILED,
      error_message: event.error,
      attempt_count: 1,
      occurred_at: event.occurredAt,
    });
  }
}

/** Default factory: Supabase-backed sink over the singleton client. */
export function createProjectionFailureSink(client: SupabaseLike = supabase): ProjectionFailureSink {
  return new SupabaseProjectionFailureSink(supabaseOutboxDbClient(client));
}
