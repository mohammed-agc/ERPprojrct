/**
 * SupabaseSubmissionProjectionWriter — the submission READ MODEL.
 *
 * The submission_log is the TRUTH; this writes a single denormalized column,
 * invoices.zatca_status, from a submission's facts. Written AFTER the log,
 * best-effort: a failure here is recoverable by replaying the latest log row.
 *
 * Status derivation is NOT owned here — it is the domain policy in
 * SubmissionStatusPolicy (deriveSubmissionStatus), shared with the
 * ProjectionReconciler. This writer only WRITES the derived status; it touches
 * ONLY zatca_status. signed_artifact_id belongs to the signing projection (S5.1).
 */
import type {
  SubmissionProjectionWriter,
  SubmissionProjection,
} from './SubmissionCoordinator';
import {
  deriveSubmissionStatus,
  type SubmissionDerivedStatus,
} from '../policy/SubmissionStatusPolicy';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

/**
 * Back-compat thin wrapper over the domain policy. The rules live in
 * SubmissionStatusPolicy (single source); this only adapts the SubmissionProjection
 * shape onto neutral facts.
 */
export function deriveZatcaStatus(
  p: SubmissionProjection
): SubmissionDerivedStatus | null {
  return deriveSubmissionStatus({
    validationStatus: p.validationStatus,
    clearanceStatus: p.clearanceStatus,
    reportingStatus: p.reportingStatus,
  });
}

export class SupabaseSubmissionProjectionWriter
  implements SubmissionProjectionWriter
{
  constructor(private readonly client: SupabaseLike) {}

  async project(p: SubmissionProjection): Promise<void> {
    const status = deriveZatcaStatus(p);
    if (!status) {
      // Indeterminate disposition — leave the read-model untouched, never guess.
      return;
    }

    const { error } = await this.client
      .from('invoices')
      .update({ zatca_status: status })
      .eq('id', p.documentId);

    if (error) {
      throw new Error(
        `SubmissionProjectionWriter: update failed: ${error.message}`
      );
    }
  }
}

/** Factory — defaults to the app singleton; server-side runs inject a client. */
export function createSubmissionProjectionWriter(
  client: SupabaseLike = supabase
): SubmissionProjectionWriter {
  return new SupabaseSubmissionProjectionWriter(client);
}
