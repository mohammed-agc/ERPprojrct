/**
 * SupabaseSubmissionLogWriter — appends ONE attempt row to zatca_submission_log.
 *
 * This is the DURABLE TRUTH of a submission attempt (the event log). It only ever
 * INSERTs (the table is append-only, trigger-enforced) — never updates. Maps the
 * internal SubmissionLogEntry onto the table columns and returns the new row id.
 */

import type {
  SubmissionLogWriter,
  SubmissionLogEntry,
} from './SubmissionCoordinator';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

export class SupabaseSubmissionLogWriter implements SubmissionLogWriter {
  constructor(private readonly client: SupabaseLike) {}

  async record(entry: SubmissionLogEntry): Promise<string> {
    const { data, error } = await this.client
      .from('zatca_submission_log')
      .insert({
        company_id: entry.companyId,
        document_type: entry.documentType,
        document_id: entry.documentId,
        icv: entry.icv,
        zatca_invoice_uuid: entry.zatcaInvoiceUuid,
        submission_type: entry.submissionType,
        credential_id: entry.credentialId,
        xml_hash: entry.xmlHash,
        attempt_number: entry.attemptNumber,
        http_status: entry.httpStatus ?? null,
        zatca_status: entry.zatcaStatus ?? null,
        zatca_response_code: entry.zatcaResponseCode ?? null,
        response_description: entry.responseDescription ?? null,
        response_json: (entry.responseJson ?? null) as never,
        success: entry.success,
        error_category: entry.errorCategory ?? null,
        error_code: entry.errorCode ?? null,
        error_message: entry.errorMessage ?? null,
        retryable: entry.retryable ?? null,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`SubmissionLogWriter: insert failed: ${error.message}`);
    }
    const id = (data as { id?: unknown } | null)?.id;
    if (typeof id !== 'string') {
      throw new Error('SubmissionLogWriter: insert returned no id');
    }
    return id;
  }
}

/** Factory — defaults to the app singleton; server-side runs inject a client. */
export function createSubmissionLogWriter(
  client: SupabaseLike = supabase
): SubmissionLogWriter {
  return new SupabaseSubmissionLogWriter(client);
}
