/**
 * SupabaseSubmissionProjectionWriter — the submission READ MODEL.
 *
 * The submission_log is the TRUTH; this derives a single denormalized column,
 * invoices.zatca_status, from a submission's facts. Written AFTER the log,
 * best-effort: a failure here is recoverable by replaying the latest log row.
 *
 * Derivation (CHECK-constrained domain: draft|ready|reported|cleared|rejected|cancelled):
 *   validationStatus ERROR → 'rejected'
 *   clearanceStatus  CLEARED → 'cleared'
 *   reportingStatus  REPORTED → 'reported'
 *   anything else (unknown disposition) → NO write (never force an invalid value)
 *
 * It touches ONLY zatca_status. signed_artifact_id belongs to the signing
 * projection (S5.1), not here.
 */

import type {
  SubmissionProjectionWriter,
  SubmissionProjection,
} from './SubmissionCoordinator';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

type InvoiceZatcaStatus = 'reported' | 'cleared' | 'rejected';

export function deriveZatcaStatus(
  p: SubmissionProjection
): InvoiceZatcaStatus | null {
  if (p.validationStatus === 'ERROR') return 'rejected';
  if (p.clearanceStatus === 'CLEARED') return 'cleared';
  if (p.reportingStatus === 'REPORTED') return 'reported';
  return null;
}

export class SupabaseSubmissionProjectionWriter
  implements SubmissionProjectionWriter
{
  constructor(private readonly client: SupabaseLike) {}

  async project(p: SubmissionProjection): Promise<void> {
    const status = deriveZatcaStatus(p);
    if (!status) {
      // Unknown disposition — leave the read-model untouched rather than guess.
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
