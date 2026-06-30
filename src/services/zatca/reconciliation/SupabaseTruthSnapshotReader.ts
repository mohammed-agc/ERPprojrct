/**
 * SupabaseTruthSnapshotReader — gathers the RAW TruthSnapshot for one document.
 *
 * It READS the four truth sources + the projection, each independently, and is
 * TOLERANT of absence: a missing row is `null`, never an error and never an
 * interpretation. It does NOT know the seven classifications — it only reports
 * "found / not found". All meaning is derived downstream (deriveExpected →
 * compare → classify).
 *
 * Sources:
 *   invoices                 → current projection (icv,pih,signed_artifact_id,xml_hash,zatca_status)
 *   zatca_document_chain     → structural truth (null ⇒ NOT_SIGNED downstream)
 *   zatca_signed_artifacts   → the artifact the chain points at (null ⇒ MISSING_ARTIFACT)
 *   zatca_submission_log     → latest attempt by completed_at DESC NULLS LAST
 *   zatca_projection_outbox  → unresolved rows for the chain's artifact
 *
 * The artifact + outbox are read by the chain's artifact_id, so they are only
 * meaningful once a chain exists; when the chain is null they are null/empty.
 */

import type { DocumentRef } from './ProjectionReconciler';
import type { TruthSnapshot } from './TruthSnapshot';
import { supabase } from '@/integrations/supabase/client';

type SupabaseLike = typeof supabase;

export interface TruthSnapshotReader {
  read(ref: DocumentRef): Promise<TruthSnapshot>;
}

export class SupabaseTruthSnapshotReader implements TruthSnapshotReader {
  constructor(private readonly client: SupabaseLike) {}

  async read(ref: DocumentRef): Promise<TruthSnapshot> {
    // 1) Current projection (invoices). The invoice row itself is assumed to
    //    exist (it is the document); its zatca columns may all be null.
    const inv = await this.client
      .from('invoices')
      .select('icv, pih, signed_artifact_id, xml_hash, zatca_status')
      .eq('id', ref.documentId)
      .maybeSingle();
    if (inv.error) throw new Error(`TruthSnapshotReader: invoices read failed: ${inv.error.message}`);

    const projection = {
      icv: (inv.data?.icv as number | null) ?? null,
      pih: (inv.data?.pih as string | null) ?? null,
      signedArtifactId: (inv.data?.signed_artifact_id as string | null) ?? null,
      xmlHash: (inv.data?.xml_hash as string | null) ?? null,
      zatcaStatus: (inv.data?.zatca_status as string | null) ?? null,
    };

    // 2) Chain (structural truth).
    const ch = await this.client
      .from('zatca_document_chain')
      .select('icv, pih, uuid, artifact_id, artifact_hash')
      .eq('document_id', ref.documentId)
      .eq('environment', ref.environment)
      .eq('document_type', ref.documentType)
      .maybeSingle();
    if (ch.error) throw new Error(`TruthSnapshotReader: chain read failed: ${ch.error.message}`);

    const chain = ch.data
      ? {
          icv: Number(ch.data.icv),
          pih: ch.data.pih as string,
          uuid: ch.data.uuid as string,
          artifactId: ch.data.artifact_id as string,
          artifactHash: ch.data.artifact_hash as string,
        }
      : null;

    // 3/5) Artifact + outbox are keyed by the chain's artifact_id — only
    //      meaningful once a chain exists.
    let artifact: TruthSnapshot['artifact'] = null;
    let unresolvedOutboxIds: string[] = [];

    if (chain) {
      const art = await this.client
        .from('zatca_signed_artifacts')
        .select('artifact_hash')
        .eq('id', chain.artifactId)
        .maybeSingle();
      if (art.error) throw new Error(`TruthSnapshotReader: artifact read failed: ${art.error.message}`);
      artifact = art.data
        ? { artifactHash: art.data.artifact_hash as string }
        : null;

      const ob = await this.client
        .from('zatca_projection_outbox')
        .select('id')
        .eq('artifact_id', chain.artifactId)
        .is('resolved_at', null);
      if (ob.error) throw new Error(`TruthSnapshotReader: outbox read failed: ${ob.error.message}`);
      unresolvedOutboxIds = (ob.data ?? []).map((r) => r.id as string);
    }

    // 4) Latest submission by completed_at DESC NULLS LAST (truth completion,
    //    not attempt start).
    const sub = await this.client
      .from('zatca_submission_log')
      .select('id, zatca_status, zatca_response_code, success')
      .eq('document_id', ref.documentId)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (sub.error) throw new Error(`TruthSnapshotReader: submission read failed: ${sub.error.message}`);

    const latestSubmission = sub.data
      ? {
          submissionLogId: sub.data.id as string,
          zatca_status: (sub.data.zatca_status as string | null) ?? undefined,
          zatca_response_code:
            (sub.data.zatca_response_code as string | null) ?? undefined,
          success: (sub.data.success as boolean | null) ?? undefined,
        }
      : null;

    return {
      chain,
      artifact,
      projection,
      latestSubmission,
      unresolvedOutboxIds,
    };
  }
}

export function createTruthSnapshotReader(
  client: SupabaseLike = supabase
): TruthSnapshotReader {
  return new SupabaseTruthSnapshotReader(client);
}
